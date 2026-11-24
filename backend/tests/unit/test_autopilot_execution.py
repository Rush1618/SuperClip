from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from src.services.autopilot_service import AutopilotService, is_cron_due
from src.services.auto_upload_service import maybe_trigger_auto_upload
from src.services.rights_service import RightsService


def test_is_cron_due_accuracy():
    # 9:00 AM UTC schedule: "0 9 * * *"
    cron_expr = "0 9 * * *"

    # 1. Last run was today at 09:00 UTC, now is 09:30 UTC -> Not due again
    last_run = datetime(2026, 11, 24, 9, 0, 0, tzinfo=timezone.utc)
    now = datetime(2026, 11, 24, 9, 30, 0, tzinfo=timezone.utc)
    assert is_cron_due(cron_expr, last_run, now=now) is False

    # 2. Last run was yesterday at 09:00 UTC, now is today at 08:30 UTC -> Not due yet (even though > 23h has elapsed)
    last_run = datetime(2026, 11, 23, 9, 0, 0, tzinfo=timezone.utc)
    now = datetime(2026, 11, 24, 8, 30, 0, tzinfo=timezone.utc)
    assert is_cron_due(cron_expr, last_run, now=now) is False

    # 3. Last run was yesterday at 09:00 UTC, now is today at 09:01 UTC -> Due!
    now = datetime(2026, 11, 24, 9, 1, 0, tzinfo=timezone.utc)
    assert is_cron_due(cron_expr, last_run, now=now) is True


@pytest.mark.asyncio
async def test_rights_evidence_validation():
    db = AsyncMock()
    service = RightsService(db)

    # Empty evidence must be rejected for creator_authorized
    with pytest.raises(ValueError, match="Evidence verification failed"):
        await service.register_source_rights(
            user_id="u1",
            source_id="yt-123",
            platform="youtube",
            rights_state="creator_authorized",
            permission_evidence="",
        )

    # Placeholder string 'creator_agreement' must be rejected
    with pytest.raises(ValueError, match="Evidence verification failed"):
        await service.register_source_rights(
            user_id="u1",
            source_id="yt-123",
            platform="youtube",
            rights_state="licensed",
            permission_evidence="creator_agreement",
        )

    # Random unstructured string must be rejected
    with pytest.raises(ValueError, match="Evidence verification failed"):
        await service.register_source_rights(
            user_id="u1",
            source_id="yt-123",
            platform="youtube",
            rights_state="licensed",
            permission_evidence="not_a_valid_ref",
        )

    # Disallowed host (e.g. localhost/loopback spoof) must be rejected
    with pytest.raises(ValueError, match="Evidence verification failed"):
        await service.register_source_rights(
            user_id="u1",
            source_id="yt-123",
            platform="youtube",
            rights_state="licensed",
            permission_evidence="http://localhost/fake-license.pdf",
        )

    # Valid verifiable URL evidence succeeds
    result_mock = MagicMock()
    result_mock.mappings().first.return_value = {
        "id": "rights-1",
        "source_id": "yt-123",
        "rights_state": "creator_authorized",
    }
    db.execute.return_value = result_mock

    registered = await service.register_source_rights(
        user_id="u1",
        source_id="yt-123",
        platform="youtube",
        rights_state="creator_authorized",
        permission_evidence="https://licenses.example.com/agreement-77291.pdf",
    )
    assert registered["source_id"] == "yt-123"

    # Valid structured reference identifier succeeds
    registered_ref = await service.register_source_rights(
        user_id="u1",
        source_id="yt-123",
        platform="youtube",
        rights_state="creator_authorized",
        permission_evidence="CONTRACT-2026-X88",
    )
    assert registered_ref["source_id"] == "yt-123"


@pytest.mark.asyncio
async def test_autopilot_rule_enqueues_processing_job_and_persists_job_id():
    db = AsyncMock()
    service = AutopilotService(db)

    rule_row = {
        "id": "rule-42",
        "user_id": "u-user",
        "team_id": None,
        "name": "Trending Rule",
        "enabled": True,
        "niche": "tech",
        "region": "US",
        "min_trend_score": 75,
        "clip_count": 3,
        "daily_limit": 5,
        "max_concurrent_jobs": 2,
        "processing_workflow": "highlights",
        "sources": json.dumps(["youtube"]),
        "channels": json.dumps([]),
        "languages": json.dumps(["en"]),
        "keywords": json.dumps([]),
        "excluded_keywords": json.dumps([]),
        "min_rights_status": "creator_authorized",
    }

    rule_res = MagicMock()
    rule_res.mappings().first.return_value = rule_row

    daily_count_res = MagicMock()
    daily_count_res.scalar.return_value = 0

    active_count_res = MagicMock()
    active_count_res.scalar.return_value = 0

    exec_insert_res = MagicMock()
    update_last_run_res = MagicMock()

    db.execute.side_effect = [
        rule_res,
        daily_count_res,
        active_count_res,
        exec_insert_res,
        update_last_run_res,
    ]

    service.trending_service.fetch_worldwide_trending_videos = AsyncMock(
        return_value=[
            {
                "id": "vid-12345",
                "platform": "youtube",
                "title": "Quantum AI Breakthrough",
                "virality_score": 92,
                "language": "en",
                "url": "https://www.youtube.com/watch?v=vid-12345",
            }
        ]
    )

    service.rights_service.check_rights_permission = AsyncMock(
        return_value={
            "allowed": True,
            "rights_state": "owned",
            "reason": "Verified owned content",
        }
    )

    with patch("src.repositories.source_repository.SourceRepository.create_source", new=AsyncMock(return_value="src-rec-1")), \
         patch("src.repositories.task_repository.TaskRepository.create_task", new=AsyncMock(return_value="task-999")) as mock_create_task, \
         patch("src.repositories.task_repository.TaskRepository.save_source_metadata", new=AsyncMock()) as mock_save_meta, \
         patch("src.workers.job_queue.JobQueue.enqueue_processing_job", new=AsyncMock(return_value="job-555")) as mock_enqueue:

        res = await service.execute_rule("rule-42")

        assert res["status"] == "completed"
        assert res["tasks_created"] == 1

        mock_create_task.assert_awaited_once()
        create_kwargs = mock_create_task.await_args.kwargs
        assert create_kwargs["workflow_options"]["auto_upload"] is True
        assert create_kwargs["workflow_options"]["autopilot_rule_id"] == "rule-42"

        # Check metadata calls: 1 call persisting source details and deterministic processing_job_id atomically before enqueue
        assert mock_save_meta.await_count == 1
        save_call_args = mock_save_meta.await_args.args
        assert save_call_args[0] == db
        assert save_call_args[1] == "task-999"
        saved_metadata = save_call_args[2]
        assert saved_metadata["autopilot_rule_id"] == "rule-42"
        assert saved_metadata["discovered_title"] == "Quantum AI Breakthrough"
        assert saved_metadata["discovered_platform"] == "youtube"
        assert saved_metadata["discovered_source_id"] == "vid-12345"
        assert saved_metadata["virality_score"] == 92
        assert saved_metadata["rights_state"] == "owned"
        assert saved_metadata["processing_job_id"].startswith("task-999:")
        persisted_job_id = saved_metadata["processing_job_id"]

        mock_enqueue.assert_awaited_once_with(
            "process_video_task",
            "highlights",
            "task-999",
            "https://www.youtube.com/watch?v=vid-12345",
            "youtube",
            "u-user",
            None,
            None,
            None,
            "default",
            "highlights",
            "vertical",
            True,
            None,
            "auto",
            _job_id=persisted_job_id,
        )


@pytest.mark.asyncio
async def test_autopilot_queue_failure_marks_task_error():
    db = AsyncMock()
    service = AutopilotService(db)

    rule_row = {
        "id": "rule-fail",
        "user_id": "u-user",
        "team_id": None,
        "name": "Queue Fail Rule",
        "enabled": True,
        "niche": "tech",
        "region": "US",
        "min_trend_score": 70,
        "clip_count": 1,
        "daily_limit": 5,
        "max_concurrent_jobs": 2,
        "processing_workflow": "highlights",
        "sources": json.dumps(["youtube"]),
        "channels": json.dumps([]),
        "languages": json.dumps([]),
        "keywords": json.dumps([]),
        "excluded_keywords": json.dumps([]),
        "min_rights_status": "creator_authorized",
    }

    rule_res = MagicMock()
    rule_res.mappings().first.return_value = rule_row

    daily_count_res = MagicMock()
    daily_count_res.scalar.return_value = 0

    active_count_res = MagicMock()
    active_count_res.scalar.return_value = 0

    exec_insert_res = MagicMock()
    update_last_run_res = MagicMock()

    db.execute.side_effect = [
        rule_res,
        daily_count_res,
        active_count_res,
        exec_insert_res,
        update_last_run_res,
    ]

    service.trending_service.fetch_worldwide_trending_videos = AsyncMock(
        return_value=[
            {
                "id": "vid-err",
                "platform": "youtube",
                "title": "Failing Enqueue Video",
                "virality_score": 85,
                "url": "https://www.youtube.com/watch?v=vid-err",
            }
        ]
    )

    service.rights_service.check_rights_permission = AsyncMock(
        return_value={"allowed": True, "rights_state": "creator_authorized"}
    )

    with patch("src.repositories.source_repository.SourceRepository.create_source", new=AsyncMock(return_value="src-err")), \
         patch("src.repositories.task_repository.TaskRepository.create_task", new=AsyncMock(return_value="task-err")), \
         patch("src.repositories.task_repository.TaskRepository.save_source_metadata", new=AsyncMock()), \
         patch("src.repositories.task_repository.TaskRepository.update_task_status", new=AsyncMock()) as mock_update_status, \
         patch("src.workers.job_queue.JobQueue.enqueue_processing_job", new=AsyncMock(side_effect=RuntimeError("Redis connection refused"))):

        res = await service.execute_rule("rule-fail")

        assert res["status"] == "completed"
        # Since queue failed, tasks_created MUST NOT be incremented
        assert res["tasks_created"] == 0
        assert res["rejected_reasons"].get("worker_enqueue_failed") == 1

        mock_update_status.assert_awaited_once_with(
            db,
            "task-err",
            "error",
            progress=0,
            progress_message="Autopilot worker enqueue failed. Please retry this generation.",
            expected_statuses=["queued"],
        )


@pytest.mark.asyncio
async def test_autopilot_persists_even_if_metadata_save_fails():
    db = AsyncMock()
    service = AutopilotService(db)

    rule_row = {
        "id": "rule-meta-fail",
        "user_id": "u-user",
        "team_id": None,
        "name": "Meta Fail Rule",
        "enabled": True,
        "niche": "tech",
        "region": "US",
        "min_trend_score": 70,
        "clip_count": 1,
        "daily_limit": 5,
        "max_concurrent_jobs": 2,
        "processing_workflow": "highlights",
        "sources": json.dumps(["youtube"]),
        "channels": json.dumps([]),
        "languages": json.dumps([]),
        "keywords": json.dumps([]),
        "excluded_keywords": json.dumps([]),
        "min_rights_status": "creator_authorized",
    }

    rule_res = MagicMock()
    rule_res.mappings().first.return_value = rule_row

    daily_count_res = MagicMock()
    daily_count_res.scalar.return_value = 0

    active_count_res = MagicMock()
    active_count_res.scalar.return_value = 0

    exec_insert_res = MagicMock()
    update_last_run_res = MagicMock()

    db.execute.side_effect = [
        rule_res,
        daily_count_res,
        active_count_res,
        exec_insert_res,
        update_last_run_res,
    ]

    service.trending_service.fetch_worldwide_trending_videos = AsyncMock(
        return_value=[
            {
                "id": "vid-meta",
                "platform": "youtube",
                "title": "Meta Test Video",
                "virality_score": 85,
                "url": "https://www.youtube.com/watch?v=vid-meta",
            }
        ]
    )

    service.rights_service.check_rights_permission = AsyncMock(
        return_value={"allowed": True, "rights_state": "creator_authorized"}
    )

    # First call to save_source_metadata succeeds, retry calls (job_id save) raise errors
    save_meta_mock = AsyncMock(side_effect=[
        None,
        RuntimeError("Transient DB glitch"),
        RuntimeError("Transient DB glitch"),
        RuntimeError("Transient DB glitch"),
    ])

    with patch("src.repositories.source_repository.SourceRepository.create_source", new=AsyncMock(return_value="src-meta")), \
         patch("src.repositories.task_repository.TaskRepository.create_task", new=AsyncMock(return_value="task-meta")), \
         patch("src.repositories.task_repository.TaskRepository.save_source_metadata", new=save_meta_mock), \
         patch("src.repositories.task_repository.TaskRepository.update_task_status", new=AsyncMock()) as mock_update_status, \
         patch("src.workers.job_queue.JobQueue.enqueue_processing_job", new=AsyncMock(return_value="job-ok")):

        res = await service.execute_rule("rule-meta-fail")

        assert res["status"] == "completed"
        # Since queue succeeded, task is counted as created and status is NOT set to error
        assert res["tasks_created"] == 1
        mock_update_status.assert_not_awaited()


@pytest.mark.asyncio
async def test_autopilot_rule_filters_non_matching_candidates():
    db = AsyncMock()
    service = AutopilotService(db)

    rule_row = {
        "id": "rule-filter",
        "user_id": "u-user",
        "team_id": None,
        "name": "Filtered Rule",
        "enabled": True,
        "niche": "gaming",
        "region": "US",
        "min_trend_score": 80,
        "clip_count": 2,
        "daily_limit": 5,
        "max_concurrent_jobs": 2,
        "processing_workflow": "smart_clips",
        "sources": json.dumps(["youtube"]),
        "channels": json.dumps(["@official_dev"]),
        "languages": json.dumps(["en"]),
        "keywords": json.dumps(["gameplay"]),
        "excluded_keywords": json.dumps(["sponsor", "scam"]),
        "min_rights_status": "creator_authorized",
    }

    rule_res = MagicMock()
    rule_res.mappings().first.return_value = rule_row

    daily_count_res = MagicMock()
    daily_count_res.scalar.return_value = 0

    active_count_res = MagicMock()
    active_count_res.scalar.return_value = 0

    exec_insert_res = MagicMock()
    update_last_run_res = MagicMock()

    db.execute.side_effect = [
        rule_res,
        daily_count_res,
        active_count_res,
        exec_insert_res,
        update_last_run_res,
    ]

    service.trending_service.fetch_worldwide_trending_videos = AsyncMock(
        return_value=[
            # 1. Platform mismatch (twitch instead of youtube)
            {"id": "c1", "platform": "twitch", "title": "Great gameplay", "virality_score": 90, "channel_id": "@official_dev", "language": "en"},
            # 2. Channel mismatch
            {"id": "c2", "platform": "youtube", "title": "Epic gameplay", "virality_score": 90, "channel_id": "@other_channel", "language": "en"},
            # 3. Missing keyword ("gameplay" not in title)
            {"id": "c3", "platform": "youtube", "title": "Vlog episode 4", "virality_score": 90, "channel_id": "@official_dev", "language": "en"},
            # 4. Excluded keyword present ("sponsor")
            {"id": "c4", "platform": "youtube", "title": "Pro gameplay with sponsor", "virality_score": 90, "channel_id": "@official_dev", "language": "en"},
            # 5. Score below threshold (75 < 80)
            {"id": "c5", "platform": "youtube", "title": "Clean gameplay", "virality_score": 75, "channel_id": "@official_dev", "language": "en"},
            # 6. Missing language metadata (must not pass rule restricted to "en")
            {"id": "c6", "platform": "youtube", "title": "Clean gameplay", "virality_score": 90, "channel_id": "@official_dev", "language": ""},
        ]
    )

    with patch("src.repositories.source_repository.SourceRepository.create_source", new=AsyncMock()), \
         patch("src.repositories.task_repository.TaskRepository.create_task", new=AsyncMock()), \
         patch("src.repositories.task_repository.TaskRepository.save_source_metadata", new=AsyncMock()), \
         patch("src.workers.job_queue.JobQueue.enqueue_processing_job", new=AsyncMock()):

        res = await service.execute_rule("rule-filter")

        assert res["status"] == "completed"
        assert res["tasks_created"] == 0
        reasons = res["rejected_reasons"]
        assert reasons.get("source_platform_mismatch") == 1
        assert reasons.get("channel_mismatch") == 1
        assert reasons.get("keywords_missing") == 1
        assert reasons.get("excluded_keyword_present") == 1
        assert reasons.get("score_below_threshold") == 1
        assert reasons.get("language_mismatch") == 1


@pytest.mark.asyncio
async def test_maybe_trigger_auto_upload_inspects_workflow_options():
    db = AsyncMock()

    # Task created by Autopilot with workflow_options.auto_upload = True
    task_mock = {
        "id": "task-auto",
        "user_id": "u-1",
        "team_id": None,
        "workflow_settings": {},
        "create_settings": {},
        "workflow_options": {"auto_upload": True},
    }

    with patch("src.repositories.task_repository.TaskRepository.get_task_by_id", new=AsyncMock(return_value=task_mock)), \
         patch("src.services.auto_upload_service.AutoUploadService.auto_upload_task_clips", new=AsyncMock(return_value={"status": "completed", "total_posts_created": 2})) as mock_upload:

        res = await maybe_trigger_auto_upload("task-auto", "u-1", db=db)

        assert res is not None
        assert res["status"] == "completed"
        mock_upload.assert_awaited_once_with(
            user_id="u-1",
            task_id="task-auto",
            team_id=None,
            top_clips_only=None,
        )

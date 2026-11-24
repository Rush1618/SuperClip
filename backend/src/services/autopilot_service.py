"""
Autopilot Autonomous Discovery, Rights Verification, and Clipping Engine.

Executes scheduled discovery rules, validates source rights, evaluates virality,
and creates automated clipping tasks without manual user intervention.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .rights_service import RightsService
from .trending_service import TrendingService
from ..config import Config, get_config

logger = logging.getLogger(__name__)


def is_cron_due(cron_expr: str, last_run_at: Optional[datetime], now: Optional[datetime] = None) -> bool:
    """Evaluate if a 5-part cron schedule has ticked since the last run."""
    if last_run_at is None:
        return True
    if now is None:
        now = datetime.now(timezone.utc)
    if last_run_at.tzinfo is None:
        last_run_at = last_run_at.replace(tzinfo=timezone.utc)

    delta = (now - last_run_at).total_seconds()
    if delta < 60:
        return False

    fields = cron_expr.strip().split()
    if len(fields) != 5:
        return delta >= 7200  # Default 2-hour interval

    def match_field(val: int, pattern: str) -> bool:
        if pattern == "*":
            return True
        for part in pattern.split(","):
            if part.startswith("*/"):
                try:
                    step = int(part[2:])
                    if step > 0 and val % step == 0:
                        return True
                except ValueError:
                    pass
            elif "-" in part:
                try:
                    start, end = map(int, part.split("-"))
                    if start <= val <= end:
                        return True
                except ValueError:
                    pass
            else:
                try:
                    if int(part) == val:
                        return True
                except ValueError:
                    pass
        return False

    # Find the most recent timestamp <= now that matches the cron schedule
    current = now.replace(second=0, microsecond=0)
    found_tick: Optional[datetime] = None
    # Check backwards minute by minute up to 31 days
    for _ in range(31 * 24 * 60):
        cron_dow = (current.weekday() + 1) % 7
        if (
            match_field(current.minute, fields[0])
            and match_field(current.hour, fields[1])
            and match_field(current.day, fields[2])
            and match_field(current.month, fields[3])
            and match_field(cron_dow, fields[4])
        ):
            found_tick = current
            break
        current -= timedelta(minutes=1)

    if not found_tick:
        return delta >= 7200

    return last_run_at < found_tick


class AutopilotService:
    """Manages autonomous rule discovery, validation, and task dispatching."""

    def __init__(self, db: AsyncSession, config: Optional[Config] = None):
        self.db = db
        self.config = config or get_config()
        self.rights_service = RightsService(db)
        self.trending_service = TrendingService(config=self.config)

    async def list_rules(
        self,
        user_id: str,
        team_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List all configured autopilot rules."""
        query = text(
            """
            SELECT id, user_id, team_id, name, enabled, sources, platforms,
                   channels, niche, region, languages, keywords, excluded_keywords,
                   min_trend_score, min_rights_status, processing_workflow, clip_count,
                   daily_limit, schedule_cron, max_concurrent_jobs, last_run_at,
                   created_at, updated_at
            FROM autopilot_rules
            WHERE user_id = :user_id OR (:team_id IS NOT NULL AND team_id = :team_id)
            ORDER BY created_at DESC
            """
        )
        result = await self.db.execute(query, {"user_id": user_id, "team_id": team_id})
        rules = []
        for row in result.mappings().all():
            r = dict(row)
            for k in ("sources", "platforms", "channels", "languages", "keywords", "excluded_keywords"):
                if isinstance(r.get(k), str):
                    try:
                        r[k] = json.loads(r[k])
                    except Exception:
                        pass
            rules.append(r)
        return rules

    async def create_rule(
        self,
        user_id: str,
        rule_data: Dict[str, Any],
        team_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new Autopilot rule."""
        rule_id = str(uuid4())
        insert_query = text(
            """
            INSERT INTO autopilot_rules (
                id, user_id, team_id, name, enabled, sources, platforms,
                channels, niche, region, languages, keywords, excluded_keywords,
                min_trend_score, min_rights_status, processing_workflow, clip_count,
                daily_limit, schedule_cron, max_concurrent_jobs, created_at, updated_at
            ) VALUES (
                :id, :user_id, :team_id, :name, :enabled, :sources, :platforms,
                :channels, :niche, :region, :languages, :keywords, :excluded_keywords,
                :min_trend_score, :min_rights_status, :processing_workflow, :clip_count,
                :daily_limit, :schedule_cron, :max_concurrent_jobs, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING id, name, enabled, created_at
            """
        )
        params = {
            "id": rule_id,
            "user_id": user_id,
            "team_id": team_id,
            "name": rule_data.get("name", "Trending Highlights Autopilot"),
            "enabled": bool(rule_data.get("enabled", True)),
            "sources": json.dumps(rule_data.get("sources", ["youtube", "twitch"])),
            "platforms": json.dumps(rule_data.get("platforms", ["youtube", "tiktok", "instagram"])),
            "channels": json.dumps(rule_data.get("channels", [])),
            "niche": rule_data.get("niche", "all"),
            "region": rule_data.get("region", "US"),
            "languages": json.dumps(rule_data.get("languages", ["en"])),
            "keywords": json.dumps(rule_data.get("keywords", [])),
            "excluded_keywords": json.dumps(rule_data.get("excluded_keywords", [])),
            "min_trend_score": int(rule_data.get("min_trend_score", 70)),
            "min_rights_status": rule_data.get("min_rights_status", "creator_authorized"),
            "processing_workflow": rule_data.get("processing_workflow", "highlights"),
            "clip_count": int(rule_data.get("clip_count", 3)),
            "daily_limit": int(rule_data.get("daily_limit", 5)),
            "schedule_cron": rule_data.get("schedule_cron", "0 */2 * * *"),
            "max_concurrent_jobs": int(rule_data.get("max_concurrent_jobs", 2)),
        }
        result = await self.db.execute(insert_query, params)
        await self.db.commit()
        row = result.mappings().first()
        return dict(row) if row else {"id": rule_id, "status": "created"}

    async def toggle_rule(
        self,
        rule_id: str,
        enabled: bool,
        user_id: Optional[str] = None,
    ) -> bool:
        """Pause or resume a specific autopilot rule with authorization check."""
        if user_id:
            query = text(
                """
                UPDATE autopilot_rules
                SET enabled = :enabled, updated_at = CURRENT_TIMESTAMP
                WHERE id = :id AND (
                    user_id = :user_id OR
                    team_id IN (SELECT team_id FROM team_members WHERE user_id = :user_id)
                )
                """
            )
            res = await self.db.execute(query, {"id": rule_id, "enabled": enabled, "user_id": user_id})
        else:
            query = text(
                """
                UPDATE autopilot_rules
                SET enabled = :enabled, updated_at = CURRENT_TIMESTAMP
                WHERE id = :id
                """
            )
            res = await self.db.execute(query, {"id": rule_id, "enabled": enabled})
        await self.db.commit()
        return res.rowcount > 0

    async def execute_rule(
        self,
        rule_id: str,
        user_id: Optional[str] = None,
        team_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute an active Autopilot rule:
        1. Discover sources matching niche, keywords, and score.
        2. Verify source rights.
        3. Check daily limits.
        4. Spawn processing task with Auto-Publish configured.
        5. Persist execution outcome in autopilot_executions.
        """
        if user_id:
            rule_res = await self.db.execute(
                text(
                    """
                    SELECT * FROM autopilot_rules
                    WHERE id = :id AND (
                        user_id = :user_id OR
                        team_id IN (SELECT team_id FROM team_members WHERE user_id = :user_id)
                    )
                    """
                ),
                {"id": rule_id, "user_id": user_id},
            )
        else:
            rule_res = await self.db.execute(
                text("SELECT * FROM autopilot_rules WHERE id = :id"), {"id": rule_id}
            )
        rule = rule_res.mappings().first()
        if not rule or not rule["enabled"]:
            return {"status": "skipped", "reason": "Rule not found or disabled", "rule_id": rule_id}

        user_id = rule["user_id"]
        team_id = rule.get("team_id")
        niche = rule["niche"]
        region = rule["region"]
        min_score = rule["min_trend_score"]
        clip_count = rule["clip_count"]
        daily_limit = int(rule.get("daily_limit") or 5)
        max_concurrent = int(rule.get("max_concurrent_jobs") or 2)

        # Enforce rule daily task limit across the actual day
        daily_count_res = await self.db.execute(
            text("""
                SELECT COALESCE(SUM(tasks_created), 0)
                FROM autopilot_executions
                WHERE rule_id = :rule_id AND created_at >= CURRENT_DATE
            """),
            {"rule_id": rule_id},
        )
        tasks_created_today = int(daily_count_res.scalar() or 0)
        remaining_daily_quota = max(0, daily_limit - tasks_created_today)
        if remaining_daily_quota <= 0:
            return {
                "status": "skipped",
                "reason": f"Daily limit reached ({tasks_created_today}/{daily_limit} tasks today)",
                "rule_id": rule_id,
            }

        # Enforce concurrency limit for active tasks created by this rule
        active_res = await self.db.execute(
            text("""
                SELECT COUNT(*)
                FROM tasks
                WHERE (workflow_options->>'autopilot_rule_id') = :rule_id
                  AND status IN ('queued', 'processing', 'downloading', 'rendering')
            """),
            {"rule_id": rule_id},
        )
        active_count = int(active_res.scalar() or 0)
        if active_count >= max_concurrent:
            return {
                "status": "skipped",
                "reason": f"Concurrency limit reached ({active_count}/{max_concurrent} active jobs)",
                "rule_id": rule_id,
            }

        rule_sources = rule.get("sources")
        if isinstance(rule_sources, str):
            try:
                rule_sources = json.loads(rule_sources)
            except Exception:
                rule_sources = []
        rule_sources = [s.lower().strip() for s in (rule_sources or []) if s]

        rule_channels = rule.get("channels")
        if isinstance(rule_channels, str):
            try:
                rule_channels = json.loads(rule_channels)
            except Exception:
                rule_channels = []
        rule_channels = [c.lower().strip() for c in (rule_channels or []) if c]

        rule_languages = rule.get("languages")
        if isinstance(rule_languages, str):
            try:
                rule_languages = json.loads(rule_languages)
            except Exception:
                rule_languages = []
        rule_languages = [lang.lower().strip() for lang in (rule_languages or []) if lang]

        rule_keywords = rule.get("keywords")
        if isinstance(rule_keywords, str):
            try:
                rule_keywords = json.loads(rule_keywords)
            except Exception:
                rule_keywords = []
        rule_keywords = [k.lower().strip() for k in (rule_keywords or []) if k]

        rule_excluded_keywords = rule.get("excluded_keywords")
        if isinstance(rule_excluded_keywords, str):
            try:
                rule_excluded_keywords = json.loads(rule_excluded_keywords)
            except Exception:
                rule_excluded_keywords = []
        rule_excluded_keywords = [k.lower().strip() for k in (rule_excluded_keywords or []) if k]

        min_rights_status = rule.get("min_rights_status") or "creator_authorized"

        # 1. Discover potential sources from trending connectors
        candidates = await self.trending_service.fetch_worldwide_trending_videos(
            niche=niche,
            region=region,
            limit=10,
        )

        sources_scanned = len(candidates)
        eligible_sources = 0
        tasks_created = 0
        rejected_reasons: Dict[str, int] = {}

        from ..repositories.source_repository import SourceRepository
        from ..repositories.task_repository import TaskRepository
        from ..workers.job_queue import JobQueue

        RIGHTS_RANK = {
            "owned": 5,
            "public_domain": 4,
            "licensed": 3,
            "creator_authorized": 2,
            "fair_use_presumed": 1,
            "unauthorized": 0,
        }

        for item in candidates:
            platform = (item.get("platform") or "youtube").lower().strip()
            if rule_sources and platform not in rule_sources:
                rejected_reasons["source_platform_mismatch"] = rejected_reasons.get("source_platform_mismatch", 0) + 1
                continue

            channel_id = str(item.get("channel_id") or item.get("channel") or "").lower().strip()
            channel_title = str(item.get("channel_title") or "").lower().strip()
            if rule_channels and not any(c in channel_id or c in channel_title for c in rule_channels):
                rejected_reasons["channel_mismatch"] = rejected_reasons.get("channel_mismatch", 0) + 1
                continue

            item_lang = str(item.get("language") or item.get("lang") or "").lower().strip()
            if rule_languages:
                if not item_lang or not any(l == item_lang or item_lang.startswith(l) for l in rule_languages):
                    rejected_reasons["language_mismatch"] = rejected_reasons.get("language_mismatch", 0) + 1
                    continue

            title_and_desc = f"{item.get('title', '')} {item.get('description', '')}".lower()
            if rule_keywords and not any(kw in title_and_desc for kw in rule_keywords):
                rejected_reasons["keywords_missing"] = rejected_reasons.get("keywords_missing", 0) + 1
                continue

            if rule_excluded_keywords and any(ekw in title_and_desc for ekw in rule_excluded_keywords):
                rejected_reasons["excluded_keyword_present"] = rejected_reasons.get("excluded_keyword_present", 0) + 1
                continue

            score = item.get("virality_score", 0)
            if score < min_score:
                rejected_reasons["score_below_threshold"] = rejected_reasons.get("score_below_threshold", 0) + 1
                continue

            source_id = item.get("id") or item.get("video_id")

            # 2. Check rights & authorization
            rights = await self.rights_service.check_rights_permission(
                source_id=source_id,
                platform=platform,
                operation="publish",
                user_id=user_id,
                team_id=team_id,
                channel_id=channel_id,
            )

            if not rights["allowed"]:
                reason_key = rights.get("rights_state", "unauthorized")
                rejected_reasons[f"rights_{reason_key}"] = rejected_reasons.get(f"rights_{reason_key}", 0) + 1
                continue

            candidate_state = rights.get("rights_state", "unauthorized")
            if RIGHTS_RANK.get(candidate_state, 0) < RIGHTS_RANK.get(min_rights_status, 2):
                rejected_reasons["rights_below_min_status"] = rejected_reasons.get("rights_below_min_status", 0) + 1
                continue

            eligible_sources += 1

            # 3. Create task if within daily quota and active concurrency budget
            if tasks_created < remaining_daily_quota and (active_count + tasks_created) < max_concurrent:
                try:
                    raw_url = item.get("url") or f"https://www.youtube.com/watch?v={source_id}"
                    source_title = item.get("title", "Autopilot Clip")
                    source_record_id = await SourceRepository.create_source(
                        self.db,
                        source_type=platform,
                        title=source_title,
                        url=raw_url,
                    )
                    processing_workflow = rule.get("processing_workflow") or "highlights"
                    task_id = await TaskRepository.create_task(
                        self.db,
                        user_id=user_id,
                        source_id=source_record_id,
                        status="queued",
                        workflow=processing_workflow,
                        team_id=team_id,
                        workflow_options={
                            "auto_upload": True,
                            "target_clip_count": clip_count,
                            "autopilot_rule_id": rule_id,
                        },
                    )
                    await TaskRepository.save_source_metadata(
                        self.db,
                        task_id,
                        {
                            "autopilot_rule_id": rule_id,
                            "discovered_title": source_title,
                            "discovered_platform": platform,
                            "discovered_source_id": source_id,
                            "discovered_channel_id": channel_id,
                            "virality_score": score,
                            "rights_state": candidate_state,
                        },
                    )

                    processing_job_id = None
                    try:
                        processing_job_id = await JobQueue.enqueue_processing_job(
                            "process_video_task",
                            processing_workflow,
                            task_id,
                            raw_url,
                            platform,
                            user_id,
                            None,
                            None,
                            None,
                            "default",
                            processing_workflow,
                            "vertical",
                            True,
                            None,
                            "auto",
                        )
                        # Persist processing_job_id on task source metadata for recovery & tracking
                        await TaskRepository.save_source_metadata(
                            self.db,
                            task_id,
                            {"processing_job_id": processing_job_id},
                        )
                        tasks_created += 1
                        logger.info(
                            "Autopilot rule %s created and enqueued task %s (job %s) for source %s",
                            rule_id, task_id, processing_job_id, source_id
                        )
                    except Exception as q_err:
                        logger.error("Could not enqueue autopilot task %s to worker: %s", task_id, q_err)
                        await TaskRepository.update_task_status(
                            self.db,
                            task_id,
                            "error",
                            progress=0,
                            progress_message="Autopilot worker enqueue failed. Please retry this generation.",
                            expected_statuses=["queued"],
                        )
                        rejected_reasons["worker_enqueue_failed"] = rejected_reasons.get("worker_enqueue_failed", 0) + 1
                except Exception as task_err:
                    logger.warning("Failed to create autopilot task: %s", task_err)

        # 4. Record execution stats
        exec_id = str(uuid4())
        await self.db.execute(
            text(
                """
                INSERT INTO autopilot_executions (
                    id, rule_id, status, sources_scanned, eligible_sources,
                    tasks_created, clips_generated, posts_published,
                    rejected_reasons, created_at
                ) VALUES (
                    :id, :rule_id, 'completed', :sources_scanned, :eligible_sources,
                    :tasks_created, 0, 0, :rejected_reasons, CURRENT_TIMESTAMP
                )
                """
            ),
            {
                "id": exec_id,
                "rule_id": rule_id,
                "sources_scanned": sources_scanned,
                "eligible_sources": eligible_sources,
                "tasks_created": tasks_created,
                "rejected_reasons": json.dumps(rejected_reasons),
            },
        )

        # Update last_run_at on rule
        await self.db.execute(
            text("UPDATE autopilot_rules SET last_run_at = CURRENT_TIMESTAMP WHERE id = :id"),
            {"id": rule_id},
        )
        await self.db.commit()

        return {
            "status": "completed",
            "execution_id": exec_id,
            "rule_id": rule_id,
            "sources_scanned": sources_scanned,
            "eligible_sources": eligible_sources,
            "tasks_created": tasks_created,
            "rejected_reasons": rejected_reasons,
        }

    async def get_autopilot_overview(self, user_id: str, team_id: Optional[str] = None) -> Dict[str, Any]:
        """Return operational overview metrics for the Autopilot dashboard."""
        rules = await self.list_rules(user_id, team_id=team_id)
        active_rules = [r for r in rules if r.get("enabled")]

        # Query aggregated executions
        exec_query = text(
            """
            SELECT COUNT(*) AS total_executions,
                   COALESCE(SUM(sources_scanned), 0) AS total_scanned,
                   COALESCE(SUM(eligible_sources), 0) AS total_eligible,
                   COALESCE(SUM(tasks_created), 0) AS total_tasks,
                   COALESCE(SUM(posts_published), 0) AS total_published
            FROM autopilot_executions e
            JOIN autopilot_rules r ON e.rule_id = r.id
            WHERE r.user_id = :user_id OR (:team_id IS NOT NULL AND r.team_id = :team_id)
            """
        )
        res = await self.db.execute(exec_query, {"user_id": user_id, "team_id": team_id})
        stats = res.mappings().first()

        return {
            "total_rules": len(rules),
            "active_rules_count": len(active_rules),
            "total_executions": stats["total_executions"] if stats else 0,
            "total_sources_scanned": stats["total_scanned"] if stats else 0,
            "total_eligible_sources": stats["total_eligible"] if stats else 0,
            "total_tasks_created": stats["total_tasks"] if stats else 0,
            "total_posts_published": stats["total_published"] if stats else 0,
            "rules": rules,
        }

    @classmethod
    async def execute_due_rules(cls, db: AsyncSession) -> List[Dict[str, Any]]:
        """Query enabled autopilot rules and execute eligible candidates whose schedules are due."""
        service = cls(db)
        now = datetime.now(timezone.utc)
        query = text(
            """
            SELECT id, user_id, team_id, schedule_cron, last_run_at
            FROM autopilot_rules
            WHERE enabled = true
            ORDER BY last_run_at ASC NULLS FIRST
            """
        )
        result = await db.execute(query)
        rows = result.fetchall()
        executed = []
        for row in rows:
            schedule_cron = getattr(row, "schedule_cron", "0 */2 * * *")
            last_run_at = getattr(row, "last_run_at", None)
            if not is_cron_due(schedule_cron, last_run_at, now):
                continue

            try:
                res = await service.execute_rule(row.id, user_id=row.user_id, team_id=row.team_id)
                executed.append(res)
                if len(executed) >= 5:
                    break
            except Exception as e:
                logger.error("Error executing autopilot rule %s: %s", row.id, e)
        return executed

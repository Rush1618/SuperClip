import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.services.auto_upload_service import AutoUploadService


@pytest.mark.asyncio
async def test_get_auto_upload_overview_empty():
    db = AsyncMock()
    service = AutoUploadService(db=db)
    service.social_service.list_connections = AsyncMock(return_value=[])

    overview = await service.get_auto_upload_overview("user-123")
    assert overview["auto_upload_ready"] is False
    assert overview["connected_accounts_count"] == 0
    assert overview["connected_providers"] == []


@pytest.mark.asyncio
async def test_get_auto_upload_overview_with_accounts():
    db = AsyncMock()
    service = AutoUploadService(db=db)
    service.social_service.list_connections = AsyncMock(return_value=[
        {"id": "acc-1", "provider": "youtube", "username": "CreatorShorts", "status": "active"},
        {"id": "acc-2", "provider": "tiktok", "username": "@creatortok", "status": "active"},
    ])

    overview = await service.get_auto_upload_overview("user-123")
    assert overview["auto_upload_ready"] is True
    assert overview["connected_accounts_count"] == 2
    assert "youtube" in overview["connected_providers"]
    assert "tiktok" in overview["connected_providers"]


@pytest.mark.asyncio
async def test_auto_upload_clip_no_connected_accounts(monkeypatch):
    monkeypatch.setenv("SOCIAL_PUBLISHING_ACCESS", "all")
    db = AsyncMock()
    service = AutoUploadService(db=db)
    service.social_service.list_connections = AsyncMock(return_value=[])

    with patch("src.repositories.clip_repository.ClipRepository.get_clip_by_id", new=AsyncMock(return_value={"id": "clip-1", "task_id": "task-1"})):
        res = await service.auto_upload_clip("user-123", task_id="task-1", clip_id="clip-1")
        assert res["status"] == "no_connected_accounts"
        assert "no social accounts" in res["message"]


@pytest.mark.asyncio
async def test_auto_upload_clip_feature_gate_disabled(monkeypatch):
    monkeypatch.setenv("SOCIAL_PUBLISHING_ACCESS", "off")
    db = AsyncMock()
    service = AutoUploadService(db=db)

    with patch("src.repositories.clip_repository.ClipRepository.get_clip_by_id", new=AsyncMock(return_value={"id": "clip-1", "task_id": "task-1"})):
        res = await service.auto_upload_clip("user-123", task_id="task-1", clip_id="clip-1")
        assert res["status"] == "disabled"
        assert "disabled by administrator" in res["message"]

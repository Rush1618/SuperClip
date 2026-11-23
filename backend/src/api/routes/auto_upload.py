"""
API Endpoints for Autonomous Social Upload & Distribution.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import AuthContext, resolve_auth_context
from ...config import get_config
from ...database import get_db
from ...services.auto_upload_service import AutoUploadService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auto-upload", tags=["auto-upload"])


class AutoUploadClipRequest(BaseModel):
    task_id: str = Field(..., description="Task ID containing the clip")
    clip_id: str = Field(..., description="ID of clip to auto-upload")
    platforms: Optional[List[str]] = Field(None, description="Platforms to upload to (e.g. ['youtube', 'tiktok']) or None for all connected")
    privacy_level: str = Field("public", description="Privacy level ('public', 'unlisted', 'private')")


class AutoUploadTaskRequest(BaseModel):
    task_id: str = Field(..., description="Task ID whose clips should be auto-uploaded")
    platforms: Optional[List[str]] = Field(None, description="Target platforms")
    privacy_level: str = Field("public", description="Privacy level")
    top_clips_only: Optional[int] = Field(None, description="Only upload top N virality clips (e.g. 1)")


async def require_auth(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    return await resolve_auth_context(request, db, get_config())


@router.get("/status")
async def get_auto_upload_status(
    auth: AuthContext = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve auto-upload readiness, connected accounts, and supported distribution channels."""
    service = AutoUploadService(db, get_config())
    return await service.get_auto_upload_overview(auth.user_id, team_id=auth.team_id)


@router.post("/clip")
async def auto_upload_clip_endpoint(
    payload: AutoUploadClipRequest,
    auth: AuthContext = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Trigger 1-click autonomous upload for a clip across all connected channels."""
    service = AutoUploadService(db, get_config())
    return await service.auto_upload_clip(
        auth.user_id,
        task_id=payload.task_id,
        clip_id=payload.clip_id,
        team_id=auth.team_id,
        platforms=payload.platforms,
        privacy_level=payload.privacy_level,
    )


@router.post("/task")
async def auto_upload_task_endpoint(
    payload: AutoUploadTaskRequest,
    auth: AuthContext = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Trigger autonomous upload for all (or top N) clips in a task."""
    service = AutoUploadService(db, get_config())
    return await service.auto_upload_task_clips(
        auth.user_id,
        task_id=payload.task_id,
        team_id=auth.team_id,
        platforms=payload.platforms,
        privacy_level=payload.privacy_level,
        top_clips_only=payload.top_clips_only,
    )


"""
API Routes for Authoritative Automation Preferences.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import get_authenticated_user_id
from ...config import Config, get_config
from ...database import get_db
from ...services.automation_service import AutomationService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/automation", tags=["automation"])


class UpdateAutomationPreferencesRequest(BaseModel):
    auto_publish_enabled: Optional[bool] = None
    default_privacy_level: Optional[str] = Field(default=None, max_length=40)
    max_daily_posts: Optional[int] = Field(default=None, ge=1, le=100)
    top_clips_only: Optional[int] = Field(default=None, ge=1, le=20)
    min_virality_score: Optional[int] = Field(default=None, ge=1, le=100)
    selected_platforms: Optional[List[str]] = None
    account_privacy_overrides: Optional[Dict[str, str]] = None
    schedule_preference: Optional[str] = Field(default=None, max_length=40)
    local_only_mode: Optional[bool] = None
    cloud_ai_allowed: Optional[bool] = None
    speech_healing_enabled: Optional[bool] = None
    important_words_enabled: Optional[bool] = None
    learning_loop_enabled: Optional[bool] = None
    chunked_download_enabled: Optional[bool] = None
    chunk_window_seconds: Optional[int] = Field(default=None, ge=30, le=3600)
    primary_ai_model: Optional[str] = Field(default=None, max_length=80)
    fallback_ai_model: Optional[str] = Field(default=None, max_length=80)
    ai_voice_hook_enabled: Optional[bool] = None
    ai_voice_style: Optional[str] = Field(default=None, max_length=40)
    team_id: Optional[str] = None


@router.get("/preferences")
async def get_automation_preferences(
    request: Request,
    team_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Retrieve persistent automation preferences for the user or workspace."""
    user_id = get_authenticated_user_id(request, config)
    if team_id:
        from ...repositories.team_repository import TeamRepository
        if not await TeamRepository.is_member(db, team_id, user_id):
            raise HTTPException(status_code=403, detail="Not a member of this team")

    service = AutomationService(db)
    return await service.get_preferences(user_id=user_id, team_id=team_id)


@router.patch("/preferences")
async def update_automation_preferences(
    body: UpdateAutomationPreferencesRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Update persistent automation preferences."""
    user_id = get_authenticated_user_id(request, config)
    updates = body.model_dump(exclude_unset=True)
    team_id = updates.pop("team_id", None)
    if team_id:
        from ...repositories.team_repository import TeamRepository
        if not await TeamRepository.is_member(db, team_id, user_id):
            raise HTTPException(status_code=403, detail="Not a member of this team")

    service = AutomationService(db)
    updated = await service.update_preferences(user_id=user_id, updates=updates, team_id=team_id)
    return {"status": "success", "preferences": updated}

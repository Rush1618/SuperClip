"""
API Routes for Autopilot Autonomous Discovery & Video Distribution.
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
from ...repositories.team_repository import TeamRepository
from ...services.autopilot_service import AutopilotService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/autopilot", tags=["autopilot"])


class CreateAutopilotRuleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = Field(default=True)
    sources: List[str] = Field(default=["youtube", "twitch"])
    platforms: List[str] = Field(default=["youtube", "tiktok", "instagram"])
    channels: Optional[List[str]] = Field(default=[])
    niche: str = Field(default="all", max_length=80)
    region: str = Field(default="US", max_length=10)
    languages: Optional[List[str]] = Field(default=["en"])
    keywords: Optional[List[str]] = Field(default=[])
    excluded_keywords: Optional[List[str]] = Field(default=[])
    min_trend_score: int = Field(default=70, ge=1, le=100)
    min_rights_status: str = Field(default="creator_authorized")
    processing_workflow: str = Field(default="highlights")
    clip_count: int = Field(default=3, ge=1, le=10)
    daily_limit: int = Field(default=5, ge=1, le=50)
    schedule_cron: str = Field(default="0 */2 * * *")
    max_concurrent_jobs: int = Field(default=2, ge=1, le=10)
    team_id: Optional[str] = None


class UpdateAutopilotRuleRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    enabled: Optional[bool] = None
    sources: Optional[List[str]] = None
    platforms: Optional[List[str]] = None
    channels: Optional[List[str]] = None
    niche: Optional[str] = Field(default=None, max_length=80)
    region: Optional[str] = Field(default=None, max_length=10)
    languages: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    excluded_keywords: Optional[List[str]] = None
    min_trend_score: Optional[int] = Field(default=None, ge=1, le=100)
    min_rights_status: Optional[str] = None
    processing_workflow: Optional[str] = None
    clip_count: Optional[int] = Field(default=None, ge=1, le=10)
    daily_limit: Optional[int] = Field(default=None, ge=1, le=50)
    schedule_cron: Optional[str] = None
    max_concurrent_jobs: Optional[int] = Field(default=None, ge=1, le=10)


class ToggleRuleRequest(BaseModel):
    enabled: bool


@router.get("/overview")
async def get_autopilot_overview(
    request: Request,
    team_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Get operational status and stats for Autopilot."""
    user_id = get_authenticated_user_id(request, config)
    if team_id:
        is_mem = await TeamRepository.is_member(db, team_id, user_id)
        if not is_mem:
            raise HTTPException(status_code=403, detail="You do not belong to this team workspace")
    service = AutopilotService(db, config=config)
    return await service.get_autopilot_overview(user_id=user_id, team_id=team_id)


@router.get("/rules")
async def list_autopilot_rules(
    request: Request,
    team_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """List all Autopilot rules configured for user/team."""
    user_id = get_authenticated_user_id(request, config)
    if team_id:
        is_mem = await TeamRepository.is_member(db, team_id, user_id)
        if not is_mem:
            raise HTTPException(status_code=403, detail="You do not belong to this team workspace")
    service = AutopilotService(db, config=config)
    rules = await service.list_rules(user_id=user_id, team_id=team_id)
    return {"rules": rules, "count": len(rules)}


@router.post("/rules")
async def create_autopilot_rule(
    body: CreateAutopilotRuleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Create a new Autopilot rule."""
    user_id = get_authenticated_user_id(request, config)
    if body.team_id:
        is_mem = await TeamRepository.is_member(db, body.team_id, user_id)
        if not is_mem:
            raise HTTPException(status_code=403, detail="You do not belong to this team workspace")
    service = AutopilotService(db, config=config)
    rule = await service.create_rule(
        user_id=user_id,
        rule_data=body.model_dump(),
        team_id=body.team_id,
    )
    return {"status": "success", "rule": rule}


@router.post("/rules/{rule_id}/toggle")
async def toggle_autopilot_rule(
    rule_id: str,
    body: ToggleRuleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Pause or resume an Autopilot rule with ownership validation."""
    user_id = get_authenticated_user_id(request, config)
    service = AutopilotService(db, config=config)
    success = await service.toggle_rule(rule_id=rule_id, enabled=body.enabled, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Rule not found or access denied")
    return {"status": "success", "rule_id": rule_id, "enabled": body.enabled}


@router.put("/rules/{rule_id}")
async def update_autopilot_rule(
    rule_id: str,
    body: UpdateAutopilotRuleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Update an Autopilot rule with ownership validation."""
    user_id = get_authenticated_user_id(request, config)
    service = AutopilotService(db, config=config)
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await service.update_rule(rule_id=rule_id, rule_data=update_data, user_id=user_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Rule not found or access denied")
    return {"status": "success", "rule": updated}


@router.delete("/rules/{rule_id}")
async def delete_autopilot_rule(
    rule_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Delete an Autopilot rule with ownership validation."""
    user_id = get_authenticated_user_id(request, config)
    service = AutopilotService(db, config=config)
    deleted = await service.delete_rule(rule_id=rule_id, user_id=user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found or access denied")
    return {"status": "success", "rule_id": rule_id, "deleted": True}


@router.post("/rules/{rule_id}/run")
async def run_autopilot_rule_now(
    rule_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Trigger an immediate execution of an Autopilot rule with ownership validation."""
    user_id = get_authenticated_user_id(request, config)
    service = AutopilotService(db, config=config)
    result = await service.execute_rule(rule_id=rule_id, user_id=user_id)
    return result

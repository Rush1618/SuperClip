"""
API Routes for Source Rights & Creator Authorization Management.
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
from ...services.rights_service import RIGHTS_STATES, RightsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rights", tags=["rights"])


class RegisterRightsRequest(BaseModel):
    source_id: str = Field(min_length=1, max_length=255)
    platform: str = Field(default="youtube", max_length=50)
    rights_state: str = Field(default="creator_authorized")
    creator_identity: Optional[str] = Field(default=None, max_length=255)
    rights_owner: Optional[str] = Field(default=None, max_length=255)
    permission_source: Optional[str] = Field(default="creator_agreement", max_length=255)
    permission_evidence: Optional[str] = Field(default=None)
    permitted_operations: Optional[List[str]] = Field(default=["analyze", "clip", "publish"])
    allowed_destinations: Optional[List[str]] = Field(default=["youtube", "tiktok", "instagram"])
    team_id: Optional[str] = None


@router.get("")
async def list_source_rights(
    request: Request,
    team_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """List registered source rights and creator permissions for the current user/workspace."""
    user_id = get_authenticated_user_id(request, config)
    service = RightsService(db)
    records = await service.list_user_source_rights(user_id=user_id, team_id=team_id, limit=limit)
    return {
        "rights": records,
        "count": len(records),
        "supported_states": sorted(RIGHTS_STATES),
    }


@router.get("/check")
async def check_source_permission(
    request: Request,
    source_id: str = Query(...),
    platform: str = Query("youtube"),
    operation: str = Query("publish"),
    target_destination: Optional[str] = Query(None),
    team_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Evaluate whether an operation (analyze, clip, publish) is permitted for a source."""
    user_id = get_authenticated_user_id(request, config)
    service = RightsService(db)
    decision = await service.check_rights_permission(
        source_id=source_id,
        platform=platform,
        operation=operation,
        user_id=user_id,
        team_id=team_id,
        target_destination=target_destination,
    )
    return decision


@router.post("")
async def register_source_rights(
    body: RegisterRightsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Register creator authorization or ownership for a media source."""
    user_id = get_authenticated_user_id(request, config)
    if body.rights_state not in RIGHTS_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rights_state. Permitted states: {sorted(RIGHTS_STATES)}",
        )

    service = RightsService(db)
    record = await service.register_source_rights(
        user_id=user_id,
        source_id=body.source_id,
        platform=body.platform,
        rights_state=body.rights_state,
        creator_identity=body.creator_identity,
        rights_owner=body.rights_owner,
        permission_source=body.permission_source,
        permission_evidence=body.permission_evidence,
        permitted_operations=body.permitted_operations,
        allowed_destinations=body.allowed_destinations,
        team_id=body.team_id,
    )
    return {
        "status": "success",
        "message": f"Source rights registered for {body.source_id} under state '{body.rights_state}'",
        "rights_record": record,
    }

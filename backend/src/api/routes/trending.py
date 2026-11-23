"""
Trending USA Video Discovery, Live Stream Hype Monitor & Autonomous Clipping API.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import AuthContext, resolve_auth_context
from ...config import get_config
from ...database import get_db
from ...services.trending_service import (
    clear_trending_cache,
    fetch_all_trending,
    fetch_twitch_trending_clips,
    fetch_trending_videos,
    fetch_us_trending_videos,
    get_learning_memory,
    learn_from_trending_videos,
)
from ...services.live_stream_service import (
    analyze_stream_hype_moments,
    check_and_heal_transcript,
    resolve_playable_stream_url,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trending", tags=["trending"])


class LiveMonitorRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048, description="URL of live stream or video to monitor")
    channel: Optional[str] = Field(None, max_length=256, description="Optional channel or streamer name")


class TranscriptionCheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100000, description="Transcription text to analyze and heal")
    channel: Optional[str] = Field(None, max_length=256, description="Channel or speaker context")
    context: Optional[str] = Field(None, max_length=1024, description="Additional context or topic")


async def require_auth(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    """Validate authenticated caller identity for protected trending operations."""
    return await resolve_auth_context(request, db, get_config())


@router.get("")
async def get_trending_videos(
    request: Request,
    platform: str = "all",
    region: str = "US",
    niche: str = "all",
    timeframe: str = "24h",
    limit: int = 25,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Fetch top trending YouTube and Twitch clips/videos filtered by Region, Niche, and Recent 24h Timeframe."""
    if refresh:
        # Require authentication to force an unthrottled live upstream refresh
        await resolve_auth_context(request, db, get_config())

    videos = fetch_all_trending(platform=platform, region=region, niche=niche, timeframe=timeframe, limit=limit, force_refresh=refresh)
    memory = get_learning_memory()
    return {
        "videos": videos,
        "platform": platform,
        "region": region,
        "niche": niche,
        "timeframe": timeframe,
        "total": len(videos),
        "learning_agent": {
            "status": memory.get("status", "active"),
            "cycles_completed": memory.get("total_cycles", 1),
            "videos_analyzed": memory.get("total_videos_analyzed", 20),
            "last_learned_at": memory.get("last_learned_at"),
            "active_hooks": memory.get("learned_hooks", [])[:4],
        },
    }


@router.post("/refresh")
async def force_refresh_trending(
    platform: str = "all",
    region: str = "US",
    niche: str = "all",
    timeframe: str = "24h",
    limit: int = 25,
    auth: AuthContext = Depends(require_auth),
):
    """Force an immediate refresh by querying live YouTube feeds and updating the feed."""
    clear_trending_cache()
    videos = fetch_all_trending(platform=platform, region=region, niche=niche, timeframe=timeframe, limit=limit, force_refresh=True)
    return {"message": "Refreshed live YouTube trending feed", "videos": videos, "total": len(videos)}


@router.get("/learning-status")
async def get_learning_agent_status(
    auth: AuthContext = Depends(require_auth),
):
    """Retrieve details on what the autonomous agent has learned."""
    memory = get_learning_memory()
    return {"learning_agent": memory}


@router.post("/learn-now")
async def trigger_learning_pass(
    auth: AuthContext = Depends(require_auth),
):
    """Trigger an immediate autonomous learning pass from current trending videos."""
    memory = await learn_from_trending_videos()
    return {
        "message": "Learning cycle completed successfully",
        "cycles_completed": memory.get("total_cycles", 1),
        "learned_hooks": memory.get("learned_hooks", []),
    }


@router.post("/live-monitor")
async def monitor_live_stream_endpoint(
    payload: LiveMonitorRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Analyze a live stream (YouTube or Twitch) for peak hype moments and chat spikes."""
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=422, detail="Missing or invalid live stream URL")
    return analyze_stream_hype_moments(url, channel_hint=payload.channel)


@router.post("/check-transcription")
async def check_transcription_endpoint(
    payload: TranscriptionCheckRequest,
    auth: AuthContext = Depends(require_auth),
):
    """
    Examine live speech transcription, extract important keywords ('imp words'),
    and perform AI-powered speech error detection and self-healing.
    """
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Missing or empty transcription text")
    return await check_and_heal_transcript(text, channel=payload.channel or "", context=payload.context or "")


@router.post("/autoclip")
async def autoclip_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_auth),
):
    """
    Automatically queue and create a clipping task for a trending video or specific
    timestamp hype moment. Resolves raw live stream channel URLs to playable video sources.
    """
    from .tasks import SourceAttempt, _create_task

    try:
        body_dict = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON body")

    raw_source = body_dict.get("source") or {}
    orig_url = str(raw_source.get("url") or "").strip()
    if orig_url:
        try:
            playable = resolve_playable_stream_url(orig_url, channel=raw_source.get("title") or "")
            if playable != orig_url:
                raw_source["url"] = playable
                body_dict["source"] = raw_source
        except ValueError as err:
            raise HTTPException(
                status_code=422,
                detail=f"STREAM_NOT_PLAYABLE: {str(err)}",
            )

    new_bytes = json.dumps(body_dict).encode("utf-8")
    request._body = new_bytes
    if hasattr(request, "_json"):
        delattr(request, "_json")

    async def new_receive():
        return {"type": "http.request", "body": new_bytes, "more_body": False}

    request._receive = new_receive

    attempt = SourceAttempt(request, db)
    try:
        response = await _create_task(request, db, attempt)
        await attempt.accepted()
        return response
    except HTTPException as exc:
        await attempt.rejected(exc.status_code, exc.detail)
        raise

"""
Trending USA Video Discovery, Live Stream Hype Monitor & Autonomous Clipping API.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
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


@router.get("")
async def get_trending_videos(
    platform: str = "all",
    region: str = "US",
    niche: str = "all",
    timeframe: str = "24h",
    limit: int = 25,
    refresh: bool = False,
):
    """Fetch top trending YouTube and Twitch clips/videos filtered by Region, Niche, and Recent 24h Timeframe."""
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
):
    """Force an immediate refresh by querying live YouTube feeds and updating the feed."""
    clear_trending_cache()
    videos = fetch_all_trending(platform=platform, region=region, niche=niche, timeframe=timeframe, limit=limit, force_refresh=True)
    return {"message": "Refreshed live YouTube trending feed", "videos": videos, "total": len(videos)}


@router.get("/learning-status")
async def get_learning_agent_status():
    """Retrieve details on what the autonomous agent has learned."""
    memory = get_learning_memory()
    return {"learning_agent": memory}


@router.post("/learn-now")
async def trigger_learning_pass():
    """Trigger an immediate autonomous learning pass from current trending videos."""
    memory = await learn_from_trending_videos()
    return {
        "message": "Learning cycle completed successfully",
        "cycles_completed": memory.get("total_cycles", 1),
        "learned_hooks": memory.get("learned_hooks", []),
    }


import json
import re

async def _safe_json_body(request: Request) -> Dict[str, Any]:
    try:
        body = await request.body()
        if not body:
            return {}
        text = body.decode("utf-8", errors="replace").strip()
        if text.startswith('"{') and text.endswith('}"'):
            text = text[1:-1].replace(r'\"', '"')
        # Handle literal backslash escapes
        text = re.sub(r'\\([^"\\/bfnrtu])', r'\1', text)
        return json.loads(text)
    except Exception:
        try:
            return await request.json()
        except Exception:
            return {}


@router.post("/live-monitor")
async def monitor_live_stream_endpoint(request: Request):
    """Analyze a live stream (YouTube or Twitch) for peak hype moments and chat spikes."""
    body = await _safe_json_body(request)
    url = body.get("url")
    channel = body.get("channel")
    if not url or not isinstance(url, str):
        raise HTTPException(status_code=400, detail="Missing or invalid live stream URL")
    return analyze_stream_hype_moments(url, channel_hint=channel)


@router.post("/check-transcription")
async def check_transcription_endpoint(request: Request):
    """
    Examine live speech transcription, extract important keywords ('imp words'),
    and perform AI-powered speech error detection and self-healing.
    """
    body = await _safe_json_body(request)
    text = body.get("text") or ""
    channel = body.get("channel") or ""
    context = body.get("context") or ""
    if not text.strip():
        raise HTTPException(status_code=400, detail="Missing or empty transcription text")
    return await check_and_heal_transcript(text, channel=channel, context=context)


@router.post("/autoclip")
async def autoclip_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Automatically queue and create a clipping task for a trending video or specific
    timestamp hype moment. Resolves raw live stream channel URLs to playable video sources.
    """
    from .tasks import SourceAttempt, _create_task

    # Inspect incoming payload to resolve unplayable live channel URLs
    body_dict = await _safe_json_body(request)
    raw_source = body_dict.get("source") or {}
    orig_url = str(raw_source.get("url") or "").strip()
    if orig_url:
        playable = resolve_playable_stream_url(orig_url, channel=raw_source.get("title") or "")
        if playable != orig_url:
            raw_source["url"] = playable
            body_dict["source"] = raw_source
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

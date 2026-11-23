"""
Autonomous Multi-Platform Social Upload & Publishing Service.

Automatically pushes rendered viral clips to connected user platforms
(YouTube Shorts, TikTok, Instagram Reels, Twitter/X) in auto-clipping mode.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from .social_service import SocialService
from .trending_service import get_learning_memory
from ..config import Config, get_config
from ..repositories.clip_repository import ClipRepository
from ..repositories.social_repository import SocialRepository

logger = logging.getLogger(__name__)


class AutoUploadService:
    """Manages autonomous social distribution for generated video clips."""

    def __init__(
        self,
        db: AsyncSession,
        config: Optional[Config] = None,
        queue_adapter=None,
    ):
        self.db = db
        self.config = config or get_config()
        self.queue_adapter = queue_adapter
        self.social_service = SocialService(
            db=self.db,
            config=self.config,
            queue_adapter=self.queue_adapter,
        )

    async def get_auto_upload_overview(self, user_id: str, team_id: Optional[str] = None) -> Dict[str, Any]:
        """Check active platforms, account connections, and auto-upload readiness."""
        accounts = await self.social_service.list_connections(user_id, team_id=team_id)
        active_accounts = [
            acc for acc in accounts
            if not acc.get("revoked_at") and acc.get("status") != "reauth_required"
        ]
        connected_providers = list({acc["provider"] for acc in active_accounts})
        return {
            "auto_upload_ready": len(active_accounts) > 0,
            "connected_accounts_count": len(active_accounts),
            "connected_providers": connected_providers,
            "accounts": [
                {
                    "id": acc["id"],
                    "provider": acc["provider"],
                    "username": acc.get("username") or acc.get("account_name") or acc["id"],
                    "account_name": acc.get("account_name"),
                }
                for acc in active_accounts
            ],
            "default_platforms": connected_providers,
        }

    async def auto_upload_clip(
        self,
        user_id: str,
        *,
        task_id: str,
        clip_id: str,
        team_id: Optional[str] = None,
        platforms: Optional[List[str]] = None,
        privacy_level: str = "public",
    ) -> Dict[str, Any]:
        """
        Automatically upload and publish a specific clip across all (or selected) connected platforms.
        Generates platform-tailored viral hooks, tags, and titles using learned viral patterns.
        """
        clip = await ClipRepository.get_clip_by_id(self.db, clip_id)
        if not clip:
            return {"status": "error", "message": f"Clip {clip_id} not found", "posts": []}

        accounts = await self.social_service.list_connections(user_id, team_id=team_id)
        valid_accounts = [
            acc for acc in accounts
            if not acc.get("revoked_at") and acc.get("status") != "reauth_required"
        ]

        if not valid_accounts:
            return {
                "status": "no_connected_accounts",
                "message": (
                    "Auto-upload is ready, but no social accounts (YouTube, TikTok, Instagram) "
                    "are currently connected. Connect accounts in Settings to enable automated distribution."
                ),
                "clip_id": clip_id,
                "posts": [],
            }

        # Filter by requested platforms if provided
        target_accounts = valid_accounts
        if platforms and len(platforms) > 0 and "all" not in platforms:
            plat_set = {p.lower().strip() for p in platforms}
            target_accounts = [acc for acc in valid_accounts if acc["provider"].lower() in plat_set]

        if not target_accounts:
            return {
                "status": "no_matching_accounts",
                "message": f"No active connections found for platforms: {platforms}",
                "clip_id": clip_id,
                "posts": [],
            }

        created_posts = []
        errors = []

        # Get viral learning hooks to optimize captions
        memory = get_learning_memory()
        viral_tags = memory.get("trending_hashtags", ["#viral", "#shorts", "#trending", "#fyp"])

        for acc in target_accounts:
            provider = acc["provider"]
            try:
                # 1. Generate optimized caption & title for platform
                draft_caption = ""
                draft_title = clip.get("hook_title") or clip.get("title") or "Viral Clip"
                hashtags = list(viral_tags[:5])

                try:
                    caption_result = await self.social_service.generate_caption(
                        user_id,
                        task_id=task_id,
                        clip_id=clip_id,
                        provider=provider,
                        team_id=team_id,
                    )
                    if caption_result and isinstance(caption_result, dict):
                        draft_caption = caption_result.get("caption") or ""
                        if caption_result.get("title"):
                            draft_title = caption_result["title"]
                        if caption_result.get("hashtags"):
                            hashtags = caption_result["hashtags"]
                except Exception as cap_err:
                    logger.debug("Automatic caption draft error on %s, using fallback: %s", provider, cap_err)
                    draft_caption = f"{draft_title}\n\n{' '.join(hashtags)}"

                # 2. Create the post record and queue it for publishing
                post = await self.social_service.create_post(
                    user_id,
                    task_id=task_id,
                    clip_id=clip_id,
                    social_account_id=acc["id"],
                    title=draft_title,
                    caption=draft_caption,
                    hashtags=hashtags,
                    privacy_level=privacy_level,
                    scheduled_for=None,  # Immediate publication
                    team_id=team_id,
                )
                created_posts.append({
                    "post_id": post["id"],
                    "provider": provider,
                    "account_name": acc.get("account_name") or acc.get("username"),
                    "status": post.get("status", "queued"),
                    "title": draft_title,
                })
                logger.info("Auto-upload post created for clip %s to %s", clip_id, provider)

            except Exception as post_err:
                logger.warning("Failed to auto-upload clip %s to %s: %s", clip_id, provider, post_err)
                errors.append({"provider": provider, "error": str(post_err)})

        return {
            "status": "success" if created_posts else "failed",
            "clip_id": clip_id,
            "uploaded_count": len(created_posts),
            "posts": created_posts,
            "errors": errors,
            "message": f"Auto-uploaded to {len(created_posts)} platform(s)" if created_posts else "Failed to auto-upload",
        }

    async def auto_upload_task_clips(
        self,
        user_id: str,
        *,
        task_id: str,
        team_id: Optional[str] = None,
        platforms: Optional[List[str]] = None,
        privacy_level: str = "public",
        top_clips_only: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Auto-upload all (or top N) clips from a completed task across connected channels.
        """
        clips = await ClipRepository.get_clips_by_task_id(self.db, task_id)
        if not clips:
            return {"status": "no_clips", "message": f"No clips found for task {task_id}", "results": []}

        # Sort clips by virality score so best content goes first
        sorted_clips = sorted(clips, key=lambda c: c.get("virality_score") or 0, reverse=True)
        if top_clips_only and top_clips_only > 0:
            sorted_clips = sorted_clips[:top_clips_only]

        results = []
        for clip in sorted_clips:
            res = await self.auto_upload_clip(
                user_id,
                task_id=task_id,
                clip_id=clip["id"],
                team_id=team_id,
                platforms=platforms,
                privacy_level=privacy_level,
            )
            results.append(res)

        total_uploaded = sum(r.get("uploaded_count", 0) for r in results)
        return {
            "status": "completed",
            "task_id": task_id,
            "total_clips_evaluated": len(sorted_clips),
            "total_posts_created": total_uploaded,
            "results": results,
        }


async def maybe_trigger_auto_upload(
    task_id: str,
    user_id: str,
    db: Optional[AsyncSession] = None,
) -> Optional[Dict[str, Any]]:
    """
    Check if a completed task has auto-upload enabled in its workflow_settings
    or create_settings. If enabled, automatically uploads generated clips to
    connected platforms.
    """
    from ..repositories.task_repository import TaskRepository

    if db is None:
        try:
            from ..database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                return await maybe_trigger_auto_upload(task_id, user_id, db=session)
        except Exception as exc:
            logger.debug("Database session unavailable for auto-upload trigger: %s", exc)
            return None

    task = await TaskRepository.get_task(db, task_id)
    if not task:
        return None

    settings = task.get("create_settings") or {}
    workflow_settings = task.get("workflow_settings") or {}
    auto_upload_enabled = bool(
        workflow_settings.get("auto_upload") or settings.get("auto_upload")
    )
    if not auto_upload_enabled:
        return None

    logger.info(f"Task {task_id} has auto_upload enabled; triggering autonomous social upload.")
    service = AutoUploadService(db)
    return await service.auto_upload_task_clips(
        user_id=user_id,
        task_id=task_id,
        team_id=task.get("team_id"),
    )


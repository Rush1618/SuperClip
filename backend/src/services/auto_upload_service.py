"""
Autonomous Multi-Platform Social Upload & Publishing Service.

Automatically pushes rendered viral clips to connected user platforms
(YouTube Shorts, TikTok, Instagram Reels) in auto-clipping mode.
Enforces rights checks, outbox idempotency, and transactional intent tracking.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .rights_service import RightsService
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
        self.rights_service = RightsService(self.db)

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
        Verifies source rights, records transactional publishing intents with idempotency,
        and generates platform-tailored viral hooks and captions.
        """
        clip = await ClipRepository.get_clip_by_id(self.db, clip_id)
        if not clip:
            return {"status": "error", "message": f"Clip {clip_id} not found", "posts": []}

        # Verify source rights before distributing
        # 0. Check global social publishing feature gate
        if os.getenv("SOCIAL_PUBLISHING_ACCESS", "off").lower() in ("off", "false", "0"):
            return {
                "status": "disabled",
                "message": "Social publishing is currently disabled by administrator (SOCIAL_PUBLISHING_ACCESS=off).",
                "clip_id": clip_id,
                "posts": [],
            }

        from ..repositories.task_repository import TaskRepository
        task = await TaskRepository.get_task_by_id(self.db, task_id)
        source_id = task.get("source_id") or task_id if task else task_id
        source_platform = task.get("source_type") or "youtube" if task else "youtube"

        rights_check = await self.rights_service.check_rights_permission(
            source_id=source_id,
            platform=source_platform,
            operation="publish",
            user_id=user_id,
            team_id=team_id,
        )
        if not rights_check["allowed"]:
            logger.warning(
                "Auto-upload blocked for clip %s (task %s): %s",
                clip_id,
                task_id,
                rights_check["reason"],
            )
            return {
                "status": "blocked_by_rights",
                "message": rights_check["reason"],
                "rights_state": rights_check.get("rights_state"),
                "clip_id": clip_id,
                "posts": [],
            }

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

        # Enforce persistent automation preferences (virality threshold, daily limits, platforms)
        from .automation_service import AutomationService
        pref = await AutomationService(self.db).get_preferences(user_id, team_id=team_id)

        min_virality = int(pref.get("min_virality_score", 0)) if pref else 0
        clip_score = int(clip.get("virality_score") or 0)
        if min_virality > 0 and clip_score < min_virality:
            return {
                "status": "below_virality_threshold",
                "message": f"Clip virality score ({clip_score}) is below configured minimum threshold ({min_virality}).",
                "clip_id": clip_id,
                "posts": [],
            }

        max_daily = int(pref.get("max_daily_posts", 10)) if pref else 10
        daily_posts_res = await self.db.execute(
            text("""
                SELECT COUNT(*) FROM publishing_intents
                WHERE (user_id = :user_id OR (:team_id IS NOT NULL AND team_id = :team_id))
                  AND status IN ('queued', 'published')
                  AND created_at >= CURRENT_DATE
            """),
            {"user_id": user_id, "team_id": team_id},
        )
        today_posts = int(daily_posts_res.scalar() or 0)
        if today_posts >= max_daily:
            return {
                "status": "daily_limit_reached",
                "message": f"Daily publishing limit ({max_daily} posts) reached for today.",
                "clip_id": clip_id,
                "posts": [],
            }

        # Filter by requested or configured platforms
        effective_platforms = platforms
        if not effective_platforms and pref and pref.get("selected_platforms"):
            effective_platforms = pref.get("selected_platforms")

        target_accounts = valid_accounts
        if effective_platforms and len(effective_platforms) > 0 and "all" not in effective_platforms:
            plat_set = {p.lower().strip() for p in effective_platforms}
            target_accounts = [acc for acc in valid_accounts if acc["provider"].lower() in plat_set]

        if not target_accounts:
            return {
                "status": "no_matching_accounts",
                "message": f"No active connections found for platforms: {effective_platforms or 'all'}",
                "clip_id": clip_id,
                "posts": [],
            }

        created_posts = []
        errors = []

        # Get viral learning hooks to optimize captions
        memory = get_learning_memory()
        viral_tags = memory.get("trending_hashtags", ["#viral", "#shorts", "#trending", "#fyp"])
        privacy_overrides = pref.get("account_privacy_overrides") or {} if pref else {}

        for acc in target_accounts:
            provider = acc["provider"]
            idempotency_key = f"{clip_id}:{acc['id']}:{task_id}"

            # Check if intent already exists in outbox
            existing_intent = await self.db.execute(
                text("SELECT id, social_post_id, status, external_post_id, external_url FROM publishing_intents WHERE idempotency_key = :k"),
                {"k": idempotency_key},
            )
            row = existing_intent.mappings().first()
            intent_id = None
            if row:
                if row["status"] != "pending" or row.get("social_post_id"):
                    logger.info("Publishing intent already active for clip %s to %s (status: %s)", clip_id, provider, row["status"])
                    created_posts.append({
                        "post_id": row.get("social_post_id") or row["id"],
                        "intent_id": row["id"],
                        "provider": provider,
                        "account_name": acc.get("account_name") or acc.get("username"),
                        "status": row["status"],
                        "external_url": row.get("external_url"),
                        "title": clip.get("title", "Clip"),
                    })
                    continue
                else:
                    logger.info("Recovering orphaned pending publishing intent %s for clip %s to %s", row["id"], clip_id, provider)
                    intent_id = row["id"]

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

                # Enforce privacy overrides per platform / account
                effective_privacy = privacy_overrides.get(provider) or pref.get("default_privacy_level") or privacy_level
                if provider == "tiktok" and effective_privacy == "public":
                    effective_privacy = "private"

                # 2. Record transactional publishing intent in PostgreSQL with race protection if not recovered
                if not intent_id:
                    intent_id = str(uuid4())
                    insert_res = await self.db.execute(
                        text(
                            """
                            INSERT INTO publishing_intents (
                                id, user_id, team_id, task_id, clip_id, social_account_id,
                                provider, idempotency_key, status, title, caption, hashtags,
                                privacy_level, created_at, updated_at
                            ) VALUES (
                                :id, :user_id, :team_id, :task_id, :clip_id, :social_account_id,
                                :provider, :idempotency_key, 'pending', :title, :caption, :hashtags,
                                :privacy_level, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                            )
                            ON CONFLICT (idempotency_key) DO NOTHING
                            RETURNING id
                            """
                        ),
                        {
                            "id": intent_id,
                            "user_id": user_id,
                            "team_id": team_id,
                            "task_id": task_id,
                            "clip_id": clip_id,
                            "social_account_id": acc["id"],
                            "provider": provider,
                            "idempotency_key": idempotency_key,
                            "title": draft_title,
                            "caption": draft_caption,
                            "hashtags": hashtags,
                            "privacy_level": effective_privacy,
                        },
                    )
                    await self.db.commit()
                    inserted_row = insert_res.fetchone()

                    if not inserted_row:
                        # Concurrent insert handled by another worker
                        existing_intent = await self.db.execute(
                            text("SELECT id, social_post_id, status, external_url FROM publishing_intents WHERE idempotency_key = :k"),
                            {"k": idempotency_key},
                        )
                        row = existing_intent.mappings().first()
                        if row:
                            created_posts.append({
                                "post_id": row.get("social_post_id") or row["id"],
                                "intent_id": row["id"],
                                "provider": provider,
                                "account_name": acc.get("account_name") or acc.get("username"),
                                "status": row["status"],
                                "external_url": row.get("external_url"),
                                "title": draft_title,
                            })
                        continue

                # 3. Create the post record and queue it for publishing
                post = await self.social_service.create_post(
                    user_id,
                    task_id=task_id,
                    clip_id=clip_id,
                    social_account_id=acc["id"],
                    title=draft_title,
                    caption=draft_caption,
                    hashtags=hashtags,
                    privacy_level=effective_privacy,
                    scheduled_for=None,  # Immediate publication
                    team_id=team_id,
                )

                # Link social_post_id and mark status queued on intent atomically
                await self.db.execute(
                    text("""
                        UPDATE publishing_intents
                        SET social_post_id = :post_id, status = 'queued', updated_at = CURRENT_TIMESTAMP
                        WHERE id = :id
                    """),
                    {"id": intent_id, "post_id": post["id"]},
                )
                await self.db.commit()

                created_posts.append({
                    "post_id": post["id"],
                    "intent_id": intent_id,
                    "provider": provider,
                    "account_name": acc.get("account_name") or acc.get("username"),
                    "status": post.get("status", "queued"),
                    "title": draft_title,
                })
                logger.info("Auto-upload post created for clip %s to %s", clip_id, provider)

            except Exception as post_err:
                logger.warning("Failed to auto-upload clip %s to %s: %s", clip_id, provider, post_err)
                if intent_id:
                    try:
                        await self.db.execute(
                            text("UPDATE publishing_intents SET status = 'failed', last_error = :err WHERE id = :id"),
                            {"id": intent_id, "err": str(post_err)[:500]},
                        )
                        await self.db.commit()
                    except Exception:
                        pass
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

    async def list_publishing_queue(
        self,
        user_id: str,
        team_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """List active and recent items in the publishing queue."""
        query = text(
            """
            SELECT i.id, i.task_id, i.clip_id, i.provider, i.status, i.title,
                   i.caption, i.privacy_level, i.attempts, i.external_post_id,
                   i.external_url, i.last_error, i.created_at, i.published_at,
                   a.display_name AS account_name, a.avatar_url AS account_avatar
            FROM publishing_intents i
            LEFT JOIN social_accounts a ON i.social_account_id = a.id
            WHERE i.user_id = :user_id OR (:team_id IS NOT NULL AND i.team_id = :team_id)
            ORDER BY i.created_at DESC
            LIMIT :limit
            """
        )
        res = await self.db.execute(query, {"user_id": user_id, "team_id": team_id, "limit": limit})
        return [dict(r) for r in res.mappings().all()]


async def maybe_trigger_auto_upload(
    task_id: str,
    user_id: str,
    db: Optional[AsyncSession] = None,
) -> Optional[Dict[str, Any]]:
    """
    Check if a completed task has auto-upload enabled in its workflow_settings,
    create_settings, or user persistent automation preferences.
    If enabled, automatically uploads generated clips to connected platforms.
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

    task = await TaskRepository.get_task_by_id(db, task_id)
    if not task:
        return None

    settings = task.get("create_settings") or {}
    workflow_settings = task.get("workflow_settings") or {}
    auto_upload_enabled = bool(
        workflow_settings.get("auto_upload") or settings.get("auto_upload")
    )

    # Check user/workspace persistent automation preferences if not explicitly set on task
    top_n = None
    if not auto_upload_enabled:
        from .automation_service import AutomationService
        pref = await AutomationService(db).get_preferences(user_id, team_id=task.get("team_id"))
        if pref and pref.get("auto_publish_enabled"):
            auto_upload_enabled = True
            top_n = pref.get("top_clips_only")

    if not auto_upload_enabled:
        return None

    logger.info("Task %s has auto_upload enabled; triggering autonomous social upload.", task_id)
    service = AutoUploadService(db)
    return await service.auto_upload_task_clips(
        user_id=user_id,
        task_id=task_id,
        team_id=task.get("team_id"),
        top_clips_only=top_n,
    )

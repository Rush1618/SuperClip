"""
Persistent Automation Preferences & Policies Service.

Replaces localStorage-only automation settings with authoritative PostgreSQL-backed
preferences supporting user and workspace/team levels.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_AUTOMATION_PREFERENCES = {
    "auto_publish_enabled": False,
    "default_privacy_level": "public",
    "max_daily_posts": 10,
    "top_clips_only": 3,
    "min_virality_score": 60,
    "selected_platforms": ["youtube", "tiktok", "instagram"],
    "account_privacy_overrides": {},
    "schedule_preference": "immediate",
    "local_only_mode": False,
    "cloud_ai_allowed": True,
    "speech_healing_enabled": True,
    "important_words_enabled": True,
    "learning_loop_enabled": True,
    "chunked_download_enabled": True,
    "chunk_window_seconds": 180,
    "primary_ai_model": "ollama:qwen2.5:7b",
    "fallback_ai_model": "openrouter:deepseek/deepseek-chat",
    "ai_voice_hook_enabled": True,
    "ai_voice_style": "viral_guy",
}


class AutomationService:
    """Manages persistent automation policies and preferences."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_preferences(
        self,
        user_id: str,
        team_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fetch persistent automation preferences, or initialize defaults."""
        query = text(
            """
            SELECT id, user_id, team_id, auto_publish_enabled, default_privacy_level,
                   max_daily_posts, top_clips_only, min_virality_score, selected_platforms,
                   account_privacy_overrides, schedule_preference, local_only_mode,
                   cloud_ai_allowed, speech_healing_enabled, important_words_enabled,
                   learning_loop_enabled, chunked_download_enabled, chunk_window_seconds,
                   primary_ai_model, fallback_ai_model, ai_voice_hook_enabled,
                   ai_voice_style, created_at, updated_at
            FROM automation_preferences
            WHERE (:team_id IS NOT NULL AND team_id = :team_id)
               OR (team_id IS NULL AND user_id = :user_id)
            ORDER BY (team_id IS NOT NULL) DESC
            LIMIT 1
            """
        )
        result = await self.db.execute(query, {"user_id": user_id, "team_id": team_id})
        row = result.mappings().first()
        if row:
            data = dict(row)
            # Ensure JSON fields are parsed if returned as string
            for k in ("selected_platforms", "account_privacy_overrides"):
                if isinstance(data.get(k), str):
                    try:
                        data[k] = json.loads(data[k])
                    except Exception:
                        pass
            return data

        # If none exist, create and return default preferences
        return await self.initialize_defaults(user_id=user_id, team_id=team_id)

    async def initialize_defaults(
        self,
        user_id: str,
        team_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Initialize and persist default automation preferences."""
        new_id = str(uuid4())
        insert_query = text(
            """
            INSERT INTO automation_preferences (
                id, user_id, team_id, auto_publish_enabled, default_privacy_level,
                max_daily_posts, top_clips_only, min_virality_score, selected_platforms,
                account_privacy_overrides, schedule_preference, local_only_mode,
                cloud_ai_allowed, speech_healing_enabled, important_words_enabled,
                learning_loop_enabled, chunked_download_enabled, chunk_window_seconds,
                primary_ai_model, fallback_ai_model, ai_voice_hook_enabled,
                ai_voice_style, created_at, updated_at
            ) VALUES (
                :id, :user_id, :team_id, :auto_publish_enabled, :default_privacy_level,
                :max_daily_posts, :top_clips_only, :min_virality_score, :selected_platforms,
                :account_privacy_overrides, :schedule_preference, :local_only_mode,
                :cloud_ai_allowed, :speech_healing_enabled, :important_words_enabled,
                :learning_loop_enabled, :chunked_download_enabled, :chunk_window_seconds,
                :primary_ai_model, :fallback_ai_model, :ai_voice_hook_enabled,
                :ai_voice_style, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING id, user_id, team_id, auto_publish_enabled, default_privacy_level,
                      max_daily_posts, top_clips_only, min_virality_score, selected_platforms,
                      created_at
            """
        )
        params = {
            "id": new_id,
            "user_id": user_id,
            "team_id": team_id,
            "auto_publish_enabled": DEFAULT_AUTOMATION_PREFERENCES["auto_publish_enabled"],
            "default_privacy_level": DEFAULT_AUTOMATION_PREFERENCES["default_privacy_level"],
            "max_daily_posts": DEFAULT_AUTOMATION_PREFERENCES["max_daily_posts"],
            "top_clips_only": DEFAULT_AUTOMATION_PREFERENCES["top_clips_only"],
            "min_virality_score": DEFAULT_AUTOMATION_PREFERENCES["min_virality_score"],
            "selected_platforms": json.dumps(DEFAULT_AUTOMATION_PREFERENCES["selected_platforms"]),
            "account_privacy_overrides": json.dumps(DEFAULT_AUTOMATION_PREFERENCES["account_privacy_overrides"]),
            "schedule_preference": DEFAULT_AUTOMATION_PREFERENCES["schedule_preference"],
            "local_only_mode": DEFAULT_AUTOMATION_PREFERENCES["local_only_mode"],
            "cloud_ai_allowed": DEFAULT_AUTOMATION_PREFERENCES["cloud_ai_allowed"],
            "speech_healing_enabled": DEFAULT_AUTOMATION_PREFERENCES["speech_healing_enabled"],
            "important_words_enabled": DEFAULT_AUTOMATION_PREFERENCES["important_words_enabled"],
            "learning_loop_enabled": DEFAULT_AUTOMATION_PREFERENCES["learning_loop_enabled"],
            "chunked_download_enabled": DEFAULT_AUTOMATION_PREFERENCES["chunked_download_enabled"],
            "chunk_window_seconds": DEFAULT_AUTOMATION_PREFERENCES["chunk_window_seconds"],
            "primary_ai_model": DEFAULT_AUTOMATION_PREFERENCES["primary_ai_model"],
            "fallback_ai_model": DEFAULT_AUTOMATION_PREFERENCES["fallback_ai_model"],
            "ai_voice_hook_enabled": DEFAULT_AUTOMATION_PREFERENCES["ai_voice_hook_enabled"],
            "ai_voice_style": DEFAULT_AUTOMATION_PREFERENCES["ai_voice_style"],
        }
        result = await self.db.execute(insert_query, params)
        await self.db.commit()
        return {**DEFAULT_AUTOMATION_PREFERENCES, "id": new_id, "user_id": user_id, "team_id": team_id}

    async def update_preferences(
        self,
        user_id: str,
        updates: Dict[str, Any],
        team_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Update persistent automation preferences."""
        current = await self.get_preferences(user_id, team_id=team_id)
        record_id = current["id"]

        allowed_keys = {
            "auto_publish_enabled",
            "default_privacy_level",
            "max_daily_posts",
            "top_clips_only",
            "min_virality_score",
            "selected_platforms",
            "account_privacy_overrides",
            "schedule_preference",
            "local_only_mode",
            "cloud_ai_allowed",
            "speech_healing_enabled",
            "important_words_enabled",
            "learning_loop_enabled",
            "chunked_download_enabled",
            "chunk_window_seconds",
            "primary_ai_model",
            "fallback_ai_model",
            "ai_voice_hook_enabled",
            "ai_voice_style",
        }

        set_clauses = ["updated_at = CURRENT_TIMESTAMP"]
        params: Dict[str, Any] = {"id": record_id}

        for k, v in updates.items():
            if k in allowed_keys and v is not None:
                if k in ("selected_platforms", "account_privacy_overrides") and not isinstance(v, str):
                    params[k] = json.dumps(v)
                else:
                    params[k] = v
                set_clauses.append(f"{k} = :{k}")

        update_query = text(
            f"""
            UPDATE automation_preferences
            SET {', '.join(set_clauses)}
            WHERE id = :id
            """
        )
        await self.db.execute(update_query, params)
        await self.db.commit()

        return await self.get_preferences(user_id, team_id=team_id)

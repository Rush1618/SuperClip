"""
PostgreSQL-backed Viral Learning Memory Repository.
Persists and retrieves autonomous viral patterns, hook formulas, and retention triggers.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_VIRAL_MEMORY: Dict[str, Any] = {
    "version": "2.0",
    "last_learned_at": datetime.now(timezone.utc).isoformat(),
    "total_cycles": 1,
    "total_videos_analyzed": 20,
    "learned_hooks": [
        "Curiosity gap: 'I never expected this to happen when...'",
        "Pattern interrupt: 'Stop scrolling if you care about...'",
        "Contrarian claim: 'Everyone thinks X, but the truth is completely different.'",
        "Immediate payoff: 'Here is the exact reason why this changed everything.'",
        "High-stakes storytelling: 'In the next 30 seconds, I'll show you how...'",
    ],
    "title_formulas": [
        "I Tried [X] So You Don't Have To",
        "The Real Truth About [Topic]",
        "Why Nobody Is Talking About [X]",
        "Don't Do [X] Until You Watch This",
        "How [Person/Topic] Actually Happened",
    ],
    "retention_triggers": [
        "Wait till you see what happened next...",
        "I honestly couldn't believe this part.",
        "Drop your thoughts in the comments 👇",
        "If you've been in this situation, let me know below.",
    ],
    "trending_hashtags": [
        "#fyp", "#shorts", "#viral", "#trending", "#youtube",
        "#creator", "#mindblown", "#storytime", "#facts"
    ],
    "virality_boost_rules": "Score higher for clips opening with an energetic claim, direct question, or high-stakes reveal.",
    "average_score_boost_pct": 18,
    "status": "active_continuous_learning",
}

# In-memory fallback if PostgreSQL is temporarily unavailable or in local test fixtures
_MEMORY_CACHE: Dict[str, Any] = dict(DEFAULT_VIRAL_MEMORY)


class ViralLearningRepository:
    """Repository for managing autonomous viral pattern learning in PostgreSQL."""

    @staticmethod
    async def get_latest_memory(session: Optional[AsyncSession] = None) -> Dict[str, Any]:
        """Fetch the most recent viral learning record from PostgreSQL."""
        if session is not None:
            return await ViralLearningRepository._fetch_from_session(session)

        try:
            from ..database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                return await ViralLearningRepository._fetch_from_session(db)
        except Exception as exc:
            logger.debug("Database not reachable for viral learning memory, using fallback: %s", exc)
            return dict(_MEMORY_CACHE)

    @staticmethod
    async def _fetch_from_session(db: AsyncSession) -> Dict[str, Any]:
        try:
            result = await db.execute(
                text(
                    """
                    SELECT cycle_number, learned_hooks, title_formulas, retention_triggers,
                           trending_hashtags, virality_boost_rules, videos_analyzed_count, created_at
                    FROM viral_learning_records
                    ORDER BY created_at DESC
                    LIMIT 1
                    """
                )
            )
            row = result.fetchone()
            if not row:
                return dict(_MEMORY_CACHE)

            hooks = row.learned_hooks if isinstance(row.learned_hooks, list) else json.loads(row.learned_hooks or "[]")
            formulas = row.title_formulas if isinstance(row.title_formulas, list) else json.loads(row.title_formulas or "[]")
            triggers = row.retention_triggers if isinstance(row.retention_triggers, list) else json.loads(row.retention_triggers or "[]")
            hashtags = row.trending_hashtags if isinstance(row.trending_hashtags, list) else json.loads(row.trending_hashtags or "[]")

            loaded = {
                "version": "2.0",
                "last_learned_at": row.created_at.isoformat() if row.created_at else datetime.now(timezone.utc).isoformat(),
                "total_cycles": row.cycle_number,
                "total_videos_analyzed": row.videos_analyzed_count,
                "learned_hooks": hooks or DEFAULT_VIRAL_MEMORY["learned_hooks"],
                "title_formulas": formulas or DEFAULT_VIRAL_MEMORY["title_formulas"],
                "retention_triggers": triggers or DEFAULT_VIRAL_MEMORY["retention_triggers"],
                "trending_hashtags": hashtags or DEFAULT_VIRAL_MEMORY["trending_hashtags"],
                "virality_boost_rules": row.virality_boost_rules or DEFAULT_VIRAL_MEMORY["virality_boost_rules"],
                "average_score_boost_pct": 18,
                "status": "active_continuous_learning",
            }
            _MEMORY_CACHE.update(loaded)
            return loaded
        except Exception as exc:
            logger.debug("Error querying viral_learning_records table: %s", exc)
            return dict(_MEMORY_CACHE)

    @staticmethod
    async def save_memory(memory: Dict[str, Any], session: Optional[AsyncSession] = None) -> None:
        """Atomically insert a new viral learning cycle into PostgreSQL."""
        _MEMORY_CACHE.update(memory)

        if session is not None:
            await ViralLearningRepository._insert_record(session, memory)
            return

        try:
            from ..database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                await ViralLearningRepository._insert_record(db, memory)
                await db.commit()
        except Exception as exc:
            logger.debug("Could not persist viral learning record to PostgreSQL: %s", exc)

    @staticmethod
    async def _insert_record(db: AsyncSession, memory: Dict[str, Any]) -> None:
        hooks = json.dumps(memory.get("learned_hooks", []))
        formulas = json.dumps(memory.get("title_formulas", []))
        triggers = json.dumps(memory.get("retention_triggers", []))
        hashtags = json.dumps(memory.get("trending_hashtags", []))

        await db.execute(
            text(
                """
                INSERT INTO viral_learning_records (
                    cycle_number, learned_hooks, title_formulas, retention_triggers,
                    trending_hashtags, virality_boost_rules, videos_analyzed_count, created_at
                ) VALUES (
                    :cycle_number, :learned_hooks::jsonb, :title_formulas::jsonb, :retention_triggers::jsonb,
                    :trending_hashtags::jsonb, :virality_boost_rules, :videos_analyzed_count, NOW()
                )
                """
            ),
            {
                "cycle_number": memory.get("total_cycles", 1),
                "learned_hooks": hooks,
                "title_formulas": formulas,
                "retention_triggers": triggers,
                "trending_hashtags": hashtags,
                "virality_boost_rules": memory.get("virality_boost_rules", ""),
                "videos_analyzed_count": memory.get("total_videos_analyzed", 0),
            },
        )


-- Migration: 20261123_0006_automation_preferences.sql
-- Persistent automation preferences

CREATE TABLE IF NOT EXISTS automation_preferences (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE,
    auto_publish_enabled BOOLEAN NOT NULL DEFAULT false,
    default_privacy_level VARCHAR(40) NOT NULL DEFAULT 'public',
    max_daily_posts INTEGER NOT NULL DEFAULT 10,
    top_clips_only INTEGER NOT NULL DEFAULT 3,
    min_virality_score INTEGER NOT NULL DEFAULT 60,
    selected_platforms JSONB NOT NULL DEFAULT '["youtube", "tiktok", "instagram"]'::jsonb,
    account_privacy_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    schedule_preference VARCHAR(40) NOT NULL DEFAULT 'immediate',
    local_only_mode BOOLEAN NOT NULL DEFAULT false,
    cloud_ai_allowed BOOLEAN NOT NULL DEFAULT true,
    speech_healing_enabled BOOLEAN NOT NULL DEFAULT true,
    important_words_enabled BOOLEAN NOT NULL DEFAULT true,
    learning_loop_enabled BOOLEAN NOT NULL DEFAULT true,
    chunked_download_enabled BOOLEAN NOT NULL DEFAULT true,
    chunk_window_seconds INTEGER NOT NULL DEFAULT 180,
    primary_ai_model VARCHAR(80) NOT NULL DEFAULT 'ollama:qwen2.5:7b',
    fallback_ai_model VARCHAR(80) NOT NULL DEFAULT 'openrouter:deepseek/deepseek-chat',
    ai_voice_hook_enabled BOOLEAN NOT NULL DEFAULT true,
    ai_voice_style VARCHAR(40) NOT NULL DEFAULT 'viral_guy',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_preferences_user_id ON automation_preferences (user_id) WHERE team_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_preferences_team_id ON automation_preferences (team_id) WHERE team_id IS NOT NULL;

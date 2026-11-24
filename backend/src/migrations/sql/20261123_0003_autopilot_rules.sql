-- Migration: 20261123_0003_autopilot_rules.sql
-- Autonomous autopilot rules engine and execution tracking

CREATE TABLE IF NOT EXISTS autopilot_rules (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    sources JSONB NOT NULL DEFAULT '["youtube", "twitch"]'::jsonb,
    platforms JSONB NOT NULL DEFAULT '["youtube", "tiktok", "instagram"]'::jsonb,
    channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    niche VARCHAR(80) NOT NULL DEFAULT 'all',
    region VARCHAR(10) NOT NULL DEFAULT 'US',
    languages JSONB NOT NULL DEFAULT '["en"]'::jsonb,
    keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    excluded_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_trend_score INTEGER NOT NULL DEFAULT 70,
    min_rights_status VARCHAR(40) NOT NULL DEFAULT 'creator_authorized',
    processing_workflow VARCHAR(40) NOT NULL DEFAULT 'highlights',
    clip_count INTEGER NOT NULL DEFAULT 3,
    daily_limit INTEGER NOT NULL DEFAULT 5,
    schedule_cron VARCHAR(50) NOT NULL DEFAULT '0 */2 * * *',
    max_concurrent_jobs INTEGER NOT NULL DEFAULT 2,
    last_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_autopilot_rules_user_id ON autopilot_rules (user_id);
CREATE INDEX IF NOT EXISTS idx_autopilot_rules_team_id ON autopilot_rules (team_id);
CREATE INDEX IF NOT EXISTS idx_autopilot_rules_enabled ON autopilot_rules (enabled);

CREATE TABLE IF NOT EXISTS autopilot_executions (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    rule_id VARCHAR(36) NOT NULL REFERENCES autopilot_rules(id) ON DELETE CASCADE,
    status VARCHAR(40) NOT NULL DEFAULT 'completed',
    sources_scanned INTEGER NOT NULL DEFAULT 0,
    eligible_sources INTEGER NOT NULL DEFAULT 0,
    tasks_created INTEGER NOT NULL DEFAULT 0,
    clips_generated INTEGER NOT NULL DEFAULT 0,
    posts_published INTEGER NOT NULL DEFAULT 0,
    rejected_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_autopilot_executions_rule_id ON autopilot_executions (rule_id);
CREATE INDEX IF NOT EXISTS idx_autopilot_executions_created_at ON autopilot_executions (created_at DESC);

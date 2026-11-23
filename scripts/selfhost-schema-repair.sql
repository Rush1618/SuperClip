-- Catch-up for databases created from an older init.sql (or before the table existed).
-- Idempotent: safe on a fresh install and on an existing one. init.sql ends with this
-- exact block; frontend/src/lib/schema-drift.test.ts keeps the two identical and keeps
-- init.sql in step with frontend/prisma/schema.prisma.
-- On an existing install: docker compose exec -T postgres psql -U supoclip -d supoclip < scripts/selfhost-schema-repair.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255);

ALTER TABLE stripe_webhook_events ADD COLUMN IF NOT EXISTS claim_token VARCHAR(255);
ALTER TABLE stripe_webhook_events ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE stripe_webhook_events ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'processed';

CREATE TABLE IF NOT EXISTS ai_edit_usage_events (
    job_id VARCHAR(32) PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    refunded_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS ix_ai_edit_usage_events_user_created ON ai_edit_usage_events (user_id, created_at);

CREATE TABLE IF NOT EXISTS email_deliveries (
    message_id VARCHAR(255) PRIMARY KEY,
    recipient VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    region VARCHAR(64) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_email_deliveries_recipient ON email_deliveries (recipient);

CREATE TABLE IF NOT EXISTS minute_usage_events (
    id VARCHAR(36) PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT,
    minutes INTEGER NOT NULL,
    source_duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    refunded_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS ix_minute_usage_events_user_created ON minute_usage_events (user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS minute_usage_events_task_id_key ON minute_usage_events (task_id);

CREATE TABLE IF NOT EXISTS service_statuses (
    id VARCHAR(80) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL,
    headline VARCHAR(120) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stripe_account_migrations (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_account VARCHAR(255) NOT NULL,
    source_customer VARCHAR(255) NOT NULL,
    source_subscription VARCHAR(255) NOT NULL,
    destination_account VARCHAR(255) NOT NULL,
    destination_customer VARCHAR(255) NOT NULL,
    destination_subscription VARCHAR(255),
    destination_schedule VARCHAR(255),
    stage VARCHAR(32) NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    paid_through TIMESTAMP WITH TIME ZONE NOT NULL,
    source_stopped_verified BOOLEAN NOT NULL DEFAULT false,
    source_resumed_verified BOOLEAN NOT NULL DEFAULT false,
    destination_disabled_verified BOOLEAN NOT NULL DEFAULT false,
    destination_paid_invoice VARCHAR(255),
    cancellation_requested BOOLEAN NOT NULL DEFAULT false,
    recovery_required BOOLEAN NOT NULL DEFAULT false,
    review_reason TEXT,
    livemode BOOLEAN NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_account_migrations_user_id_key ON stripe_account_migrations (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_account_migrations_source_account_source_customer_key
    ON stripe_account_migrations (source_account, source_customer);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_account_migrations_destination_account_destination_c_key
    ON stripe_account_migrations (destination_account, destination_customer);

CREATE TABLE IF NOT EXISTS social_accounts (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    external_account_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    username VARCHAR(255),
    avatar_url TEXT,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    scopes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_unique_account
    ON social_accounts (user_id, provider, external_account_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_user_id ON social_accounts (user_id);

CREATE TABLE IF NOT EXISTS social_oauth_states (
    state VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    code_verifier VARCHAR(255),
    redirect_uri TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_oauth_states_expires_at ON social_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS social_posts (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE SET NULL,
    clip_id VARCHAR(36),
    social_account_id VARCHAR(36) REFERENCES social_accounts(id) ON DELETE SET NULL,
    provider VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    scheduled_for TIMESTAMP WITH TIME ZONE,
    title VARCHAR(255),
    caption TEXT,
    hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
    privacy_level VARCHAR(40) NOT NULL DEFAULT 'public',
    media_token VARCHAR(64) UNIQUE,
    media_token_expires_at TIMESTAMP WITH TIME ZONE,
    source_file_path TEXT,
    pending_handle VARCHAR(255),
    external_post_id VARCHAR(255),
    external_url TEXT,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    claimed_at TIMESTAMP WITH TIME ZONE,
    hook_type VARCHAR(50),
    hook_title VARCHAR(255),
    virality_score INTEGER,
    hook_score INTEGER,
    engagement_score INTEGER,
    value_score INTEGER,
    shareability_score INTEGER,
    clip_duration DOUBLE PRECISION,
    published_at TIMESTAMP WITH TIME ZONE,
    publish_notification_sent_at TIMESTAMP WITH TIME ZONE,
    last_metrics_at TIMESTAMP WITH TIME ZONE,
    metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_posts_clip_id ON social_posts (clip_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status_scheduled ON social_posts (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_social_posts_task_id ON social_posts (task_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_user_id ON social_posts (user_id);
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS publish_notification_sent_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS social_post_metrics (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    post_id VARCHAR(36) NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    views BIGINT,
    likes BIGINT,
    comments BIGINT,
    shares BIGINT,
    saves BIGINT,
    raw JSONB
);
CREATE INDEX IF NOT EXISTS idx_social_post_metrics_post_id ON social_post_metrics (post_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    owner_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan VARCHAR(20) NOT NULL DEFAULT 'free',
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'inactive',
    subscription_provider VARCHAR(20),
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_account_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    seat_limit INTEGER NOT NULL DEFAULT 3 CHECK (seat_limit >= 1),
    billing_period_start TIMESTAMP WITH TIME ZONE,
    billing_period_end TIMESTAMP WITH TIME ZONE,
    subscription_cancel_at TIMESTAMP WITH TIME ZONE,
    pending_plan VARCHAR(20),
    pending_plan_invoice_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_teams_owner_id ON teams (owner_id);

CREATE TABLE IF NOT EXISTS team_members (
    team_id VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    monthly_minute_limit INTEGER CHECK (monthly_minute_limit IS NULL OR monthly_minute_limit >= 0),
    monthly_ai_edit_limit INTEGER CHECK (monthly_ai_edit_limit IS NULL OR monthly_ai_edit_limit >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_team_members_user_id ON team_members (user_id);

CREATE TABLE IF NOT EXISTS team_invitations (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    team_id VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    invited_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_team_invitations_team_email ON team_invitations (team_id, email);
CREATE INDEX IF NOT EXISTS ix_team_invitations_email ON team_invitations (email);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks (team_id);

ALTER TABLE minute_usage_events ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_minute_usage_events_team_created ON minute_usage_events (team_id, created_at);

ALTER TABLE ai_edit_usage_events ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_ai_edit_usage_events_team_created ON ai_edit_usage_events (team_id, created_at);

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_social_accounts_team_id ON social_accounts (team_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_team_unique ON social_accounts (team_id, provider, external_account_id) WHERE team_id IS NOT NULL;
ALTER TABLE social_accounts ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE social_oauth_states ADD COLUMN IF NOT EXISTS team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_social_posts_team_id ON social_posts (team_id);

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_api_keys_team_id ON api_keys (team_id);

CREATE TABLE IF NOT EXISTS viral_learning_records (
    id SERIAL PRIMARY KEY,
    cycle_number INTEGER NOT NULL DEFAULT 1,
    learned_hooks JSONB NOT NULL DEFAULT '[]'::jsonb,
    title_formulas JSONB NOT NULL DEFAULT '[]'::jsonb,
    retention_triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
    trending_hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
    virality_boost_rules TEXT,
    videos_analyzed_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_viral_learning_created_at ON viral_learning_records (created_at DESC);

CREATE TABLE IF NOT EXISTS source_rights (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
    team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE,
    source_id VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    creator_identity VARCHAR(255),
    rights_owner VARCHAR(255),
    rights_state VARCHAR(40) NOT NULL DEFAULT 'personal_analysis_only',
    permission_source VARCHAR(255),
    permission_evidence TEXT,
    permitted_operations JSONB NOT NULL DEFAULT '["analyze"]'::jsonb,
    allowed_destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_source_rights_source_platform ON source_rights (source_id, platform);
CREATE INDEX IF NOT EXISTS idx_source_rights_user_id ON source_rights (user_id);
CREATE INDEX IF NOT EXISTS idx_source_rights_team_id ON source_rights (team_id);

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

CREATE TABLE IF NOT EXISTS publishing_intents (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE,
    task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE CASCADE,
    clip_id VARCHAR(36) NOT NULL,
    social_account_id VARCHAR(36) REFERENCES social_accounts(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    title VARCHAR(255),
    caption TEXT,
    hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
    privacy_level VARCHAR(40) NOT NULL DEFAULT 'public',
    scheduled_for TIMESTAMP WITH TIME ZONE,
    attempts INTEGER NOT NULL DEFAULT 0,
    external_post_id VARCHAR(255),
    external_url TEXT,
    last_error TEXT,
    claimed_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_publishing_intents_status ON publishing_intents (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_publishing_intents_task_clip ON publishing_intents (task_id, clip_id);
CREATE INDEX IF NOT EXISTS idx_publishing_intents_user_id ON publishing_intents (user_id);

CREATE TABLE IF NOT EXISTS live_stream_sessions (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE,
    stream_url TEXT NOT NULL,
    platform VARCHAR(50) NOT NULL,
    channel_id VARCHAR(255),
    channel_name VARCHAR(255),
    status VARCHAR(40) NOT NULL DEFAULT 'monitoring',
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stopped_at TIMESTAMP WITH TIME ZONE,
    peak_chat_velocity INTEGER NOT NULL DEFAULT 0,
    detected_moments_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_stream_sessions_user ON live_stream_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_live_stream_sessions_team ON live_stream_sessions (team_id);

CREATE TABLE IF NOT EXISTS live_events (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    session_id VARCHAR(36) NOT NULL REFERENCES live_stream_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL DEFAULT 'chat_spike',
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stream_time_seconds FLOAT NOT NULL DEFAULT 0.0,
    hype_score INTEGER NOT NULL DEFAULT 0,
    chat_velocity INTEGER NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    clip_task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE SET NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'detected',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_events_session ON live_events (session_id, event_timestamp DESC);

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

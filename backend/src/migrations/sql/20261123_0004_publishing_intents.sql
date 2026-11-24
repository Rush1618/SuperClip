-- Migration: 20261123_0004_publishing_intents.sql
-- Durable publishing transactional outbox

CREATE TABLE IF NOT EXISTS publishing_intents (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE,
    task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE CASCADE,
    clip_id VARCHAR(36) NOT NULL,
    social_account_id VARCHAR(36) REFERENCES social_accounts(id) ON DELETE CASCADE,
    social_post_id VARCHAR(36) REFERENCES social_posts(id) ON DELETE SET NULL,
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
ALTER TABLE publishing_intents ADD COLUMN IF NOT EXISTS social_post_id VARCHAR(36) REFERENCES social_posts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_publishing_intents_social_post_id ON publishing_intents (social_post_id);

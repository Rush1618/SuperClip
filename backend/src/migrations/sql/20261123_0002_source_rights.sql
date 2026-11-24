-- Migration: 20261123_0002_source_rights.sql
-- Source Rights and Creator Authorization system

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

-- Migration: 20261123_0005_live_stream_monitoring.sql
-- Live stream monitoring sessions and chat spike events

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

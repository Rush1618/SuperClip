-- Migration: 20261123_0001_viral_learning_records.sql
-- Autonomous viral pattern learning memory persisted in PostgreSQL

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


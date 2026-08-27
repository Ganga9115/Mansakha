-- migration_011_ollama_and_policies.sql
-- Description: Adds tables for the Ollama 15-question dynamic Check-In flow and Ministry Policy deployment.

BEGIN;

-- 1. Table for Ollama Dynamic Questionnaires
CREATE TABLE IF NOT EXISTS victim_questionnaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    victim_id UUID REFERENCES victims(victim_id) ON DELETE CASCADE,
    responses JSONB NOT NULL DEFAULT '[]'::jsonb, -- Stores the Q&A pairs
    predicted_distress_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for victim_questionnaires
ALTER TABLE victim_questionnaires ENABLE ROW LEVEL SECURITY;

-- Victims can insert their own questionnaires
CREATE POLICY "Victims can insert their own questionnaires"
    ON victim_questionnaires
    FOR INSERT
    WITH CHECK (victim_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid);

-- Victims can read their own questionnaires
CREATE POLICY "Victims can read their own questionnaires"
    ON victim_questionnaires
    FOR SELECT
    USING (victim_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid);

-- Staff/Ministry can read all questionnaires (assuming privacy isn't restricted here per user prompt)
CREATE POLICY "Staff can read all questionnaires"
    ON victim_questionnaires
    FOR SELECT
    USING (
        (current_setting('request.jwt.claims', true)::json->>'account_type') IN ('Counsellor', 'Administration', 'Ministry')
    );

-- 2. Table for Ministry Policies
-- Policies are strategic interventions deployed by National/State admins to measure impact over time.
-- Note: Re-creating this safely just in case migration_009_ministry_analytics didn't create it exactly as needed, 
-- or ensuring it exists if it wasn't there.
CREATE TABLE IF NOT EXISTS policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id UUID REFERENCES jurisdictions(jurisdiction_id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    launched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID REFERENCES officials(official_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for policies
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

-- Admins/Ministry can insert and read policies
CREATE POLICY "Admins can manage policies"
    ON policies
    FOR ALL
    USING (
        (current_setting('request.jwt.claims', true)::json->>'account_type') IN ('Administration', 'Ministry')
    );

-- Staff can read policies
CREATE POLICY "Staff can read policies"
    ON policies
    FOR SELECT
    USING (
        (current_setting('request.jwt.claims', true)::json->>'account_type') IN ('Counsellor', 'Administration', 'Ministry')
    );

COMMIT;

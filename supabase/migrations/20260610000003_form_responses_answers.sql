-- Add answers + created_at columns to form_responses if they don't exist yet.
-- (Original table uses response_data / submitted_at; new code uses answers / created_at)
ALTER TABLE public.form_responses
  ADD COLUMN IF NOT EXISTS answers     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

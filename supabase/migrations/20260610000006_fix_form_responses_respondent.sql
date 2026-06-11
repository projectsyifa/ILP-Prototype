-- Fix form_responses: rename user_id → respondent_id so code matches schema
-- Also set database timezone to Asia/Jakarta (GMT+7 / WIB)

-- 1. Timezone: set database default to WIB
ALTER DATABASE postgres SET timezone TO 'Asia/Jakarta';

-- 2. Rename column user_id → respondent_id on form_responses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'form_responses'
      AND column_name  = 'user_id'
  ) THEN
    ALTER TABLE public.form_responses RENAME COLUMN user_id TO respondent_id;
  END IF;
END $$;

-- 3. Add index on respondent_id for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_form_responses_respondent ON public.form_responses (respondent_id);

-- 4. Rebuild RLS policies that reference the column
DROP POLICY IF EXISTS "fr_select" ON public.form_responses;
DROP POLICY IF EXISTS "fr_insert" ON public.form_responses;
DROP POLICY IF EXISTS "fr_admin"  ON public.form_responses;

-- Participants can read their own responses; admins can read all
CREATE POLICY "fr_select" ON public.form_responses
  FOR SELECT USING (
    respondent_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Any authenticated user can insert (RLS on respondent_id enforced at app layer)
CREATE POLICY "fr_insert" ON public.form_responses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Admins can update/delete
CREATE POLICY "fr_admin" ON public.form_responses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

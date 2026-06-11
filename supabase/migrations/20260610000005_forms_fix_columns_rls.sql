-- Fix missing columns on forms table that the app inserts but never declared
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS mode           text DEFAULT 'gform',
  ADD COLUMN IF NOT EXISTS is_master      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS master_category text,
  ADD COLUMN IF NOT EXISTS entry_nama       text,
  ADD COLUMN IF NOT EXISTS entry_id_peserta text,
  ADD COLUMN IF NOT EXISTS entry_email      text,
  ADD COLUMN IF NOT EXISTS entry_institusi  text,
  ADD COLUMN IF NOT EXISTS entry_training   text,
  ADD COLUMN IF NOT EXISTS fields           jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS training_id      uuid REFERENCES public.trainings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gsheet_id        text,
  ADD COLUMN IF NOT EXISTS gform_url        text,
  ADD COLUMN IF NOT EXISTS gform_edit_url   text,
  ADD COLUMN IF NOT EXISTS gform_embed_url  text;

-- Fix RLS: allow any authenticated admin to write to forms
-- Uses auth.uid() directly to avoid stale security-definer caching issues
DROP POLICY IF EXISTS "forms_write"  ON public.forms;
DROP POLICY IF EXISTS "forms_read"   ON public.forms;

CREATE POLICY "forms_read" ON public.forms
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "forms_write" ON public.forms
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Also fix form_responses insert policy — participants must be able to insert their own
DROP POLICY IF EXISTS "fr_insert"            ON public.form_responses;
DROP POLICY IF EXISTS "form_responses_insert" ON public.form_responses;

CREATE POLICY "fr_insert" ON public.form_responses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

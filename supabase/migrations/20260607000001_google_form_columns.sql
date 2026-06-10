-- ILP Academy 2026 — Google Form integration columns
-- Safe to re-run (all IF NOT EXISTS)

-- =====================================================================
-- ASSIGNMENTS: columns for Google Form auto-create & prefill
-- =====================================================================
alter table public.assignments add column if not exists gsheet_id    text;
alter table public.assignments add column if not exists form_url     text;
alter table public.assignments add column if not exists entry_nama   text;
alter table public.assignments add column if not exists entry_email  text;
alter table public.assignments add column if not exists entry_institusi text;

-- =====================================================================
-- FORMS: columns for Form Builder Google Form integration
-- =====================================================================
alter table public.forms add column if not exists training_id    uuid references public.trainings(id) on delete set null;
alter table public.forms add column if not exists gsheet_id      text;
alter table public.forms add column if not exists gform_url      text;
alter table public.forms add column if not exists gform_edit_url text;
alter table public.forms add column if not exists gform_embed_url text;
alter table public.forms add column if not exists fields         jsonb default '[]'::jsonb;

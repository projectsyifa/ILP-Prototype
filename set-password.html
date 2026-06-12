-- ILP Academy 2026 redesign migration (idempotent; safe to re-run)
--  ILP ACADEMY 2026 — UPGRADE / MIGRATION SECTION
--  Everything below is idempotent and safe to re-run any number of times.
--  Applied automatically by `npm run migrate` and the GitHub Action.
-- =====================================================================
-- =====================================================================

-- ---------- Columns the app already uses (schema drift fix) ----------
-- Scheduled visibility used across the participant views.
alter table public.trainings   add column if not exists visible_from timestamptz;
alter table public.materials   add column if not exists visible_from timestamptz;
alter table public.assignments add column if not exists visible_from timestamptz;

-- ---------- Richer content metadata ----------
alter table public.materials add column if not exists type text default 'file';            -- file | video | text | link
alter table public.materials add column if not exists content text;                        -- inline rich text / embed url
alter table public.materials add column if not exists chapter text;                         -- grouping label
alter table public.materials add column if not exists order_index integer default 0;        -- ordering within a training
alter table public.materials add column if not exists estimated_minutes integer;            -- est. reading/watch time

alter table public.assignments add column if not exists type text default 'tugas';          -- tugas | latihan | kuis | ujian
alter table public.assignments add column if not exists max_points integer default 100;

-- ---------- Grading (nilai 0–100) ----------
alter table public.feedbacks add column if not exists score integer;

-- ---------- Profile fields used by the Profile page ----------
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists bio text;

-- =====================================================================
-- NEW TABLES
-- =====================================================================

-- Form Builder (internal forms + saved Google Form embeds)
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null default 'internal',   -- internal | gform
  schema jsonb default '[]'::jsonb,         -- array of field defs (internal forms)
  embed_url text,                           -- google form embed url (gform)
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  respondent_id uuid references public.profiles(id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Media library (Supabase Storage objects + external Drive/links metadata)
create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id) on delete set null,
  title text,
  url text not null,
  provider text not null default 'supabase', -- supabase | gdrive | external
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Per-material progress tracking for participants
create table if not exists public.material_progress (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (material_id, participant_id)
);

-- Explicit training enrollments (optional; program is open-enrolment by default)
create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (training_id, participant_id)
);

-- Server-pushed notifications (the app also computes notifications client-side)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link_hash text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- rename old column names to new schema if still old names
do $$
begin
  -- material_progress: user_id -> participant_id
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_progress' and column_name = 'user_id'
  ) then
    alter table public.material_progress rename column user_id to participant_id;
  end if;

  -- form_responses: user_id -> respondent_id
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'form_responses' and column_name = 'user_id'
  ) then
    alter table public.form_responses rename column user_id to respondent_id;
  end if;

  -- training_enrollments: user_id -> participant_id
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_enrollments' and column_name = 'user_id'
  ) then
    alter table public.training_enrollments rename column user_id to participant_id;
  end if;
end $$;

create index if not exists material_progress_user_idx on public.material_progress (participant_id);
create index if not exists form_responses_form_idx on public.form_responses (form_id);

-- =====================================================================
-- RLS for the new tables
-- =====================================================================
alter table public.forms                enable row level security;
alter table public.form_responses       enable row level security;
alter table public.media_files          enable row level security;
alter table public.material_progress    enable row level security;
alter table public.training_enrollments enable row level security;
alter table public.notifications        enable row level security;

-- forms: read = any authenticated, write = admin
drop policy if exists "forms_read"  on public.forms;
create policy "forms_read"  on public.forms  for select using (auth.role() = 'authenticated');
drop policy if exists "forms_write" on public.forms;
create policy "forms_write" on public.forms  for all using (public.is_admin()) with check (public.is_admin());

-- form_responses: insert by anyone authenticated; read own or admin
drop policy if exists "fr_insert" on public.form_responses;
create policy "fr_insert" on public.form_responses for insert with check (auth.role() = 'authenticated');
drop policy if exists "fr_select" on public.form_responses;
create policy "fr_select" on public.form_responses for select using (respondent_id = auth.uid() or public.is_admin());
drop policy if exists "fr_admin"  on public.form_responses;
create policy "fr_admin"  on public.form_responses for all using (public.is_admin()) with check (public.is_admin());

-- media_files: read any authenticated, write admin
drop policy if exists "media_read"  on public.media_files;
create policy "media_read"  on public.media_files for select using (auth.role() = 'authenticated');
drop policy if exists "media_write" on public.media_files;
create policy "media_write" on public.media_files for all using (public.is_admin()) with check (public.is_admin());

-- material_progress: each participant manages their own; admin can read
drop policy if exists "mp_select" on public.material_progress;
create policy "mp_select" on public.material_progress for select using (participant_id = auth.uid() or public.is_admin());
drop policy if exists "mp_upsert" on public.material_progress;
create policy "mp_upsert" on public.material_progress for insert with check (participant_id = auth.uid());
drop policy if exists "mp_update" on public.material_progress;
create policy "mp_update" on public.material_progress for update using (participant_id = auth.uid()) with check (participant_id = auth.uid());

-- training_enrollments: participant self-enrol; admin manage
drop policy if exists "te_select" on public.training_enrollments;
create policy "te_select" on public.training_enrollments for select using (participant_id = auth.uid() or public.is_admin());
drop policy if exists "te_insert" on public.training_enrollments;
create policy "te_insert" on public.training_enrollments for insert with check (participant_id = auth.uid() or public.is_admin());
drop policy if exists "te_admin"  on public.training_enrollments;
create policy "te_admin"  on public.training_enrollments for all using (public.is_admin()) with check (public.is_admin());

-- notifications: each user reads/updates their own; admin can insert for anyone
drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "notif_update" on public.notifications;
create policy "notif_update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notif_admin"  on public.notifications;
create policy "notif_admin"  on public.notifications for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- END UPGRADE SECTION
-- =====================================================================

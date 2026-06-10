-- =====================================================================
-- ILP Academy LMS 2026 — Supabase Schema, RLS Policies, Storage Buckets
-- =====================================================================
-- This file is FULLY IDEMPOTENT. Running it multiple times is safe.
-- It is applied automatically by `npm run migrate` (scripts/migrate.mjs)
-- and by the GitHub Action in .github/workflows/migrate.yml.
-- You can also paste it into the Supabase SQL Editor and run it once.
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists pgcrypto;

-- ---------- Enums ----------
do $$ begin
  create type user_role as enum ('admin', 'participant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum ('draft', 'submitted', 'late', 'reviewed');
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'participant',
  full_name text,
  institution text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text,
  status text not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.trainings (
  id uuid primary key default gen_random_uuid(),
  week_number integer,
  title text not null,
  description text,
  speaker text,
  zoom_link text,
  training_date date not null,
  start_time time,
  end_time time,
  attachment_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id) on delete set null,
  title text not null,
  description text,
  file_url text,
  publish_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id) on delete set null,
  title text not null,
  description text,
  deadline timestamptz,
  attachment_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  file_url text,
  status submission_status not null default 'submitted',
  submitted_at timestamptz default now(),
  created_at timestamptz not null default now(),
  unique (assignment_id, participant_id)
);

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  attendance_status text not null default 'present',
  created_at timestamptz not null default now(),
  unique (training_id, participant_id)
);

-- =====================================================================
-- IDEMPOTENT COLUMN UPGRADES (safe to re-run on an existing database)
-- =====================================================================

-- profiles: extended profile fields used by the participant detail drawer
alter table public.profiles add column if not exists jabatan      text;
alter table public.profiles add column if not exists bidang_ilmu  text;
alter table public.profiles add column if not exists nuptk        text;
alter table public.profiles add column if not exists whatsapp     text;
alter table public.profiles add column if not exists phone        text;
alter table public.profiles add column if not exists bio          text;
alter table public.profiles add column if not exists avatar_url   text;

-- trainings / materials / assignments: scheduled visibility ("Tampil mulai ...")
alter table public.trainings   add column if not exists week_number  integer;
alter table public.trainings   add column if not exists visible_from timestamptz;
alter table public.materials   add column if not exists visible_from timestamptz;
alter table public.assignments add column if not exists visible_from timestamptz;

-- assignments: Google Form submission integration + scoring
alter table public.assignments add column if not exists form_url        text;
alter table public.assignments add column if not exists entry_nama      text;
alter table public.assignments add column if not exists entry_email     text;
alter table public.assignments add column if not exists entry_institusi text;
alter table public.assignments add column if not exists max_points      integer default 100;

-- submissions: numeric grade (powers analytics + feedback page)
alter table public.submissions add column if not exists grade integer;

-- =====================================================================
-- NEW FEATURE TABLES (Form Builder, Media, Progress, Enrollment, Notif)
-- =====================================================================

-- Form builder (internal forms + embedded Google Forms)
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id) on delete set null,
  title text not null,
  description text,
  type text default 'custom',          -- 'pretest'|'posttest'|'survey'|'attendance'|'custom'
  mode text default 'internal',         -- 'gform'|'internal'
  gform_url text,
  gform_embed_url text,
  gform_edit_url text,
  gsheet_id text,
  fields jsonb default '[]'::jsonb,      -- internal field definitions
  show_trigger text default 'manual',    -- 'manual'|'before_session'|'after_session'
  session_number integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Idempotent column add for databases created before this column existed
alter table public.forms add column if not exists gform_edit_url text;

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references public.forms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  response_data jsonb default '{}'::jsonb,
  file_urls jsonb default '[]'::jsonb,
  submitted_at timestamptz not null default now()
);

-- Media/file metadata (file itself lives in Google Drive / Storage)
create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid references public.profiles(id) on delete set null,
  context text,                          -- 'material'|'submission'|'form_response'
  context_id uuid,
  original_name text,
  mime_type text,
  drive_file_id text,
  drive_view_link text,
  drive_embed_link text,
  drive_download_link text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- Per-material reading progress
create table if not exists public.material_progress (
  user_id uuid references public.profiles(id) on delete cascade,
  material_id uuid references public.materials(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  time_spent_seconds integer not null default 0,
  primary key (user_id, material_id)
);

-- Training enrollment
create table if not exists public.training_enrollments (
  training_id uuid references public.trainings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  status text not null default 'active', -- 'active'|'completed'|'dropped'
  primary key (training_id, user_id)
);

-- Notifications (bell icon)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text,                             -- 'tugas_baru'|'nilai_keluar'|'form_tersedia'|...
  title text,
  body text,
  link_hash text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Helpful indexes ----------
create index if not exists idx_materials_training   on public.materials(training_id);
create index if not exists idx_assignments_training on public.assignments(training_id);
create index if not exists idx_submissions_part     on public.submissions(participant_id);
create index if not exists idx_attendances_part     on public.attendances(participant_id);
create index if not exists idx_notifications_user   on public.notifications(user_id, is_read);
create index if not exists idx_form_responses_form  on public.form_responses(form_id);

-- ---------- Auto-create profile on new auth user ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, institution, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'institution',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'participant')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        institution = coalesce(public.profiles.institution, excluded.institution);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Helper: is current user an admin? ----------
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- Enable RLS ----------
alter table public.profiles             enable row level security;
alter table public.invitations          enable row level security;
alter table public.trainings            enable row level security;
alter table public.materials            enable row level security;
alter table public.assignments          enable row level security;
alter table public.submissions          enable row level security;
alter table public.feedbacks            enable row level security;
alter table public.attendances          enable row level security;
alter table public.forms                enable row level security;
alter table public.form_responses       enable row level security;
alter table public.media_files          enable row level security;
alter table public.material_progress    enable row level security;
alter table public.training_enrollments enable row level security;
alter table public.notifications        enable row level security;

-- ---------- Policies: profiles ----------
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());

-- ---------- Policies: content tables (read = any authed, write = admin) ----------
do $$
declare t text;
begin
  foreach t in array array['trainings','materials','assignments','forms'] loop
    execute format('drop policy if exists "%1$s_read" on public.%1$s;', t);
    execute format('create policy "%1$s_read" on public.%1$s for select using (auth.role() = ''authenticated'');', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$s;', t);
    execute format('create policy "%1$s_write" on public.%1$s for all using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- ---------- Policies: submissions ----------
drop policy if exists "submissions_select" on public.submissions;
create policy "submissions_select" on public.submissions
  for select using (participant_id = auth.uid() or public.is_admin());

drop policy if exists "submissions_insert" on public.submissions;
create policy "submissions_insert" on public.submissions
  for insert with check (participant_id = auth.uid());

drop policy if exists "submissions_update" on public.submissions;
create policy "submissions_update" on public.submissions
  for update using (participant_id = auth.uid() or public.is_admin())
  with check (participant_id = auth.uid() or public.is_admin());

drop policy if exists "submissions_delete" on public.submissions;
create policy "submissions_delete" on public.submissions
  for delete using (public.is_admin());

-- ---------- Policies: feedbacks ----------
drop policy if exists "feedbacks_select" on public.feedbacks;
create policy "feedbacks_select" on public.feedbacks
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.submissions s
      where s.id = feedbacks.submission_id and s.participant_id = auth.uid()
    )
  );

drop policy if exists "feedbacks_write" on public.feedbacks;
create policy "feedbacks_write" on public.feedbacks
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Policies: attendances ----------
drop policy if exists "attendances_select" on public.attendances;
create policy "attendances_select" on public.attendances
  for select using (participant_id = auth.uid() or public.is_admin());

drop policy if exists "attendances_write" on public.attendances;
create policy "attendances_write" on public.attendances
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "attendances_self_insert" on public.attendances;
create policy "attendances_self_insert" on public.attendances
  for insert with check (participant_id = auth.uid());

drop policy if exists "attendances_self_update" on public.attendances;
create policy "attendances_self_update" on public.attendances
  for update using (participant_id = auth.uid() or public.is_admin())
  with check (participant_id = auth.uid() or public.is_admin());

-- ---------- Policies: invitations (admin only) ----------
drop policy if exists "invitations_admin" on public.invitations;
create policy "invitations_admin" on public.invitations
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Policies: form_responses ----------
drop policy if exists "form_responses_select" on public.form_responses;
create policy "form_responses_select" on public.form_responses
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "form_responses_insert" on public.form_responses;
create policy "form_responses_insert" on public.form_responses
  for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "form_responses_admin" on public.form_responses;
create policy "form_responses_admin" on public.form_responses
  for delete using (public.is_admin());

-- ---------- Policies: media_files ----------
drop policy if exists "media_files_select" on public.media_files;
create policy "media_files_select" on public.media_files
  for select using (auth.role() = 'authenticated');

drop policy if exists "media_files_insert" on public.media_files;
create policy "media_files_insert" on public.media_files
  for insert with check (uploader_id = auth.uid() or public.is_admin());

drop policy if exists "media_files_modify" on public.media_files;
create policy "media_files_modify" on public.media_files
  for update using (uploader_id = auth.uid() or public.is_admin());

drop policy if exists "media_files_delete" on public.media_files;
create policy "media_files_delete" on public.media_files
  for delete using (uploader_id = auth.uid() or public.is_admin());

-- ---------- Policies: material_progress (own rows) ----------
drop policy if exists "material_progress_all" on public.material_progress;
create policy "material_progress_all" on public.material_progress
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ---------- Policies: training_enrollments ----------
drop policy if exists "enroll_select" on public.training_enrollments;
create policy "enroll_select" on public.training_enrollments
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "enroll_write" on public.training_enrollments;
create policy "enroll_write" on public.training_enrollments
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Policies: notifications (own rows) ----------
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications
  for delete using (user_id = auth.uid() or public.is_admin());

-- =====================================================================
-- Storage buckets
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policies: materials (read public, write admin)
drop policy if exists "materials_read" on storage.objects;
create policy "materials_read" on storage.objects
  for select using (bucket_id = 'materials');

drop policy if exists "materials_write" on storage.objects;
create policy "materials_write" on storage.objects
  for insert with check (bucket_id = 'materials' and public.is_admin());

drop policy if exists "materials_update" on storage.objects;
create policy "materials_update" on storage.objects
  for update using (bucket_id = 'materials' and public.is_admin());

drop policy if exists "materials_delete" on storage.objects;
create policy "materials_delete" on storage.objects
  for delete using (bucket_id = 'materials' and public.is_admin());

-- Storage policies: submissions (owner folder or admin)
drop policy if exists "submissions_read" on storage.objects;
create policy "submissions_read" on storage.objects
  for select using (
    bucket_id = 'submissions'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "submissions_insert" on storage.objects;
create policy "submissions_insert" on storage.objects
  for insert with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "submissions_update" on storage.objects;
create policy "submissions_update" on storage.objects
  for update using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policies: avatars (read public, write own folder)
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_write" on storage.objects;
create policy "avatars_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- Promote your first admin (run AFTER you sign that user up once):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- =====================================================================

-- Fix material_progress: rename user_id -> participant_id if needed, add id col
do $$
begin
  -- rename user_id to participant_id if still old name
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_progress' and column_name = 'user_id'
  ) then
    alter table public.material_progress rename column user_id to participant_id;
  end if;

  -- add id column if not exists (new schema has it as primary key)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_progress' and column_name = 'id'
  ) then
    alter table public.material_progress add column id uuid default gen_random_uuid();
  end if;
end $$;

-- Fix material_progress index (safe now that column exists)
create index if not exists material_progress_user_idx on public.material_progress (participant_id);

-- Fix RLS policies for material_progress
drop policy if exists "mp_select" on public.material_progress;
create policy "mp_select" on public.material_progress for select using (participant_id = auth.uid() or public.is_admin());
drop policy if exists "mp_upsert" on public.material_progress;
create policy "mp_upsert" on public.material_progress for insert with check (participant_id = auth.uid());
drop policy if exists "mp_update" on public.material_progress;
create policy "mp_update" on public.material_progress for update using (participant_id = auth.uid()) with check (participant_id = auth.uid());

-- Add grade & feedback_note to submissions
alter table public.submissions add column if not exists grade integer;
alter table public.submissions add column if not exists feedback_note text;

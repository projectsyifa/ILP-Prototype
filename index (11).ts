/**
 * Edge Function: db-migrate
 * Connects directly to Postgres via SUPABASE_DB_URL (auto-injected).
 * No bootstrap required — self-contained.
 */

import { corsHeaders, ok, err } from "../_shared/cors.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "20260601120000_redesign_2026",
    sql: `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS institution text;
          ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;`,
  },
  {
    name: "20260607000000_add_grade_column",
    sql: `ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS grade numeric;`,
  },
  {
    name: "20260607000001_google_form_columns",
    sql: `ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS gsheet_id text;
          ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS gform_url text;
          ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS gform_edit_url text;`,
  },
  {
    name: "20260607000002_sync_assignment_gsheet",
    sql: `ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS gsheet_id text;
          ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS form_url text;
          ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS entry_nama text;
          ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS entry_email text;
          ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS entry_institusi text;`,
  },
  {
    name: "20260610000001_master_forms",
    sql: `ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;
          ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS master_category text;
          ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS entry_ids jsonb DEFAULT '{}'::jsonb;`,
  },
  {
    name: "20260610000003_form_responses_answers",
    sql: `CREATE TABLE IF NOT EXISTS public.form_responses (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            form_id uuid REFERENCES public.forms(id) ON DELETE CASCADE,
            respondent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
            response_data jsonb DEFAULT '{}'::jsonb,
            submitted_at timestamptz NOT NULL DEFAULT now()
          );
          ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;
          DO $$ BEGIN
            CREATE POLICY "Participants insert own responses" ON public.form_responses
              FOR INSERT TO authenticated WITH CHECK (respondent_id = auth.uid());
          EXCEPTION WHEN duplicate_object THEN null; END $$;
          DO $$ BEGIN
            CREATE POLICY "Admins read all responses" ON public.form_responses
              FOR SELECT TO authenticated USING (
                EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
              );
          EXCEPTION WHEN duplicate_object THEN null; END $$;
          DO $$ BEGIN
            CREATE POLICY "Participants read own responses" ON public.form_responses
              FOR SELECT TO authenticated USING (respondent_id = auth.uid());
          EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  },
  {
    name: "20260610000004_training_code",
    sql: `ALTER TABLE public.trainings ADD COLUMN IF NOT EXISTS code text;`,
  },
  {
    name: "20260610000005_forms_fix_columns_rls",
    sql: `ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS training_id uuid REFERENCES public.trainings(id) ON DELETE SET NULL;
          ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS fields jsonb DEFAULT '[]'::jsonb;
          ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;`,
  },
  {
    name: "20260610000006_fix_form_responses_respondent",
    sql: `ALTER TABLE public.form_responses ADD COLUMN IF NOT EXISTS training_id uuid REFERENCES public.trainings(id) ON DELETE SET NULL;`,
  },
  {
    name: "20260611000000_forms_session_schedule",
    sql: `ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS session_schedule jsonb DEFAULT '{}'::jsonb;`,
  },
  {
    name: "20260612000001_training_youtube_link",
    sql: `ALTER TABLE public.trainings ADD COLUMN IF NOT EXISTS youtube_link text;`,
  },
  {
    name: "20260612000002_materials_preread_url",
    sql: `ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS preread_url text;`,
  },
  {
    name: "20260612000003_materials_recording_url",
    sql: `ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS recording_url text;`,
  },
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_attendances_participant ON public.attendances(participant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attendances_training ON public.attendances(training_id)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_participant ON public.submissions(participant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.submissions(assignment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_form_responses_form ON public.form_responses(form_id)`,
  `CREATE INDEX IF NOT EXISTS idx_form_responses_respondent ON public.form_responses(respondent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_forms_master ON public.forms(is_master) WHERE is_master = true`,
  `CREATE INDEX IF NOT EXISTS idx_forms_training ON public.forms(training_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trainings_date ON public.trainings(training_date)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_training ON public.assignments(training_id)`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role)`,
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return err("SUPABASE_DB_URL not set.");

  const pool = new Pool(dbUrl, 1, true);
  const client = await pool.connect();

  try {
    // Bootstrap: create _migrations table if not exists
    await client.queryObject(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Get applied migrations
    const { rows } = await client.queryObject<{ name: string }>(
      `SELECT name FROM public._migrations`
    );
    const appliedSet = new Set(rows.map((r) => r.name));

    const migrationResults: { name: string; status: string }[] = [];

    for (const m of MIGRATIONS) {
      if (appliedSet.has(m.name)) {
        migrationResults.push({ name: m.name, status: "skipped" });
        continue;
      }
      try {
        await client.queryObject(m.sql);
        await client.queryObject(
          `INSERT INTO public._migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
          [m.name]
        );
        migrationResults.push({ name: m.name, status: "applied" });
      } catch (e) {
        migrationResults.push({ name: m.name, status: `error: ${(e as Error).message}` });
      }
    }

    // Apply indexes
    const indexResults: { name: string; status: string }[] = [];
    for (const idx of INDEXES) {
      const idxName = idx.match(/idx_\w+/)?.[0] ?? "unknown";
      try {
        await client.queryObject(idx);
        indexResults.push({ name: idxName, status: "ok" });
      } catch (e) {
        indexResults.push({ name: idxName, status: `error: ${(e as Error).message}` });
      }
    }

    const applied_count = migrationResults.filter((r) => r.status === "applied").length;
    const skipped_count = migrationResults.filter((r) => r.status === "skipped").length;
    const error_count = migrationResults.filter((r) => r.status.startsWith("error")).length;

    return ok({ applied_count, skipped_count, error_count, migrations: migrationResults, indexes: indexResults });
  } finally {
    client.release();
    await pool.end();
  }
});

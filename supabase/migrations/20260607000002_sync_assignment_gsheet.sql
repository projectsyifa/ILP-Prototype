-- Sync gsheet_id and form_url from forms table to assignments
-- For assignments where form was created but gsheet_id not stored (before column existed)
UPDATE public.assignments a
SET gsheet_id = f.gsheet_id,
    form_url  = COALESCE(a.form_url, f.gform_url)
FROM public.forms f
WHERE f.title = 'Pengumpulan: ' || a.title
  AND f.gsheet_id IS NOT NULL
  AND a.gsheet_id IS NULL;

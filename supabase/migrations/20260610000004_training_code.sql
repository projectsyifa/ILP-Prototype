-- Add training_code to trainings (unique human-readable ID per session)
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS training_code text;

-- Auto-generate codes for existing trainings that don't have one yet.
-- Format: ILP-S01, ILP-S02, ... based on week_number; fall back to sequence.
DO $$
DECLARE
  rec RECORD;
  seq INT := 1;
BEGIN
  -- For trainings with week_number, use ILP-S{week_number:02}
  FOR rec IN
    SELECT id, week_number FROM public.trainings
    WHERE training_code IS NULL AND week_number IS NOT NULL
    ORDER BY week_number
  LOOP
    UPDATE public.trainings
    SET training_code = 'ILP-S' || LPAD(rec.week_number::text, 2, '0')
    WHERE id = rec.id;
  END LOOP;

  -- For trainings without week_number, assign sequential codes
  FOR rec IN
    SELECT id FROM public.trainings
    WHERE training_code IS NULL
    ORDER BY training_date, created_at
  LOOP
    UPDATE public.trainings
    SET training_code = 'ILP-S' || LPAD(seq::text, 2, '0')
    WHERE id = rec.id;
    seq := seq + 1;
  END LOOP;
END $$;

-- Ensure uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_trainings_code ON public.trainings (training_code)
  WHERE training_code IS NOT NULL;

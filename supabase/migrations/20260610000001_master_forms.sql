-- Master form support: add columns to forms table
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS is_master        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS master_category  text,
  ADD COLUMN IF NOT EXISTS entry_nama       text,
  ADD COLUMN IF NOT EXISTS entry_id_peserta text,
  ADD COLUMN IF NOT EXISTS entry_email      text,
  ADD COLUMN IF NOT EXISTS entry_institusi  text,
  ADD COLUMN IF NOT EXISTS entry_training   text;

-- Index for fast lookup of master forms
CREATE INDEX IF NOT EXISTS idx_forms_is_master ON forms (is_master, master_category)
  WHERE is_master = true;

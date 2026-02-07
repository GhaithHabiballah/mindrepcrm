ALTER TABLE leads ADD COLUMN IF NOT EXISTS sort_order integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;

ALTER TABLE temp_leads ADD COLUMN IF NOT EXISTS sort_order integer;
ALTER TABLE temp_leads ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM leads
)
UPDATE leads
SET sort_order = ranked.rn
FROM ranked
WHERE leads.id = ranked.id AND leads.sort_order IS NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM temp_leads
)
UPDATE temp_leads
SET sort_order = ranked.rn
FROM ranked
WHERE temp_leads.id = ranked.id AND temp_leads.sort_order IS NULL;

CREATE TABLE IF NOT EXISTS cell_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  note text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (lead_id, field_key)
);

DROP TRIGGER IF EXISTS update_cell_notes_updated_at ON cell_notes;
CREATE TRIGGER update_cell_notes_updated_at
  BEFORE UPDATE ON cell_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE cell_notes DISABLE ROW LEVEL SECURITY;

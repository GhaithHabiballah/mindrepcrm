CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  website text,
  outreach_method text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS temp_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  website text,
  outreach_method text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text UNIQUE NOT NULL,
  label text NOT NULL,
  type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO lead_fields (field_key, label, type) VALUES
  ('name', 'Name', 'text'),
  ('email', 'Email', 'text'),
  ('phone', 'Phone', 'phone'),
  ('website', 'Website', 'url'),
  ('outreach_method', 'Outreach Method', 'select')
ON CONFLICT (field_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS outreach_methods (
  key text PRIMARY KEY,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO outreach_methods (key, label) VALUES
  ('email', 'Email'),
  ('sms', 'SMS'),
  ('instagram', 'Instagram'),
  ('linkedin', 'LinkedIn'),
  ('phone', 'Phone')
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS update_updated_at_column();
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP FUNCTION IF EXISTS add_lead_column(text, text);
CREATE FUNCTION add_lead_column(column_name text, column_type text DEFAULT 'text')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
IMMUTABLE
AS $$
BEGIN
  IF column_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid column name. Use only lowercase letters, numbers, and underscores.';
  END IF;

  IF column_type NOT IN ('text', 'integer', 'boolean', 'timestamptz', 'jsonb') THEN
    column_type := 'text';
  END IF;

  EXECUTE format('ALTER TABLE leads ADD COLUMN IF NOT EXISTS %I %s', column_name, column_type);
  EXECUTE format('ALTER TABLE temp_leads ADD COLUMN IF NOT EXISTS %I %s', column_name, column_type);

  PERFORM pg_notify('pgrst', 'reload schema');
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error adding column: %', SQLERRM;
    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION add_lead_column(text, text) TO anon;

ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_fields DISABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_methods DISABLE ROW LEVEL SECURITY;
ALTER TABLE temp_leads DISABLE ROW LEVEL SECURITY;

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

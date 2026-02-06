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

CREATE OR REPLACE FUNCTION add_lead_column(column_name text, column_type text DEFAULT 'text')
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

ALTER TABLE temp_leads DISABLE ROW LEVEL SECURITY;

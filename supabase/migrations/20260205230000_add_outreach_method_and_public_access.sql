/*
  # Add outreach_method + allow anon access

  ## Overview
  - Adds `outreach_method` column to leads
  - Inserts default lead field for outreach method
  - Disables RLS for leads + lead_fields so anon key can read/write
  - Grants anon access to add_lead_column RPC
*/

-- Add outreach_method column to leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS outreach_method text;

-- Insert default field if missing
INSERT INTO lead_fields (field_key, label, type)
VALUES ('outreach_method', 'Outreach Method', 'select')
ON CONFLICT (field_key) DO NOTHING;

-- Allow anon access for this client-only app
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_fields DISABLE ROW LEVEL SECURITY;

-- Allow anon to call add_lead_column
GRANT EXECUTE ON FUNCTION add_lead_column(text, text) TO anon;

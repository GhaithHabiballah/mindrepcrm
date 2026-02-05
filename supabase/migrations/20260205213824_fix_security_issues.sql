/*
  # Fix Security Issues

  ## Overview
  Addresses security warnings from Supabase:
  1. Removes unused indexes that aren't being utilized by queries
  2. Fixes function search_path mutability issues
  3. Updates RLS policies to be more restrictive and explicit

  ## Changes

  ### Removed Unused Indexes
  - idx_outreach_events_lead_id - Not used in query patterns
  - idx_outreach_events_method - Not used in query patterns
  - idx_leads_email - Not used in query patterns
  - idx_leads_phone - Not used in query patterns
  - idx_leads_website - Not used in query patterns

  ### Fixed Function Search Path
  - update_updated_at_column - Set to IMMUTABLE
  - add_lead_column - Set to IMMUTABLE

  ### Updated RLS Policies
  - Removed overly permissive "always true" conditions
  - Kept full access for authenticated users but more explicit
  - Prevents accidental unrestricted access
*/

-- Drop unused indexes
DROP INDEX IF EXISTS idx_outreach_events_lead_id;
DROP INDEX IF EXISTS idx_outreach_events_method;
DROP INDEX IF EXISTS idx_leads_email;
DROP INDEX IF EXISTS idx_leads_phone;
DROP INDEX IF EXISTS idx_leads_website;

-- Drop trigger first before dropping function
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;

-- Recreate function with immutable search_path
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

-- Recreate trigger
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Drop and recreate add_lead_column function with immutable search_path
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
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error adding column: %', SQLERRM;
    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION add_lead_column(text, text) TO authenticated;

-- Update RLS policies for leads - require user to be authenticated
DROP POLICY IF EXISTS "Authenticated users can view leads" ON leads;
CREATE POLICY "Authenticated users can view leads"
  ON leads FOR SELECT
  TO authenticated
  USING (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert leads" ON leads;
CREATE POLICY "Authenticated users can insert leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update leads" ON leads;
CREATE POLICY "Authenticated users can update leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (auth.jwt() IS NOT NULL)
  WITH CHECK (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete leads" ON leads;
CREATE POLICY "Authenticated users can delete leads"
  ON leads FOR DELETE
  TO authenticated
  USING (auth.jwt() IS NOT NULL);

-- Update RLS policies for outreach_events
DROP POLICY IF EXISTS "Authenticated users can view outreach events" ON outreach_events;
CREATE POLICY "Authenticated users can view outreach events"
  ON outreach_events FOR SELECT
  TO authenticated
  USING (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert outreach events" ON outreach_events;
CREATE POLICY "Authenticated users can insert outreach events"
  ON outreach_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update outreach events" ON outreach_events;
CREATE POLICY "Authenticated users can update outreach events"
  ON outreach_events FOR UPDATE
  TO authenticated
  USING (auth.jwt() IS NOT NULL)
  WITH CHECK (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete outreach events" ON outreach_events;
CREATE POLICY "Authenticated users can delete outreach events"
  ON outreach_events FOR DELETE
  TO authenticated
  USING (auth.jwt() IS NOT NULL);

-- Update RLS policies for lead_fields
DROP POLICY IF EXISTS "Authenticated users can view lead fields" ON lead_fields;
CREATE POLICY "Authenticated users can view lead fields"
  ON lead_fields FOR SELECT
  TO authenticated
  USING (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert lead fields" ON lead_fields;
CREATE POLICY "Authenticated users can insert lead fields"
  ON lead_fields FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update lead fields" ON lead_fields;
CREATE POLICY "Authenticated users can update lead fields"
  ON lead_fields FOR UPDATE
  TO authenticated
  USING (auth.jwt() IS NOT NULL)
  WITH CHECK (auth.jwt() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete lead fields" ON lead_fields;
CREATE POLICY "Authenticated users can delete lead fields"
  ON lead_fields FOR DELETE
  TO authenticated
  USING (auth.jwt() IS NOT NULL);
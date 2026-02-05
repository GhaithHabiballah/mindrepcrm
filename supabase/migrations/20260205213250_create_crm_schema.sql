/*
  # CRM Database Schema

  ## Overview
  Creates the core schema for a minimal outbound CRM with three main tables:
  - leads: Single source of truth for all lead data
  - outreach_events: Tracks all outreach activities linked to leads
  - lead_fields: Defines dynamic schema for extensible lead fields

  ## New Tables

  ### 1. `leads` - Master lead data (single source of truth)
  - `id` (uuid, primary key) - unique identifier
  - `name` (text) - lead name
  - `email` (text, nullable) - contact email
  - `phone` (text, nullable) - contact phone
  - `website` (text, nullable) - lead website
  - `created_at` (timestamptz) - creation timestamp
  - `updated_at` (timestamptz) - last update timestamp

  ### 2. `outreach_events` - Outreach activity log
  - `id` (uuid, primary key) - unique identifier
  - `lead_id` (uuid, foreign key) - references leads.id
  - `method` (text) - outreach method (email, sms, instagram, etc.)
  - `status` (text) - status (sent, replied, booked, etc.)
  - `notes` (text, nullable) - additional notes
  - `created_at` (timestamptz) - creation timestamp

  ### 3. `lead_fields` - Dynamic field definitions
  - `id` (uuid, primary key) - unique identifier
  - `field_key` (text, unique) - field identifier (e.g., "website")
  - `label` (text) - display label (e.g., "Website")
  - `type` (text) - field type (text, phone, url)
  - `created_at` (timestamptz) - creation timestamp

  ## Security
  - Enable RLS on all tables
  - Policies allow authenticated users full CRUD access
  - All tables protected from anonymous access

  ## Important Notes
  1. leads table is the canonical source - no duplication allowed
  2. outreach_events references leads via foreign key with CASCADE delete
  3. lead_fields enables schema evolution without breaking changes
  4. All tables use UUID for primary keys
  5. Timestamps track creation and updates
*/

-- Create leads table (single source of truth)
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  website text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create outreach_events table
CREATE TABLE IF NOT EXISTS outreach_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  method text NOT NULL,
  status text DEFAULT 'sent',
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create lead_fields table for dynamic schema
CREATE TABLE IF NOT EXISTS lead_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text UNIQUE NOT NULL,
  label text NOT NULL,
  type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Insert default lead fields
INSERT INTO lead_fields (field_key, label, type) VALUES
  ('name', 'Name', 'text'),
  ('email', 'Email', 'text'),
  ('phone', 'Phone', 'phone'),
  ('website', 'Website', 'url')
ON CONFLICT (field_key) DO NOTHING;

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_fields ENABLE ROW LEVEL SECURITY;

-- Leads policies
CREATE POLICY "Authenticated users can view leads"
  ON leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete leads"
  ON leads FOR DELETE
  TO authenticated
  USING (true);

-- Outreach events policies
CREATE POLICY "Authenticated users can view outreach events"
  ON outreach_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert outreach events"
  ON outreach_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update outreach events"
  ON outreach_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete outreach events"
  ON outreach_events FOR DELETE
  TO authenticated
  USING (true);

-- Lead fields policies
CREATE POLICY "Authenticated users can view lead fields"
  ON lead_fields FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert lead fields"
  ON lead_fields FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update lead fields"
  ON lead_fields FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete lead fields"
  ON lead_fields FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_outreach_events_lead_id ON outreach_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_events_method ON outreach_events(method);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_website ON leads(website);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for leads table
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
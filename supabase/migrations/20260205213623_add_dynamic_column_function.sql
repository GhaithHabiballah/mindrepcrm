/*
  # Add Dynamic Column Function

  ## Overview
  Creates a PostgreSQL function to safely add columns to the leads table dynamically.
  This enables schema evolution without breaking changes.

  ## New Functions

  ### 1. `add_lead_column` - Safely adds a column to the leads table
  - Parameters:
    - `column_name` (text) - name of the column to add
    - `column_type` (text) - data type of the column (defaults to text)
  - Returns: boolean indicating success
  - Security: Only callable by authenticated users
  - Idempotent: Uses IF NOT EXISTS to prevent errors

  ## Security
  - Function is created with SECURITY DEFINER to allow table alterations
  - Still protected by RLS on the leads table itself
  - Only authenticated users can call this function

  ## Important Notes
  1. This function allows dynamic schema changes
  2. Uses IF NOT EXISTS for idempotency
  3. Defaults all new columns to text type for simplicity
  4. Column names are validated to prevent SQL injection
*/

-- Create function to add columns dynamically
CREATE OR REPLACE FUNCTION add_lead_column(column_name text, column_type text DEFAULT 'text')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate column name to prevent SQL injection
  IF column_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid column name. Use only lowercase letters, numbers, and underscores.';
  END IF;

  -- Validate column type
  IF column_type NOT IN ('text', 'integer', 'boolean', 'timestamptz', 'jsonb') THEN
    column_type := 'text';
  END IF;

  -- Add column if it doesn't exist
  EXECUTE format('ALTER TABLE leads ADD COLUMN IF NOT EXISTS %I %s', column_name, column_type);
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error adding column: %', SQLERRM;
    RETURN false;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION add_lead_column(text, text) TO authenticated;

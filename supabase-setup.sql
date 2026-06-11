-- Run this once in Supabase → SQL Editor → New query

CREATE TABLE IF NOT EXISTS tickets (
  id                  BIGSERIAL PRIMARY KEY,
  ticket_id           TEXT,
  subject             TEXT,
  fault_code          TEXT,
  fault_code_l1       TEXT,
  fault_code_l2       TEXT,
  symptom             TEXT,
  defect              TEXT,
  repair              TEXT,
  tech_name           TEXT,
  first_referred_date DATE,
  comments            TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Allow full access via the public (anon) key — internal tool, no auth needed
CREATE POLICY "public_full_access"
  ON tickets FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

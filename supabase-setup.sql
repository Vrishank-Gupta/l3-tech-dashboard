-- ─────────────────────────────────────────────────────────────────
-- EXISTING INSTALL (already ran this before)?
-- Run only these two lines in SQL Editor to add the new columns:
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'open';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_at    TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS agent_name   TEXT;


-- ─────────────────────────────────────────────────────────────────
-- FRESH INSTALL — run everything below (safe to run on existing too)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id                  BIGSERIAL PRIMARY KEY,
  ticket_id           TEXT,
  subject             TEXT,
  product_name        TEXT,
  symptom             TEXT,
  defect              TEXT,
  repair              TEXT,
  tech_name           TEXT,
  first_referred_date DATE,
  comments            TEXT,
  status              TEXT DEFAULT 'open',
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_full_access" ON tickets;
CREATE POLICY "public_full_access"
  ON tickets FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

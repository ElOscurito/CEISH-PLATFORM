ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS annex_2_schedule JSONB NOT NULL DEFAULT '{"items":[]}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_research_annexes_annex_2
  ON research_annexes(submission_id, annex_number, created_at DESC)
  WHERE annex_number = 2;

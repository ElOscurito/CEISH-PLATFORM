CREATE TABLE IF NOT EXISTS ext_member_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(60) NOT NULL,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  logout_session_version INTEGER,
  login_id UUID UNIQUE REFERENCES ext_member_activity_logs(id) ON DELETE SET NULL,
  session_duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, logout_session_version)
);

CREATE INDEX IF NOT EXISTS idx_ext_logs_member
  ON ext_member_activity_logs(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ext_performance_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type VARCHAR(40) NOT NULL UNIQUE
    CHECK (process_type IN ('stratification', 'qualification', 'correction_review')),
  warning_days INTEGER NOT NULL DEFAULT 5,
  critical_days INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (warning_days > 0 AND critical_days > warning_days)
);

INSERT INTO ext_performance_thresholds (process_type, warning_days, critical_days)
VALUES ('stratification', 5, 10), ('qualification', 10, 15), ('correction_review', 5, 10)
ON CONFLICT (process_type) DO NOTHING;

CREATE OR REPLACE VIEW ext_vw_member_roster AS
SELECT u.id, u.name, r.name AS role
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE EXISTS (SELECT 1 FROM stratification_assignments WHERE stratifier_id = u.id)
   OR EXISTS (SELECT 1 FROM qualification_cases WHERE qualifier_id = u.id);

CREATE OR REPLACE VIEW ext_vw_member_review_times AS
SELECT a.id, a.submission_id, a.stratifier_id AS member_id,
       'stratification'::text AS process_type, a.round_number AS sequence,
       a.assigned_at AS started_at, a.decided_at AS decided_at
FROM stratification_assignments a
JOIN submissions s ON s.id = a.submission_id
WHERE a.decided_at IS NOT NULL OR s.classification_status <> 'cancelled'
UNION ALL
SELECT q.id, q.submission_id, COALESCE(first_decision.completed_by, q.qualifier_id),
       'qualification', 1, q.created_at, COALESCE(first_decision.completed_at, legacy.decided_at)
FROM qualification_cases q
LEFT JOIN qualification_cycles c ON c.qualification_id = q.id AND c.cycle_number = 1
LEFT JOIN LATERAL (
  SELECT a.completed_at, a.completed_by
  FROM research_annexes a
  JOIN qualification_cycles ac ON ac.id = a.qualification_cycle_id
  WHERE ac.qualification_id = q.id AND ac.cycle_number = 1
    AND a.annex_number = 12 AND a.status = 'completed' AND a.completed_at IS NOT NULL
    AND a.completed_at >= q.created_at
    AND (c.correction_submitted_at IS NULL OR a.completed_at < c.correction_submitted_at)
  ORDER BY a.completed_at, a.id LIMIT 1
) first_decision ON TRUE
LEFT JOIN LATERAL (
  SELECT CASE WHEN c.correction_submitted_at IS NULL OR c.reviewed_at < c.correction_submitted_at
              THEN c.reviewed_at END AS decided_at
) legacy ON TRUE
WHERE first_decision.completed_at IS NOT NULL OR legacy.decided_at IS NOT NULL
   OR q.status = 'pending-review';

-- A decision requesting another correction is emitted against the next cycle.
CREATE OR REPLACE VIEW ext_vw_member_correction_times AS
SELECT c.id, q.submission_id, COALESCE(decision.completed_by, q.qualifier_id) AS member_id,
       'correction_review'::text AS process_type, c.cycle_number AS sequence,
       c.correction_submitted_at AS started_at,
       COALESCE(decision.completed_at, CASE WHEN c.reviewed_at >= c.correction_submitted_at
                                           THEN c.reviewed_at END) AS decided_at
FROM qualification_cycles c
JOIN qualification_cases q ON q.id = c.qualification_id
LEFT JOIN qualification_cycles next_cycle
  ON next_cycle.qualification_id = q.id AND next_cycle.cycle_number = c.cycle_number + 1
LEFT JOIN LATERAL (
  SELECT a.completed_at, a.completed_by
  FROM research_annexes a
  WHERE (a.qualification_cycle_id = c.id OR a.qualification_cycle_id = next_cycle.id)
    AND a.annex_number = 12 AND a.status = 'completed'
    AND a.completed_at >= c.correction_submitted_at
    AND (next_cycle.correction_submitted_at IS NULL OR a.completed_at < next_cycle.correction_submitted_at)
  ORDER BY a.completed_at, a.id LIMIT 1
) decision ON TRUE
WHERE c.correction_submitted_at IS NOT NULL
  AND (decision.completed_at IS NOT NULL OR c.reviewed_at >= c.correction_submitted_at
       OR (q.status = 'resubmitted' AND q.current_cycle = c.cycle_number));

-- ============================================================================
-- Migración 102: Módulo Externo - Consultores Permanentes de Odontología
-- Equipo: Vinculación con la Sociedad CEISH-ULEAM
-- ============================================================================

-- 1. Tabla de perfiles de consultores (odontología y externos)
CREATE TABLE IF NOT EXISTS ext_consultant_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  consultant_type VARCHAR(20) NOT NULL CHECK (consultant_type IN ('permanent_dentistry', 'temporary_external')),
  faculty VARCHAR(120) NOT NULL DEFAULT 'Facultad de Odontología',
  specialty VARCHAR(150) NOT NULL,
  department VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de solicitudes de interconsulta técnica
CREATE TABLE IF NOT EXISTS ext_consultation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  requester_member_id UUID NOT NULL REFERENCES users(id),
  consultant_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'declined', 'expired')),
  instructions TEXT,
  due_date TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 3. Tabla de recomendaciones y retroalimentación técnica por criterio
CREATE TABLE IF NOT EXISTS ext_consultation_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES ext_consultation_requests(id) ON DELETE CASCADE,
  criteria_label VARCHAR(255) NOT NULL,
  suggested_status VARCHAR(20) CHECK (suggested_status IN ('approved', 'rejected', 'neutral')),
  technical_comments TEXT NOT NULL,
  is_accepted_by_member BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_ext_consult_requests_sub ON ext_consultation_requests(submission_id);
CREATE INDEX IF NOT EXISTS idx_ext_consult_requests_user ON ext_consultation_requests(consultant_id, status);
CREATE INDEX IF NOT EXISTS idx_ext_consult_feedbacks_req ON ext_consultation_feedbacks(request_id);

-- 4. Docentes de demostración de la Facultad de Odontología (para pruebas)
-- Se asignan con el rol de profesor/evaluador ('teacher')
INSERT INTO users (id, name, email, password, role_id)
SELECT d.id::uuid, d.name, d.email, d.password, roles.id
  FROM (VALUES
    ('b1000000-0000-0000-0000-000000000001', 'Dr. Carlos Mendoza', 'carlos.mendoza@ceish.edu', 'scrypt$ceish-demo-salt$004b4334e2bed3392d1bde96cc8e586ce71017f4d2e41f6881ebd61330157250233389a55c5a3d120e024b589df757924ae011001fe61d34b1f46259a9db27cd'),
    ('b1000000-0000-0000-0000-000000000002', 'Dra. Elena Morales', 'elena.morales@ceish.edu', 'scrypt$ceish-demo-salt$004b4334e2bed3392d1bde96cc8e586ce71017f4d2e41f6881ebd61330157250233389a55c5a3d120e024b589df757924ae011001fe61d34b1f46259a9db27cd'),
    ('b1000000-0000-0000-0000-000000000003', 'Dr. Roberto Zambrano', 'roberto.zambrano@ceish.edu', 'scrypt$ceish-demo-salt$004b4334e2bed3392d1bde96cc8e586ce71017f4d2e41f6881ebd61330157250233389a55c5a3d120e024b589df757924ae011001fe61d34b1f46259a9db27cd'),
    ('b1000000-0000-0000-0000-000000000004', 'Dra. Patricia Vélez', 'patricia.velez@ceish.edu', 'scrypt$ceish-demo-salt$004b4334e2bed3392d1bde96cc8e586ce71017f4d2e41f6881ebd61330157250233389a55c5a3d120e024b589df757924ae011001fe61d34b1f46259a9db27cd'),
    ('b1000000-0000-0000-0000-000000000005', 'Dr. Andrés Cedeño', 'andres.cedeno@ceish.edu', 'scrypt$ceish-demo-salt$004b4334e2bed3392d1bde96cc8e586ce71017f4d2e41f6881ebd61330157250233389a55c5a3d120e024b589df757924ae011001fe61d34b1f46259a9db27cd')
  ) AS d(id, name, email, password)
  CROSS JOIN roles
 WHERE roles.name = 'teacher'
ON CONFLICT (id) DO NOTHING;

-- Registro de perfiles de consultores odontológicos permanentes
INSERT INTO ext_consultant_profiles (user_id, consultant_type, faculty, specialty, department, is_active)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'permanent_dentistry', 'Facultad de Odontología', 'Endodoncia', 'Clínica Odontológica', true),
  ('b1000000-0000-0000-0000-000000000002', 'permanent_dentistry', 'Facultad de Odontología', 'Periodoncia e Implantología', 'Periodoncia', true),
  ('b1000000-0000-0000-0000-000000000003', 'permanent_dentistry', 'Facultad de Odontología', 'Cirugía Maxilofacial', 'Cirugía', true),
  ('b1000000-0000-0000-0000-000000000004', 'permanent_dentistry', 'Facultad de Odontología', 'Odontopediatría', 'Preventiva y Comunitaria', true),
  ('b1000000-0000-0000-0000-000000000005', 'permanent_dentistry', 'Facultad de Odontología', 'Rehabilitación Oral y Prótesis', 'Rehabilitación Oral', true)
ON CONFLICT (user_id) DO NOTHING;

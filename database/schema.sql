-- ============================================================================
-- CEISH Platform — Esquema de base de datos
-- PostgreSQL 16
-- Se ejecuta automáticamente al crear el contenedor (volumen vacío).
-- ============================================================================

-- Extensión para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- roles
-- ----------------------------------------------------------------------------
CREATE TABLE roles (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) NOT NULL UNIQUE
);

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(255) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,           -- hash scrypt: scrypt$salt$hash
  auth_session_version INTEGER NOT NULL DEFAULT 0,
  role_id    UUID NOT NULL REFERENCES roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role ON users(role_id);

-- ----------------------------------------------------------------------------
-- registration_requests
-- Solicitudes públicas de acceso. No crean una sesión ni una cuenta activa
-- hasta que el equipo administrador las revise.
-- ----------------------------------------------------------------------------
CREATE TABLE registration_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  researcher_type VARCHAR(20) NOT NULL
                    CHECK (researcher_type IN ('internal', 'external')),
  affiliation     VARCHAR(180) NOT NULL DEFAULT '',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES users(id)
);

CREATE INDEX idx_registration_requests_status ON registration_requests(status);

CREATE TABLE researcher_profiles (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  researcher_type VARCHAR(20) NOT NULL
                    CHECK (researcher_type IN ('internal', 'external')),
  affiliation     VARCHAR(180) NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- submissions  (entrega de documentos)
-- ----------------------------------------------------------------------------
CREATE TABLE submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  research_code VARCHAR(11) NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  document_name VARCHAR(255) NOT NULL,           -- nombre original del archivo
  document_path TEXT,                            -- clave del objeto en MinIO (bucket "documents")
  comment       TEXT NOT NULL DEFAULT '',
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'submitted', 'reviewed')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  grade         NUMERIC(4,2) CHECK (grade >= 0 AND grade <= 10),
  final_comment TEXT,                                -- retroalimentación anónima para el estudiante
  classification_status VARCHAR(30) NOT NULL DEFAULT 'awaiting-assignment'
                    CHECK (classification_status IN (
                      'awaiting-assignment', 'awaiting-first', 'awaiting-second',
                    'awaiting-consensus', 'classified', 'cancelled'
                  )),
  risk_level VARCHAR(30)
                  CHECK (risk_level IN ('no-risk', 'minimal-risk', 'greater-than-minimal')),
  classified_at TIMESTAMPTZ
);

CREATE INDEX idx_submissions_student ON submissions(student_id);
CREATE INDEX idx_submissions_status  ON submissions(status);

-- ----------------------------------------------------------------------------
-- submission_documents
-- Una investigación se presenta como un conjunto de documentos Word.
-- ----------------------------------------------------------------------------
CREATE TABLE submission_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  document_name VARCHAR(255) NOT NULL,
  document_path TEXT NOT NULL,
  mime_type     VARCHAR(120) NOT NULL,
  size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_documents_path_unique UNIQUE (submission_id, document_path)
);

CREATE INDEX idx_submission_documents_submission
  ON submission_documents(submission_id, uploaded_at);

-- ----------------------------------------------------------------------------
-- stratification_assignments
-- Dictámenes de riesgo emitidos por miembros CEISH. Una entrega puede requerir
-- uno o dos estratificadores según el primer nivel seleccionado.
-- ----------------------------------------------------------------------------
CREATE TABLE stratification_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  stratifier_id   UUID NOT NULL REFERENCES users(id),
  round_number    SMALLINT NOT NULL CHECK (round_number IN (1, 2)),
  risk_level      VARCHAR(30)
                    CHECK (risk_level IN ('no-risk', 'minimal-risk', 'greater-than-minimal')),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at      TIMESTAMPTZ,
  CONSTRAINT stratification_round_unique UNIQUE (submission_id, round_number),
  CONSTRAINT stratification_member_unique UNIQUE (submission_id, stratifier_id)
);

CREATE INDEX idx_stratification_member
  ON stratification_assignments(stratifier_id, decided_at);
CREATE INDEX idx_stratification_submission
  ON stratification_assignments(submission_id);

-- ----------------------------------------------------------------------------
-- research_annexes
-- Instancias editables y auditables de los anexos 11, 12, 13, 23 y 27.
-- ----------------------------------------------------------------------------
CREATE TABLE research_annexes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES stratification_assignments(id) ON DELETE SET NULL,
  annex_number  SMALLINT NOT NULL CHECK (annex_number IN (11, 12, 13, 23, 27)),
  qualification_cycle_id UUID,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'completed', 'voided')),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_name VARCHAR(255),
  document_path TEXT,
  document_updated_at TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES users(id),
  completed_by  UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_research_annexes_submission
  ON research_annexes(submission_id, annex_number, created_at DESC);
CREATE INDEX idx_research_annexes_assignment
  ON research_annexes(assignment_id, annex_number, created_at DESC);
CREATE INDEX idx_research_annexes_completed_by
  ON research_annexes(completed_by, annex_number);
CREATE INDEX idx_research_annexes_qualification_cycle
  ON research_annexes(qualification_cycle_id, annex_number, created_at DESC);
CREATE UNIQUE INDEX idx_research_annexes_active_11
  ON research_annexes(submission_id, annex_number)
  WHERE annex_number = 11 AND status <> 'voided';
CREATE UNIQUE INDEX idx_research_annexes_active_27
  ON research_annexes(assignment_id, annex_number)
  WHERE annex_number = 27 AND status <> 'voided';
CREATE UNIQUE INDEX idx_research_annexes_active_13
  ON research_annexes(submission_id, annex_number)
  WHERE annex_number = 13 AND status <> 'voided';
CREATE INDEX idx_research_annexes_document
  ON research_annexes(id)
  WHERE document_path IS NOT NULL;

-- ----------------------------------------------------------------------------
-- qualification_cases / qualification_cycles
-- Para investigaciones sin riesgo, el primer estratificador continúa como
-- calificador. Cada ciclo conserva observaciones y el informe de corrección.
-- ----------------------------------------------------------------------------
CREATE TABLE qualification_cases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  UUID NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  qualifier_id   UUID NOT NULL REFERENCES users(id),
  status         VARCHAR(30) NOT NULL DEFAULT 'pending-review'
                   CHECK (status IN (
                     'pending-review', 'corrections-required', 'resubmitted',
                     'approved', 'cancelled', 'expired'
                   )),
  current_cycle  SMALLINT NOT NULL DEFAULT 1 CHECK (current_cycle >= 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  cancelled_at   TIMESTAMPTZ
);

CREATE INDEX idx_qualification_qualifier
  ON qualification_cases(qualifier_id, status);

CREATE TABLE qualification_cycles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_id         UUID NOT NULL REFERENCES qualification_cases(id) ON DELETE CASCADE,
  cycle_number             SMALLINT NOT NULL CHECK (cycle_number >= 1),
  status                   VARCHAR(30) NOT NULL DEFAULT 'pending-review'
                             CHECK (status IN (
                               'pending-review', 'corrections-required', 'resubmitted',
                               'reviewed', 'approved'
                             )),
  observations             TEXT NOT NULL DEFAULT '',
  correction_due_at        TIMESTAMPTZ,
  correction_document_name VARCHAR(255),
  correction_document_path TEXT,
  correction_submitted_at  TIMESTAMPTZ,
  reviewed_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT qualification_cycle_unique UNIQUE (qualification_id, cycle_number)
);

CREATE INDEX idx_qualification_cycles_case
  ON qualification_cycles(qualification_id, cycle_number);

ALTER TABLE research_annexes
  ADD CONSTRAINT research_annexes_qualification_cycle_fk
  FOREIGN KEY (qualification_cycle_id) REFERENCES qualification_cycles(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- assignments  (relación profesor - estudiante)
-- ----------------------------------------------------------------------------
CREATE TABLE assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT assignments_unique UNIQUE (teacher_id, student_id),
  CONSTRAINT assignments_distinct CHECK (teacher_id <> student_id)
);

CREATE INDEX idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX idx_assignments_student ON assignments(student_id);

-- ----------------------------------------------------------------------------
-- reviews
-- ----------------------------------------------------------------------------
CREATE TABLE reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_id   UUID NOT NULL REFERENCES users(id),
  comment       TEXT NOT NULL DEFAULT '',
  grade         NUMERIC(4,2) CHECK (grade >= 0 AND grade <= 10),
  status        VARCHAR(20) NOT NULL DEFAULT 'in-progress'
                  CHECK (status IN ('in-progress', 'completed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reviews_submission_unique UNIQUE (submission_id)
);

CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);

-- ----------------------------------------------------------------------------
-- review_stages  (evaluación dividida en etapas)
-- ----------------------------------------------------------------------------
CREATE TABLE review_stages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  stage_number SMALLINT NOT NULL CHECK (stage_number BETWEEN 1 AND 4),
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'in-progress', 'completed')),
  completed_at TIMESTAMPTZ,

  CONSTRAINT review_stages_unique UNIQUE (review_id, stage_number)
);

CREATE INDEX idx_review_stages_review ON review_stages(review_id);

-- ----------------------------------------------------------------------------
-- criteria_evaluations
-- ----------------------------------------------------------------------------
CREATE TABLE criteria_evaluations (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id  UUID NOT NULL REFERENCES review_stages(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  status    VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  comment   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_criteria_stage ON criteria_evaluations(stage_id);

-- ----------------------------------------------------------------------------
-- annotations  (observaciones ubicadas dentro del PDF)
-- ----------------------------------------------------------------------------
CREATE TABLE annotations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria_evaluation_id UUID NOT NULL REFERENCES criteria_evaluations(id) ON DELETE CASCADE,
  page_number            SMALLINT NOT NULL CHECK (page_number >= 1),
  x                      NUMERIC(8,4) NOT NULL,   -- % del ancho de página (0-100)
  y                      NUMERIC(8,4) NOT NULL,   -- % del alto de página (0-100)
  width                  NUMERIC(8,4) NOT NULL,
  height                 NUMERIC(8,4) NOT NULL,
  comment                TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_annotations_criteria ON annotations(criteria_evaluation_id);

-- Tarea 5: formularios dinámicos con versiones e historial.
-- Aditiva e idempotente: el ejecutor actual vuelve a recorrer las migraciones.
-- stage_number = 0 representa postulación inicial; 1..4, revisión por etapas.
CREATE TABLE IF NOT EXISTS ext_form_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_audience VARCHAR(30) NOT NULL
    CHECK (target_audience IN ('researcher_submission', 'evaluator_criteria')),
  stage_number SMALLINT NOT NULL CHECK (stage_number BETWEEN 0 AND 4),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_form_audience_stage_check
    CHECK (target_audience <> 'evaluator_criteria' OR stage_number > 0)
);

-- Una definición por destinatario y momento. Desactivar no libera ese lugar:
-- se reutiliza la definición y se publica otra versión.
CREATE UNIQUE INDEX IF NOT EXISTS ext_form_audience_stage_unique
  ON ext_form_definitions(target_audience, stage_number);

CREATE TABLE IF NOT EXISTS ext_form_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES ext_form_definitions(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title VARCHAR(150) NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT ext_form_version_publication_check CHECK (
    (status = 'draft' AND published_at IS NULL) OR
    (status IN ('published', 'retired') AND published_at IS NOT NULL)
  ),
  CONSTRAINT ext_form_version_number_unique UNIQUE (form_id, version_number),
  CONSTRAINT ext_form_version_identity_unique UNIQUE (id, form_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ext_form_one_draft
  ON ext_form_versions(form_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS ext_form_one_published
  ON ext_form_versions(form_id) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS ext_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES ext_form_versions(id) ON DELETE RESTRICT,
  field_key VARCHAR(80) NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]*$'),
  label TEXT NOT NULL CHECK (length(btrim(label)) > 0),
  field_type VARCHAR(30) NOT NULL
    CHECK (field_type IN ('text', 'textarea', 'single_select', 'multi_select', 'checkbox', 'file', 'criterion')),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  display_order INTEGER NOT NULL DEFAULT 1 CHECK (display_order > 0),
  placeholder TEXT,
  help_text TEXT,
  CONSTRAINT ext_field_select_options_check CHECK (
    (field_type IN ('single_select', 'multi_select') AND jsonb_array_length(options) > 0) OR
    (field_type NOT IN ('single_select', 'multi_select') AND options = '[]'::jsonb)
  ),
  CONSTRAINT ext_field_key_unique UNIQUE (version_id, field_key),
  CONSTRAINT ext_field_version_identity_unique UNIQUE (id, version_id)
);
CREATE INDEX IF NOT EXISTS idx_ext_fields_order ON ext_form_fields(version_id, display_order);

-- Una instancia fija la versión al iniciar cada etapa/ciclo. Las correcciones
-- crean otro ciclo; nunca reutilizan ni sobrescriben el envío anterior.
CREATE TABLE IF NOT EXISTS ext_form_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES ext_form_definitions(id) ON DELETE RESTRICT,
  version_id UUID NOT NULL,
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  CONSTRAINT ext_instance_submission_check CHECK (
    (status = 'draft' AND submitted_at IS NULL) OR
    (status = 'submitted' AND submitted_at IS NOT NULL)
  ),
  CONSTRAINT ext_instance_version_fk FOREIGN KEY (version_id, form_id)
    REFERENCES ext_form_versions(id, form_id) ON DELETE RESTRICT,
  CONSTRAINT ext_instance_cycle_unique UNIQUE (submission_id, form_id, cycle_number),
  CONSTRAINT ext_instance_version_identity_unique UNIQUE (id, version_id)
);
CREATE INDEX IF NOT EXISTS idx_ext_instances_version ON ext_form_instances(version_id, form_id);

CREATE TABLE IF NOT EXISTS ext_submission_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL,
  version_id UUID NOT NULL,
  field_id UUID NOT NULL,
  field_value JSONB NOT NULL CHECK (field_value <> 'null'::jsonb),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_value_instance_fk FOREIGN KEY (instance_id, version_id)
    REFERENCES ext_form_instances(id, version_id) ON DELETE CASCADE,
  CONSTRAINT ext_value_field_fk FOREIGN KEY (field_id, version_id)
    REFERENCES ext_form_fields(id, version_id) ON DELETE RESTRICT,
  CONSTRAINT ext_submission_field_unique UNIQUE (instance_id, field_id)
);
CREATE INDEX IF NOT EXISTS idx_ext_values_field ON ext_submission_field_values(field_id, version_id);

-- Cada archivo tiene una clave MinIO independiente; no se guardan URLs firmadas.
CREATE TABLE IF NOT EXISTS ext_form_response_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_value_id UUID NOT NULL REFERENCES ext_submission_field_values(id) ON DELETE CASCADE,
  document_name VARCHAR(255) NOT NULL,
  document_path TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(120) NOT NULL CHECK (mime_type IN (
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ext_response_files_value ON ext_form_response_files(field_value_id);

-- Las versiones publicadas conservan contenido y campos. Solo pueden retirarse.
CREATE OR REPLACE FUNCTION ext_guard_form_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Una versión publicada debe retirarse, no eliminarse';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
    (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') OR
    NOT (OLD.status = 'published' AND NEW.status = 'retired' OR OLD.status = NEW.status)
  ) THEN
    RAISE EXCEPTION 'El contenido de una versión publicada es inmutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER ext_form_version_history
  BEFORE UPDATE OR DELETE ON ext_form_versions
  FOR EACH ROW EXECUTE FUNCTION ext_guard_form_version();

CREATE OR REPLACE FUNCTION ext_guard_form_field() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO parent_status FROM ext_form_versions WHERE id = OLD.version_id FOR UPDATE;
    IF parent_status <> 'draft' THEN
      RAISE EXCEPTION 'Los campos publicados son inmutables';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO parent_status FROM ext_form_versions WHERE id = NEW.version_id FOR UPDATE;
    IF parent_status <> 'draft' THEN
      RAISE EXCEPTION 'Solo se agregan campos a borradores';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
CREATE OR REPLACE TRIGGER ext_form_field_history
  BEFORE INSERT OR UPDATE OR DELETE ON ext_form_fields
  FOR EACH ROW EXECUTE FUNCTION ext_guard_form_field();

CREATE OR REPLACE FUNCTION ext_guard_form_definition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.target_audience, NEW.stage_number) IS DISTINCT FROM (OLD.target_audience, OLD.stage_number) THEN
    RAISE EXCEPTION 'El destinatario y la etapa identifican al formulario y no se pueden cambiar';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER ext_form_definition_identity
  BEFORE UPDATE ON ext_form_definitions
  FOR EACH ROW EXECUTE FUNCTION ext_guard_form_definition();

CREATE OR REPLACE FUNCTION ext_guard_form_instance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  version_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'submitted' AND EXISTS (SELECT 1 FROM submissions WHERE id = OLD.submission_id) THEN
      RAISE EXCEPTION 'Un envío finalizado no se puede eliminar por separado';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO version_status FROM ext_form_versions WHERE id = NEW.version_id FOR UPDATE;
    IF NEW.status <> 'draft' OR version_status IS NULL OR version_status = 'draft' THEN
      RAISE EXCEPTION 'Una instancia debe comenzar en borrador con una versión publicada o histórica';
    END IF;
    IF NEW.cycle_number = 1 AND version_status <> 'published' THEN
      RAISE EXCEPTION 'El primer ciclo requiere una versión publicada vigente';
    END IF;
    IF NEW.cycle_number > 1 AND NOT EXISTS (
      SELECT 1 FROM ext_form_instances
      WHERE submission_id = NEW.submission_id AND form_id = NEW.form_id
        AND version_id = NEW.version_id AND cycle_number = NEW.cycle_number - 1
        AND status = 'submitted'
    ) THEN
      RAISE EXCEPTION 'Una corrección debe conservar la versión del ciclo enviado anterior';
    END IF;
  ELSE
    IF OLD.status = 'submitted' THEN
      RAISE EXCEPTION 'Un envío finalizado es inmutable; crea otro ciclo';
    END IF;
    IF (NEW.id, NEW.submission_id, NEW.form_id, NEW.version_id, NEW.cycle_number, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.submission_id, OLD.form_id, OLD.version_id, OLD.cycle_number, OLD.created_at) THEN
      RAISE EXCEPTION 'La identidad y versión de una instancia no pueden cambiar';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER ext_form_instance_history
  BEFORE INSERT OR UPDATE OR DELETE ON ext_form_instances
  FOR EACH ROW EXECUTE FUNCTION ext_guard_form_instance();

-- Bloquea cambios de respuestas/archivos tras enviar. El bloqueo de la instancia
-- serializa el guardado con el envío. La ausencia del padre durante DELETE
-- permite la cascada al eliminar la investigación, siguiendo la política core.
CREATE OR REPLACE FUNCTION ext_guard_form_response() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  candidate JSONB;
  instance_uuid UUID;
  instance_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'ext_submission_field_values' THEN
      IF (NEW.id, NEW.instance_id, NEW.version_id, NEW.field_id) IS DISTINCT FROM
         (OLD.id, OLD.instance_id, OLD.version_id, OLD.field_id) THEN
        RAISE EXCEPTION 'No se puede reasignar una respuesta';
      END IF;
    ELSE
      IF (NEW.id, NEW.field_value_id) IS DISTINCT FROM (OLD.id, OLD.field_value_id) THEN
        RAISE EXCEPTION 'No se puede reasignar un archivo';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN candidate := to_jsonb(OLD);
  ELSE candidate := to_jsonb(NEW);
  END IF;
  IF TG_TABLE_NAME = 'ext_submission_field_values' THEN
    instance_uuid := (candidate->>'instance_id')::uuid;
  ELSE
    SELECT instance_id INTO instance_uuid FROM ext_submission_field_values
      WHERE id = (candidate->>'field_value_id')::uuid;
  END IF;
  SELECT status INTO instance_status FROM ext_form_instances WHERE id = instance_uuid FOR UPDATE;
  IF instance_status = 'submitted' THEN
    RAISE EXCEPTION 'Las respuestas y archivos de un envío finalizado son inmutables';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'ext_submission_field_values' THEN NEW.updated_at := NOW(); END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER ext_form_value_history
  BEFORE INSERT OR UPDATE OR DELETE ON ext_submission_field_values
  FOR EACH ROW EXECUTE FUNCTION ext_guard_form_response();
CREATE OR REPLACE TRIGGER ext_form_file_history
  BEFORE INSERT OR UPDATE OR DELETE ON ext_form_response_files
  FOR EACH ROW EXECUTE FUNCTION ext_guard_form_response();

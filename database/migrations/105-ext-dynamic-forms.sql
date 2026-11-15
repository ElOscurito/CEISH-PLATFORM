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

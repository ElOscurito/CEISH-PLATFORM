-- Tarea 4 (Vinculación): registro y admisión de investigadores externos a la ULEAM.
-- Cada solicitud de registro externa tiene un único expediente con la institución
-- de origen, el estado del convenio y la carta de aval (PDF almacenado en MinIO).
-- Idempotente: scripts/migrate.mjs vuelve a ejecutar todas las migraciones.
CREATE TABLE IF NOT EXISTS ext_external_researcher_dossiers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_request_id UUID NOT NULL UNIQUE
                            REFERENCES registration_requests(id) ON DELETE CASCADE,
  user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
  home_institution        VARCHAR(200) NOT NULL,
  institution_country     VARCHAR(100) NOT NULL,
  position_role           VARCHAR(120) NOT NULL,
  has_uleam_agreement     BOOLEAN NOT NULL DEFAULT FALSE,
  agreement_code_or_name  VARCHAR(200),         -- convenio declarado por el investigador
  verified_agreement_code_or_name VARCHAR(200), -- convenio confirmado por el administrador
  endorsement_letter_name VARCHAR(255) NOT NULL,
  endorsement_letter_path TEXT NOT NULL,
  verification_status     VARCHAR(30) NOT NULL DEFAULT 'under_review'
                            CHECK (verification_status IN (
                              'under_review',
                              'verified_with_agreement',
                              'verified_without_agreement',
                              'rejected'
                            )),
  admin_notes             TEXT,
  verified_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Para bases donde la tabla ya existía sin la columna del convenio verificado.
ALTER TABLE ext_external_researcher_dossiers
  ADD COLUMN IF NOT EXISTS verified_agreement_code_or_name VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_ext_dossiers_status
  ON ext_external_researcher_dossiers(verification_status, created_at DESC);

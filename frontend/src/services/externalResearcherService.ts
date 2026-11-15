// Vinculación · Tarea 4 — registro y admisión de investigadores externos.
// Corre en el NAVEGADOR: solo fetch hacia /api/extensions/* (NestJS).
import { apiErrorMessage, apiFetch, apiGet, apiRequest } from './http';

export const ENDORSEMENT_MAX_MB = 10;

export type DossierStatus =
  | 'under_review'
  | 'verified_with_agreement'
  | 'verified_without_agreement'
  | 'rejected';

export type VerificationDecision = Exclude<DossierStatus, 'under_review'>;

export interface ExternalDossier {
  id: string;
  registration_request_id: string;
  user_id: string | null;
  name: string;
  email: string;
  request_status: 'pending' | 'approved' | 'rejected';
  home_institution: string;
  institution_country: string;
  position_role: string;
  has_uleam_agreement: boolean;
  agreement_code_or_name: string | null;
  verified_agreement_code_or_name: string | null;
  endorsement_letter_name: string;
  verification_status: DossierStatus;
  admin_notes: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface ExternalRegistrationInput {
  name: string;
  email: string;
  password: string;
  homeInstitution: string;
  institutionCountry: string;
  positionRole: string;
  hasUleamAgreement: boolean;
  agreementCodeOrName: string;
  endorsementLetter: File;
}

export interface VerifyDossierInput {
  decision: VerificationDecision;
  adminNotes?: string;
  agreementCodeOrName?: string;
}

export const DOSSIER_STATUS_LABEL: Record<DossierStatus, string> = {
  under_review: 'En revisión',
  verified_with_agreement: 'Verificado con convenio',
  verified_without_agreement: 'Verificado sin convenio',
  rejected: 'Rechazado',
};

export function validateEndorsementLetter(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return 'La carta de aval debe ser un archivo PDF.';
  }
  if (file.size === 0) return 'El archivo seleccionado está vacío.';
  if (file.size > ENDORSEMENT_MAX_MB * 1024 * 1024) {
    return `La carta de aval supera el límite de ${ENDORSEMENT_MAX_MB} MB.`;
  }
  return null;
}

export async function registerExternalResearcher(
  input: ExternalRegistrationInput,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const form = new FormData();
  form.append('name', input.name);
  form.append('email', input.email);
  form.append('password', input.password);
  form.append('homeInstitution', input.homeInstitution);
  form.append('institutionCountry', input.institutionCountry);
  form.append('positionRole', input.positionRole);
  form.append('hasUleamAgreement', String(input.hasUleamAgreement));
  if (input.hasUleamAgreement) {
    form.append('agreementCodeOrName', input.agreementCodeOrName);
  }
  form.append('endorsementLetter', input.endorsementLetter);

  try {
    const res = await apiFetch('/api/extensions/auth/register-external', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      return { success: false, error: await apiErrorMessage(res, 'No se pudo enviar la solicitud') };
    }
    const data = (await res.json()) as { message: string };
    return { success: true, message: data.message };
  } catch {
    return { success: false, error: 'Error de conexión. Verifica tu red e intenta de nuevo.' };
  }
}

export const externalResearcherService = {
  listDossiers(status?: DossierStatus): Promise<ExternalDossier[]> {
    const query = status ? `?status=${status}` : '';
    return apiGet(`/api/extensions/admin/external-dossiers${query}`);
  },

  getDossier(id: string): Promise<ExternalDossier> {
    return apiGet(`/api/extensions/admin/external-dossiers/${id}`);
  },

  letterUrl(id: string): string {
    return `/api/extensions/admin/external-dossiers/${id}/letter`;
  },

  verifyDossier(id: string, input: VerifyDossierInput): Promise<ExternalDossier> {
    return apiRequest(`/api/extensions/admin/external-dossiers/${id}/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },
};

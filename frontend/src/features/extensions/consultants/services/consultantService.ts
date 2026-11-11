import { apiGet, apiRequest } from '../../../../services/http';
import type {
  ConsultationRequest,
  CreateConsultationRequestInput,
  PermanentConsultant,
  SubmitConsultationFeedbackInput,
} from '../types/consultant.types';

export const consultantService = {
  /**
   * Obtiene la lista de consultores permanentes de odontología activos
   */
  async getPermanentConsultants(): Promise<PermanentConsultant[]> {
    return apiGet<PermanentConsultant[]>('/api/extensions/consultants/permanent');
  },

  /**
   * Crea una nueva solicitud de interconsulta técnica
   */
  async createRequest(input: CreateConsultationRequestInput): Promise<ConsultationRequest> {
    return apiRequest<ConsultationRequest>('/api/extensions/consultants/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },

  /**
   * Obtiene las interconsultas asignadas al usuario actual (rol consultor)
   */
  async getMyRequests(): Promise<ConsultationRequest[]> {
    return apiGet<ConsultationRequest[]>('/api/extensions/consultants/requests/my-requests');
  },

  /**
   * Obtiene todas las solicitudes de interconsulta vinculadas a una investigación
   */
  async getRequestsForSubmission(submissionId: string): Promise<ConsultationRequest[]> {
    return apiGet<ConsultationRequest[]>(
      `/api/extensions/consultants/submissions/${submissionId}/requests`,
    );
  },

  /**
   * Obtiene el detalle de una solicitud específica
   */
  async getRequestById(requestId: string): Promise<ConsultationRequest> {
    return apiGet<ConsultationRequest>(`/api/extensions/consultants/requests/${requestId}`);
  },

  /**
   * Envía las observaciones/criterios del informe técnico (por el consultor)
   */
  async submitFeedback(
    requestId: string,
    input: SubmitConsultationFeedbackInput,
  ): Promise<ConsultationRequest> {
    return apiRequest<ConsultationRequest>(
      `/api/extensions/consultants/requests/${requestId}/feedback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
  },

  /**
   * Adopta en bloque las recomendaciones del consultor (por el miembro titular CEISH)
   */
  async acceptAllFeedback(requestId: string): Promise<ConsultationRequest> {
    return apiRequest<ConsultationRequest>(
      `/api/extensions/consultants/requests/${requestId}/accept-all`,
      {
        method: 'POST',
      },
    );
  },
};

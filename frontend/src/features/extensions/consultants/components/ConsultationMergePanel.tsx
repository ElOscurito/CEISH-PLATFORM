import { useState } from 'react';
import { consultantService } from '../services/consultantService';
import type { ConsultationFeedback, ConsultationRequest } from '../types/consultant.types';
import '../styles/consultants.css';

interface Props {
  requests: ConsultationRequest[];
  onRefresh: () => void;
  onAdoptAll?: (feedbacks: ConsultationFeedback[]) => void;
  onAdoptSingle?: (feedback: ConsultationFeedback) => void;
}

export function ConsultationMergePanel({
  requests,
  onRefresh,
  onAdoptAll,
  onAdoptSingle,
}: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) {
    return null;
  }

  const handleAdoptAll = async (request: ConsultationRequest) => {
    if (!request.feedbacks || request.feedbacks.length === 0) return;
    setError(null);
    setLoadingId(request.id);
    try {
      await consultantService.acceptAllFeedback(request.id);
      if (onAdoptAll) {
        onAdoptAll(request.feedbacks);
      }
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al adoptar observaciones';
      setError(message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="merge-panel">
      <div className="merge-panel__header">
        <div className="merge-panel__title">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M3 4.5A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 13.5v-9z"
              stroke="#38bdf8"
              strokeWidth="1.5"
            />
            <path d="M6 7.5h6M6 10.5h4" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Interconsultas Odontológicas ({requests.length})</span>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: 6, color: '#fca5a5', fontSize: 12 }}>
          {error}
        </div>
      )}

      {requests.map((req) => {
        const isCompleted = req.status === 'completed';
        const consultantName = req.consultant?.name ?? 'Docente Consultor';
        const specialty = req.consultant?.consultantProfile?.specialty ?? 'Odontología';
        const feedbacks = req.feedbacks ?? [];
        const allAccepted = feedbacks.length > 0 && feedbacks.every((f) => f.isAcceptedByMember);

        return (
          <div key={req.id} className="merge-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: '#f2f4f7', fontSize: 13 }}>{consultantName}</strong>
                <span style={{ fontSize: 11, color: '#38bdf8', marginLeft: 8 }}>({specialty})</span>
              </div>
              <span className={`consultants-badge ${isCompleted ? 'consultants-badge--completed' : 'consultants-badge--pending'}`}>
                {isCompleted ? '✓ Informe Técnico Emitido' : 'Pendiente de Respuesta'}
              </span>
            </div>

            {req.instructions && (
              <p style={{ margin: '4px 0', fontSize: 12, color: '#94a3b8' }}>
                <em>Instrucciones enviadas:</em> {req.instructions}
              </p>
            )}

            {isCompleted && feedbacks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                    Recomendaciones Técnicas del Consultor:
                  </span>
                  <button
                    type="button"
                    className="eval-btn eval-btn--primary"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    disabled={allAccepted || loadingId === req.id}
                    onClick={() => handleAdoptAll(req)}
                  >
                    {allAccepted
                      ? '✓ Recomendaciones Adoptadas'
                      : loadingId === req.id
                      ? 'Adoptando...'
                      : '⚡ Adoptar todas en bloque'}
                  </button>
                </div>

                {feedbacks.map((fb) => (
                  <div key={fb.id} style={{ background: '#0e1115', padding: 10, borderRadius: 6, border: '1px solid #2a3038' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span className="merge-card__criterion">{fb.criteriaLabel}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`merge-card__status merge-card__status--${fb.suggestedStatus}`}>
                          {fb.suggestedStatus === 'approved' ? 'Aprobado sugerido' : fb.suggestedStatus === 'rejected' ? 'Corrección sugerida' : 'Neutral'}
                        </span>
                        {fb.isAcceptedByMember ? (
                          <span style={{ fontSize: 11, color: '#4ade80' }}>✓ Adoptado</span>
                        ) : (
                          onAdoptSingle && (
                            <button
                              type="button"
                              className="eval-btn eval-btn--outline"
                              style={{ fontSize: 10, padding: '2px 8px' }}
                              onClick={() => onAdoptSingle(fb)}
                            >
                              Adoptar criterio
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    <div className="merge-card__comment">{fb.technicalComments}</div>
                  </div>
                ))}
              </div>
            ) : isCompleted ? (
              <p style={{ fontSize: 12, color: '#64748b' }}>No se registraron comentarios específicos.</p>
            ) : (
              <p style={{ fontSize: 12, color: '#64748b' }}>
                El consultor aún no ha emitido su informe técnico. Te notificaremos cuando esté listo.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

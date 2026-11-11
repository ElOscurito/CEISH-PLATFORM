import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { consultantService } from '../services/consultantService';
import type { ConsultationRequest, SingleFeedbackInput } from '../types/consultant.types';
import { storageService } from '../../../../services/storage';
import { usePDFViewer } from '../../../evaluation/hooks/usePDFViewer';
import { PDFViewer } from '../../../evaluation/components/PDFViewer/PDFViewer';
import { DocxViewer } from '../../../evaluation/components/DocxViewer';
import '../styles/consultants.css';

const DEFAULT_CRITERIA = [
  'Planteamiento y Justificación de la Investigación Odontológica',
  'Metodología, Muestreo y Protocolos Clínicos',
  'Consentimiento Informado y Protección de Participantes',
  'Bioseguridad, Manejo de Tejidos y Material Dental',
  'Confidencialidad y Custodia de Datos Clínicos',
];

export function ConsultantFeedbackView() {
  const { requestId = '' } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<ConsultationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formCriteria, setFormCriteria] = useState<
    Array<{
      criteriaLabel: string;
      suggestedStatus: 'approved' | 'rejected' | 'neutral';
      technicalComments: string;
    }>
  >(
    DEFAULT_CRITERIA.map((label) => ({
      criteriaLabel: label,
      suggestedStatus: 'neutral',
      technicalComments: '',
    })),
  );

  const pdf = usePDFViewer();
  const { loadFile } = pdf;

  useEffect(() => {
    if (!requestId) return;
    let active = true;
    consultantService
      .getRequestById(requestId)
      .then((data) => {
        if (!active) return;
        setRequest(data);
        if (data.feedbacks && data.feedbacks.length > 0) {
          setFormCriteria(
            data.feedbacks.map((f) => ({
              criteriaLabel: f.criteriaLabel,
              suggestedStatus: f.suggestedStatus,
              technicalComments: f.technicalComments,
            })),
          );
        }
        if (data.submissionId) {
          loadFile(storageService.getRawUrl(data.submissionId));
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Error al cargar la interconsulta');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [requestId, loadFile]);

  const handleStatusChange = (
    index: number,
    status: 'approved' | 'rejected' | 'neutral',
  ) => {
    setFormCriteria((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], suggestedStatus: status };
      return next;
    });
  };

  const handleCommentChange = (index: number, comment: string) => {
    setFormCriteria((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], technicalComments: comment };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId) return;

    // Validar que al menos un criterio tenga comentario
    const hasComments = formCriteria.some((c) => c.technicalComments.trim().length > 0);
    if (!hasComments) {
      setError('Por favor redacta comentarios técnicos en al menos un criterio');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload: SingleFeedbackInput[] = formCriteria.map((c) => ({
        criteriaLabel: c.criteriaLabel,
        suggestedStatus: c.suggestedStatus,
        technicalComments: c.technicalComments.trim() || 'Sin observaciones técnicas adicionales.',
      }));

      const updated = await consultantService.submitFeedback(requestId, {
        feedbacks: payload,
      });
      setRequest(updated);
      setSuccessMessage('¡Informe técnico emitido y enviado exitosamente al miembro CEISH!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar el informe técnico';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="eval-loading">
        <div className="pdf-spinner" />
        <span>Cargando expediente de interconsulta...</span>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#fca5a5' }}>
        <p>{error}</p>
        <button
          className="eval-btn eval-btn--outline"
          onClick={() => navigate('/evaluador/interconsultas')}
        >
          Volver a mis interconsultas
        </button>
      </div>
    );
  }

  const isDocx =
    request?.submission?.documentName &&
    !request.submission.documentName.toLowerCase().endsWith('.pdf');

  return (
    <div className="consultant-layout">
      {/* Header */}
      <header className="consultant-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            className="review-header__back"
            onClick={() => navigate('/evaluador/interconsultas')}
            title="Volver al listado"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 12L6 8l4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f2f4f7' }}>
                {request?.submission?.title ?? 'Investigación Asignada'}
              </span>
              <span className="consultants-badge">
                Código: {request?.submission?.researchCode ?? 'N/A'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Solicitado por:{' '}
              <strong style={{ color: '#cbd5e1' }}>
                {request?.requesterMember?.name ?? 'Miembro CEISH'}
              </strong>{' '}
              • Documento: {request?.submission?.documentName}
            </span>
          </div>
        </div>

        <div>
          <span
            className={`consultants-badge ${
              request?.status === 'completed'
                ? 'consultants-badge--completed'
                : 'consultants-badge--pending'
            }`}
          >
            {request?.status === 'completed'
              ? '✓ Informe Emitido'
              : 'Estado: En Revisión'}
          </span>
        </div>
      </header>

      {/* Body: Two Panels (Document + Form) */}
      <div className="consultant-body">
        {/* Document Panel */}
        <main className="consultant-doc-panel">
          {request?.submissionId && isDocx ? (
            <DocxViewer url={storageService.getRawUrl(request.submissionId)} />
          ) : (
            <PDFViewer
              file={pdf.pdfFile}
              currentPage={pdf.currentPage}
              totalPages={pdf.totalPages}
              zoom={pdf.zoom}
              isLoading={pdf.isLoading}
              onLoadSuccess={pdf.setTotalPages}
              onLoadError={pdf.onLoadError}
              onLoadFile={pdf.loadFile}
              onPrevPage={pdf.prevPage}
              onNextPage={pdf.nextPage}
              onZoomIn={pdf.zoomIn}
              onZoomOut={pdf.zoomOut}
              onResetZoom={pdf.resetZoom}
              onPageChange={pdf.goToPage}
            />
          )}
        </main>

        {/* Feedback Form Panel */}
        <aside className="consultant-form-panel">
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f2f4f7', margin: '0 0 4px 0' }}>
              Informe Técnico Odontológico
            </h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
              Emite tus sugerencias técnicas por criterio. El miembro titular podrá adoptarlas en
              bloque para su dictamen final.
            </p>
          </div>

          {request?.instructions && (
            <div
              style={{
                background: '#1a1f26',
                borderLeft: '3px solid #38bdf8',
                padding: '10px 12px',
                borderRadius: 4,
                fontSize: 12,
                color: '#cbd5e1',
              }}
            >
              <strong style={{ color: '#38bdf8' }}>Instrucciones del Miembro CEISH:</strong>
              <div style={{ marginTop: 4 }}>{request.instructions}</div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                borderRadius: 6,
                color: '#fca5a5',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          {successMessage && (
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid #22c55e',
                borderRadius: 6,
                color: '#86efac',
                fontSize: 12,
              }}
            >
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {formCriteria.map((c, idx) => (
              <div key={idx} className="consultant-form-group">
                <span className="consultant-form-group__title">
                  {idx + 1}. {c.criteriaLabel}
                </span>

                <div className="consultant-radio-group">
                  <label className="consultant-radio-label">
                    <input
                      type="radio"
                      name={`status_${idx}`}
                      checked={c.suggestedStatus === 'approved'}
                      onChange={() => handleStatusChange(idx, 'approved')}
                    />
                    <span>Aprobado sugerido</span>
                  </label>
                  <label className="consultant-radio-label">
                    <input
                      type="radio"
                      name={`status_${idx}`}
                      checked={c.suggestedStatus === 'rejected'}
                      onChange={() => handleStatusChange(idx, 'rejected')}
                    />
                    <span>Corrección sugerida</span>
                  </label>
                  <label className="consultant-radio-label">
                    <input
                      type="radio"
                      name={`status_${idx}`}
                      checked={c.suggestedStatus === 'neutral'}
                      onChange={() => handleStatusChange(idx, 'neutral')}
                    />
                    <span>Neutral</span>
                  </label>
                </div>

                <textarea
                  className="modal__textarea"
                  rows={3}
                  placeholder="Detalla tu criterio técnico u observaciones odontológicas..."
                  value={c.technicalComments}
                  onChange={(e) => handleCommentChange(idx, e.target.value)}
                />
              </div>
            ))}

            <button
              type="submit"
              className="eval-btn eval-btn--primary"
              style={{ padding: '12px', fontSize: 13, fontWeight: 700, marginTop: 8 }}
              disabled={submitting}
            >
              {submitting ? 'Enviando informe...' : 'Enviar Informe Técnico al CEISH'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

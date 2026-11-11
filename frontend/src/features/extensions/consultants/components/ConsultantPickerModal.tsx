import { useEffect, useState } from 'react';
import { consultantService } from '../services/consultantService';
import type { ConsultationRequest, PermanentConsultant } from '../types/consultant.types';
import '../styles/consultants.css';

interface Props {
  submissionId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (request: ConsultationRequest) => void;
}

export function ConsultantPickerModal({
  submissionId,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [consultants, setConsultants] = useState<PermanentConsultant[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedConsultantId, setSelectedConsultantId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    consultantService
      .getPermanentConsultants()
      .then((data) => {
        if (active) setConsultants(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Error al cargar consultores');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = consultants.filter((c) =>
    `${c.name} ${c.specialty} ${c.department ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConsultantId) {
      setError('Por favor selecciona un docente consultor');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await consultantService.createRequest({
        submissionId,
        consultantId: selectedConsultantId,
        instructions: instructions.trim() || undefined,
        dueDate: dueDate || undefined,
      });
      onSuccess(created);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al enviar la solicitud';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal consultant-picker-modal">
        <div className="modal__header">
          <div>
            <h2 className="modal__title">Solicitar Interconsulta a Odontología</h2>
            <p className="page__subtitle" style={{ margin: 0, fontSize: 12 }}>
              Consultores Permanentes — Facultad de Odontología ULEAM
            </p>
          </div>
          <button className="modal__close" onClick={onClose} type="button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal__body">
            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: 6, color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div className="modal__field">
              <label className="modal__label">Buscar por nombre o especialidad</label>
              <input
                type="text"
                className="consultant-search-box"
                placeholder="Ej: Endodoncia, Periodoncia, Dr. Mendoza..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="modal__field">
              <label className="modal__label">Docentes Consultores Disponibles</label>
              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                  Cargando catálogo de odontología...
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                  No se encontraron docentes con ese criterio.
                </div>
              ) : (
                <div className="consultant-list">
                  {filtered.map((c) => {
                    const isSelected = selectedConsultantId === c.userId;
                    return (
                      <div
                        key={c.userId}
                        className={`consultant-option ${isSelected ? 'consultant-option--selected' : ''}`}
                        onClick={() => setSelectedConsultantId(c.userId)}
                      >
                        <div className="consultant-option__info">
                          <span className="consultant-option__name">{c.name}</span>
                          <span className="consultant-option__specialty">
                            {c.specialty} • {c.faculty}
                          </span>
                        </div>
                        <span className="consultants-badge">
                          {isSelected ? '✓ Seleccionado' : 'Disponible'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="modal__field">
              <label className="modal__label">Instrucciones o enfoque para el consultor</label>
              <textarea
                className="modal__textarea"
                rows={3}
                placeholder="Indica qué aspectos odontológicos específicos debe analizar el consultor..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            <div className="modal__field">
              <label className="modal__label">Fecha límite sugerida (opcional)</label>
              <input
                type="date"
                className="modal__input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="modal__footer">
            <button type="button" className="eval-btn eval-btn--outline" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="eval-btn eval-btn--primary"
              disabled={!selectedConsultantId || submitting}
            >
              {submitting ? 'Enviando...' : 'Enviar Solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

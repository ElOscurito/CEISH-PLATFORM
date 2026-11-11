import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { consultantService } from '../services/consultantService';
import type { ConsultationRequest } from '../types/consultant.types';
import '../styles/consultants.css';

type FilterType = 'all' | 'pending' | 'completed';

export function ConsultantRequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    consultantService
      .getMyRequests()
      .then((data) => {
        if (active) setRequests(data);
      })
      .catch((err: unknown) => {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Error al cargar interconsultas';
          setError(msg);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filtered = requests.filter((r) => {
    const matchesFilter =
      filter === 'all' ? true : filter === 'completed' ? r.status === 'completed' : r.status !== 'completed';
    const matchesSearch =
      (r.submission?.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.submission?.researchCode ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.requesterMember?.name ?? '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Interconsultas Odontológicas</h1>
          <p className="page__subtitle">
            Solicitudes de criterio técnico emitidas por los miembros del comité CEISH.
          </p>
        </div>
      </div>

      <div className="page__body">
        <div className="filter-bar">
          <input
            className="filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, código o miembro..."
          />
          <button
            type="button"
            className={`filter-pill ${filter === 'all' ? 'filter-pill--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todas ({requests.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === 'pending' ? 'filter-pill--active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pendientes ({requests.filter((r) => r.status !== 'completed').length})
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === 'completed' ? 'filter-pill--active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completadas ({requests.filter((r) => r.status === 'completed').length})
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              color: '#fca5a5',
              fontSize: 13,
              marginTop: 16,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="page__loading">
            <div className="pdf-spinner" />
            <span>Cargando interconsultas...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No hay solicitudes de interconsulta en esta sección</p>
            <p className="empty-state__subtitle">
              Cuando un miembro titular del CEISH te solicite criterio técnico, aparecerá aquí.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
            {filtered.map((req) => {
              const isCompleted = req.status === 'completed';
              return (
                <div
                  key={req.id}
                  style={{
                    background: '#12161b',
                    border: '1px solid #2a3038',
                    borderRadius: 9,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#f2f4f7',
                        }}
                      >
                        {req.submission?.title ?? 'Investigación'}
                      </span>
                      <span className="consultants-badge">
                        {req.submission?.researchCode ?? 'Sin código'}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      Solicitado por:{' '}
                      <strong style={{ color: '#cbd5e1' }}>
                        {req.requesterMember?.name ?? 'Miembro CEISH'}
                      </strong>{' '}
                      • Fecha:{' '}
                      {new Date(req.requestedAt).toLocaleDateString('es-EC', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {req.dueDate && (
                        <>
                          {' '}
                          • Límite:{' '}
                          <span style={{ color: '#f59e0b' }}>
                            {new Date(req.dueDate).toLocaleDateString('es-EC')}
                          </span>
                        </>
                      )}
                    </div>

                    {req.instructions && (
                      <div
                        style={{
                          background: '#171b20',
                          padding: '8px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#94a3b8',
                          borderLeft: '3px solid #38bdf8',
                        }}
                      >
                        <strong>Instrucciones:</strong> {req.instructions}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                    <span
                      className={`consultants-badge ${
                        isCompleted ? 'consultants-badge--completed' : 'consultants-badge--pending'
                      }`}
                    >
                      {isCompleted ? '✓ Informe Emitido' : 'Pendiente de Criterio'}
                    </span>

                    <button
                      type="button"
                      className="eval-btn eval-btn--primary"
                      onClick={() => navigate(`/evaluador/interconsultas/${req.id}`)}
                    >
                      {isCompleted ? 'Ver / Editar Informe' : 'Emitir Informe Técnico'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

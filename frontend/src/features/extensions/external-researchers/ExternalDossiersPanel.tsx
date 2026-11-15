import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DOSSIER_STATUS_LABEL,
  externalResearcherService,
  type DossierStatus,
  type ExternalDossier,
} from '../../../services/externalResearcherService';
import { ExternalDossierAdminModal } from './ExternalDossierAdminModal';
import '../../admin/admin.css';
import './externalResearchers.css';

type StatusFilter = 'all' | DossierStatus;

export function ExternalDossiersPanel() {
  const [dossiers, setDossiers] = useState<ExternalDossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('under_review');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('solicitud');

  useEffect(() => {
    void externalResearcherService.listDossiers()
      .then(setDossiers)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => dossiers.find((item) => item.id === requestedId || item.registration_request_id === requestedId) ?? null,
    [dossiers, requestedId],
  );

  const open = (dossier: ExternalDossier) => setSearchParams({ solicitud: dossier.registration_request_id });
  const close = () => setSearchParams({});
  const replace = (updated: ExternalDossier) => {
    setDossiers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  };

  const pendingCount = dossiers.filter((item) => item.verification_status === 'under_review').length;
  const filtered = dossiers.filter((item) => {
    const haystack = `${item.name} ${item.email} ${item.home_institution} ${item.institution_country}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (status === 'all' || item.verification_status === status);
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Expedientes de investigadores externos</h1>
          <p className="page__subtitle">{pendingCount} expedientes pendientes de verificación</p>
        </div>
      </div>

      <div className="page__body">
        {error && <div className="workflow-alert workflow-alert--error" role="alert">{error}</div>}
        <div className="request-toolbar">
          <label><span className="sr-only">Buscar expedientes</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, correo, institución o país..." /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} aria-label="Filtrar por estado">
            <option value="all">Todos los estados</option>
            {(Object.keys(DOSSIER_STATUS_LABEL) as DossierStatus[]).map((key) => <option key={key} value={key}>{DOSSIER_STATUS_LABEL[key]}</option>)}
          </select>
          <span>{filtered.length} resultados</span>
        </div>

        {loading ? (
          <div className="page__loading"><div className="pdf-spinner" /><span>Cargando...</span></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p className="empty-state__title">No hay expedientes en este estado</p></div>
        ) : (
          <div className="request-list ext-dossier-list">
            {filtered.map((dossier) => (
              <article key={dossier.id} className="request-card ext-dossier-card">
                <div className="request-card__identity">
                  <span className="request-card__avatar">{dossier.name.charAt(0) || '?'}</span>
                  <div>
                    <h2>{dossier.name}</h2>
                    <p>{dossier.email}</p>
                  </div>
                </div>
                <div className="request-card__details">
                  <span>{dossier.home_institution} · {dossier.institution_country}</span>
                  <span>{dossier.position_role}</span>
                  <span>{dossier.has_uleam_agreement ? `Declara convenio: ${dossier.agreement_code_or_name ?? 'sí'}` : 'Sin convenio declarado'}</span>
                  {dossier.verified_agreement_code_or_name && <span>Convenio verificado: {dossier.verified_agreement_code_or_name}</span>}
                  <span>{new Date(dossier.created_at).toLocaleDateString('es-EC')}</span>
                </div>
                <span className={`badge ext-status ext-status--${dossier.verification_status}`}>
                  {DOSSIER_STATUS_LABEL[dossier.verification_status]}
                </span>
                <div className="request-card__actions">
                  <button className="eval-btn eval-btn--primary" onClick={() => open(dossier)}>
                    {dossier.verification_status === 'under_review' ? 'Revisar expediente' : 'Ver expediente'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selected && <ExternalDossierAdminModal dossier={selected} onClose={close} onUpdated={replace} />}
    </div>
  );
}

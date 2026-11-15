import { useState } from 'react';
import {
  DOSSIER_STATUS_LABEL,
  externalResearcherService,
  type ExternalDossier,
  type VerificationDecision,
} from '../../../services/externalResearcherService';

interface Props {
  dossier: ExternalDossier;
  onClose: () => void;
  onUpdated: (dossier: ExternalDossier) => void;
}

const DECISIONS: Array<{ value: VerificationDecision; title: string; detail: string }> = [
  { value: 'verified_with_agreement', title: 'Aprobar con convenio', detail: 'Se verificó el convenio con la ULEAM' },
  { value: 'verified_without_agreement', title: 'Aprobar sin convenio', detail: 'Aval válido, sin convenio vigente' },
  { value: 'rejected', title: 'Rechazar', detail: 'La solicitud no cumple los requisitos' },
];

export function ExternalDossierAdminModal({ dossier, onClose, onUpdated }: Props) {
  const isPending = dossier.verification_status === 'under_review';
  const [decision, setDecision] = useState<VerificationDecision>(
    dossier.has_uleam_agreement ? 'verified_with_agreement' : 'verified_without_agreement',
  );
  const [agreement, setAgreement] = useState(dossier.agreement_code_or_name ?? '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const letterUrl = externalResearcherService.letterUrl(dossier.id);
  // Aprobar sin convenio a quien declaró uno exige justificarlo, igual que un rechazo.
  const contradictsDeclaration = decision === 'verified_without_agreement' && dossier.has_uleam_agreement;
  const notesRequired = decision === 'rejected' || contradictsDeclaration;

  const submit = async () => {
    if (decision === 'verified_with_agreement' && agreement.trim().length < 2) {
      setError('Indica el nombre o código del convenio verificado (mínimo 2 caracteres).');
      return;
    }
    if (decision === 'rejected' && !notes.trim()) {
      setError('Explica el motivo del rechazo en las observaciones.');
      return;
    }
    if (contradictsDeclaration && !notes.trim()) {
      setError('El investigador declaró un convenio: explica en las observaciones por qué se aprueba sin convenio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await externalResearcherService.verifyDossier(dossier.id, {
        decision,
        adminNotes: notes.trim() || undefined,
        agreementCodeOrName: decision === 'verified_with_agreement' ? agreement.trim() : undefined,
      });
      onUpdated(updated);
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div className="modal ext-modal" role="dialog" aria-modal="true" aria-labelledby="ext-dossier-title">
        <div className="modal__header">
          <h2 className="modal__title" id="ext-dossier-title">Expediente · {dossier.name}</h2>
          <button className="modal__close" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button>
        </div>

        <div className="ext-modal__body">
          <section className="ext-modal__info">
            <dl className="ext-modal__data">
              <dt>Correo</dt><dd>{dossier.email}</dd>
              <dt>Institución</dt><dd>{dossier.home_institution}</dd>
              <dt>País</dt><dd>{dossier.institution_country}</dd>
              <dt>Cargo</dt><dd>{dossier.position_role}</dd>
              <dt>Convenio declarado</dt><dd>{dossier.has_uleam_agreement ? (dossier.agreement_code_or_name ?? 'Sí') : 'No declarado'}</dd>
              {dossier.verified_agreement_code_or_name && <><dt>Convenio verificado</dt><dd>{dossier.verified_agreement_code_or_name}</dd></>}
              <dt>Solicitud</dt><dd>{new Date(dossier.created_at).toLocaleString('es-EC')}</dd>
              <dt>Estado</dt><dd><span className={`badge ext-status ext-status--${dossier.verification_status}`}>{DOSSIER_STATUS_LABEL[dossier.verification_status]}</span></dd>
              {dossier.verified_at && <><dt>Dictaminado</dt><dd>{new Date(dossier.verified_at).toLocaleString('es-EC')}</dd></>}
              {dossier.admin_notes && <><dt>Observaciones</dt><dd>{dossier.admin_notes}</dd></>}
            </dl>

            {isPending && (
              <div className="ext-modal__decision">
                {error && <div className="workflow-alert workflow-alert--error" role="alert">{error}</div>}
                <fieldset disabled={saving}>
                  <legend className="modal__label">Dictamen</legend>
                  {DECISIONS.map((option) => (
                    <label key={option.value} className={`ext-choice ${decision === option.value ? 'is-selected' : ''}`}>
                      <input type="radio" name="decision" value={option.value} checked={decision === option.value} onChange={() => setDecision(option.value)} />
                      <span><strong>{option.title}</strong><small>{option.detail}</small></span>
                    </label>
                  ))}
                </fieldset>
                {decision === 'verified_with_agreement' && (
                  <>
                    <label className="modal__field">
                      <span className="modal__label">Convenio declarado por el investigador</span>
                      <input className="modal__input ext-readonly" value={dossier.has_uleam_agreement ? (dossier.agreement_code_or_name ?? '') : 'No declarado'} readOnly tabIndex={-1} aria-readonly="true" />
                    </label>
                    <label className="modal__field">
                      <span className="modal__label">Convenio verificado</span>
                      <input className="modal__input" value={agreement} onChange={(event) => setAgreement(event.target.value)} maxLength={200} disabled={saving} placeholder="Nombre o código del convenio" />
                    </label>
                  </>
                )}
                <label className="modal__field">
                  <span className="modal__label">Observaciones {notesRequired ? '(obligatorio)' : '(opcional)'}</span>
                  <textarea className="modal__textarea" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} disabled={saving} />
                </label>
              </div>
            )}
          </section>

          <section className="ext-modal__letter">
            <div className="ext-modal__letter-header">
              <span>{dossier.endorsement_letter_name}</span>
              <a href={letterUrl} target="_blank" rel="noreferrer">Abrir en pestaña nueva ↗</a>
            </div>
            <iframe title="Carta de aval institucional" src={letterUrl} />
          </section>
        </div>

        <div className="modal__footer">
          <button className="eval-btn eval-btn--outline" onClick={onClose} disabled={saving}>Cerrar</button>
          {isPending && (
            <button className={`eval-btn ${decision === 'rejected' ? 'eval-btn--danger-outline' : 'eval-btn--primary'}`} onClick={() => void submit()} disabled={saving}>
              {saving ? 'Guardando...' : decision === 'rejected' ? 'Rechazar solicitud' : 'Aprobar y habilitar cuenta'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

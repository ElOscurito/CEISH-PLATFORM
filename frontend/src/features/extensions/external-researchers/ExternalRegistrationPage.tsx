import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../auth/AuthLayout';
import Button from '../../../shared/components/common/Button';
import Card from '../../../shared/components/common/Card';
import Input from '../../../shared/components/common/Input';
import { colors, typography } from '../../../shared/components/common/colors';
import {
  ENDORSEMENT_MAX_MB,
  registerExternalResearcher,
  validateEndorsementLetter,
} from '../../../services/externalResearcherService';
import '../../auth/LoginForm.css';
import './externalResearchers.css';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_TEXT = 2;

export const ExternalRegistrationPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [homeInstitution, setHomeInstitution] = useState('');
  const [institutionCountry, setInstitutionCountry] = useState('');
  const [positionRole, setPositionRole] = useState('');
  const [hasUleamAgreement, setHasUleamAgreement] = useState(false);
  const [agreementCodeOrName, setAgreementCodeOrName] = useState('');
  const [endorsementLetter, setEndorsementLetter] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectLetter = (file: File | undefined) => {
    if (!file) return;
    const validationError = validateEndorsementLetter(file);
    setError(validationError);
    setEndorsementLetter(validationError ? null : file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const required = [name, email, homeInstitution, institutionCountry, positionRole, password, confirmPassword];
    if (required.some((value) => !value.trim()) || (hasUleamAgreement && !agreementCodeOrName.trim())) {
      setError('Completa todos los campos requeridos.');
      return;
    }
    const textFields: Array<[string, string]> = [
      ['El nombre', name],
      ['La institución', homeInstitution],
      ['El país', institutionCountry],
      ['El cargo', positionRole],
    ];
    if (hasUleamAgreement) textFields.push(['El convenio', agreementCodeOrName]);
    const shortField = textFields.find(([, value]) => value.trim().length < MIN_TEXT);
    if (shortField) {
      setError(`${shortField[0]} debe tener al menos ${MIN_TEXT} caracteres.`);
      return;
    }
    if (!emailPattern.test(email.trim())) {
      setError('Ingresa un correo válido.');
      return;
    }
    if (!endorsementLetter) {
      setError('Adjunta la carta de aval institucional en PDF.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);
    const result = await registerExternalResearcher({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      homeInstitution: homeInstitution.trim(),
      institutionCountry: institutionCountry.trim(),
      positionRole: positionRole.trim(),
      hasUleamAgreement,
      agreementCodeOrName: agreementCodeOrName.trim(),
      endorsementLetter,
    });
    setIsLoading(false);

    if (!result.success) {
      setError(result.error ?? 'No se pudo enviar la solicitud.');
      return;
    }
    setSuccess(result.message ?? 'Solicitud enviada correctamente.');
  };

  return (
    <div className="ext-auth-scroll">
    <AuthLayout>
      <Card variant="elevated" padding="md">
        <div className="login-form__header">
          <h1 className="login-form__title" style={{ color: colors.surface.dark, fontFamily: typography.fontFamily.display }}>
            Registro de investigador externo
          </h1>
          <p className="login-form__subtitle" style={{ color: colors.gray[600], fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.body }}>
            Para personas que no pertenecen a la ULEAM. El CEISH verificará tu filiación, la carta de aval y el convenio interinstitucional antes de habilitar tu acceso.
          </p>
        </div>

        <div className="login-form__divider-top" style={{ background: `linear-gradient(90deg, ${colors.primary[500]} 0%, ${colors.success[500]} 100%)` }} />

        {error && <div className="login-form__alert login-form__alert--error" role="alert"><span className="login-form__alert-icon">⚠️</span><p className="login-form__alert-text">{error}</p></div>}
        {success && <div className="login-form__alert login-form__alert--success" role="status"><span className="login-form__alert-icon">✓</span><p className="login-form__alert-text">{success}</p></div>}

        {!success && (
          <form onSubmit={handleSubmit} className="login-form__form" noValidate>
            <p className="ext-form__section">Datos personales</p>
            <Input label="Nombres y apellidos" name="name" value={name} onChange={(event) => setName(event.target.value)} required disabled={isLoading} autoComplete="name" />
            <Input label="Correo electrónico" type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={isLoading} autoComplete="email" />

            <p className="ext-form__section">Filiación institucional</p>
            <Input label="Institución de procedencia" name="homeInstitution" value={homeInstitution} onChange={(event) => setHomeInstitution(event.target.value)} required disabled={isLoading} autoComplete="organization" maxLength={200} />
            <div className="ext-form__row">
              <Input label="País de la institución" name="institutionCountry" value={institutionCountry} onChange={(event) => setInstitutionCountry(event.target.value)} required disabled={isLoading} autoComplete="country-name" maxLength={100} />
              <Input label="Cargo en la institución" name="positionRole" value={positionRole} onChange={(event) => setPositionRole(event.target.value)} required disabled={isLoading} autoComplete="organization-title" maxLength={120} />
            </div>

            <fieldset className="registration-form__type" disabled={isLoading}>
              <legend>¿Tu institución tiene convenio con la ULEAM? <span aria-hidden="true">*</span></legend>
              <div className="registration-form__choices">
                <label className={hasUleamAgreement ? 'is-selected' : ''}><input type="radio" name="hasUleamAgreement" checked={hasUleamAgreement} onChange={() => setHasUleamAgreement(true)} /><span><strong>Sí, existe convenio</strong><small>Marco o específico</small></span></label>
                <label className={!hasUleamAgreement ? 'is-selected' : ''}><input type="radio" name="hasUleamAgreement" checked={!hasUleamAgreement} onChange={() => setHasUleamAgreement(false)} /><span><strong>No / No lo sé</strong><small>El CEISH lo verificará</small></span></label>
              </div>
            </fieldset>

            {hasUleamAgreement && (
              <Input label="Nombre o código del convenio" name="agreementCodeOrName" value={agreementCodeOrName} onChange={(event) => setAgreementCodeOrName(event.target.value)} required disabled={isLoading} maxLength={200} />
            )}

            <div className="ext-form__file">
              <span className="ext-form__file-label">Carta de aval institucional (PDF) <span aria-hidden="true">*</span></span>
              <button type="button" className={`ext-form__dropzone ${endorsementLetter ? 'has-file' : ''}`} onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                {endorsementLetter ? (
                  <><strong>{endorsementLetter.name}</strong><small>{(endorsementLetter.size / 1024 / 1024).toFixed(2)} MB · Cambiar archivo</small></>
                ) : (
                  <><strong>Seleccionar carta de aval</strong><small>Solo PDF · máximo {ENDORSEMENT_MAX_MB} MB</small></>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { selectLetter(event.target.files?.[0]); event.target.value = ''; }} />
            </div>

            <p className="ext-form__section">Acceso a la plataforma</p>
            <Input label="Contraseña" type="password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={isLoading} autoComplete="new-password" />
            <Input label="Confirmar contraseña" type="password" name="confirmPassword" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={isLoading} autoComplete="new-password" />

            <Button type="submit" variant="primary" size="sm" fullWidth isLoading={isLoading} disabled={isLoading} className="login-form__submit">
              {isLoading ? 'Enviando…' : 'Enviar solicitud de admisión'}
            </Button>
          </form>
        )}

        <div className="login-form__footer" style={{ borderTop: `1px solid ${colors.border}`, color: colors.gray[500], fontSize: typography.fontSize.xs }}>
          <p>¿Perteneces a la ULEAM? <Link to="/registro" className="login-form__footer-link" style={{ color: colors.primary[500] }}>Registro interno</Link> · <Link to="/login" className="login-form__footer-link" style={{ color: colors.primary[500] }}>Iniciar sesión</Link></p>
        </div>
      </Card>
    </AuthLayout>
    </div>
  );
};

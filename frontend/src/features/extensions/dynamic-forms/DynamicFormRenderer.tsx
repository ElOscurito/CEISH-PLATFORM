import { useId } from 'react';
import type { Answers, AnswerValue, CriterionAnswer, DynamicField, ResponseFile } from './dynamic-form.types';
import './dynamic-form-renderer.css';

interface Props {
  fields: DynamicField[]; answers: Answers; onChange: (id: string, value: AnswerValue) => void;
  errors?: Record<string, string>; readOnly?: boolean; disabled?: boolean;
  files?: Record<string, ResponseFile[]>;
  onUpload?: (fieldId: string, file: File) => void;
  onRemoveFile?: (fieldId: string, fileId: string) => void;
  onDownload?: (fileId: string) => void;
}

/** Controlled renderer: no network requests or submission side effects. */
export function DynamicFormRenderer({ fields, answers, onChange, errors = {}, readOnly = false, disabled = false, files = {}, onUpload, onRemoveFile, onDownload }: Props) {
  const prefix = useId();
  return <div className="dynamic-fields">{[...fields].sort((a, b) => a.displayOrder - b.displayOrder).map(field => {
    const id = `${prefix}-${field.id}`;
    const value = answers[field.id];
    const error = errors[field.id];
    const locked = readOnly || disabled;
    const common = { id, disabled: locked, 'aria-invalid': Boolean(error), 'aria-describedby': `${id}-help${error ? ` ${id}-error` : ''}`, 'aria-required': field.isRequired };
    const text = typeof value === 'string' ? value : '';
    const selected = Array.isArray(value) ? value : [];
    const criterion: CriterionAnswer = value && typeof value === 'object' && !Array.isArray(value) ? value : { status: 'pending', observation: '', pageReference: null };
    return <section className="dynamic-field" key={field.id}>
      <label className="dynamic-field-label" htmlFor={id}>{field.label}{field.isRequired && <span> (obligatorio)</span>}</label>
      <p id={`${id}-help`} className="dynamic-field-help">{field.helpText}{field.fieldType === 'file' && ' Word o PDF, hasta 15 MB por archivo. Máximo 10 archivos.'}</p>
      {field.fieldType === 'text' && <input {...common} value={text} maxLength={2000} placeholder={field.placeholder ?? ''} onChange={e => onChange(field.id, e.target.value)} />}
      {field.fieldType === 'textarea' && <textarea {...common} value={text} maxLength={20000} rows={5} placeholder={field.placeholder ?? ''} onChange={e => onChange(field.id, e.target.value)} />}
      {field.fieldType === 'single_select' && <select {...common} value={text} onChange={e => onChange(field.id, e.target.value)}><option value="">Selecciona una opción</option>{field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
      {field.fieldType === 'multi_select' && <fieldset {...common}><legend className="dynamic-sr-only">{field.label}</legend>{field.options.map(o => <label className="dynamic-choice" key={o.value}><input type="checkbox" checked={selected.includes(o.value)} onChange={e => onChange(field.id, e.target.checked ? [...selected, o.value] : selected.filter(v => v !== o.value))} />{o.label}</label>)}</fieldset>}
      {field.fieldType === 'checkbox' && <label className="dynamic-choice"><input {...common} type="checkbox" checked={value === true} onChange={e => onChange(field.id, e.target.checked)} />Confirmo</label>}
      {field.fieldType === 'file' && <div>
        {!readOnly && <input {...common} type="file" accept=".doc,.docx,.pdf" disabled={locked || !onUpload || (files[field.id]?.length ?? 0) >= 10} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) onUpload?.(field.id, file); }} />}
        <ul className="dynamic-files">{(files[field.id] ?? []).map(file => <li key={file.id}><span>{file.documentName} <small>({(file.sizeBytes / 1024).toFixed(1)} KB)</small></span><button type="button" disabled={disabled || !onDownload} onClick={() => onDownload?.(file.id)}>Abrir</button>{!readOnly && <button type="button" disabled={locked || !onRemoveFile} onClick={() => onRemoveFile?.(field.id, file.id)}>Quitar</button>}</li>)}</ul>
        {!files[field.id]?.length && <p className="dynamic-field-help">Sin archivos adjuntos.</p>}
      </div>}
      {field.fieldType === 'criterion' && <div className="dynamic-criterion">
        <select {...common} value={criterion.status} onChange={e => onChange(field.id, { ...criterion, status: e.target.value as CriterionAnswer['status'] })}><option value="pending">Pendiente</option><option value="approved">Aprobado</option><option value="rejected">Rechazado</option></select>
        <label htmlFor={`${id}-observation`}>Observaciones</label><textarea id={`${id}-observation`} disabled={locked} value={criterion.observation} maxLength={20000} rows={3} onChange={e => onChange(field.id, { ...criterion, observation: e.target.value })} />
        <label htmlFor={`${id}-page`}>Página de referencia (opcional)</label><input id={`${id}-page`} disabled={locked} type="number" min={1} max={32767} step={1} value={criterion.pageReference ?? ''} onChange={e => onChange(field.id, { ...criterion, pageReference: e.target.value === '' ? null : Number(e.target.value) })} />
      </div>}
      {error && <p className="dynamic-error" id={`${id}-error`} role="alert">{error}</p>}
    </section>;
  })}</div>;
}

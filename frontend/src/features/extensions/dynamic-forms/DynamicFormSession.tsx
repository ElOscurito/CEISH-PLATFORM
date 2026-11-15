import { useEffect, useRef, useState } from 'react';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import { dynamicFormService as api } from './dynamic-form.service';
import { validateAnswers } from './dynamic-form.validation';
import type { Answers, DynamicInstance, ResponseFile } from './dynamic-form.types';

interface Props { instanceId: string; readOnly?: boolean; onSubmitted?: (instance: DynamicInstance) => void; onDirtyChange?: (dirty: boolean) => void }

/** A keyed boundary prevents answers from leaking between research instances. */
export function DynamicFormSession(props: Props) { return <Session key={props.instanceId} {...props} />; }

function Session({ instanceId, readOnly = false, onSubmitted, onDirtyChange }: Props) {
  const [instance, setInstance] = useState<DynamicInstance | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, ResponseFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  const install = (data: DynamicInstance) => {
    setInstance(data); setAnswers(Object.fromEntries(data.values.map(v => [v.fieldId, v.fieldValue]))); setFiles(Object.fromEntries(data.values.map(v => [v.fieldId, v.files])));
  };
  useEffect(() => {
    let active = true; mounted.current = true;
    api.get(instanceId).then(data => { if (active) install(data); }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, [instanceId]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const save = async (final: boolean) => {
    if (!instance || readOnly || instance.status === 'submitted') return;
    const invalid = validateAnswers(instance.version.fields, answers, final);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      setError('Revisa los campos señalados.');
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    await run(async () => {
      const saved = await api.save(instanceId, instance.version.fields, answers);
      if (!mounted.current) return;
      install(saved); setDirty(false);
      if (final) {
        const submitted = await api.submit(instanceId);
        if (!mounted.current) return;
        install(submitted); setNotice('Formulario enviado.'); onSubmitted?.(submitted);
      } else setNotice('Respuestas guardadas. Puedes continuar después.');
    });
  };
  const upload = (fieldId: string, file: File) => {
    if (!/\.(docx?|pdf)$/i.test(file.name) || file.size < 1 || file.size > 15728640 || file.name.length > 255) { setError('Selecciona un Word o PDF de hasta 15 MB.'); return; }
    if ((files[fieldId]?.length ?? 0) >= 10) { setError('Máximo 10 archivos por campo.'); return; }
    void run(async () => {
      const result = await api.upload(instanceId, fieldId, file);
      if (!mounted.current) return;
      const next = [...(files[fieldId] ?? []), result];
      setFiles(current => ({ ...current, [fieldId]: next })); setAnswers(current => ({ ...current, [fieldId]: next.map(f => f.id) }));
      setErrors(current => { const nextErrors = { ...current }; delete nextErrors[fieldId]; return nextErrors; }); setNotice('Archivo adjuntado.');
    });
  };
  const remove = (fieldId: string, fileId: string) => { void run(async () => {
    await api.removeFile(instanceId, fileId);
    if (!mounted.current) return;
    const next = (files[fieldId] ?? []).filter(f => f.id !== fileId);
    setFiles(current => ({ ...current, [fieldId]: next })); setAnswers(current => ({ ...current, [fieldId]: next.map(f => f.id) })); setNotice('Archivo retirado del borrador.');
  }); };
  const download = (fileId: string) => {
    // Open synchronously to avoid popup blocking after the URL request.
    const tab = window.open('about:blank', '_blank'); if (tab) tab.opener = null;
    void api.download(fileId).then(({ url }) => { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Enlace de archivo inválido.'); if (tab) tab.location.href = parsed.href; else throw new Error('Permite ventanas emergentes para abrir el archivo.'); }).catch(e => { tab?.close(); if (mounted.current) setError((e as Error).message); });
  };
  if (loading) return <p role="status">Cargando formulario…</p>;
  if (!instance) return <div role="alert">{error || 'No se pudo cargar el formulario.'}<button type="button" disabled={busy} onClick={() => void run(async () => { const data = await api.get(instanceId); if (mounted.current) install(data); })}>Reintentar</button></div>;
  const locked = readOnly || instance.status === 'submitted';
  return <form ref={formRef} className="dynamic-session" noValidate onSubmit={e => { e.preventDefault(); void save(true); }} aria-busy={busy}>
    <h2>{instance.version.title}</h2>{instance.version.description && <p>{instance.version.description}</p>}
    <p className="dynamic-field-help">Ciclo {instance.cycleNumber} · {instance.status === 'submitted' ? 'Enviado' : readOnly ? 'Solo lectura' : 'Borrador'}{dirty && ' · Cambios sin guardar'}</p>
    {error && <p role="alert" className="dynamic-error">{error}</p>}{notice && <p role="status" className="dynamic-notice">{notice}</p>}
    <DynamicFormRenderer fields={instance.version.fields} answers={answers} errors={errors} files={files} readOnly={locked} disabled={busy} onChange={(id, value) => { setAnswers(current => ({ ...current, [id]: value })); setDirty(true); setNotice(''); setErrors(current => { const next = { ...current }; delete next[id]; return next; }); }} onUpload={upload} onRemoveFile={remove} onDownload={download} />
    {!locked && <div className="dynamic-session-actions"><button type="button" disabled={busy} onClick={() => void save(false)}>Guardar borrador</button><button type="submit" disabled={busy}>{busy ? 'Procesando…' : 'Enviar formulario'}</button></div>}
  </form>;
}

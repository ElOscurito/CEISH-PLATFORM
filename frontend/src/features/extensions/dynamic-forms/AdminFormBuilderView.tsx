import { useEffect, useState } from 'react';
import { apiRequest } from '../../../services/http';
import './dynamic-forms.css';

type Field = { fieldKey: string; label: string; fieldType: string; isRequired: boolean; options: { value: string; label: string }[]; placeholder: string; helpText: string };
type Version = { id: string; versionNumber: number; status: string; title: string; description: string | null; fields: Field[] };
type FormDefinition = { id: string; targetAudience: string; stageNumber: number; isActive: boolean; versions: Version[] };
const stages = ['Postulación inicial', '1 · Estructura', '2 · Metodología', '3 · Resultados', '4 · Formato'];
const types: Record<string, string> = { text: 'Texto corto', textarea: 'Texto largo', single_select: 'Selección única', multi_select: 'Selección múltiple', checkbox: 'Casilla de verificación', file: 'Archivo', criterion: 'Criterio de evaluación' };
const base = '/api/extensions/admin/forms';
const send = <T,>(path: string, method: string, body?: unknown) => apiRequest<T>(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export function AdminFormBuilderView() {
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [selected, setSelected] = useState('');
  const [editor, setEditor] = useState<Version | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audience, setAudience] = useState('researcher_submission');
  const [stage, setStage] = useState(0);
  const [title, setTitle] = useState('');
  const form = forms.find(f => f.id === selected);
  const editable = editor?.status === 'draft';

  const load = async () => { const data = await apiRequest<FormDefinition[]>(base); setForms(data); return data; };
  useEffect(() => {
    let active = true;
    apiRequest<FormDefinition[]>(base).then(data => { if (active) setForms(data); }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);

  const choose = (f: FormDefinition, version?: Version) => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    setSelected(f.id); setEditor(structuredClone(version ?? f.versions.find(v => v.status === 'draft') ?? f.versions[0])); setDirty(false); setError(''); setNotice('');
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const change = (patch: Partial<Version>) => { setEditor(current => current ? { ...current, ...patch } : current); setDirty(true); };
  const changeField = (index: number, patch: Partial<Field>) => { if (editor) change({ fields: editor.fields.map((f, i) => i === index ? { ...f, ...patch } : f) }); };
  const move = (index: number, direction: number) => {
    if (!editor) return;
    const next = [...editor.fields]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; change({ fields: next });
  };
  const validate = () => {
    if (!editor?.title.trim()) throw new Error('Escribe el título del formulario.');
    const keys = new Set<string>();
    for (const f of editor.fields) {
      if (!f.label.trim()) throw new Error('Todos los campos necesitan un enunciado.');
      if (!/^[a-z][a-z0-9_]*$/.test(f.fieldKey) || keys.has(f.fieldKey)) throw new Error('Cada campo necesita una clave única: letras minúsculas, números y guion bajo.');
      keys.add(f.fieldKey);
      if (['single_select', 'multi_select'].includes(f.fieldType) && (!f.options.length || f.options.some(o => !o.value.trim() || !o.label.trim()) || new Set(f.options.map(o => o.value.trim())).size !== f.options.length)) throw new Error(`Revisa las opciones de «${f.label}»: deben tener texto y claves únicas.`);
    }
  };
  const save = async () => {
    validate();
    const saved = await send<Version>(`/${selected}/draft`, 'PUT', editor);
    setEditor(saved); setDirty(false); await load(); setNotice('Borrador guardado.');
  };

  return <div className="page df-builder">
    <div className="page__header"><div><h1 className="page__title">Formularios por etapas</h1><p className="page__subtitle">Configura preguntas para investigadores y criterios para revisores.</p></div></div>
    <div className="page__body">
      {error && <div className="df-error" role="alert">{error}</div>}
      {notice && <div className="df-notice" role="status">{notice}</div>}
      {loading ? <p role="status">Cargando formularios…</p> : <div className="df-layout">
        <aside className="df-sidebar">
          <section className="df-panel"><h2>Formularios</h2>
            {!forms.length && <p>No hay formularios creados.</p>}
            {forms.map(f => <button type="button" className={`df-form-item ${selected === f.id ? 'is-selected' : ''}`} key={f.id} disabled={busy} onClick={() => choose(f)} aria-pressed={selected === f.id}><strong>{f.targetAudience === 'researcher_submission' ? 'Investigador' : 'Evaluador CEISH'}</strong><span>{stages[f.stageNumber]}</span><small>{f.isActive ? 'Activo' : 'Desactivado'} · {f.versions.some(v => v.status === 'published') ? 'Publicado' : 'Sin publicar'}</small></button>)}
            <button type="button" disabled={busy || dirty} onClick={() => void run(async () => { await load(); setNotice('Lista actualizada.'); })}>Actualizar lista</button>
          </section>
          <form className="df-panel" onSubmit={e => { e.preventDefault(); if (dirty && !window.confirm('¿Descartar los cambios sin guardar?')) return; void run(async () => { const created = await send<FormDefinition>('', 'POST', { targetAudience: audience, stageNumber: stage, title }); await load(); setSelected(created.id); setEditor(created.versions[0]); setDirty(false); setTitle(''); setNotice('Formulario creado. Agrega sus campos.'); }); }}>
            <h2>Nuevo formulario</h2><fieldset disabled={busy}>
              <label>Destinatario<select value={audience} onChange={e => { setAudience(e.target.value); if (e.target.value === 'evaluator_criteria' && stage === 0) setStage(1); }}><option value="researcher_submission">Investigador</option><option value="evaluator_criteria">Evaluador CEISH</option></select></label>
              <label>Momento<select value={stage} onChange={e => setStage(Number(e.target.value))}>{stages.map((name, i) => (audience !== 'evaluator_criteria' || i > 0) && <option key={i} value={i}>{name}</option>)}</select></label>
              <label>Título<input required maxLength={150} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Información ética adicional" /></label>
              <button type="submit" disabled={!title.trim() || forms.some(f => f.targetAudience === audience && f.stageNumber === stage)}>Crear formulario</button>
              {forms.some(f => f.targetAudience === audience && f.stageNumber === stage) && <small>Esta combinación ya existe. Selecciónala en la lista para editarla.</small>}
            </fieldset>
          </form>
        </aside>
        <section className="df-panel df-editor" aria-label="Editor del formulario">
          {!editor || !form ? <div className="df-empty"><h2>Selecciona un formulario</h2><p>Crea uno o abre un formulario de la lista para configurar sus campos.</p></div> : <>
            <div className="df-toolbar"><h2>{stages[form.stageNumber]}</h2><span>{dirty ? 'Cambios sin guardar' : 'Versión ' + editor.versionNumber}</span></div>
            <label>Versión<select disabled={busy} value={editor.id} onChange={e => choose(form, form.versions.find(v => v.id === e.target.value))}>{form.versions.map(v => <option key={v.id} value={v.id}>Versión {v.versionNumber} · {v.status === 'draft' ? 'Borrador' : v.status === 'published' ? 'Publicada' : 'Histórica'}</option>)}</select></label>
            <p className="df-hint">Las versiones publicadas conservan sus campos y respuestas. Publica una nueva versión para aplicar cambios a nuevas instancias.</p>
            <div className="df-actions">
              {!editable && <button disabled={busy} onClick={() => void run(async () => { const draft = await send<Version>(`/${selected}/draft`, 'POST'); await load(); setEditor(draft); setDirty(false); })}>Editar en un borrador</button>}
              <button disabled={busy || dirty} onClick={() => void run(async () => { await send(`/${selected}`, 'PATCH', { isActive: !form.isActive }); await load(); setNotice(form.isActive ? 'Formulario desactivado para nuevas instancias.' : 'Formulario activado.'); })}>{form.isActive ? 'Desactivar formulario' : 'Activar formulario'}</button>
            </div>
            <fieldset disabled={!editable || busy}>
              <label>Título<input value={editor.title} maxLength={150} onChange={e => change({ title: e.target.value })} /></label>
              <label>Descripción<textarea value={editor.description ?? ''} maxLength={10000} onChange={e => change({ description: e.target.value })} rows={2} /></label>
              <div className="df-fields">
                {editor.fields.map((f, index) => <article className="df-field" key={index}>
                  <div className="df-toolbar"><h3>Campo {index + 1}</h3><div className="df-actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Subir campo ${index + 1}`}>↑</button><button type="button" disabled={index === editor.fields.length - 1} onClick={() => move(index, 1)} aria-label={`Bajar campo ${index + 1}`}>↓</button><button type="button" onClick={() => { if (window.confirm('¿Quitar este campo del borrador?')) change({ fields: editor.fields.filter((_, i) => i !== index) }); }}>Quitar</button></div></div>
                  <label>Enunciado<input value={f.label} maxLength={2000} onChange={e => changeField(index, { label: e.target.value })} /></label>
                  <div className="df-columns"><label>Tipo<select value={f.fieldType} onChange={e => changeField(index, { fieldType: e.target.value, options: ['single_select', 'multi_select'].includes(e.target.value) ? f.options : [] })}>{Object.entries(types).filter(([key]) => form.targetAudience === 'evaluator_criteria' ? key === 'criterion' : key !== 'criterion').map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="df-check"><input type="checkbox" checked={f.isRequired} onChange={e => changeField(index, { isRequired: e.target.checked })} />Obligatorio</label></div>
                  <label>Texto de ayuda<input value={f.helpText ?? ''} maxLength={2000} onChange={e => changeField(index, { helpText: e.target.value })} /></label>
                  {['text', 'textarea'].includes(f.fieldType) && <label>Ejemplo dentro del campo<input value={f.placeholder ?? ''} maxLength={500} onChange={e => changeField(index, { placeholder: e.target.value })} /></label>}
                  {['single_select', 'multi_select'].includes(f.fieldType) && <div className="df-options"><h4>Opciones</h4>{f.options.map((o, oi) => <div className="df-option" key={oi}><label>Texto<input value={o.label} maxLength={200} onChange={e => changeField(index, { options: f.options.map((item, i) => i === oi ? { ...item, label: e.target.value } : item) })} /></label><label>Clave<input value={o.value} maxLength={80} onChange={e => changeField(index, { options: f.options.map((item, i) => i === oi ? { ...item, value: e.target.value } : item) })} /></label><button type="button" aria-label={`Quitar opción ${oi + 1}`} onClick={() => changeField(index, { options: f.options.filter((_, i) => i !== oi) })}>×</button></div>)}<button type="button" disabled={f.options.length >= 100} onClick={() => changeField(index, { options: [...f.options, { value: `opcion_${crypto.randomUUID().slice(0, 8)}`, label: '' }] })}>Agregar opción</button></div>}
                  {f.fieldType === 'file' && <p className="df-hint">Word o PDF · hasta 15 MB por archivo.</p>}
                  {f.fieldType === 'criterion' && <p className="df-hint">El revisor podrá aprobar o rechazar el criterio y escribir observaciones.</p>}
                  <details><summary>Identificador del campo</summary><label>Clave única<input value={f.fieldKey} maxLength={80} onChange={e => changeField(index, { fieldKey: e.target.value })} /></label></details>
                </article>)}
              </div>
              {editable && <button type="button" disabled={editor.fields.length >= 100} onClick={() => change({ fields: [...editor.fields, { fieldKey: `campo_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`, label: '', fieldType: form.targetAudience === 'evaluator_criteria' ? 'criterion' : 'text', isRequired: false, options: [], placeholder: '', helpText: '' }] })}>+ Agregar campo</button>}
            </fieldset>
            {editable && <div className="df-footer"><button disabled={busy || !dirty} onClick={() => void run(save)}>{busy ? 'Procesando…' : 'Guardar borrador'}</button><button className="df-primary" disabled={busy || dirty || !editor.fields.length} onClick={() => { if (window.confirm('¿Publicar esta versión para nuevas instancias? Las respuestas anteriores conservarán su versión.')) void run(async () => { const published = await send<Version>(`/${selected}/publish`, 'POST'); setEditor(published); await load(); setNotice('Versión publicada.' + (!form.isActive ? ' Activa el formulario para habilitar nuevas instancias.' : '')); }); }}>Publicar versión</button>{dirty && <small>Guarda el borrador antes de publicarlo.</small>}</div>}
          </>}
        </section>
      </div>}
    </div>
  </div>;
}

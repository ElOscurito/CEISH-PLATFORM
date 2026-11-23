import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { performanceApi, processes } from './performanceApi';
import type { Color, Detail, Threshold } from './performanceApi';
import './performance.css';

const labels = { green: 'Verde', yellow: 'Amarillo', red: 'Rojo' };
const dateFormat = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Guayaquil',
});
const numberFormat = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1 });
const formatDate = (date: string | null) => date ? dateFormat.format(new Date(date)) : '—';
const formatNumber = (value: number | null) => value === null ? '—' : numberFormat.format(value);
const message = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación';

function Light({ color }: { color: Color | null }) {
  return color ? <span className={'performance-light performance-light--' + color}>{labels[color]}</span> : 'Sin revisiones';
}

function ThresholdForm({ threshold, onSave }: { threshold: Threshold; onSave: () => void }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const warningDays = Number(data.get('warning'));
    const criticalDays = Number(data.get('critical'));
    setStatus('');
    if (warningDays >= criticalDays) {
      setError('El umbral amarillo debe ser menor que el rojo.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await performanceApi.update({ process_type: threshold.process_type, warning_days: warningDays, critical_days: criticalDays });
      setStatus('Umbrales guardados.');
      onSave();
    } catch (error) {
      setError(message(error));
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save}>
    <fieldset disabled={saving}>
      <legend>{processes[threshold.process_type]}</legend>
      <label>Amarillo <input name="warning" type="number" min="1" max="2147483647" step="1" defaultValue={threshold.warning_days} required /></label>
      <label>Rojo <input name="critical" type="number" min="1" max="2147483647" step="1" defaultValue={threshold.critical_days} required /></label>
      <button className="eval-btn eval-btn--outline" type="submit">{saving ? 'Guardando…' : 'Guardar'}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
  </form>;
}

function MemberDetail({ detail }: { detail: Detail }) {
  return <>
    <h3>Revisiones</h3>
    {detail.cases.length ? <div className="performance-table"><table>
      <thead><tr><th>Investigación</th><th>Proceso</th><th>Inicio</th><th>Dictamen</th><th>Días hábiles</th><th>Semáforo</th></tr></thead>
      <tbody>{detail.cases.map((item) => <tr key={item.process_type + item.id}>
        <td>{item.title}</td><td>{processes[item.process_type]} · {item.sequence}</td>
        <td>{formatDate(item.started_at)}</td><td>{item.decided_at ? formatDate(item.decided_at) : 'Abierta'}</td>
        <td>{item.days}</td><td><Light color={item.color} /></td>
      </tr>)}</tbody>
    </table></div> : <p>No hay revisiones para este período.</p>}
    <h3>Accesos</h3>
    {detail.activity.length ? <div className="performance-table"><table>
      <thead><tr><th>Evento</th><th>Fecha</th><th>Duración de sesión</th></tr></thead>
      <tbody>{detail.activity.map((item) => <tr key={item.id}>
        <td>{item.action_type === 'LOGIN' ? 'Inicio de sesión' : 'Cierre de sesión'}</td>
        <td>{formatDate(item.created_at)}</td>
        <td>{item.session_duration_seconds === null ? '—' : formatNumber(item.session_duration_seconds / 60) + ' min'}</td>
      </tr>)}</tbody>
    </table></div> : <p>No hay accesos para este período.</p>}
  </>;
}

export function MemberPerformanceDashboard() {
  const [filter, setFilter] = useState({ from: '', to: '', memberId: '' });
  const [detailId, setDetailId] = useState('');
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof performanceApi.summary>>>();
  const [detail, setDetail] = useState<Detail>();
  const [thresholds, setThresholds] = useState<Threshold[]>();
  const [loadedFilter, setLoadedFilter] = useState<typeof filter>();
  const [summaryError, setSummaryError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [thresholdError, setThresholdError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const { from, to } = filter;
  const invalidPeriod = Boolean(from && to && from > to);

  useEffect(() => {
    if (invalidPeriod) return;
    const request = new AbortController();
    performanceApi.summary(filter, request.signal)
      .then((value) => { if (!request.signal.aborted) { setSummary(value); setLoadedFilter(filter); } })
      .catch((error: unknown) => { if (!request.signal.aborted) setSummaryError(message(error)); });
    return () => request.abort();
  }, [filter, invalidPeriod, revision]);

  useEffect(() => {
    if (!detailId || invalidPeriod) return;
    const request = new AbortController();
    performanceApi.detail(detailId, { from, to }, request.signal)
      .then((value) => { if (!request.signal.aborted) setDetail(value); })
      .catch((error: unknown) => { if (!request.signal.aborted) setDetailError(message(error)); });
    return () => request.abort();
  }, [detailId, from, to, invalidPeriod, revision]);

  useEffect(() => {
    let active = true;
    performanceApi.thresholds()
      .then((value) => { if (active) setThresholds(value); })
      .catch((error: unknown) => { if (active) setThresholdError(message(error)); });
    return () => { active = false; };
  }, []);

  function refresh() {
    setSummary(undefined);
    setSummaryError('');
    setDetail(undefined);
    setDetailError('');
    setRevision((value) => value + 1);
  }

  function changeFilter(key: keyof typeof filter, value: string) {
    setSummaryError('');
    setDetailError('');
    setDetail(undefined);
    setDetailId('');
    setFilter((previous) => ({ ...previous, [key]: value }));
  }

  async function download() {
    setExporting(true);
    setExportError('');
    try {
      await performanceApi.download(filter);
    } catch (error) {
      setExportError(message(error));
    } finally {
      setExporting(false);
    }
  }

  return <div className="page">
    <header className="page__header"><div>
      <h1 className="page__title">Desempeño de miembros CEISH</h1>
      <p className="page__subtitle">Revisiones, cumplimiento de plazos y accesos al sistema.</p>
    </div></header>
    <div className="page__body performance">
      <section className="admin-section" aria-label="Resumen de desempeño">
        <div className="performance-filters">
          <label>Desde <input type="date" value={from} onChange={(event) => changeFilter('from', event.target.value)} /></label>
          <label>Hasta <input type="date" value={to} onChange={(event) => changeFilter('to', event.target.value)} /></label>
          <label>Miembro <select value={filter.memberId} onChange={(event) => changeFilter('memberId', event.target.value)}>
            <option value="">Todos</option>
            {summary?.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select></label>
          <button className="eval-btn eval-btn--primary" disabled={invalidPeriod || exporting} onClick={download}>{exporting ? 'Exportando…' : 'Exportar CSV'}</button>
        </div>
        <p className="performance-note">El período filtra las revisiones por fecha de dictamen y los accesos por fecha del evento. Las revisiones abiertas se calculan a hoy. Se cuentan días hábiles de lunes a viernes en hora de Ecuador continental, sin el día inicial ni ajuste por feriados.</p>
        {exportError && <p role="alert">{exportError}</p>}
        {invalidPeriod ? <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>
          : summaryError ? <p role="alert">{summaryError} <button className="eval-btn eval-btn--outline" onClick={refresh}>Reintentar</button></p>
          : !summary || loadedFilter !== filter ? <p role="status">Cargando desempeño…</p>
          : !summary.rows.length ? <p>No hay miembros con asignaciones para mostrar.</p>
          : <div className="performance-table"><table>
            <thead><tr><th>Miembro</th><th>Semáforo</th><th>A tiempo</th><th>Días de demora</th><th>Días de revisión</th>
              <th>Abiertas en amarillo</th><th>Abiertas en rojo</th><th>Inicios de sesión</th><th>Sesiones cerradas</th><th>Último acceso</th><th>Días de subsanación</th></tr></thead>
            <tbody>{summary.rows.map(({ member, metrics }) => <tr key={member.id}>
              <th scope="row"><button className="eval-btn eval-btn--outline" aria-expanded={detailId === member.id} onClick={() => {
                setDetail(undefined);
                setDetailError('');
                setDetailId(detailId === member.id ? '' : member.id);
              }}>{member.name}</button></th>
              <td><Light color={metrics.color} /></td>
              <td>{formatNumber(metrics.onTimePercent)}{metrics.onTimePercent !== null && '%'}</td>
              <td>{formatNumber(metrics.averageDelayDays)}</td><td>{formatNumber(metrics.averageReviewDays)}</td>
              <td>{metrics.openWarning}</td><td>{metrics.openCritical}</td><td>{metrics.loginCount}</td>
              <td>{metrics.completedSessions}</td><td>{formatDate(metrics.lastLogin)}</td><td>{formatNumber(metrics.averageCorrectionDays)}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
      {detailId && <section className="admin-section" aria-label="Detalle del miembro">
        <h2>{detail ? detail.member.name : 'Detalle del miembro'}</h2>
        {detailError ? <p role="alert">{detailError}</p> : detail ? <MemberDetail detail={detail} /> : <p role="status">Cargando detalle…</p>}
      </section>}
      <section className="admin-section">
        <h2>Umbrales del semáforo</h2>
        <p className="performance-note">Cada color se aplica desde el número de días hábiles indicado. La demora es el promedio de días por encima del umbral rojo en revisiones con dictamen.</p>
        {thresholdError ? <p role="alert">{thresholdError}</p> : !thresholds ? <p role="status">Cargando umbrales…</p>
          : thresholds.length === 0 ? <p>No hay umbrales configurados.</p>
          : thresholds.map((threshold) => <ThresholdForm key={threshold.process_type} threshold={threshold} onSave={refresh} />)}
      </section>
    </div>
  </div>;
}

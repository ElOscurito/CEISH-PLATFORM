import { useRef, useState } from 'react';
import type { Annex2Schedule, Annex2ScheduleItem } from '../../../shared/types/platform.types';

interface Props {
  value: Annex2Schedule;
  onChange: (value: Annex2Schedule) => void;
}

const uid = () => crypto.randomUUID();

export function Annex2ScheduleEditor({ value, onChange }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const drag = useRef<{ pointerId: number; id: string; x: number; start: number; cellWidth: number } | null>(null);
  const orderedItems = value.items.filter((item) => item.type === 'objective').flatMap((parent) => [
    parent, ...value.items.filter((item) => item.parentId === parent.id),
  ]);
  const visibleItems = orderedItems.filter((item) => !item.parentId || !collapsed.has(item.parentId));
  const update = (id: string, patch: Partial<Annex2ScheduleItem>) => {
    const previous = value.items.find((item) => item.id === id);
    const shift = patch.startMonth !== undefined && previous ? patch.startMonth - previous.startMonth : 0;
    const items = value.items.map((item) => item.id === id ? { ...item, ...patch } : { ...item });
    const parent = items.find((item) => item.id === id && item.type === 'objective');
    if (parent) {
      const end = parent.startMonth + parent.durationMonths - 1;
      for (const item of items) {
        if (item.parentId === parent.id) {
          item.startMonth += shift;
          item.startMonth = Math.max(parent.startMonth, Math.min(item.startMonth, end));
          item.durationMonths = Math.max(1, Math.min(item.durationMonths, end - item.startMonth + 1));
        }
      }
    }
    onChange({ items });
  };

  const addObjective = () => {
    const objective: Annex2ScheduleItem = {
      id: uid(), parentId: null, type: 'objective',
      label: `Objetivo específico ${value.items.filter((item) => item.type === 'objective').length + 1}`,
      startMonth: 1, durationMonths: 1,
    };
    onChange({ items: [...value.items, objective] });
  };

  const addActivity = (parent: Annex2ScheduleItem) => {
    const count = value.items.filter((item) => item.parentId === parent.id).length + 1;
    const insertAt = orderedItems.findIndex((item) => item.id === parent.id) + count;
    const items = [...orderedItems];
    items.splice(insertAt, 0, {
      id: uid(), parentId: parent.id, type: 'activity', label: `Actividad ${count}`,
      startMonth: parent.startMonth, durationMonths: 1,
    });
    setCollapsed((current) => { const next = new Set(current); next.delete(parent.id); return next; });
    onChange({ items });
  };

  const remove = (id: string) => onChange({
    items: value.items.filter((item) => item.id !== id && item.parentId !== id),
  });

  return (
    <section className="annex2-editor" aria-labelledby="annex2-title">
      <div className="annex2-editor__heading">
        <div>
          <h3 id="annex2-title">Anexo 2 · Cronograma por objetivos</h3>
          <p>Define la duración en meses y mueve el inicio para solapar actividades. El mes 1 se convertirá en la fecha de aprobación.</p>
        </div>
        <button className="eval-btn eval-btn--outline" type="button" onClick={addObjective}>Añadir objetivo</button>
      </div>
      <div className="annex2-timeline" style={{ '--months': 36 } as React.CSSProperties}>
        <div className="annex2-timeline__scale" aria-hidden="true">
          <span>Actividad</span>{Array.from({ length: 36 }, (_, i) => <small key={i}>{i + 1}</small>)}
        </div>
        {visibleItems.map((item) => {
          const parent = item.parentId ? value.items.find((candidate) => candidate.id === item.parentId) : null;
          const min = parent?.startMonth ?? 1;
          const max = parent ? parent.startMonth + parent.durationMonths - item.durationMonths : 37 - item.durationMonths;
          return (
            <div className={`annex2-row annex2-row--${item.type}`} key={item.id}>
              <div className="annex2-row__fields">
                <textarea rows={2} aria-label={item.type === 'objective' ? 'Nombre del objetivo' : 'Nombre de la subactividad'} value={item.label} onChange={(e) => update(item.id, { label: e.target.value })} />
                <label>Inicio <input type="number" min={min} max={Math.max(min, max)} value={item.startMonth} onChange={(e) => update(item.id, { startMonth: Number(e.target.value) })} /></label>
                <label>Meses <input type="number" min="1" max={parent ? parent.startMonth + parent.durationMonths - item.startMonth : 37 - item.startMonth} value={item.durationMonths} onChange={(e) => update(item.id, { durationMonths: Number(e.target.value) })} /></label>
                {item.type === 'objective' && <button type="button" onClick={() => addActivity(item)}>+ Subactividad</button>}
                {item.type === 'objective' && value.items.some((child) => child.parentId === item.id) && (
                  <button type="button" aria-expanded={!collapsed.has(item.id)} aria-label={`Subactividades de ${item.label}`} onClick={() => setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                    return next;
                  })}>{collapsed.has(item.id) ? 'Mostrar' : 'Ocultar'} subactividades</button>
                )}
                <button type="button" aria-label={`Eliminar ${item.label}`} onClick={() => remove(item.id)}>×</button>
              </div>
              <div className="annex2-row__track">
                <div
                  className="annex2-row__bar"
                  style={{ gridColumn: `${item.startMonth} / span ${item.durationMonths}` }}
                  title={`${item.durationMonths} meses. Arrastra para mover.`}
                  role="slider"
                  tabIndex={0}
                  aria-label={`Mover ${item.label}`}
                  aria-valuemin={min}
                  aria-valuemax={Math.max(min, max)}
                  aria-valuenow={item.startMonth}
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerDown={(event) => {
                    if (event.button !== 0 && event.button !== 2) return;
                    event.preventDefault();
                    const width = event.currentTarget.parentElement!.getBoundingClientRect().width;
                    if (!width) return;
                    drag.current = { pointerId: event.pointerId, id: item.id, x: event.clientX, start: item.startMonth, cellWidth: width / 36 };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    event.currentTarget.focus();
                  }}
                  onPointerMove={(event) => {
                    const active = drag.current;
                    if (!active || active.id !== item.id || active.pointerId !== event.pointerId) return;
                    const offset = Math.round((event.clientX - active.x) / active.cellWidth);
                    const startMonth = Math.max(min, Math.min(Math.max(min, max), active.start + offset));
                    if (startMonth !== item.startMonth) update(item.id, { startMonth });
                  }}
                  onPointerUp={(event) => {
                    drag.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { drag.current = null; }}
                  onLostPointerCapture={() => { drag.current = null; }}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? min : event.key === 'End' ? max : item.startMonth + (event.key === 'ArrowRight' ? 1 : -1);
                    update(item.id, { startMonth: Math.max(min, Math.min(Math.max(min, max), next)) });
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {!value.items.length && <p className="annex2-editor__empty">Añade al menos un objetivo para enviar la investigación.</p>}
    </section>
  );
}

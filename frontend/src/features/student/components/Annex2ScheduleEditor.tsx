import type { Annex2Schedule, Annex2ScheduleItem } from '../../../shared/types/platform.types';

interface Props {
  value: Annex2Schedule;
  onChange: (value: Annex2Schedule) => void;
}

const uid = () => crypto.randomUUID();

export function Annex2ScheduleEditor({ value, onChange }: Props) {
  const update = (id: string, patch: Partial<Annex2ScheduleItem>) => {
    const items = value.items.map((item) => item.id === id ? { ...item, ...patch } : item);
    const parent = items.find((item) => item.id === id && item.type === 'objective');
    if (parent) {
      const end = parent.startMonth + parent.durationMonths - 1;
      for (const item of items) {
        if (item.parentId === parent.id) {
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
    onChange({ items: [...value.items, {
      id: uid(), parentId: parent.id, type: 'activity', label: `Actividad ${count}`,
      startMonth: parent.startMonth, durationMonths: 1,
    }] });
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
        {value.items.map((item) => {
          const parent = item.parentId ? value.items.find((candidate) => candidate.id === item.parentId) : null;
          const min = parent?.startMonth ?? 1;
          const max = parent ? parent.startMonth + parent.durationMonths - item.durationMonths : 37 - item.durationMonths;
          return (
            <div className={`annex2-row annex2-row--${item.type}`} key={item.id}>
              <div className="annex2-row__fields">
                <input aria-label="Nombre" value={item.label} onChange={(e) => update(item.id, { label: e.target.value })} />
                <label>Inicio <input type="number" min={min} max={Math.max(min, max)} value={item.startMonth} onChange={(e) => update(item.id, { startMonth: Number(e.target.value) })} /></label>
                <label>Meses <input type="number" min="1" max={parent ? parent.startMonth + parent.durationMonths - item.startMonth : 37 - item.startMonth} value={item.durationMonths} onChange={(e) => update(item.id, { durationMonths: Number(e.target.value) })} /></label>
                {item.type === 'objective' && <button type="button" onClick={() => addActivity(item)}>+ Subactividad</button>}
                <button type="button" aria-label={`Eliminar ${item.label}`} onClick={() => remove(item.id)}>×</button>
              </div>
              <div className="annex2-row__track">
                <div className="annex2-row__bar" style={{ gridColumn: `${item.startMonth} / span ${item.durationMonths}` }} title={`${item.durationMonths} meses`} />
                <input
                  className="annex2-row__slider"
                  type="range"
                  aria-label={`Mover ${item.label}`}
                  min={min}
                  max={Math.max(min, max)}
                  value={item.startMonth}
                  onChange={(event) => update(item.id, { startMonth: Number(event.target.value) })}
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

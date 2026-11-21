import { useState } from 'react';
import type { Annex2Schedule } from '../../../shared/types/platform.types';
import { Annex2ScheduleEditor } from './Annex2ScheduleEditor';

interface Props {
  initialSchedule: Annex2Schedule;
  onConfirm: (schedule: Annex2Schedule) => void;
  onCancel: () => void;
}

export function Annex2ScheduleModal({ initialSchedule, onConfirm, onCancel }: Props) {
  const [schedule, setSchedule] = useState(initialSchedule);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="annex2-modal-title">
        <div className="modal__header">
          <h2 className="modal__title" id="annex2-modal-title">Editar cronograma del Anexo 2</h2>
          <button className="modal__close" onClick={onCancel} aria-label="Cerrar" type="button">×</button>
        </div>
        <div className="modal__body">
          <Annex2ScheduleEditor value={schedule} onChange={setSchedule} />
        </div>
        <div className="modal__footer">
          <button className="eval-btn eval-btn--outline" type="button" onClick={onCancel}>Cancelar</button>
          <button className="eval-btn eval-btn--primary" type="button" disabled={!schedule.items.some((item) => item.type === 'objective')} onClick={() => onConfirm(schedule)}>Guardar cronograma</button>
        </div>
      </div>
    </div>
  );
}

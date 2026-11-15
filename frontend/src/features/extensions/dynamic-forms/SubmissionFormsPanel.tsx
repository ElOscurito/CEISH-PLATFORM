import { useEffect, useState } from 'react';
import { apiRequest } from '../../../services/http';
import { DynamicFormSession } from './DynamicFormSession';
import type { DynamicInstance } from './dynamic-form.types';
type Instance = DynamicInstance & {form:{stageNumber:number;targetAudience:string};canRespond:boolean};

export function SubmissionFormsPanel({submissionId}:{submissionId:string}) {
  const [instances,setInstances]=useState<Instance[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{let active=true;apiRequest<Instance[]>(`/api/extensions/submissions/${encodeURIComponent(submissionId)}/form-instances`).then(data=>{if(active){setInstances(data);setError('');}}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[submissionId,refresh]);
  return <section className="submission-dynamic-forms" aria-label="Formularios de la investigación">
    <div className="dynamic-session-actions"><h3>Formularios y respuestas</h3><button type="button" onClick={()=>setRefresh(x=>x+1)}>Actualizar estado</button></div>
    {loading&&<p role="status">Cargando formularios…</p>}{error&&<p role="alert" className="dynamic-error">{error}</p>}
    {!loading&&!error&&!instances.length&&<p>No hay formularios adicionales asignados a esta investigación.</p>}
    {instances.map(instance=><details key={instance.id} open={instance.canRespond&&instance.status==='draft'}>
      <summary>{instance.form.stageNumber===0?'Postulación':`Etapa ${instance.form.stageNumber}`} · {instance.form.targetAudience==='researcher_submission'?'Investigador':'Evaluador'} · {instance.version.title} · {instance.status==='submitted'?'Enviado':'Pendiente'}</summary>
      <DynamicFormSession key={`${instance.id}-${instance.status}`} instanceId={instance.id} readOnly={!instance.canRespond} onSubmitted={()=>setRefresh(x=>x+1)}/>
    </details>)}
  </section>;
}

import { useEffect, useState } from 'react';
import { UploadModal } from '../../student/components/UploadModal';
import { apiRequest } from '../../../services/http';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import { validateAnswers } from './dynamic-form.validation';
import type { Answers, DynamicField } from './dynamic-form.types';

type Configuration = {id:string;title:string;description:string|null;fields:DynamicField[]};
export function InitialSubmissionModal({onCancel,onCreated}:{onCancel:()=>void;onCreated:()=>void}) {
  const [configuration,setConfiguration]=useState<Configuration|null>(null);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [answers,setAnswers]=useState<Answers>({});
  const [attachments,setAttachments]=useState<Record<string,{id:string;file:File}[]>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;apiRequest<Configuration|null>('/api/extensions/submission-intake').then(data=>{if(active)setConfiguration(data);}).catch(e=>{if(active)setLoadError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const confirm=async(documents:File[],title:string,comment:string)=>{
    if(loading||loadError) throw new Error(loadError||'Espera a que cargue el formulario.');
    const invalid=validateAnswers(configuration?.fields??[],answers);
    setErrors(invalid);
    if(Object.keys(invalid).length) throw new Error('Completa los campos señalados antes de enviar.');
    const payload=new FormData();
    for(const file of documents) payload.append('documents',file);
    const attachmentFields:string[]=[];
    for(const [fieldId,items] of Object.entries(attachments)) for(const {file} of items) {payload.append('attachments',file);attachmentFields.push(fieldId);}
    payload.append('payload',JSON.stringify({title,comment,versionId:configuration?.id??null,answers,attachmentFields}));
    await apiRequest('/api/extensions/submission-intake',{method:'POST',body:payload});
    onCreated();
  };
  return <UploadModal onConfirm={confirm} onCancel={onCancel} blocked={loading||Boolean(loadError)} additionalContent={<section className="dynamic-session">
    {loading&&<p role="status">Cargando requisitos de postulación…</p>}
    {loadError&&<p role="alert">{loadError} Cierra y vuelve a abrir para reintentar.</p>}
    {error&&<p role="alert" className="dynamic-error">{error}</p>}
    {configuration&&<><h3>{configuration.title}</h3><p>{configuration.description}</p><DynamicFormRenderer fields={configuration.fields} answers={answers} errors={errors}
      files={Object.fromEntries(Object.entries(attachments).map(([id,items])=>[id,items.map(({id,file})=>({id,documentName:file.name,sizeBytes:file.size,mimeType:file.type}))]))}
      onChange={(id,value)=>{setAnswers(current=>({...current,[id]:value}));setErrors(current=>({...current,[id]:''}));}}
      onUpload={(fieldId,file)=>{
        if(!/\.(docx?|pdf)$/i.test(file.name)||file.size<1||file.size>15728640||file.name.length>255){setError('Adjunta Word o PDF de hasta 15 MB.');return;}
        const next=[...(attachments[fieldId]??[]),{id:crypto.randomUUID(),file}];
        if(next.length>10){setError('Máximo 10 archivos por campo.');return;}
        setAttachments(current=>({...current,[fieldId]:next}));setAnswers(current=>({...current,[fieldId]:next.map(f=>f.id)}));setError('');
      }}
      onRemoveFile={(fieldId,fileId)=>{const next=(attachments[fieldId]??[]).filter(f=>f.id!==fileId);setAttachments(current=>({...current,[fieldId]:next}));setAnswers(current=>({...current,[fieldId]:next.map(f=>f.id)}));}}
    /></>}
    {!loading&&!loadError&&!configuration&&<p>No hay preguntas adicionales para esta postulación.</p>}
  </section>}/>;
}

import { apiRequest } from '../../../services/http';
import type { Answers, DynamicField, DynamicInstance, ResponseFile } from './dynamic-form.types';
const base = '/api/extensions';
const send = <T,>(path: string, method: string, body?: unknown) => apiRequest<T>(base + path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
export const dynamicFormService = {
  get: (id: string) => apiRequest<DynamicInstance>(`${base}/form-instances/${encodeURIComponent(id)}`),
  start: (submissionId: string, formId: string) => send<DynamicInstance>(`/submissions/${encodeURIComponent(submissionId)}/forms/${encodeURIComponent(formId)}/start`, 'POST'),
  save: (id: string, fields: DynamicField[], answers: Answers) => send<DynamicInstance>(`/form-instances/${encodeURIComponent(id)}/answers`, 'PUT', { answers: fields.filter(f => f.fieldType !== 'file').map(f => ({ fieldId: f.id, value: answers[f.id] ?? null })) }),
  submit: (id: string) => send<DynamicInstance>(`/form-instances/${encodeURIComponent(id)}/submit`, 'POST'),
  upload: (id: string, fieldId: string, file: File) => { const body = new FormData(); body.append('file', file); return apiRequest<ResponseFile>(`${base}/form-instances/${encodeURIComponent(id)}/fields/${encodeURIComponent(fieldId)}/files`, { method: 'POST', body }); },
  removeFile: (id: string, fileId: string) => send<{ ok: boolean }>(`/form-instances/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`, 'DELETE'),
  download: (fileId: string) => apiRequest<{ url: string }>(`${base}/form-files/${encodeURIComponent(fileId)}`),
};

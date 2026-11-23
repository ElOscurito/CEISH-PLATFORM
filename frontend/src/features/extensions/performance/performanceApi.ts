import { apiErrorMessage, apiFetch, apiGet, apiRequest } from '../../../services/http';

const base = '/api/extensions/admin/performance';
export type Color = 'green' | 'yellow' | 'red';
export const processes = {
  stratification: 'Estratificación',
  qualification: 'Calificación',
  correction_review: 'Revisión de subsanación',
};
type Process = keyof typeof processes;
export interface Threshold {
  process_type: Process;
  warning_days: number;
  critical_days: number;
}
interface Member { id: string; name: string }
interface Metrics {
  color: Color | null;
  onTimePercent: number | null;
  averageDelayDays: number | null;
  averageReviewDays: number | null;
  openWarning: number;
  openCritical: number;
  loginCount: number;
  completedSessions: number;
  lastLogin: string | null;
  averageCorrectionDays: number | null;
}
interface Summary { members: Member[]; rows: { member: Member; metrics: Metrics }[] }
export interface Detail {
  member: Member;
  cases: {
    id: string; title: string; process_type: Process; sequence: number; started_at: string;
    decided_at: string | null; days: number; color: Color;
  }[];
  activity: {
    id: string; action_type: 'LOGIN' | 'LOGOUT'; created_at: string;
    session_duration_seconds: number | null;
  }[];
}
export interface Period { from: string; to: string }
interface Filter extends Period { memberId: string }

function search(filter: Period | Filter) {
  return new URLSearchParams(Object.entries(filter).filter(([, value]) => value)).toString();
}

export const performanceApi = {
  summary: (filter: Filter, signal: AbortSignal) => apiRequest<Summary>(base + '/summary?' + search(filter), { signal }),
  detail: (id: string, period: Period, signal: AbortSignal) => apiRequest<Detail>(base + '/members/' + id + '?' + search(period), { signal }),
  thresholds: () => apiGet<Threshold[]>(base + '/thresholds'),
  update: (threshold: Threshold) => apiRequest<Threshold>(base + '/thresholds', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(threshold),
  }),
  async download(filter: Filter) {
    const response = await apiFetch(base + '/export?' + search(filter));
    if (!response.ok) throw new Error(await apiErrorMessage(response));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'desempeno-ceish.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

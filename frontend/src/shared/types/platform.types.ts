import type { Criterion } from '../../features/evaluation/types/evaluation.types';

export type UserRole = 'student' | 'evaluator' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export type SubmissionStatus = 'pending' | 'under-review' | 'reviewed';
export type ClassificationStatus =
  | 'awaiting-assignment'
  | 'awaiting-first'
  | 'awaiting-second'
  | 'awaiting-consensus'
  | 'classified'
  | 'cancelled';
export type RiskLevel = 'no-risk' | 'minimal-risk' | 'greater-than-minimal';
export type QualificationStatus =
  | 'pending-review'
  | 'corrections-required'
  | 'resubmitted'
  | 'approved'
  | 'cancelled'
  | 'expired';

export interface ResearchDocument {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface Annex2ScheduleItem {
  id: string;
  parentId: string | null;
  type: 'objective' | 'activity';
  label: string;
  startMonth: number;
  durationMonths: number;
}

export interface Annex2Schedule {
  items: Annex2ScheduleItem[];
}

export interface StudentSubmission {
  id: string;
  studentId: string;
  researchCode: string;
  title: string;
  documentName: string;
  documents: ResearchDocument[];
  annex11Status?: string;
  comment: string;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt?: string;
  grade?: number;
  finalComment?: string; // shown anonymously to student
  classificationStatus: ClassificationStatus;
  riskLevel?: RiskLevel;
  classifiedAt?: string;
  qualificationId?: string;
  qualificationStatus?: QualificationStatus;
  qualificationCycle?: number;
  qualificationObservations?: string;
  correctionDueAt?: string;
  annex2Schedule: Annex2Schedule;
  annex2Id?: string;
  annex2Status: 'draft' | 'completed';
}

export type StageStatus = 'pending' | 'in-progress' | 'completed';

export interface ReviewStage {
  id: string;
  name: string;
  order: number;
  criteria: Criterion[];
  status: StageStatus;
}

export interface Review {
  id: string;
  submissionId: string;
  evaluatorId: string;
  studentId: string;
  stages: ReviewStage[];
  currentStageIndex: number;
  finalComment?: string;
  completedAt?: string;
  grade?: number;
}

export interface Assignment {
  id: string;
  evaluatorId: string;
  studentId: string;
  createdAt: string;
}

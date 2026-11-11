export interface PermanentConsultant {
  userId: string;
  name: string;
  email: string;
  faculty: string;
  specialty: string;
  department: string | null;
  isActive: boolean;
}

export type ConsultationStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'expired';

export interface ConsultationFeedback {
  id: string;
  requestId: string;
  criteriaLabel: string;
  suggestedStatus: 'approved' | 'rejected' | 'neutral';
  technicalComments: string;
  isAcceptedByMember: boolean;
  createdAt: string;
}

export interface ConsultationRequest {
  id: string;
  submissionId: string;
  requesterMemberId: string;
  consultantId: string;
  status: ConsultationStatus;
  instructions: string | null;
  dueDate: string | null;
  requestedAt: string;
  completedAt: string | null;
  consultant?: {
    id: string;
    name: string;
    email: string;
    consultantProfile?: {
      specialty: string;
      faculty: string;
      department?: string | null;
    };
  };
  requesterMember?: {
    id: string;
    name: string;
    email: string;
  };
  submission?: {
    id: string;
    title: string;
    researchCode: string;
    documentName: string;
    documentPath: string;
    status: string;
    submittedAt: string;
    documents?: Array<{
      id: string;
      documentName: string;
      documentPath: string;
    }>;
  };
  feedbacks?: ConsultationFeedback[];
}

export interface CreateConsultationRequestInput {
  submissionId: string;
  consultantId: string;
  instructions?: string;
  dueDate?: string;
}

export interface SingleFeedbackInput {
  criteriaLabel: string;
  suggestedStatus?: 'approved' | 'rejected' | 'neutral';
  technicalComments: string;
}

export interface SubmitConsultationFeedbackInput {
  feedbacks: SingleFeedbackInput[];
}

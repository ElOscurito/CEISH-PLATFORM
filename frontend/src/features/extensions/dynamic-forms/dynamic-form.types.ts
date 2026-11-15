export type FieldType = 'text' | 'textarea' | 'single_select' | 'multi_select' | 'checkbox' | 'file' | 'criterion';
export interface DynamicField {
  id: string; fieldKey: string; label: string; fieldType: FieldType; isRequired: boolean;
  options: { value: string; label: string }[]; displayOrder: number; placeholder?: string | null; helpText?: string | null;
}
export interface CriterionAnswer { status: 'pending' | 'approved' | 'rejected'; observation: string; pageReference: number | null }
export type AnswerValue = string | boolean | string[] | CriterionAnswer | null;
export type Answers = Record<string, AnswerValue>;
export interface ResponseFile { id: string; documentName: string; mimeType: string; sizeBytes: number }
export interface DynamicInstance {
  id: string; status: 'draft' | 'submitted'; cycleNumber: number;
  version: { id: string; title: string; description: string | null; fields: DynamicField[] };
  values: { fieldId: string; fieldValue: AnswerValue; files: ResponseFile[] }[];
}

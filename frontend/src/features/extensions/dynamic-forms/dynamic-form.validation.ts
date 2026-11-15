import type { Answers, DynamicField } from './dynamic-form.types';

export function validateAnswers(fields: DynamicField[], answers: Answers, final = true): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = answers[field.id];
    const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) { if (final && field.isRequired) errors[field.id] = 'Completa este campo obligatorio.'; continue; }
    let invalid: boolean;
    switch (field.fieldType) {
      case 'text': case 'textarea': invalid = typeof value !== 'string' || value.length > (field.fieldType === 'text' ? 2000 : 20000) || (final && field.isRequired && !value.trim()); break;
      case 'checkbox': invalid = typeof value !== 'boolean' || (final && field.isRequired && !value); break;
      case 'single_select': invalid = typeof value !== 'string' || !field.options.some(o => o.value === value); break;
      case 'multi_select': invalid = !Array.isArray(value) || new Set(value).size !== value.length || value.some(v => !field.options.some(o => o.value === v)); break;
      case 'file': invalid = !Array.isArray(value) || value.length > 10 || new Set(value).size !== value.length || value.some(v => typeof v !== 'string'); break;
      case 'criterion': {
        if (typeof value !== 'object' || Array.isArray(value)) { invalid = true; break; }
        const page = value.pageReference;
        invalid = !['pending', 'approved', 'rejected'].includes(value.status) || (final && value.status === 'pending') || typeof value.observation !== 'string' || value.observation.length > 20000 || (page !== null && (!Number.isInteger(page) || page < 1 || page > 32767));
        break;
      }
      default: invalid = true;
    }
    if (invalid) errors[field.id] = field.fieldType === 'checkbox' ? 'Debes marcar esta casilla.' : field.fieldType === 'criterion' ? 'Selecciona un dictamen y revisa la página indicada.' : 'Revisa la respuesta de este campo.';
  }
  return errors;
}

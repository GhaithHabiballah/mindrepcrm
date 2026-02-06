export function isSelectField(fieldKey: string, fieldType?: string) {
  if (fieldType === 'select') return true;
  return fieldKey === 'outreach_method';
}

/** Fields that are auto-populated and should not appear in the Add Lead form */
export const AUTO_FIELDS = new Set(['date_added']);

/** Check if a field is a date type */
export function isDateField(fieldKey: string, fieldType?: string) {
  return fieldType === 'date' || fieldKey === 'date_added';
}

/** Format a date string for display */
export function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

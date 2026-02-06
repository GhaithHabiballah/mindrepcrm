export function isSelectField(fieldKey: string, fieldType?: string) {
  if (fieldType === 'select') return true;
  return fieldKey === 'outreach_method';
}

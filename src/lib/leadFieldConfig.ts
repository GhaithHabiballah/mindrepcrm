export const SELECT_FIELD_OPTIONS: Record<string, string[]> = {
  outreach_method: ['email', 'sms', 'instagram', 'linkedin', 'phone'],
};

export function isSelectField(fieldKey: string, fieldType?: string) {
  if (fieldType === 'select') return true;
  return Boolean(SELECT_FIELD_OPTIONS[fieldKey]);
}

export function getSelectOptions(fieldKey: string): string[] {
  return SELECT_FIELD_OPTIONS[fieldKey] ?? [];
}

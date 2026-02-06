import { supabase } from './supabase';

export type ImportLead = {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  [key: string]: string | undefined;
};

export type DuplicateResult = {
  original: ImportLead;
  reason: 'email' | 'phone' | 'website';
  matchedWith: string;
};

export type DeduplicationResult = {
  newLeads: ImportLead[];
  duplicates: DuplicateResult[];
};

export const normalizeEmail = (value?: string | null) =>
  value?.trim().toLowerCase() || '';

export const normalizePhone = (value?: string | null) =>
  value?.replace(/\D/g, '') || '';

export const normalizeWebsite = (value?: string | null) =>
  value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '') || '';

export async function checkDuplicates(
  leads: ImportLead[]
): Promise<DeduplicationResult> {
  const { data: existingLeads, error } = await supabase
    .from('leads')
    .select('name,email,phone,website');

  if (error) throw error;

  const existingByEmail = new Map<string, { name: string }>();
  const existingByPhone = new Map<string, { name: string }>();
  const existingByWebsite = new Map<string, { name: string }>();

  (existingLeads || []).forEach((lead: any) => {
    const email = normalizeEmail(lead.email);
    const phone = normalizePhone(lead.phone);
    const website = normalizeWebsite(lead.website);
    if (email) existingByEmail.set(email, lead);
    if (phone) existingByPhone.set(phone, lead);
    if (website) existingByWebsite.set(website, lead);
  });

  const duplicates: DuplicateResult[] = [];
  const newLeads: ImportLead[] = [];

  leads.forEach((tempLead) => {
    const email = normalizeEmail(tempLead.email);
    const phone = normalizePhone(tempLead.phone);
    const website = normalizeWebsite(tempLead.website);

    const match =
      (email && existingByEmail.get(email)) ||
      (phone && existingByPhone.get(phone)) ||
      (website && existingByWebsite.get(website));

    if (match) {
      const reason: 'email' | 'phone' | 'website' =
        email && existingByEmail.get(email)
          ? 'email'
          : phone && existingByPhone.get(phone)
          ? 'phone'
          : 'website';
      duplicates.push({ original: tempLead, reason, matchedWith: match.name });
    } else {
      newLeads.push(tempLead);
    }
  });

  return { newLeads, duplicates };
}

export async function bulkInsertLeads(leads: ImportLead[]): Promise<void> {
  const rows = leads.map((lead) => {
    const row: Record<string, string | null> = {
      name: lead.name || 'Unknown',
      email: lead.email || null,
      phone: lead.phone || null,
      website: lead.website || null,
      outreach_method: null,
    };

    // Include any extra mapped fields
    for (const [key, val] of Object.entries(lead)) {
      if (!['name', 'email', 'phone', 'website'].includes(key)) {
        row[key] = val || null;
      }
    }

    return row;
  });

  const { error } = await supabase.from('leads').insert(rows);
  if (error) throw error;
}

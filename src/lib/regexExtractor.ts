export type ExtractedContact = {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_RE =
  /(?:(?:\+?1[\s.-]?)?(?:\(?[2-9]\d{2}\)?[\s.-]?)[2-9]\d{2}[\s.-]?\d{4})|(?:\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{1,4})?)/g;

const URL_RE = new RegExp(
  '(?:https?://)?(?:www\\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}(?:/[^\\s,)"\\\'<>]*)?',
  'gi'
);

const NAME_LABEL_RE = /(?:name|contact)\s*[:]\s*(.+)/i;

function stripDigits(s: string) {
  return s.replace(/\d/g, '');
}

function looksLikeName(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (/[@./:]/.test(trimmed)) return false;
  if (/^\d/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  return words.every((w) => /^[A-Z][a-z]+$/.test(stripDigits(w)) || /^[A-Z]+$/.test(w));
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local
    .replace(/[._-]/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function extractFromChunk(chunk: string, emailDomains: Set<string>): ExtractedContact[] {
  const emails = [...chunk.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase());
  const phones = [...chunk.matchAll(PHONE_RE)]
    .map((m) => m[0])
    .filter((p) => p.replace(/\D/g, '').length >= 7);

  const emailDomainSet = new Set(emails.map((e) => e.split('@')[1]));
  emailDomainSet.forEach((d) => emailDomains.add(d));

  const urls = [...chunk.matchAll(URL_RE)]
    .map((m) => m[0])
    .filter((u) => {
      const domain = u.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      return !emailDomains.has(domain);
    });

  // Try to find a name
  let name = '';
  const labelMatch = chunk.match(NAME_LABEL_RE);
  if (labelMatch) {
    name = labelMatch[1].trim();
  } else {
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (looksLikeName(line)) {
        name = line.trim();
        break;
      }
    }
  }

  if (emails.length === 0 && phones.length === 0 && urls.length === 0) {
    return [];
  }

  // If multiple emails, create one contact per email
  if (emails.length > 1) {
    return emails.map((email, i) => ({
      name: name || nameFromEmail(email),
      email,
      phone: phones[i] || phones[0],
      website: urls[i] || urls[0],
    }));
  }

  const email = emails[0];
  return [
    {
      name: name || (email ? nameFromEmail(email) : 'Unknown'),
      email,
      phone: phones[0],
      website: urls[0],
    },
  ];
}

function splitIntoChunks(text: string): string[] {
  return text
    .split(/\n\s*\n|\n[-=]{3,}\n|\n\*{3,}\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

export function extractContacts(text: string): ExtractedContact[] {
  const chunks = splitIntoChunks(text);
  const emailDomains = new Set<string>();
  const allContacts: ExtractedContact[] = [];
  const seenEmails = new Set<string>();

  for (const chunk of chunks) {
    const contacts = extractFromChunk(chunk, emailDomains);
    for (const contact of contacts) {
      const key = contact.email?.toLowerCase();
      if (key && seenEmails.has(key)) continue;
      if (key) seenEmails.add(key);
      allContacts.push(contact);
    }
  }

  return allContacts;
}

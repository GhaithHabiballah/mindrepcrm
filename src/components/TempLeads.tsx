import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, CheckCircle } from 'lucide-react';

type TempLead = {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
};

type DuplicateResult = {
  original: TempLead;
  reason: string;
  matchedWith: string;
};

type TempLeadsProps = {
  onImport: () => void;
};

export function TempLeads({ onImport }: TempLeadsProps) {
  const [inputText, setInputText] = useState('');
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [newLeads, setNewLeads] = useState<TempLead[]>([]);
  const [checked, setChecked] = useState(false);
  const [importing, setImporting] = useState(false);

  const parseLeads = (raw: string) => {
    const lines = raw.trim().split('\n');
    const parsed: TempLead[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(/[,\t]/).map(p => p.trim());
      if (parts.length === 0) continue;

      const lead: TempLead = {
        name: parts[0] || 'Unknown',
        email: parts[1] || undefined,
        phone: parts[2] || undefined,
        website: parts[3] || undefined,
      };

      parsed.push(lead);
    }

    return parsed;
  };

  const normalizeEmail = (value?: string) => value?.trim().toLowerCase() || '';
  const normalizePhone = (value?: string) => value?.replace(/\D/g, '') || '';
  const normalizeWebsite = (value?: string) => value?.trim().toLowerCase() || '';

  const checkDuplicates = async () => {
    const parsedLeads = parseLeads(inputText);
    if (parsedLeads.length === 0) {
      alert('Please paste some leads first');
      return;
    }

    try {
      const { data: existingLeads, error } = await supabase
        .from('leads')
        .select('name,email,phone,website');

      if (error) throw error;

      const existingByEmail = new Map<string, any>();
      const existingByPhone = new Map<string, any>();
      const existingByWebsite = new Map<string, any>();

      (existingLeads || []).forEach(lead => {
        const email = normalizeEmail(lead.email);
        const phone = normalizePhone(lead.phone);
        const website = normalizeWebsite(lead.website);
        if (email) existingByEmail.set(email, lead);
        if (phone) existingByPhone.set(phone, lead);
        if (website) existingByWebsite.set(website, lead);
      });

      const dupes: DuplicateResult[] = [];
      const fresh: TempLead[] = [];

      parsedLeads.forEach(tempLead => {
        const email = normalizeEmail(tempLead.email);
        const phone = normalizePhone(tempLead.phone);
        const website = normalizeWebsite(tempLead.website);

        const existing =
          (email && existingByEmail.get(email)) ||
          (phone && existingByPhone.get(phone)) ||
          (website && existingByWebsite.get(website));

        if (existing) {
          const reason = email && existingByEmail.get(email)
            ? 'email'
            : phone && existingByPhone.get(phone)
            ? 'phone'
            : 'website';
          dupes.push({
            original: tempLead,
            reason,
            matchedWith: existing.name,
          });
        } else {
          fresh.push(tempLead);
        }
      });

      setDuplicates(dupes);
      setNewLeads(fresh);
      setChecked(true);
    } catch (error) {
      console.error('Error checking duplicates:', error);
      alert('Error checking duplicates');
    }
  };

  const handleImport = async () => {
    if (newLeads.length === 0) {
      alert('No new leads to import');
      return;
    }

    setImporting(true);
    try {
      const leadsToInsert = newLeads.map(lead => ({
        name: lead.name,
        email: lead.email || null,
        phone: lead.phone || null,
        website: lead.website || null,
        outreach_method: null,
      }));

      const { error } = await supabase.from('leads').insert(leadsToInsert);

      if (error) throw error;

      alert(`Successfully imported ${newLeads.length} leads!`);
      setInputText('');
      setDuplicates([]);
      setNewLeads([]);
      setChecked(false);
      onImport();
    } catch (error) {
      console.error('Error importing leads:', error);
      alert('Error importing leads');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Temporary Lead Import</h2>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Paste Leads (format: Name, Email, Phone, Website - one per line)
          </label>
          <textarea
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              setChecked(false);
              setDuplicates([]);
              setNewLeads([]);
            }}
            placeholder="John Doe, john@example.com, 555-1234, example.com&#10;Jane Smith, jane@example.com, 555-5678, janesmith.com"
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={checkDuplicates}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            Check Duplicates
          </button>
          {checked && newLeads.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Add {newLeads.length} to Master
            </button>
          )}
        </div>

        {checked && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex items-center gap-2 text-green-900">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">
                  {newLeads.length} new leads ready to import
                </span>
              </div>
            </div>

            {duplicates.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <h3 className="font-semibold text-yellow-900 mb-2">
                  {duplicates.length} duplicates removed:
                </h3>
                <div className="space-y-1 text-sm text-yellow-800">
                  {duplicates.slice(0, 10).map((dup, idx) => (
                    <div key={idx} className="font-mono">
                      {dup.original.name} - matched by {dup.reason} with "{dup.matchedWith}"
                    </div>
                  ))}
                  {duplicates.length > 10 && (
                    <div className="text-yellow-700 italic">
                      ... and {duplicates.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {newLeads.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">New Leads Preview:</h3>
                <div className="bg-gray-50 rounded-md p-4 max-h-64 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">Phone</th>
                        <th className="px-3 py-2 text-left">Website</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newLeads.map((lead, idx) => (
                        <tr key={idx} className="border-t border-gray-200">
                          <td className="px-3 py-2">{lead.name}</td>
                          <td className="px-3 py-2">{lead.email || '-'}</td>
                          <td className="px-3 py-2">{lead.phone || '-'}</td>
                          <td className="px-3 py-2">{lead.website || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

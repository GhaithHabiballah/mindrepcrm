import { useState } from 'react';
import { extractContacts } from '../lib/regexExtractor';
import { checkDuplicates, bulkInsertLeads, ImportLead, DuplicateResult } from '../lib/importUtils';
import { ImportPreview } from './ImportPreview';

type SmartPasteProps = {
  onImport: () => void;
};

export function SmartPaste({ onImport }: SmartPasteProps) {
  const [inputText, setInputText] = useState('');
  const [newLeads, setNewLeads] = useState<ImportLead[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handleExtract = async () => {
    setError('');
    const contacts = extractContacts(inputText);
    if (contacts.length === 0) {
      setError('No contacts found. Try pasting text containing email addresses, phone numbers, or websites.');
      return;
    }

    try {
      const result = await checkDuplicates(contacts);
      setNewLeads(result.newLeads);
      setDuplicates(result.duplicates);
      setStep('preview');
    } catch (err) {
      console.error('Error checking duplicates:', err);
      setError('Error checking for duplicates.');
    }
  };

  const handleImport = async () => {
    if (newLeads.length === 0) return;
    setImporting(true);
    try {
      await bulkInsertLeads(newLeads);
      setInputText('');
      setNewLeads([]);
      setDuplicates([]);
      setStep('input');
      onImport();
    } catch (err) {
      console.error('Error importing leads:', err);
      setError('Error importing leads. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleEditLead = (index: number, field: string, value: string) => {
    setNewLeads((prev) =>
      prev.map((lead, i) => (i === index ? { ...lead, [field]: value } : lead))
    );
  };

  const handleRemoveLead = (index: number) => {
    setNewLeads((prev) => prev.filter((_, i) => i !== index));
  };

  if (step === 'preview') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setStep('input')}
          className="text-purple-300 hover:text-purple-200 text-sm font-medium"
        >
          &larr; Back to Edit
        </button>
        <ImportPreview
          newLeads={newLeads}
          duplicates={duplicates}
          onImport={handleImport}
          importing={importing}
          onEditLead={handleEditLead}
          onRemoveLead={handleRemoveLead}
        />
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Paste any text containing contact info
        </label>
        <textarea
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setError('');
          }}
          placeholder={`Paste email signatures, bios, contact pages, etc.\n\nExamples:\n\nJohn Doe\njohn@company.com\n(555) 123-4567\nwww.company.com\n\n---\n\nJane Smith\njane@example.com\n555-987-6543`}
          rows={12}
          className="w-full px-3 py-2 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm bg-gray-900 text-white"
        />
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleExtract}
        disabled={!inputText.trim()}
        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        Extract Contacts
      </button>
    </div>
  );
}

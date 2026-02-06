import { useCallback, useEffect, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Upload } from 'lucide-react';
import { supabase, LeadField } from '../lib/supabase';
import { checkDuplicates, bulkInsertLeads, ImportLead, DuplicateResult } from '../lib/importUtils';
import { ImportPreview } from './ImportPreview';

const AUTO_MAP: Record<string, string[]> = {
  name: ['name', 'full name', 'full_name', 'contact', 'contact name', 'person', 'first name', 'firstname'],
  email: ['email', 'e-mail', 'email address', 'mail', 'e_mail'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'cell', 'phone_number'],
  website: ['website', 'url', 'web', 'site', 'homepage', 'domain'],
  outreach_method: ['outreach', 'outreach method', 'outreach_method', 'method', 'channel'],
};

type Step = 'upload' | 'mapping' | 'preview';

type FileUploadProps = {
  onImport: () => void;
};

export function FileUpload({ onImport }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<LeadField[]>([]);
  const [step, setStep] = useState<Step>('upload');
  const [newLeads, setNewLeads] = useState<ImportLead[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    supabase
      .from('lead_fields')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setFields(data);
      });
  }, []);

  const fieldOptions = fields.map((f) => ({ key: f.field_key, label: f.label }));

  const autoDetectMapping = useCallback(
    (fileHeaders: string[]) => {
      const map: Record<string, string> = {};
      for (const header of fileHeaders) {
        const normalized = header.trim().toLowerCase();
        for (const [fieldKey, aliases] of Object.entries(AUTO_MAP)) {
          if (aliases.includes(normalized)) {
            map[header] = fieldKey;
            break;
          }
        }
        // Also check against dynamic fields
        if (!map[header]) {
          const match = fields.find(
            (f) => f.field_key === normalized || f.label.toLowerCase() === normalized
          );
          if (match) map[header] = match.field_key;
        }
        if (!map[header]) map[header] = '';
      }
      return map;
    },
    [fields]
  );

  const parseFile = useCallback(
    (f: File) => {
      setError('');
      const ext = f.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv') {
        Papa.parse(f, {
          skipEmptyLines: true,
          complete: (result) => {
            const data = result.data as string[][];
            if (data.length < 2) {
              setError('File has no data rows.');
              return;
            }
            const hdrs = data[0];
            const body = data.slice(1);
            setHeaders(hdrs);
            setRows(body);
            setMapping(autoDetectMapping(hdrs));
            setStep('mapping');
          },
          error: () => setError('Failed to parse CSV file.'),
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const wb = XLSX.read(e.target?.result, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
            if (data.length < 2) {
              setError('File has no data rows.');
              return;
            }
            const hdrs = (data[0] as string[]).map(String);
            const body = data.slice(1).map((row) => (row as string[]).map(String));
            setHeaders(hdrs);
            setRows(body);
            setMapping(autoDetectMapping(hdrs));
            setStep('mapping');
          } catch {
            setError('Failed to parse Excel file.');
          }
        };
        reader.readAsArrayBuffer(f);
      } else {
        setError('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
      }
    },
    [autoDetectMapping]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      parseFile(f);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      parseFile(f);
    }
  };

  const handleMapping = async () => {
    setError('');

    // Check at least name or email is mapped
    const mappedFields = Object.values(mapping).filter(Boolean);
    if (!mappedFields.includes('name') && !mappedFields.includes('email')) {
      setError('Please map at least Name or Email.');
      return;
    }

    // Build leads from rows using mapping
    const leads: ImportLead[] = rows.map((row) => {
      const lead: ImportLead = { name: 'Unknown' };
      headers.forEach((header, colIdx) => {
        const fieldKey = mapping[header];
        if (fieldKey && row[colIdx]?.trim()) {
          lead[fieldKey] = row[colIdx].trim();
        }
      });
      if (!lead.name || lead.name === 'Unknown') {
        lead.name = lead.email?.split('@')[0] || 'Unknown';
      }
      return lead;
    });

    try {
      // Ensure dynamic columns exist
      const baseColumns = new Set(['name', 'email', 'phone', 'website', 'outreach_method']);
      const dynamicKeys = [...new Set(mappedFields)].filter((k) => !baseColumns.has(k));
      for (const key of dynamicKeys) {
        await supabase.rpc('add_lead_column', { column_name: key, column_type: 'text' });
      }

      const result = await checkDuplicates(leads);
      setNewLeads(result.newLeads);
      setDuplicates(result.duplicates);
      setStep('preview');
    } catch (err) {
      console.error('Error processing file:', err);
      setError('Error processing file data.');
    }
  };

  const handleImport = async () => {
    if (newLeads.length === 0) return;
    setImporting(true);
    try {
      await bulkInsertLeads(newLeads);
      setFile(null);
      setHeaders([]);
      setRows([]);
      setMapping({});
      setNewLeads([]);
      setDuplicates([]);
      setStep('upload');
      onImport();
    } catch (err) {
      console.error('Error importing leads:', err);
      setError('Error importing leads.');
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

  // Upload step
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
        >
          <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 mb-2">
            {file ? file.name : 'Drag & drop a CSV or Excel file here'}
          </p>
          <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer font-medium text-sm">
            Choose File
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
          <p className="text-xs text-gray-400 mt-2">Supports .csv, .xlsx, .xls</p>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Mapping step
  if (step === 'mapping') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setStep('upload')}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          &larr; Back to Upload
        </button>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">
            Map columns from "{file?.name}"
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {rows.length} row{rows.length !== 1 ? 's' : ''} detected. Map each column to a lead field.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {headers.map((header) => (
            <div key={header} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium text-gray-900">{header}</span>
                <span className="text-xs text-gray-400 ml-2">
                  e.g. "{rows[0]?.[headers.indexOf(header)] || ''}"
                </span>
              </div>
              <select
                value={mapping[header] || ''}
                onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value }))}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Skip --</option>
                {fieldOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleMapping}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
        >
          Continue to Preview
        </button>
      </div>
    );
  }

  // Preview step
  return (
    <div className="space-y-4">
      <button
        onClick={() => setStep('mapping')}
        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        &larr; Back to Mapping
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

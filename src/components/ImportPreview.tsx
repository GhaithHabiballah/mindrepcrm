import { useState } from 'react';
import { CheckCircle, X, Upload } from 'lucide-react';
import { ImportLead, DuplicateResult } from '../lib/importUtils';

type ImportPreviewProps = {
  newLeads: ImportLead[];
  duplicates: DuplicateResult[];
  onImport: () => void;
  importing: boolean;
  onEditLead: (index: number, field: string, value: string) => void;
  onRemoveLead: (index: number) => void;
};

export function ImportPreview({
  newLeads,
  duplicates,
  onImport,
  importing,
  onEditLead,
  onRemoveLead,
}: ImportPreviewProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (row: number, field: string, value: string) => {
    setEditingCell({ row, field });
    setEditValue(value);
  };

  const commitEdit = () => {
    if (editingCell) {
      onEditLead(editingCell.row, editingCell.field, editValue);
      setEditingCell(null);
      setEditValue('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="bg-green-50 border border-green-200 rounded-md p-4 flex-1">
          <div className="flex items-center gap-2 text-green-900">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">
              {newLeads.length} new lead{newLeads.length !== 1 ? 's' : ''} ready to import
            </span>
          </div>
        </div>
        {newLeads.length > 0 && (
          <button
            onClick={onImport}
            disabled={importing}
            className="ml-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Importing...' : `Add ${newLeads.length} to Master`}
          </button>
        )}
      </div>

      {duplicates.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h3 className="font-semibold text-yellow-900 mb-2">
            {duplicates.length} duplicate{duplicates.length !== 1 ? 's' : ''} removed:
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
          <h3 className="font-semibold text-gray-900 mb-2">Preview (click to edit):</h3>
          <div className="bg-gray-50 rounded-md p-4 max-h-80 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                  <th className="px-3 py-2 text-left">Website</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {newLeads.map((lead, idx) => (
                  <tr key={idx} className="border-t border-gray-200">
                    {(['name', 'email', 'phone', 'website'] as const).map((field) => (
                      <td
                        key={field}
                        className="px-3 py-2 cursor-pointer hover:bg-blue-50"
                        onClick={() => startEdit(idx, field, lead[field] || '')}
                      >
                        {editingCell?.row === idx && editingCell?.field === field ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            autoFocus
                            className="w-full px-1 py-0.5 border border-blue-500 rounded text-sm focus:outline-none"
                          />
                        ) : (
                          <span className={lead[field] ? '' : 'text-gray-400'}>{lead[field] || '-'}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onRemoveLead(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

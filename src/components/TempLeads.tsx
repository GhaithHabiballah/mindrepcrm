import { useState } from 'react';
import { ClipboardList, FileSpreadsheet } from 'lucide-react';
import { SmartPaste } from './SmartPaste';
import { FileUpload } from './FileUpload';

type ImportMode = 'smart-paste' | 'file-upload';

type TempLeadsProps = {
  onImport: () => void;
};

export function TempLeads({ onImport }: TempLeadsProps) {
  const [mode, setMode] = useState<ImportMode>('smart-paste');

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">Import Leads</h2>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('smart-paste')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm ${
            mode === 'smart-paste'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Smart Paste
        </button>
        <button
          onClick={() => setMode('file-upload')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm ${
            mode === 'file-upload'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          CSV / Excel Upload
        </button>
      </div>

      <div className="bg-gray-950 rounded-lg shadow p-6 border border-gray-800">
        {mode === 'smart-paste' && <SmartPaste onImport={onImport} />}
        {mode === 'file-upload' && <FileUpload onImport={onImport} />}
      </div>
    </div>
  );
}

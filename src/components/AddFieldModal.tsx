import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

type AddFieldModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

const FIELD_TYPES = ['text', 'phone', 'url', 'email'];

export function AddFieldModal({ onClose, onSuccess }: AddFieldModalProps) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!label.trim()) {
      setError('Field label is required');
      return;
    }

    const fieldKey = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    if (!fieldKey) {
      setError('Invalid field label');
      return;
    }

    setLoading(true);

    try {
      const { data: existing } = await supabase
        .from('lead_fields')
        .select('field_key')
        .eq('field_key', fieldKey)
        .maybeSingle();

      if (existing) {
        setError('A field with this name already exists');
        setLoading(false);
        return;
      }

      const { error: columnError } = await supabase.rpc('add_lead_column', {
        column_name: fieldKey,
        column_type: 'text',
      });

      if (columnError) throw columnError;

      const { error: fieldError } = await supabase
        .from('lead_fields')
        .insert([{ field_key: fieldKey, label, type }]);

      if (fieldError) throw fieldError;

      onSuccess();
    } catch (err) {
      console.error('Error adding field:', err);
      setError(err instanceof Error ? err.message : 'Failed to add field');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Add New Lead Field</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="label" className="block text-sm font-medium text-gray-700 mb-1">
              Field Label
            </label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Company Size, Industry, LinkedIn"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              This will be displayed as the column header
            </p>
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              Field Type
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FIELD_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Adding...' : 'Add Field'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>

        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-xs text-blue-900">
            <strong>Note:</strong> This field will be automatically added to all views (Master Leads and all Outreach tabs).
          </p>
        </div>
      </div>
    </div>
  );
}

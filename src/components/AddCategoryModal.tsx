import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

type AddCategoryModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

export function AddCategoryModal({ onClose, onSuccess }: AddCategoryModalProps) {
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const normalizeKey = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = label.trim();
    if (!trimmed) {
      setError('Category name is required');
      return;
    }

    const key = normalizeKey(trimmed);
    if (!key) {
      setError('Invalid category name');
      return;
    }

    setLoading(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from('outreach_methods')
        .select('key')
        .eq('key', key)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) {
        setError('This category already exists');
        setLoading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('outreach_methods')
        .insert([{ key, label: trimmed }]);

      if (insertError) throw insertError;

      onSuccess();
    } catch (err) {
      console.error('Error adding category:', err);
      setError(err instanceof Error ? err.message : 'Failed to add category');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-950 border border-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Add Outreach Category</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="label" className="block text-sm font-medium text-gray-300 mb-1">
              Category Name
            </label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Facebook, TikTok, Address"
              className="w-full px-3 py-2 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-900 text-white"
              required
            />
            <p className="mt-1 text-xs text-gray-400">
              This will create a new outreach tab and dropdown option
            </p>
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Adding...' : 'Add Category'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 text-gray-200 rounded-md hover:bg-gray-700 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { supabase, LeadField } from '../lib/supabase';
import { X } from 'lucide-react';
import { isSelectField, AUTO_FIELDS } from '../lib/leadFieldConfig';

type OutreachOption = {
  key: string;
  label: string;
};

type AddLeadModalProps = {
  fields: LeadField[];
  outreachOptions: OutreachOption[];
  defaultOutreachMethod?: string | null;
  tableName?: 'leads' | 'temp_leads';
  onClose: () => void;
  onSuccess: () => void;
};

export function AddLeadModal({
  fields,
  outreachOptions,
  defaultOutreachMethod,
  tableName = 'leads',
  onClose,
  onSuccess,
}: AddLeadModalProps) {
  const editableFields = useMemo(
    () => fields.filter((f) => !AUTO_FIELDS.has(f.field_key)),
    [fields]
  );

  const initialValues = useMemo(() => {
    const values: Record<string, string> = {};
    editableFields.forEach((field) => {
      if (field.field_key === 'outreach_method' && defaultOutreachMethod) {
        values[field.field_key] = defaultOutreachMethod;
      } else {
        values[field.field_key] = '';
      }
    });
    return values;
  }, [editableFields, defaultOutreachMethod]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    setLoading(true);
    try {
      const baseColumns = new Set([
        'name',
        'email',
        'phone',
        'website',
        'outreach_method',
      ]);

      const dynamicFields = editableFields.filter((field) => !baseColumns.has(field.field_key));
      if (dynamicFields.length > 0) {
        for (const field of dynamicFields) {
          const { error: addColumnError } = await supabase.rpc('add_lead_column', {
            column_name: field.field_key,
            column_type: 'text',
          });
          if (addColumnError) {
            throw addColumnError;
          }
        }
      }

      const payload: Record<string, string | null> = {};
      editableFields.forEach((field) => {
        const raw = values[field.field_key];
        payload[field.field_key] = raw?.trim() ? raw.trim() : null;
      });

      if (!payload.name) {
        payload.name = 'New Lead';
      }

      const insertLead = async () => {
        const { error: insertError } = await supabase
          .from(tableName)
          .insert([payload]);
        if (insertError) throw insertError;
      };

      try {
        await insertLead();
      } catch (insertErr) {
        const message = insertErr && typeof insertErr === 'object' && 'message' in insertErr
          ? String((insertErr as { message?: string }).message || '')
          : '';
        if (message.includes('schema cache')) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await insertLead();
        } else {
          throw insertErr;
        }
      }

      onSuccess();
    } catch (err) {
      console.error('Error adding lead:', err);
      if (err && typeof err === 'object' && 'message' in err) {
        setError(String((err as { message?: string }).message || 'Failed to add lead'));
      } else {
        setError('Failed to add lead');
      }
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-950 border border-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Add Lead</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {editableFields.map((field) => {
              const isSelect = isSelectField(field.field_key, field.type);
              const value = values[field.field_key] ?? '';
              const inputType =
                field.type === 'email'
                  ? 'email'
                  : field.type === 'phone'
                  ? 'tel'
                  : field.type === 'url'
                  ? 'url'
                  : 'text';

              return (
                <div key={field.id} className="space-y-1">
                  <label className="block text-sm font-medium text-gray-300">
                    {field.label}
                  </label>
                  {isSelect ? (
                    <select
                      value={value}
                      onChange={(e) => handleChange(field.field_key, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-900 text-white"
                    >
                      <option value="">-</option>
                      {outreachOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={inputType}
                      value={value}
                      onChange={(e) => handleChange(field.field_key, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-900 text-white"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {error && (
          <div className="bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 text-gray-200 rounded-md hover:bg-gray-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Adding...' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

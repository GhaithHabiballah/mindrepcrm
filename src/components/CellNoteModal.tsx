import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type CellNoteModalProps = {
  leadId: string;
  fieldKey: string;
  fieldLabel: string;
  onClose: () => void;
};

export function CellNoteModal({ leadId, fieldKey, fieldLabel, onClose }: CellNoteModalProps) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadNote = async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('cell_notes')
          .select('note')
          .eq('lead_id', leadId)
          .eq('field_key', fieldKey)
          .maybeSingle();
        if (fetchError) throw fetchError;
        setNote(data?.note ?? '');
      } catch (err) {
        console.error('Failed to load note', err);
        setError('Failed to load note');
      } finally {
        setLoading(false);
      }
    };
    loadNote();
  }, [leadId, fieldKey]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const trimmed = note.trim();
      if (trimmed.length === 0) {
        await supabase.from('cell_notes').delete().eq('lead_id', leadId).eq('field_key', fieldKey);
      } else {
        const { error: upsertError } = await supabase.from('cell_notes').upsert(
          {
            lead_id: leadId,
            field_key: fieldKey,
            note: trimmed,
          },
          { onConflict: 'lead_id,field_key' }
        );
        if (upsertError) throw upsertError;
      }
      onClose();
    } catch (err) {
      console.error('Failed to save note', err);
      setError('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 w-[420px] max-w-[90vw]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">Cell Note</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className="text-xs text-gray-400 mb-2">
          {fieldLabel} ({fieldKey})
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={loading ? 'Loading...' : 'Add a note for this cell'}
          className="w-full h-32 bg-gray-950 border border-gray-800 rounded-md p-2 text-sm text-white"
          disabled={loading || saving}
        />
        {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 text-sm hover:bg-gray-700"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-2 rounded-md bg-purple-700 text-white text-sm hover:bg-purple-600"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

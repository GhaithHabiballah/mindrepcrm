import { useEffect, useState } from 'react';
import { supabase, OutreachEvent, Lead, LeadField } from '../lib/supabase';
import { Plus, Trash2 } from 'lucide-react';

type OutreachViewProps = {
  method: string;
  onUpdate: () => void;
};

type OutreachRow = {
  id: string;
  lead_id: string;
  method: string;
  status: string;
  notes: string | null;
  lead: Lead;
};

const STATUSES = ['sent', 'replied', 'booked', 'no_response', 'not_interested'];

export function OutreachView({ method, onUpdate }: OutreachViewProps) {
  const [rows, setRows] = useState<OutreachRow[]>([]);
  const [fields, setFields] = useState<LeadField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadData();
  }, [method]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eventsResult, fieldsResult] = await Promise.all([
        supabase
          .from('outreach_events')
          .select(`
            id,
            lead_id,
            method,
            status,
            notes,
            lead:leads(*)
          `)
          .eq('method', method)
          .order('created_at', { ascending: false }),
        supabase.from('lead_fields').select('*').order('created_at', { ascending: true }),
      ]);

      if (eventsResult.error) throw eventsResult.error;
      if (fieldsResult.error) throw fieldsResult.error;

      const processedRows = (eventsResult.data || []).map((event: any) => ({
        id: event.id,
        lead_id: event.lead_id,
        method: event.method,
        status: event.status,
        notes: event.notes,
        lead: event.lead,
      }));

      setRows(processedRows);
      setFields(fieldsResult.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCellClick = (row: OutreachRow, field: string) => {
    setEditingCell({ rowId: row.id, field });
    if (field === 'status') {
      setEditValue(row.status);
    } else if (field === 'notes') {
      setEditValue(row.notes || '');
    } else {
      setEditValue((row.lead as any)[field] || '');
    }
  };

  const handleCellUpdate = async () => {
    if (!editingCell) return;

    const row = rows.find(r => r.id === editingCell.rowId);
    if (!row) return;

    try {
      if (editingCell.field === 'status' || editingCell.field === 'notes') {
        const { error } = await supabase
          .from('outreach_events')
          .update({ [editingCell.field]: editValue || null })
          .eq('id', editingCell.rowId);

        if (error) throw error;

        setRows(rows.map(r =>
          r.id === editingCell.rowId
            ? { ...r, [editingCell.field]: editValue || null }
            : r
        ));
      } else {
        const { error } = await supabase
          .from('leads')
          .update({ [editingCell.field]: editValue || null })
          .eq('id', row.lead_id);

        if (error) throw error;

        setRows(rows.map(r =>
          r.id === editingCell.rowId
            ? { ...r, lead: { ...r.lead, [editingCell.field]: editValue || null } }
            : r
        ));

        onUpdate();
      }
    } catch (error) {
      console.error('Error updating cell:', error);
    } finally {
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleAddRow = async () => {
    try {
      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert([{ name: 'New Lead' }])
        .select()
        .single();

      if (leadError) throw leadError;
      if (!newLead) return;

      const { data: newEvent, error: eventError } = await supabase
        .from('outreach_events')
        .insert([{ lead_id: newLead.id, method, status: 'sent' }])
        .select()
        .single();

      if (eventError) throw eventError;

      if (newEvent) {
        const newRow: OutreachRow = {
          id: newEvent.id,
          lead_id: newEvent.lead_id,
          method: newEvent.method,
          status: newEvent.status,
          notes: newEvent.notes,
          lead: newLead,
        };
        setRows([newRow, ...rows]);
        onUpdate();
      }
    } catch (error) {
      console.error('Error adding row:', error);
    }
  };

  const handleDeleteRow = async (rowId: string, leadId: string) => {
    if (!confirm('Delete this outreach event?')) return;

    try {
      const { error } = await supabase.from('outreach_events').delete().eq('id', rowId);
      if (error) throw error;

      setRows(rows.filter(r => r.id !== rowId));
      onUpdate();
    } catch (error) {
      console.error('Error deleting row:', error);
    }
  };

  if (loading) {
    return <div className="text-gray-600">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 capitalize">{method} Outreach</h2>
        <button
          onClick={handleAddRow}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Row
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {fields.map((field) => (
                  <th
                    key={field.id}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {field.label}
                  </th>
                ))}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 3} className="px-6 py-4 text-center text-gray-500">
                    No {method} outreach yet. Click "Add Row" to get started.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {fields.map((field) => (
                      <td
                        key={field.id}
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer hover:bg-blue-50"
                        onClick={() => handleCellClick(row, field.field_key)}
                      >
                        {editingCell?.rowId === row.id && editingCell?.field === field.field_key ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellUpdate}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCellUpdate();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span>{(row.lead as any)[field.field_key] || '-'}</span>
                        )}
                      </td>
                    ))}
                    <td
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer hover:bg-blue-50"
                      onClick={() => handleCellClick(row, 'status')}
                    >
                      {editingCell?.rowId === row.id && editingCell?.field === 'status' ? (
                        <select
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellUpdate}
                          autoFocus
                          className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {STATUSES.map(status => (
                            <option key={status} value={status}>
                              {status.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="capitalize">{row.status.replace('_', ' ')}</span>
                      )}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-900 cursor-pointer hover:bg-blue-50"
                      onClick={() => handleCellClick(row, 'notes')}
                    >
                      {editingCell?.rowId === row.id && editingCell?.field === 'notes' ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellUpdate}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCellUpdate();
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          autoFocus
                          className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <span>{row.notes || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleDeleteRow(row.id, row.lead_id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

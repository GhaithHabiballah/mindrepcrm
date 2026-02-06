import { useEffect, useState } from 'react';
import { supabase, Lead, LeadField } from '../lib/supabase';
import { getSelectOptions, isSelectField } from '../lib/leadFieldConfig';
import { Plus, Trash2 } from 'lucide-react';

export function MasterLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fields, setFields] = useState<LeadField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ leadId: string; fieldKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('leads-changes-master')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [leadsResult, fieldsResult] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase.from('lead_fields').select('*').order('created_at', { ascending: true }),
      ]);

      if (leadsResult.error) throw leadsResult.error;
      if (fieldsResult.error) throw fieldsResult.error;

      setLeads(leadsResult.data || []);
      setFields(fieldsResult.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCellClick = (lead: Lead, fieldKey: string) => {
    setEditingCell({ leadId: lead.id, fieldKey });
    setEditValue((lead as any)[fieldKey] || '');
  };

  const handleCellUpdate = async (overrideValue?: string) => {
    if (!editingCell) return;

    try {
      const nextValue = overrideValue ?? editValue;
      const { error } = await supabase
        .from('leads')
        .update({ [editingCell.fieldKey]: nextValue || null })
        .eq('id', editingCell.leadId);

      if (error) throw error;

      setLeads(leads.map(lead =>
        lead.id === editingCell.leadId
          ? { ...lead, [editingCell.fieldKey]: nextValue || null }
          : lead
      ));
    } catch (error) {
      console.error('Error updating cell:', error);
    } finally {
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleAddLead = async () => {
    try {
      const newLead = { name: 'New Lead', outreach_method: 'email' };
      const { data, error } = await supabase
        .from('leads')
        .insert([newLead])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setLeads([data, ...leads]);
      }
    } catch (error) {
      console.error('Error adding lead:', error);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;

    try {
      const { error } = await supabase.from('leads').delete().eq('id', leadId);
      if (error) throw error;
      setLeads(leads.filter(lead => lead.id !== leadId));
    } catch (error) {
      console.error('Error deleting lead:', error);
    }
  };

  if (loading) {
    return <div className="text-gray-600">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">All Leads</h2>
        <button
          onClick={handleAddLead}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Lead
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
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 1} className="px-6 py-4 text-center text-gray-500">
                    No leads yet. Click "Add Lead" to get started.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    {fields.map((field) => {
                      const isSelect = isSelectField(field.field_key, field.type);
                      return (
                        <td
                          key={field.id}
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer hover:bg-blue-50"
                          onClick={() => handleCellClick(lead, field.field_key)}
                        >
                          {editingCell?.leadId === lead.id && editingCell?.fieldKey === field.field_key ? (
                            isSelect ? (
                              <select
                                value={editValue}
                                onChange={(e) => {
                                  setEditValue(e.target.value);
                                  handleCellUpdate(e.target.value);
                                }}
                                autoFocus
                                className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">-</option>
                                {getSelectOptions(field.field_key).map(option => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleCellUpdate()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellUpdate();
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                autoFocus
                                className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            )
                          ) : (
                            <span>{(lead as any)[field.field_key] || '-'}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleDeleteLead(lead.id)}
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

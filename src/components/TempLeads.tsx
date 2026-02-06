import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase, Lead, LeadField } from '../lib/supabase';
import { isSelectField } from '../lib/leadFieldConfig';
import { AddLeadModal } from './AddLeadModal';
import { parseClipboard } from '../lib/pasteGrid';

type TempLeadsProps = {
  onImport: () => void;
  outreachOptions: { key: string; label: string }[];
};

type DuplicateResult = {
  original: Lead;
  reason: string;
  matchedWith: string;
};

export function TempLeads({ onImport, outreachOptions }: TempLeadsProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fields, setFields] = useState<LeadField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ leadId: string; fieldKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddLead, setShowAddLead] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ leadId: string; fieldKey: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMethod, setBulkMethod] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [leadsResult, fieldsResult] = await Promise.all([
        supabase.from('temp_leads').select('*').order('created_at', { ascending: true }),
        supabase.from('lead_fields').select('*').order('created_at', { ascending: true }),
      ]);

      if (leadsResult.error) throw leadsResult.error;
      if (fieldsResult.error) throw fieldsResult.error;

      setLeads(leadsResult.data || []);
      setFields(fieldsResult.data || []);
    } catch (error) {
      console.error('Error loading temp leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCellClick = (lead: Lead, fieldKey: string) => {
    setEditingCell({ leadId: lead.id, fieldKey });
    setSelectedCell({ leadId: lead.id, fieldKey });
    const value = (lead as Record<string, string | null>)[fieldKey];
    setEditValue(value || '');
  };

  const handleCellUpdate = async (overrideValue?: string) => {
    if (!editingCell) return;

    try {
      const nextValue = overrideValue ?? editValue;
      const { error } = await supabase
        .from('temp_leads')
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

  const handlePaste = async (leadId: string, fieldKey: string, text: string) => {
    const matrix = parseClipboard(text);
    if (matrix.length === 0) return;

    const startRowIndex = leads.findIndex((lead) => lead.id === leadId);
    const fieldIndex = fields.findIndex((field) => field.field_key === fieldKey);
    if (startRowIndex === -1 || fieldIndex === -1) return;

    const nextLeads = [...leads];
    const baseColumns = new Set(['name', 'email', 'phone', 'website', 'outreach_method']);
    for (const field of fields) {
      if (!baseColumns.has(field.field_key)) {
        await supabase.rpc('add_lead_column', { column_name: field.field_key, column_type: 'text' });
      }
    }

    const updates: Promise<unknown>[] = [];
    const inserts: Record<string, string | null>[] = [];

    for (let r = 0; r < matrix.length; r += 1) {
      const rowIndex = startRowIndex + r;
      const updatesRow: Record<string, string | null> = {};

      for (let c = 0; c < matrix[r].length; c += 1) {
        const colIndex = fieldIndex + c;
        if (colIndex >= fields.length) break;
        const targetField = fields[colIndex];
        const value = matrix[r][c]?.trim() ?? '';
        updatesRow[targetField.field_key] = value.length > 0 ? value : null;
      }

      if (rowIndex < nextLeads.length) {
        const lead = nextLeads[rowIndex];
        if (Object.keys(updatesRow).length > 0) {
          nextLeads[rowIndex] = { ...lead, ...updatesRow };
          updates.push(Promise.resolve(supabase.from('temp_leads').update(updatesRow).eq('id', lead.id)));
        }
      } else {
        const payload: Record<string, string | null> = { name: 'New Lead', outreach_method: null };
        for (const [key, val] of Object.entries(updatesRow)) {
          payload[key] = val;
        }
        inserts.push(payload);
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
    if (inserts.length > 0) {
      const { data } = await supabase.from('temp_leads').insert(inserts).select();
      if (data) nextLeads.push(...data);
    }

    setLeads(nextLeads);
  };

  const handleGridPaste = async (text: string) => {
    const matrix = parseClipboard(text);
    if (matrix.length === 0) return;

    if (leads.length === 0 && fields.length > 0) {
      const baseColumns = new Set(['name', 'email', 'phone', 'website', 'outreach_method']);
      for (const field of fields) {
        if (!baseColumns.has(field.field_key)) {
          await supabase.rpc('add_lead_column', { column_name: field.field_key, column_type: 'text' });
        }
      }
      const inserts = matrix.map((row) => {
        const payload: Record<string, string | null> = { name: 'New Lead', outreach_method: null };
        for (let c = 0; c < row.length; c += 1) {
          const field = fields[c];
          if (!field) break;
          const value = row[c]?.trim() ?? '';
          payload[field.field_key] = value.length > 0 ? value : null;
        }
        return payload;
      });
      const { data } = await supabase.from('temp_leads').insert(inserts).select();
      if (data) setLeads(data);
      return;
    }

    const anchor = selectedCell || (leads[0] && fields[0] ? { leadId: leads[0].id, fieldKey: fields[0].field_key } : null);
    if (!anchor) return;
    handlePaste(anchor.leadId, anchor.fieldKey, text);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((lead) => lead.id)));
    }
  };

  const toggleSelect = (leadId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const applyBulkMethod = async () => {
    if (!bulkMethod || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from('temp_leads')
      .update({ outreach_method: bulkMethod })
      .in('id', ids);
    if (!error) {
      setLeads((prev) =>
        prev.map((lead) => (selectedIds.has(lead.id) ? { ...lead, outreach_method: bulkMethod } : lead))
      );
      setSelectedIds(new Set());
      setBulkMethod('');
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} leads?`)) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('temp_leads').delete().in('id', ids);
    if (!error) {
      setLeads((prev) => prev.filter((lead) => !selectedIds.has(lead.id)));
      setSelectedIds(new Set());
    }
  };

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => {
      const hay = [
        lead.name,
        lead.email,
        lead.phone,
        lead.website,
        lead.outreach_method,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leads, searchQuery]);

  const addRemainingToMaster = async () => {
    if (leads.length === 0) return;
    const baseColumns = new Set(['name', 'email', 'phone', 'website', 'outreach_method']);
    for (const field of fields) {
      if (!baseColumns.has(field.field_key)) {
        await supabase.rpc('add_lead_column', { column_name: field.field_key, column_type: 'text' });
      }
    }

      const rows = leads.map((lead) => {
        const leadRecord = lead as Record<string, string | null>;
        const row: Record<string, string | null> = {
          name: lead.name || 'Unknown',
          email: lead.email || null,
          phone: lead.phone || null,
          website: lead.website || null,
          outreach_method: leadRecord.outreach_method || null,
        };
        fields.forEach((field) => {
          const value = leadRecord[field.field_key];
          if (!baseColumns.has(field.field_key)) {
            row[field.field_key] = value ?? null;
          }
        });
        return row;
    });

    const { error } = await supabase.from('leads').insert(rows);
    if (!error) {
      await supabase.from('temp_leads').delete().in('id', leads.map((l) => l.id));
      setLeads([]);
      setDuplicates([]);
      onImport();
    }
  };

  const handleAddLead = () => {
    setShowAddLead(true);
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;

    try {
      const { error } = await supabase.from('temp_leads').delete().eq('id', leadId);
      if (error) throw error;
      setLeads(leads.filter(lead => lead.id !== leadId));
    } catch (error) {
      console.error('Error deleting lead:', error);
    }
  };

  const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || '';
  const normalizePhone = (value?: string | null) => value?.replace(/\D/g, '') || '';
  const normalizeWebsite = (value?: string | null) => value?.trim().toLowerCase() || '';

  const checkDuplicates = async () => {
    setChecking(true);
    try {
      const { data: masterLeads, error } = await supabase
        .from('leads')
        .select('id,name,email,phone,website');
      if (error) throw error;

      const existingByEmail = new Map<string, Lead>();
      const existingByPhone = new Map<string, Lead>();
      const existingByWebsite = new Map<string, Lead>();

      (masterLeads || []).forEach((lead) => {
        const email = normalizeEmail(lead.email);
        const phone = normalizePhone(lead.phone);
        const website = normalizeWebsite(lead.website);
        if (email) existingByEmail.set(email, lead as Lead);
        if (phone) existingByPhone.set(phone, lead as Lead);
        if (website) existingByWebsite.set(website, lead as Lead);
      });

      const dupes: DuplicateResult[] = [];
      const toRemove: string[] = [];

      leads.forEach((tempLead) => {
        const email = normalizeEmail(tempLead.email);
        const phone = normalizePhone(tempLead.phone);
        const website = normalizeWebsite(tempLead.website);

        const existing =
          (email && existingByEmail.get(email)) ||
          (phone && existingByPhone.get(phone)) ||
          (website && existingByWebsite.get(website));

        if (existing) {
          const reason = email && existingByEmail.get(email)
            ? 'email'
            : phone && existingByPhone.get(phone)
            ? 'phone'
            : 'website';
          dupes.push({
            original: tempLead,
            reason,
            matchedWith: existing.name || 'Unknown',
          });
          toRemove.push(tempLead.id);
        }
      });

      if (toRemove.length > 0) {
        await supabase.from('temp_leads').delete().in('id', toRemove);
      }

      setDuplicates(dupes);
      if (toRemove.length > 0) {
        setLeads(leads.filter((lead) => !toRemove.includes(lead.id)));
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">Temp Leads</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={checkDuplicates}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 bg-purple-900 text-white rounded-md hover:bg-purple-800 text-sm font-medium disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Check Duplicates'}
          </button>
          <button
            onClick={addRemainingToMaster}
            disabled={leads.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-purple-700 text-white rounded-md hover:bg-purple-600 text-sm font-medium disabled:opacity-50"
          >
            Add Remaining to Master
          </button>
          <button
            onClick={handleAddLead}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-500 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 text-sm">
          <span className="text-gray-300">{selectedIds.size} selected</span>
          <select
            value={bulkMethod}
            onChange={(e) => setBulkMethod(e.target.value)}
            className="px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-white"
          >
            <option value="">Set outreach method...</option>
            {outreachOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulkMethod}
            className="px-3 py-1.5 rounded-md bg-purple-800 text-white hover:bg-purple-700"
          >
            Apply
          </button>
          <button
            onClick={deleteSelected}
            className="px-3 py-1.5 rounded-md bg-red-900 text-white hover:bg-red-800"
          >
            Delete
          </button>
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="mb-4 bg-gray-900 border border-gray-700 rounded-md p-4">
          <h3 className="font-semibold text-gray-200 mb-2">
            {duplicates.length} duplicates removed:
          </h3>
          <div className="space-y-1 text-sm text-gray-300">
            {duplicates.slice(0, 10).map((dup, idx) => (
              <div key={idx} className="font-mono">
                {dup.original.name || 'Unknown'} - matched by {dup.reason} with "{dup.matchedWith}"
              </div>
            ))}
            {duplicates.length > 10 && (
              <div className="text-gray-400 italic">
                ... and {duplicates.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="bg-gray-950 rounded-lg shadow overflow-hidden border border-gray-800"
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text.includes('\t') || text.includes('\n')) {
            e.preventDefault();
            handleGridPaste(text);
          }
        }}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === leads.length && leads.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                {fields.map((field) => (
                  <th
                    key={field.id}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
                  >
                    {field.label}
                  </th>
                ))}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-950 divide-y divide-gray-800">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 2} className="px-6 py-4 text-center text-gray-500">
                    No temp leads yet. Paste or add leads to get started.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-900">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                      />
                    </td>
                    {fields.map((field) => {
                      const isSelect = isSelectField(field.field_key, field.type);
                      const selectOptions = field.field_key === 'outreach_method'
                        ? outreachOptions
                        : [];
                      const leadRecord = lead as Record<string, string | null>;
                      const methodLabel =
                        field.field_key === 'outreach_method'
                          ? outreachOptions.find((option) => option.key === leadRecord[field.field_key])?.label
                          : null;
                      return (
                        <td
                          key={field.id}
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-100 cursor-pointer hover:bg-gray-800"
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
                                className="w-full px-2 py-1 border border-purple-500 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-900 text-white"
                              >
                                <option value="">-</option>
                                {selectOptions.map(option => (
                                  <option key={option.key} value={option.key}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onPaste={(e) => {
                                  const text = e.clipboardData.getData('text');
                                  if (text.includes('\t') || text.includes('\n')) {
                                    e.preventDefault();
                                    handlePaste(lead.id, field.field_key, text);
                                    setEditingCell(null);
                                    setEditValue('');
                                  }
                                }}
                                onBlur={() => handleCellUpdate()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellUpdate();
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                autoFocus
                                className="w-full px-2 py-1 border border-purple-500 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-900 text-white"
                              />
                            )
                          ) : (
                            <span>
                              {field.field_key === 'outreach_method'
                                ? methodLabel || '-'
                                : leadRecord[field.field_key] || '-'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleDeleteLead(lead.id)}
                        className="text-red-400 hover:text-red-300"
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

      {showAddLead && (
        <AddLeadModal
          fields={fields}
          outreachOptions={outreachOptions}
          tableName="temp_leads"
          onClose={() => setShowAddLead(false)}
          onSuccess={() => {
            setShowAddLead(false);
            loadData();
            onImport();
          }}
        />
      )}
    </div>
  );
}

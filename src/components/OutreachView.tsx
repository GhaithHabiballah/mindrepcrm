import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Lead, LeadField } from '../lib/supabase';
import { Plus, Trash2 } from 'lucide-react';
import { AddLeadModal } from './AddLeadModal';
import { parseClipboard } from '../lib/pasteGrid';
import { GridPrefs, SavedView, loadGridPrefs, saveGridPrefs, loadViews, saveViews, moveInArray } from '../lib/gridPrefs';
import { isSelectField, isDateField, formatDate } from '../lib/leadFieldConfig';

type OutreachViewProps = {
  method: string;
  label: string;
  outreachOptions: { key: string; label: string }[];
  onUpdate: () => void;
};

export function OutreachView({ method, label, outreachOptions, onUpdate }: OutreachViewProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fields, setFields] = useState<LeadField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ leadId: string; fieldKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddLead, setShowAddLead] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ leadId: string; fieldKey: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMethod, setBulkMethod] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [prefs, setPrefs] = useState<GridPrefs>(() => loadGridPrefs(`outreach:${method}`));
  const [views, setViews] = useState<SavedView[]>(() => loadViews(`outreach:${method}`));
  const [showColumns, setShowColumns] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const [activeView, setActiveView] = useState<string>('');
  const [showHint, setShowHint] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsResult, fieldsResult] = await Promise.all([
        supabase
          .from('leads')
          .select('*')
          .eq('outreach_method', method)
          .order('created_at', { ascending: true }),
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
  }, [method]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel(`leads-changes-${method}`)
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
  }, [method, loadData]);

  const handleCellClick = (lead: Lead, fieldKey: string) => {
    setEditingCell({ leadId: lead.id, fieldKey });
    setSelectedCell({ leadId: lead.id, fieldKey });
    const value = (lead as Record<string, string | null>)[fieldKey];
    setEditValue(value || '');
  };

  const selectCellByIndex = (rowIndex: number, colIndex: number) => {
    const row = filteredLeads[rowIndex];
    const col = orderedFields[colIndex];
    if (!row || !col) return;
    setSelectedCell({ leadId: row.id, fieldKey: col.field_key });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingCell) return;
    if (!selectedCell) {
      if (filteredLeads.length > 0 && orderedFields.length > 0) {
        selectCellByIndex(0, 0);
      }
      return;
    }

    const rowIndex = filteredLeads.findIndex((l) => l.id === selectedCell.leadId);
    const colIndex = orderedFields.findIndex((f) => f.field_key === selectedCell.fieldKey);
    if (rowIndex === -1 || colIndex === -1) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectCellByIndex(Math.min(rowIndex + 1, filteredLeads.length - 1), colIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectCellByIndex(Math.max(rowIndex - 1, 0), colIndex);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectCellByIndex(rowIndex, Math.min(colIndex + 1, orderedFields.length - 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectCellByIndex(rowIndex, Math.max(colIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const lead = filteredLeads[rowIndex];
      const fieldKey = orderedFields[colIndex].field_key;
      setEditingCell({ leadId: lead.id, fieldKey });
      const value = (lead as Record<string, string | null>)[fieldKey];
      setEditValue(value || '');
    }
  };

  const focusGridForPaste = () => {
    if (!selectedCell && filteredLeads.length > 0 && orderedFields.length > 0) {
      selectCellByIndex(0, 0);
    }
    gridRef.current?.focus();
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

      setLeads(leads
        .map(lead =>
          lead.id === editingCell.leadId
            ? { ...lead, [editingCell.fieldKey]: nextValue || null }
            : lead
        )
        .filter(lead => lead.outreach_method === method)
      );
      onUpdate();
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
    const fieldIndex = orderedFields.findIndex((field) => field.field_key === fieldKey);
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
        if (colIndex >= orderedFields.length) break;
        const targetField = orderedFields[colIndex];
        const value = matrix[r][c]?.trim() ?? '';
        updatesRow[targetField.field_key] = value.length > 0 ? value : null;
      }

      if (rowIndex < nextLeads.length) {
        const lead = nextLeads[rowIndex];
        if (Object.keys(updatesRow).length > 0) {
          nextLeads[rowIndex] = { ...lead, ...updatesRow };
          updates.push(Promise.resolve(supabase.from('leads').update(updatesRow).eq('id', lead.id)));
        }
      } else if (prefs.autoAddRows) {
        const payload: Record<string, string | null> = { name: 'New Lead', outreach_method: method };
        for (const [key, val] of Object.entries(updatesRow)) {
          payload[key] = val;
        }
        if (!payload.outreach_method) payload.outreach_method = method;
        inserts.push(payload);
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
    if (inserts.length > 0) {
      const { data } = await supabase.from('leads').insert(inserts).select();
      if (data) nextLeads.push(...data);
    }

    setLeads(nextLeads);
    onUpdate();
  };

  const handleGridPaste = async (text: string) => {
    const matrix = parseClipboard(text);
    if (matrix.length === 0) return;

    if (leads.length === 0 && fields.length > 0) {
      if (!prefs.autoAddRows) return;
      const baseColumns = new Set(['name', 'email', 'phone', 'website', 'outreach_method']);
      for (const field of fields) {
        if (!baseColumns.has(field.field_key)) {
          await supabase.rpc('add_lead_column', { column_name: field.field_key, column_type: 'text' });
        }
      }
      const inserts = matrix.map((row) => {
        const payload: Record<string, string | null> = { name: 'New Lead', outreach_method: method };
        for (let c = 0; c < row.length; c += 1) {
          const field = orderedFields[c];
          if (!field) break;
          const value = row[c]?.trim() ?? '';
          payload[field.field_key] = value.length > 0 ? value : null;
        }
        if (!payload.outreach_method) payload.outreach_method = method;
        return payload;
      });
      const { data } = await supabase.from('leads').insert(inserts).select();
      if (data) setLeads(data);
      onUpdate();
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
      .from('leads')
      .update({ outreach_method: bulkMethod })
      .in('id', ids);
    if (!error) {
      setLeads((prev) =>
        prev.map((lead) => (selectedIds.has(lead.id) ? { ...lead, outreach_method: bulkMethod } : lead))
      );
      setSelectedIds(new Set());
      setBulkMethod('');
      onUpdate();
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} leads?`)) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('leads').delete().in('id', ids);
    if (!error) {
      setLeads((prev) => prev.filter((lead) => !selectedIds.has(lead.id)));
      setSelectedIds(new Set());
      onUpdate();
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

  const orderedFields = useMemo(() => {
    const order = prefs.order.length > 0 ? prefs.order : fields.map((f) => f.field_key);
    const orderMap = new Map(fields.map((f) => [f.field_key, f]));
    const ordered = order.map((key) => orderMap.get(key)).filter(Boolean) as LeadField[];
    const missing = fields.filter((f) => !order.includes(f.field_key));
    return [...ordered, ...missing].filter((f) => !prefs.hidden.includes(f.field_key));
  }, [fields, prefs.order, prefs.hidden]);

  const allFieldsOrdered = useMemo(() => {
    const order = prefs.order.length > 0 ? prefs.order : fields.map((f) => f.field_key);
    const orderMap = new Map(fields.map((f) => [f.field_key, f]));
    const ordered = order.map((key) => orderMap.get(key)).filter(Boolean) as LeadField[];
    const missing = fields.filter((f) => !order.includes(f.field_key));
    return [...ordered, ...missing];
  }, [fields, prefs.order]);

  useEffect(() => {
    saveGridPrefs(`outreach:${method}`, prefs);
  }, [prefs, method]);

  useEffect(() => {
    saveViews(`outreach:${method}`, views);
  }, [views, method]);

  const toggleFieldVisibility = (fieldKey: string) => {
    setPrefs((prev) => {
      const hidden = new Set(prev.hidden);
      if (hidden.has(fieldKey)) hidden.delete(fieldKey);
      else hidden.add(fieldKey);
      return { ...prev, hidden: Array.from(hidden) };
    });
  };

  const moveField = (fieldKey: string, direction: 'up' | 'down') => {
    setPrefs((prev) => {
      const order = prev.order.length > 0 ? [...prev.order] : fields.map((f) => f.field_key);
      const idx = order.indexOf(fieldKey);
      const nextIndex = direction === 'up' ? idx - 1 : idx + 1;
      return { ...prev, order: moveInArray(order, idx, nextIndex) };
    });
  };

  const saveCurrentView = () => {
    const name = prompt('Name this view');
    if (!name) return;
    const newView: SavedView = {
      name,
      searchQuery,
      order: prefs.order,
      hidden: prefs.hidden,
      autoAddRows: prefs.autoAddRows,
    };
    setViews((prev) => [...prev.filter((v) => v.name !== name), newView]);
    setActiveView(name);
  };

  const applyView = (name: string) => {
    const view = views.find((v) => v.name === name);
    if (!view) return;
    setSearchQuery(view.searchQuery);
    setPrefs((prev) => ({
      ...prev,
      order: view.order,
      hidden: view.hidden,
      autoAddRows: view.autoAddRows,
    }));
    setActiveView(name);
  };

  const deleteView = (name: string) => {
    setViews((prev) => prev.filter((v) => v.name !== name));
    if (activeView === name) setActiveView('');
  };

  const handleAddLead = () => {
    setShowAddLead(true);
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;

    try {
      const { error } = await supabase.from('leads').delete().eq('id', leadId);
      if (error) throw error;
      setLeads(leads.filter(lead => lead.id !== leadId));
      onUpdate();
    } catch (error) {
      console.error('Error deleting lead:', error);
    }
  };

  if (loading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">{label} Outreach</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={() => setShowHint((prev) => !prev)}
            className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 text-sm hover:bg-gray-700"
          >
            Hint
          </button>
          <button
            onClick={focusGridForPaste}
            className="px-3 py-2 rounded-md bg-purple-700 text-white text-sm hover:bg-purple-600"
          >
            Paste
          </button>
          <div className="relative">
            <button
              onClick={() => setShowColumns((prev) => !prev)}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 text-sm hover:bg-gray-700"
            >
              Columns
            </button>
            {showColumns && (
              <div className="absolute right-0 mt-2 w-64 bg-gray-950 border border-gray-800 rounded-md p-3 z-10">
                <div className="text-xs text-gray-400 mb-2">Show / reorder</div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {allFieldsOrdered.map((field) => (
                    <div key={field.field_key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!prefs.hidden.includes(field.field_key)}
                        onChange={() => toggleFieldVisibility(field.field_key)}
                      />
                      <span className="text-sm text-gray-200 flex-1">{field.label}</span>
                      <button
                        onClick={() => moveField(field.field_key, 'up')}
                        className="text-gray-400 hover:text-white text-xs"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveField(field.field_key, 'down')}
                        className="text-gray-400 hover:text-white text-xs"
                      >
                        ▼
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>Auto‑add rows on paste</span>
                  <input
                    type="checkbox"
                    checked={prefs.autoAddRows}
                    onChange={(e) => setPrefs((prev) => ({ ...prev, autoAddRows: e.target.checked }))}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowViews((prev) => !prev)}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 text-sm hover:bg-gray-700"
            >
              Views
            </button>
            {showViews && (
              <div className="absolute right-0 mt-2 w-56 bg-gray-950 border border-gray-800 rounded-md p-3 z-10">
                <button
                  onClick={saveCurrentView}
                  className="w-full text-left text-sm text-purple-200 hover:text-white mb-2"
                >
                  Save current view
                </button>
                <div className="space-y-2">
                  {views.length === 0 && (
                    <div className="text-xs text-gray-500">No saved views</div>
                  )}
                  {views.map((view) => (
                    <div key={view.name} className="flex items-center gap-2">
                      <button
                        onClick={() => applyView(view.name)}
                        className={`flex-1 text-left text-sm ${
                          activeView === view.name ? 'text-white' : 'text-gray-300'
                        } hover:text-white`}
                      >
                        {view.name}
                      </button>
                      <button
                        onClick={() => deleteView(view.name)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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

      {showHint && (
        <div className="mb-3 text-xs text-gray-300 bg-gray-900 border border-gray-800 rounded-md p-2">
          Click any cell, then paste (Ctrl/Cmd+V). Multi‑row and multi‑column paste is supported.
        </div>
      )}

      <div className="mb-3 text-xs text-gray-400">
        Tip: Paste anywhere in the grid (Ctrl+V). Rows will auto‑add if enabled.
      </div>

      <div
        className="bg-gray-950 rounded-lg shadow overflow-hidden border border-gray-800"
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text.includes('\t') || text.includes('\n')) {
            e.preventDefault();
            handleGridPaste(text);
          }
        }}
        ref={gridRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
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
                {orderedFields.map((field) => (
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
                  <td colSpan={orderedFields.length + 2} className="px-6 py-4 text-center text-gray-500">
                    No {method} outreach leads yet. Click "Add Lead" to get started.
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
                    {orderedFields.map((field) => {
                      const isSelect = isSelectField(field.field_key, field.type);
                      const isDate = isDateField(field.field_key, field.type);
                      const selectOptions =
                        field.field_key === 'outreach_method'
                          ? outreachOptions
                          : [];
                      const leadRecord = lead as Record<string, string | null>;
                      const methodLabel =
                        field.field_key === 'outreach_method'
                          ? outreachOptions.find((option) => option.key === leadRecord[field.field_key])?.label
                          : null;

                      if (isDate) {
                        return (
                          <td
                            key={field.id}
                            className="px-6 py-4 whitespace-nowrap text-sm text-gray-100"
                          >
                            {formatDate(leadRecord[field.field_key])}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={field.id}
                          className={`px-6 py-4 whitespace-nowrap text-sm text-gray-100 cursor-pointer hover:bg-gray-800 ${
                            selectedCell?.leadId === lead.id && selectedCell?.fieldKey === field.field_key
                              ? 'ring-1 ring-purple-500'
                              : ''
                          }`}
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
            <tfoot>
              <tr>
                <td colSpan={orderedFields.length + 2} className="px-6 py-3">
                  <button
                    onClick={handleAddLead}
                    className="text-sm text-purple-300 hover:text-white"
                  >
                    + Add row
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showAddLead && (
        <AddLeadModal
          fields={fields}
          outreachOptions={outreachOptions}
          defaultOutreachMethod={method}
          onClose={() => setShowAddLead(false)}
          onSuccess={() => {
            setShowAddLead(false);
            loadData();
            onUpdate();
          }}
        />
      )}
    </div>
  );
}

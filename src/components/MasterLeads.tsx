import { useEffect, useMemo, useState } from 'react';
import { EditListItem, GridCellKind, GridSelection, Item } from '@glideapps/glide-data-grid';
import { supabase, Lead, LeadField } from '../lib/supabase';
import { Plus } from 'lucide-react';
import { AddLeadModal } from './AddLeadModal';
import { GridPrefs, SavedView, loadGridPrefs, saveGridPrefs, loadViews, saveViews, moveInArray } from '../lib/gridPrefs';
import { GlideLeadGrid } from './GlideLeadGrid';

type MasterLeadsProps = {
  outreachOptions: { key: string; label: string }[];
};

type UndoAction = {
  changes: { id: string; fieldKey: string; prev: string | null; next: string | null }[];
  insertedRows: Lead[];
};

export function MasterLeads({ outreachOptions }: MasterLeadsProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fields, setFields] = useState<LeadField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddLead, setShowAddLead] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMethod, setBulkMethod] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [prefs, setPrefs] = useState<GridPrefs>(() => loadGridPrefs('master'));
  const [views, setViews] = useState<SavedView[]>(() => loadViews('master'));
  const [showColumns, setShowColumns] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const [activeView, setActiveView] = useState<string>('');
  const [showHint, setShowHint] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

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
        supabase.from('leads').select('*').order('created_at', { ascending: true }),
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

  const applyMatrix = async (startRow: number, startCol: number, matrix: string[][]) => {
    if (matrix.length === 0) return;
    const baseColumns = new Set(['name', 'email', 'phone', 'website', 'outreach_method']);
    for (const field of orderedFields) {
      if (!baseColumns.has(field.field_key)) {
        await supabase.rpc('add_lead_column', { column_name: field.field_key, column_type: 'text' });
      }
    }

    const updates: Promise<unknown>[] = [];
    const inserts: Record<string, string | null>[] = [];
    const changes: UndoAction['changes'] = [];

    for (let r = 0; r < matrix.length; r += 1) {
      const rowIndex = startRow + r;
      const updatesRow: Record<string, string | null> = {};
      for (let c = 0; c < matrix[r].length; c += 1) {
        const colIndex = startCol + c;
        if (colIndex >= orderedFields.length) break;
        const targetField = orderedFields[colIndex];
        const value = matrix[r][c]?.trim() ?? '';
        updatesRow[targetField.field_key] = value.length > 0 ? value : null;
      }

      const targetRow = filteredLeads[rowIndex];
      if (targetRow) {
        if (Object.keys(updatesRow).length > 0) {
          for (const [fieldKey, nextVal] of Object.entries(updatesRow)) {
            const prevVal = (targetRow as Record<string, string | null>)[fieldKey] ?? null;
            changes.push({ id: targetRow.id, fieldKey, prev: prevVal, next: nextVal });
          }
          updates.push(Promise.resolve(supabase.from('leads').update(updatesRow).eq('id', targetRow.id)));
        }
      } else if (prefs.autoAddRows) {
        const payload: Record<string, string | null> = { name: 'New Lead', outreach_method: null };
        for (const [key, val] of Object.entries(updatesRow)) {
          payload[key] = val;
        }
        inserts.push(payload);
      }
    }

    if (updates.length > 0) await Promise.all(updates);
    if (inserts.length > 0) {
      const { data } = await supabase.from('leads').insert(inserts).select();
      if (data && data.length > 0) {
        setUndoStack((prev) => [...prev, { changes, insertedRows: data as Lead[] }]);
        setRedoStack([]);
      }
    } else if (changes.length > 0) {
      setUndoStack((prev) => [...prev, { changes, insertedRows: [] }]);
      setRedoStack([]);
    }
    loadData();
  };

  const applyMatrixWithHeaderMap = async (startRow: number, matrix: string[][]) => {
    if (matrix.length < 2) return applyMatrix(startRow, 0, matrix);
    const headerRow = matrix[0].map((value) => value.trim().toLowerCase());
    const fieldMap = new Map<string, number>();
    orderedFields.forEach((field, index) => {
      fieldMap.set(field.field_key.toLowerCase(), index);
      fieldMap.set(field.label.toLowerCase(), index);
    });
    const columnMap = headerRow.map((header) => fieldMap.get(header) ?? -1);
    const matchCount = columnMap.filter((idx) => idx >= 0).length;
    if (matchCount < 2) return applyMatrix(startRow, 0, matrix);

    const dataRows = matrix.slice(1);
    const mapped = dataRows.map((row) => {
      const out = Array.from({ length: orderedFields.length }, () => '');
      row.forEach((cell, idx) => {
        const mappedIndex = columnMap[idx];
        if (mappedIndex >= 0) out[mappedIndex] = cell;
      });
      return out;
    });
    return applyMatrix(startRow, 0, mapped);
  };

  const handleCellsEdited = async (edits: readonly EditListItem[]) => {
    if (edits.length === 0) return;
    const updatesById = new Map<string, Record<string, string | null>>();
    const changes: UndoAction['changes'] = [];

    for (const edit of edits) {
      if (edit.value.kind !== GridCellKind.Text) continue;
      const [col, row] = edit.location;
      const lead = filteredLeads[row];
      const field = orderedFields[col];
      if (!lead || !field) continue;
      let nextValue = edit.value.data ?? '';
      if (field.field_key === 'outreach_method') {
        const match = outreachOptions.find(
          (option) =>
            option.key.toLowerCase() === nextValue.toLowerCase() ||
            option.label.toLowerCase() === nextValue.toLowerCase()
        );
        if (match) nextValue = match.key;
      }
      const payload = updatesById.get(lead.id) || {};
      const prevVal = (lead as Record<string, string | null>)[field.field_key] ?? null;
      payload[field.field_key] = nextValue.length > 0 ? nextValue : null;
      updatesById.set(lead.id, payload);
      changes.push({ id: lead.id, fieldKey: field.field_key, prev: prevVal, next: payload[field.field_key] });
    }

    if (updatesById.size === 0) return;
    await Promise.all(
      Array.from(updatesById.entries()).map(([id, payload]) =>
        supabase.from('leads').update(payload).eq('id', id)
      )
    );
    setUndoStack((prev) => [...prev, { changes, insertedRows: [] }]);
    setRedoStack([]);
    loadData();
  };

  const handlePaste = (target: Item, values: readonly (readonly string[])[]) => {
    const matrix = values.map((row) => row.map((cell) => cell ?? ''));
    if (matrix.length === 0) return false;
    const startCol = target[0];
    const startRow = target[1];
    if (prefs.pasteHeaderMap) {
      void applyMatrixWithHeaderMap(startRow, matrix as string[][]);
      return false;
    }
    void applyMatrix(startRow, startCol, matrix as string[][]);
    return false;
  };

  const handleDelete = (selection: GridSelection) => {
    if (!selection.current) return true;
    const range = selection.current.range;
    const matrix = Array.from({ length: range.height }, () =>
      Array.from({ length: range.width }, () => '')
    );
    void applyMatrix(range.y, range.x, matrix);
    return true;
  };

  const focusGridForPaste = () => {
    const el = document.querySelector('[data-glide-grid]') as HTMLElement | null;
    el?.focus();
  };

  const applyUndoAction = async (action: UndoAction, useNext: boolean) => {
    if (action.insertedRows.length > 0) {
      if (useNext) {
        await supabase.from('leads').insert(action.insertedRows);
      } else {
        const ids = action.insertedRows.map((row) => row.id);
        if (ids.length > 0) await supabase.from('leads').delete().in('id', ids);
      }
    }
    if (action.changes.length > 0) {
      const updatesById = new Map<string, Record<string, string | null>>();
      action.changes.forEach((change) => {
        const payload = updatesById.get(change.id) || {};
        payload[change.fieldKey] = useNext ? change.next : change.prev;
        updatesById.set(change.id, payload);
      });
      await Promise.all(
        Array.from(updatesById.entries()).map(([id, payload]) =>
          supabase.from('leads').update(payload).eq('id', id)
        )
      );
    }
    loadData();
  };

  const handleUndo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
    await applyUndoAction(last, false);
  };

  const handleRedo = async () => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, last]);
    await applyUndoAction(last, true);
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
    saveGridPrefs('master', prefs);
  }, [prefs]);

  useEffect(() => {
    saveViews('master', views);
  }, [views]);


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
      widths: prefs.widths,
      copyHeaders: prefs.copyHeaders,
      pasteHeaderMap: prefs.pasteHeaderMap,
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
      widths: view.widths ?? {},
      copyHeaders: view.copyHeaders ?? false,
      pasteHeaderMap: view.pasteHeaderMap ?? false,
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

  if (loading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">All Leads</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            Redo
          </button>
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
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>Copy headers</span>
                  <input
                    type="checkbox"
                    checked={prefs.copyHeaders}
                    onChange={(e) => setPrefs((prev) => ({ ...prev, copyHeaders: e.target.checked }))}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>Paste header map</span>
                  <input
                    type="checkbox"
                    checked={prefs.pasteHeaderMap}
                    onChange={(e) => setPrefs((prev) => ({ ...prev, pasteHeaderMap: e.target.checked }))}
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
      <div className="bg-gray-950 rounded-lg shadow overflow-hidden border border-gray-800">
        <GlideLeadGrid
          rows={filteredLeads}
          orderedFields={orderedFields}
          outreachOptions={outreachOptions}
          prefs={prefs}
          setPrefs={setPrefs}
          onCellsEdited={handleCellsEdited}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onSelectedIdsChange={setSelectedIds}
        />
      </div>

      {showAddLead && (
        <AddLeadModal
          fields={fields}
          outreachOptions={outreachOptions}
          onClose={() => setShowAddLead(false)}
          onSuccess={() => {
            setShowAddLead(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { EditListItem, FillPatternEventArgs, GridCellKind, GridSelection, Item } from '@glideapps/glide-data-grid';
import { Plus } from 'lucide-react';
import { supabase, Lead, LeadField } from '../lib/supabase';
import { AddLeadModal } from './AddLeadModal';
import { GridPrefs, SavedView, loadGridPrefs, saveGridPrefs, loadViews, saveViews, moveInArray } from '../lib/gridPrefs';
import { GlideLeadGrid } from './GlideLeadGrid';
import { CellNoteModal } from './CellNoteModal';

type TempLeadsProps = {
  onImport: () => void;
  outreachOptions: { key: string; label: string }[];
};

type DuplicateResult = {
  original: Lead;
  reason: string;
  matchedWith: string;
};

type UndoAction = {
  changes: { id: string; fieldKey: string; prev: string | null; next: string | null }[];
  insertedRows: Lead[];
};

type SortRule = {
  fieldKey: string;
  dir: 'asc' | 'desc';
};

export function TempLeads({ onImport, outreachOptions }: TempLeadsProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fields, setFields] = useState<LeadField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddLead, setShowAddLead] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMethod, setBulkMethod] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [prefs, setPrefs] = useState<GridPrefs>(() => loadGridPrefs('temp'));
  const [views, setViews] = useState<SavedView[]>(() => loadViews('temp'));
  const [showColumns, setShowColumns] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<string>('');
  const [showHint, setShowHint] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [clearAfterImport, setClearAfterImport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('temp:clearAfterImport') === 'true';
  });
  const formatOptions = ['text', 'number', 'date', 'phone'];
  const [noteTarget, setNoteTarget] = useState<{
    leadId: string;
    fieldKey: string;
    fieldLabel: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const undoRaw = localStorage.getItem('undo:temp');
    const redoRaw = localStorage.getItem('redo:temp');
    if (undoRaw) {
      try {
        setUndoStack(JSON.parse(undoRaw));
      } catch {
        // ignore
      }
    }
    if (redoRaw) {
      try {
        setRedoStack(JSON.parse(redoRaw));
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('undo:temp', JSON.stringify(undoStack.slice(-50)));
  }, [undoStack]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('redo:temp', JSON.stringify(redoStack.slice(-50)));
  }, [redoStack]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('temp:clearAfterImport', clearAfterImport ? 'true' : 'false');
  }, [clearAfterImport]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [leadsResult, fieldsResult] = await Promise.all([
        supabase
          .from('temp_leads')
          .select('*')
          .order('pinned', { ascending: false })
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
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

  const applyMatrix = async (startRow: number, startCol: number, matrix: string[][]) => {
    if (matrix.length === 0) return;
    const baseColumns = new Set(['name', 'email', 'phone', 'website', 'outreach_method']);
    let nextSortOrder =
      Math.max(0, ...leads.map((lead) => (lead.sort_order == null ? 0 : lead.sort_order))) + 1;
    for (const field of orderedFields) {
      if (!baseColumns.has(field.field_key)) {
        await supabase.rpc('add_lead_column', { column_name: field.field_key, column_type: 'text' });
      }
    }

    const updates: Promise<unknown>[] = [];
    const inserts: Record<string, string | number | null>[] = [];
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
          updates.push(Promise.resolve(supabase.from('temp_leads').update(updatesRow).eq('id', targetRow.id)));
        }
      } else if (prefs.autoAddRows) {
        const payload: Record<string, string | null | number> = {
          name: 'New Lead',
          outreach_method: null,
          sort_order: nextSortOrder,
        };
        nextSortOrder += 1;
        for (const [key, val] of Object.entries(updatesRow)) {
          payload[key] = val;
        }
        inserts.push(payload);
      }
    }

    if (updates.length > 0) await Promise.all(updates);
    if (inserts.length > 0) {
      const { data } = await supabase.from('temp_leads').insert(inserts).select();
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
        supabase.from('temp_leads').update(payload).eq('id', id)
      )
    );
    setUndoStack((prev) => [...prev, { changes, insertedRows: [] }]);
    setRedoStack([]);
    loadData();
  };

  const handlePaste = (target: Item, values: readonly (readonly string[])[]) => {
    if (!Array.isArray(target)) return false;
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

  const handleFillPattern = (event: FillPatternEventArgs) => {
    const { patternSource, fillDestination } = event;
    const getRaw = (row: number, col: number) => {
      const field = orderedFields[col];
      const lead = filteredLeads[row];
      return field && lead ? ((lead as Record<string, string | null>)[field.field_key] ?? '') : '';
    };
    const parseTrailing = (value: string) => {
      const match = value.match(/^(.*?)(\d+)$/);
      if (!match) return null;
      return { prefix: match[1], num: Number(match[2]), width: match[2].length };
    };

    const matrix: string[][] = [];
    const isSingleCol = patternSource.width === 1;
    const isSingleRow = patternSource.height === 1;

    for (let r = 0; r < fillDestination.height; r += 1) {
      const row: string[] = [];
      for (let c = 0; c < fillDestination.width; c += 1) {
        let value = '';
        if (isSingleCol) {
          const baseValues = Array.from({ length: patternSource.height }, (_, i) =>
            getRaw(patternSource.y + i, patternSource.x)
          );
          const first = baseValues[0] ?? '';
          const second = baseValues[1] ?? '';
          const n1 = Number(first.replace(/,/g, ''));
          const n2 = Number(second.replace(/,/g, ''));
          const d1 = new Date(first);
          const d2 = new Date(second);
          const t1 = parseTrailing(first);
          const t2 = parseTrailing(second);
          const step =
            Number.isFinite(n1) && Number.isFinite(n2) && first && second
              ? n2 - n1
              : t1 && t2
              ? t2.num - t1.num
              : !Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime()) && first && second
              ? (d2.getTime() - d1.getTime()) / 86400000
              : 1;
          if (Number.isFinite(n1) && first) {
            value = (n1 + step * r).toString();
          } else if (t1) {
            const nextNum = t1.num + step * r;
            value = `${t1.prefix}${String(Math.round(nextNum)).padStart(t1.width, '0')}`;
          } else if (!Number.isNaN(d1.getTime()) && first) {
            const next = new Date(d1.getTime() + step * r * 86400000);
            value = next.toISOString().slice(0, 10);
          } else {
            value = baseValues[r % baseValues.length] ?? '';
          }
        } else if (isSingleRow) {
          const baseValues = Array.from({ length: patternSource.width }, (_, i) =>
            getRaw(patternSource.y, patternSource.x + i)
          );
          const first = baseValues[0] ?? '';
          const second = baseValues[1] ?? '';
          const n1 = Number(first.replace(/,/g, ''));
          const n2 = Number(second.replace(/,/g, ''));
          const d1 = new Date(first);
          const d2 = new Date(second);
          const t1 = parseTrailing(first);
          const t2 = parseTrailing(second);
          const step =
            Number.isFinite(n1) && Number.isFinite(n2) && first && second
              ? n2 - n1
              : t1 && t2
              ? t2.num - t1.num
              : !Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime()) && first && second
              ? (d2.getTime() - d1.getTime()) / 86400000
              : 1;
          if (Number.isFinite(n1) && first) {
            value = (n1 + step * c).toString();
          } else if (t1) {
            const nextNum = t1.num + step * c;
            value = `${t1.prefix}${String(Math.round(nextNum)).padStart(t1.width, '0')}`;
          } else if (!Number.isNaN(d1.getTime()) && first) {
            const next = new Date(d1.getTime() + step * c * 86400000);
            value = next.toISOString().slice(0, 10);
          } else {
            value = baseValues[c % baseValues.length] ?? '';
          }
        } else {
          const sourceRow = patternSource.y + (r % patternSource.height);
          const sourceCol = patternSource.x + (c % patternSource.width);
          value = getRaw(sourceRow, sourceCol);
        }
        row.push(value);
      }
      matrix.push(row);
    }
    void applyMatrix(fillDestination.y, fillDestination.x, matrix);
  };

  const handleAppendRow = async () => {
    const nextSortOrder =
      Math.max(0, ...leads.map((lead) => (lead.sort_order == null ? 0 : lead.sort_order))) + 1;
    const payload: Record<string, string | null | number> = {
      name: 'New Lead',
      outreach_method: null,
      sort_order: nextSortOrder,
    };
    await supabase.from('temp_leads').insert(payload);
    loadData();
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
        await supabase.from('temp_leads').insert(action.insertedRows);
      } else {
        const ids = action.insertedRows.map((row) => row.id);
        if (ids.length > 0) await supabase.from('temp_leads').delete().in('id', ids);
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
          supabase.from('temp_leads').update(payload).eq('id', id)
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

  const setPinnedForSelected = async (value: boolean) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('temp_leads').update({ pinned: value }).in('id', ids);
    if (!error) {
      setLeads((prev) =>
        prev.map((lead) => (selectedIds.has(lead.id) ? { ...lead, pinned: value } : lead))
      );
      setSelectedIds(new Set());
    }
  };

  const handleHeaderClick = (colIndex: number, event: { shiftKey: boolean }) => {
    const field = orderedFields[colIndex];
    if (!field) return;
    setSorts((prev) => {
      const existingIndex = prev.findIndex((rule) => rule.fieldKey === field.field_key);
      const nextDir = (dir: 'asc' | 'desc') => (dir === 'asc' ? 'desc' : 'asc');
      if (event.shiftKey) {
        if (existingIndex === -1) return [...prev, { fieldKey: field.field_key, dir: 'asc' }];
        const updated = [...prev];
        const current = updated[existingIndex];
        if (current.dir === 'desc') {
          updated.splice(existingIndex, 1);
          return updated;
        }
        updated[existingIndex] = { ...current, dir: nextDir(current.dir) };
        return updated;
      }
      if (existingIndex === -1) return [{ fieldKey: field.field_key, dir: 'asc' }];
      const current = prev[existingIndex];
      if (current.dir === 'desc') return [];
      return [{ fieldKey: field.field_key, dir: nextDir(current.dir) }];
    });
  };

  const handleRowMoved = async (startIndex: number, endIndex: number) => {
    if (sorts.length > 0) {
      if (!confirm('Row reordering clears active sorts. Continue?')) return;
      setSorts([]);
    }
    const reordered = [...filteredLeads];
    const [moved] = reordered.splice(startIndex, 1);
    reordered.splice(endIndex, 0, moved);
    const filteredIds = new Set(reordered.map((lead) => lead.id));
    const remaining = leads.filter((lead) => !filteredIds.has(lead.id));
    const combined = [...reordered, ...remaining];
    await Promise.all(
      combined.map((lead, idx) =>
        supabase.from('temp_leads').update({ sort_order: idx + 1 }).eq('id', lead.id)
      )
    );
    loadData();
  };

  const handleCellContextMenu = (cell: Item) => {
    const [col, row] = cell;
    const field = orderedFields[col];
    const lead = filteredLeads[row];
    if (!field || !lead) return;
    setNoteTarget({ leadId: lead.id, fieldKey: field.field_key, fieldLabel: field.label });
  };

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filterEntries = Object.entries(filters).filter(([, val]) => val.trim().length > 0);
    const indexed = leads.map((lead, idx) => ({ lead, idx }));
    const filtered = indexed.filter(({ lead }) => {
      if (q) {
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
        if (!hay.includes(q)) return false;
      }
      for (const [fieldKey, raw] of filterEntries) {
        const value = ((lead as Record<string, string | null>)[fieldKey] ?? '').toString().toLowerCase();
        if (!value.includes(raw.trim().toLowerCase())) return false;
      }
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      const ap = a.lead.pinned ? 1 : 0;
      const bp = b.lead.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (sorts.length === 0) return a.idx - b.idx;
      for (const rule of sorts) {
        const av = ((a.lead as Record<string, string | null>)[rule.fieldKey] ?? '').toString();
        const bv = ((b.lead as Record<string, string | null>)[rule.fieldKey] ?? '').toString();
        const an = Number(av.replace(/,/g, ''));
        const bn = Number(bv.replace(/,/g, ''));
        let cmp = 0;
        if (!Number.isNaN(an) && !Number.isNaN(bn) && av.trim() !== '' && bv.trim() !== '') {
          cmp = an - bn;
        } else {
          cmp = av.localeCompare(bv);
        }
        if (cmp !== 0) return rule.dir === 'asc' ? cmp : -cmp;
      }
      return a.idx - b.idx;
    });
    return sorted.map((entry) => entry.lead);
  }, [leads, searchQuery, filters, sorts]);

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

  const columnTitleByKey = useMemo(() => {
    const map: Record<string, string> = {};
    const sortIndex = new Map(sorts.map((s, idx) => [s.fieldKey, idx + 1]));
    fields.forEach((field) => {
      const idx = sortIndex.get(field.field_key);
      if (!idx) {
        map[field.field_key] = field.label;
        return;
      }
      const rule = sorts[idx - 1];
      const arrow = rule.dir === 'asc' ? '▲' : '▼';
      const suffix = sorts.length > 1 ? `${arrow}${idx}` : arrow;
      map[field.field_key] = `${field.label} ${suffix}`;
    });
    return map;
  }, [fields, sorts]);

  useEffect(() => {
    saveGridPrefs('temp', prefs);
  }, [prefs]);

  useEffect(() => {
    saveViews('temp', views);
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
      formats: prefs.formats,
      filters,
      sorts,
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
      formats: view.formats ?? {},
    }));
    setFilters(view.filters ?? {});
    setSorts(view.sorts ?? []);
    setActiveView(name);
  };

  const deleteView = (name: string) => {
    setViews((prev) => prev.filter((v) => v.name !== name));
    if (activeView === name) setActiveView('');
  };

  const clearTempLeads = async () => {
    if (!window.confirm('Clear all temp leads? This cannot be undone.')) return;
    await supabase.from('temp_leads').delete().neq('id', '');
    setLeads([]);
    setDuplicates([]);
  };

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
      if (clearAfterImport) {
        await supabase.from('temp_leads').delete().in('id', leads.map((l) => l.id));
        setLeads([]);
      }
      setDuplicates([]);
      onImport();
    }
  };

  const handleAddLead = () => {
    setShowAddLead(true);
  };

  const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || '';
  const normalizePhone = (value?: string | null) => value?.replace(/\D/g, '') || '';
  const normalizeWebsite = (value?: string | null) =>
    value
      ?.trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '') || '';

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
              <div className="absolute right-0 mt-2 w-72 bg-gray-950 border border-gray-800 rounded-md p-3 z-10">
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
                      <select
                        value={prefs.formats[field.field_key] ?? 'text'}
                        onChange={(e) =>
                          setPrefs((prev) => ({
                            ...prev,
                            formats: { ...prev.formats, [field.field_key]: e.target.value },
                          }))
                        }
                        className="text-xs bg-gray-900 border border-gray-700 text-gray-200 rounded px-1 py-0.5"
                      >
                        {formatOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
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
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>Clear temp after import</span>
                  <input
                    type="checkbox"
                    checked={clearAfterImport}
                    onChange={(e) => setClearAfterImport(e.target.checked)}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilters((prev) => !prev)}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 text-sm hover:bg-gray-700"
            >
              Filters
            </button>
            {showFilters && (
              <div className="absolute right-0 mt-2 w-72 bg-gray-950 border border-gray-800 rounded-md p-3 z-10">
                <div className="text-xs text-gray-400 mb-2">Column filters</div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {orderedFields.map((field) => (
                    <div key={field.field_key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-300 w-24 truncate">{field.label}</span>
                      <input
                        value={filters[field.field_key] ?? ''}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, [field.field_key]: e.target.value }))
                        }
                        placeholder="filter"
                        className="flex-1 px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-white text-xs"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setFilters({})}
                  className="mt-2 text-xs text-gray-400 hover:text-white"
                >
                  Clear filters
                </button>
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
            onClick={clearTempLeads}
            className="flex items-center gap-2 px-4 py-2 bg-red-900 text-white rounded-md hover:bg-red-800 text-sm font-medium"
          >
            Clear Temp
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
            onClick={() => setPinnedForSelected(true)}
            className="px-3 py-1.5 rounded-md bg-blue-900 text-white hover:bg-blue-800"
          >
            Pin
          </button>
          <button
            onClick={() => setPinnedForSelected(false)}
            className="px-3 py-1.5 rounded-md bg-blue-900 text-white hover:bg-blue-800"
          >
            Unpin
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

      {duplicates.length > 0 && (
        <div className="mb-4 bg-gray-900 border border-gray-700 rounded-md p-4">
          <h3 className="font-semibold text-gray-200 mb-2">
            {duplicates.length} duplicates removed:
          </h3>
          <div className="space-y-1 text-sm text-gray-300">
            {duplicates.slice(0, 10).map((dup) => (
              <div key={dup.original.id}>
                {(dup.original.name ||
                  dup.original.email ||
                  dup.original.phone ||
                  dup.original.website ||
                  'Unknown lead') + ` — matched by ${dup.reason} with ${dup.matchedWith}`}
              </div>
            ))}
            {duplicates.length > 10 && (
              <div className="text-gray-400 italic">
                ...and {duplicates.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}


      <div className="bg-gray-950 rounded-lg shadow overflow-hidden border border-gray-800">
        <GlideLeadGrid
          rows={filteredLeads}
          orderedFields={orderedFields}
          outreachOptions={outreachOptions}
          prefs={prefs}
          setPrefs={setPrefs}
          formats={prefs.formats}
          copyHeaders={prefs.copyHeaders}
          columnTitleByKey={columnTitleByKey}
          onCellsEdited={handleCellsEdited}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onFillPattern={handleFillPattern}
          onAppendRow={handleAppendRow}
          onHeaderClick={handleHeaderClick}
          onRowMoved={handleRowMoved}
          onCellContextMenu={handleCellContextMenu}
          onSelectedIdsChange={setSelectedIds}
        />
      </div>


      {noteTarget && (
        <CellNoteModal
          leadId={noteTarget.leadId}
          fieldKey={noteTarget.fieldKey}
          fieldLabel={noteTarget.fieldLabel}
          onClose={() => setNoteTarget(null)}
        />
      )}

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

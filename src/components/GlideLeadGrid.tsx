import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CompactSelection,
  DataEditor,
  EditListItem,
  FillPatternEventArgs,
  GridCell,
  GridCellKind,
  GridColumn,
  GridKeyEventArgs,
  GridSelection,
  CellClickedEventArgs,
  HeaderClickedEventArgs,
  Item,
} from '@glideapps/glide-data-grid';
import { Lead, LeadField } from '../lib/supabase';
import { GridPrefs, moveInArray } from '../lib/gridPrefs';
import { useGridSize } from '../lib/useGridSize';

type GlideLeadGridProps = {
  rows: Lead[];
  orderedFields: LeadField[];
  outreachOptions: { key: string; label: string }[];
  prefs: GridPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<GridPrefs>>;
  formats: Record<string, string>;
  copyHeaders: boolean;
  columnTitleByKey?: Record<string, string>;
  onCellsEdited: (edits: readonly EditListItem[]) => Promise<void> | void;
  onPaste: (target: Item, values: readonly (readonly string[])[]) => boolean;
  onDelete: (selection: GridSelection) => boolean | GridSelection;
  onFillPattern?: (event: FillPatternEventArgs) => void;
  onAppendRow?: () => void;
  onHeaderClick?: (columnIndex: number, event: HeaderClickedEventArgs) => void;
  onRowMoved?: (startIndex: number, endIndex: number) => void;
  onCellContextMenu?: (cell: Item, event: CellClickedEventArgs) => void;
  onSelectedIdsChange?: (ids: Set<string>) => void;
};

export function GlideLeadGrid({
  rows,
  orderedFields,
  outreachOptions,
  prefs,
  setPrefs,
  formats,
  copyHeaders,
  columnTitleByKey,
  onCellsEdited,
  onPaste,
  onDelete,
  onFillPattern,
  onAppendRow,
  onHeaderClick,
  onRowMoved,
  onCellContextMenu,
  onSelectedIdsChange,
}: GlideLeadGridProps) {
  const { ref: gridRef, size } = useGridSize<HTMLDivElement>();
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    rows: CompactSelection.empty(),
    columns: CompactSelection.empty(),
  });
  const lastHeaderClickRef = useRef<{ col: number; time: number } | null>(null);

  const columns: GridColumn[] = useMemo(
    () =>
      orderedFields.map((field) => ({
        id: field.field_key,
        title: columnTitleByKey?.[field.field_key] ?? field.label,
        width: prefs.widths[field.field_key] ?? 160,
      })),
    [orderedFields, prefs.widths, columnTitleByKey]
  );

  const selectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rowIndex of gridSelection.rows.toArray()) {
      const lead = rows[rowIndex];
      if (lead) ids.add(lead.id);
    }
    return ids;
  }, [gridSelection.rows, rows]);

  useEffect(() => {
    onSelectedIdsChange?.(selectedIds);
  }, [selectedIds, onSelectedIdsChange]);

  const formatDisplayValue = useCallback(
    (value: string, format: string | undefined) => {
      const trimmed = value ?? '';
      if (!format || format === 'text') return trimmed;
      if (format === 'number') {
        const num = Number(trimmed.replace(/,/g, ''));
        if (Number.isFinite(num)) return num.toLocaleString();
        return trimmed;
      }
      if (format === 'date') {
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString();
        return trimmed;
      }
      if (format === 'phone') {
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length === 10) {
          return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        if (digits.length === 11) {
          return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
        }
        return trimmed;
      }
      return trimmed;
    },
    []
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const field = orderedFields[col];
      const lead = rows[row];
      if (!field || !lead) {
        return {
          kind: GridCellKind.Text,
          data: '',
          displayData: '',
          allowOverlay: true,
        };
      }
      const value = (lead as Record<string, string | null>)[field.field_key] ?? '';
      const displayValueRaw =
        field.field_key === 'outreach_method'
          ? outreachOptions.find((option) => option.key === value)?.label || value
          : value;
      const displayValue = formatDisplayValue(displayValueRaw || '', formats[field.field_key]);
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: displayValue || '',
        allowOverlay: true,
      };
    },
    [orderedFields, rows, outreachOptions, formats, formatDisplayValue]
  );

  const getCellsForSelection = useCallback(
    (selection: { x: number; y: number; width: number; height: number }): GridCell[][] => {
      const result: GridCell[][] = [];
      for (let y = 0; y < selection.height; y += 1) {
        const rowCells: GridCell[] = [];
        for (let x = 0; x < selection.width; x += 1) {
          rowCells.push(getCellContent([selection.x + x, selection.y + y]));
        }
        result.push(rowCells);
      }
      return result;
    },
    [getCellContent]
  );

  const handleCellsEdited = (edits: readonly EditListItem[]) => {
    void onCellsEdited(edits);
  };

  const handleColumnResize = (column: GridColumn, width: number) => {
    setPrefs((prev) => ({
      ...prev,
      widths: { ...prev.widths, [column.id as string]: width },
    }));
  };

  const handleColumnMoved = (startIndex: number, endIndex: number) => {
    if (startIndex === endIndex) return;
    setPrefs((prev) => ({
      ...prev,
      order: moveInArray(prev.order.length > 0 ? prev.order : orderedFields.map((f) => f.field_key), startIndex, endIndex),
    }));
  };

  const buildClipboardText = (cells: GridCell[][], withHeaders: boolean, startCol: number) => {
    const rowsText: string[] = [];
    if (withHeaders) {
      const headerRow = cells[0]?.map((_, idx) => orderedFields[startCol + idx]?.label || '');
      if (headerRow) rowsText.push(headerRow.join('\t'));
    }
    for (const row of cells) {
      rowsText.push(
        row
          .map((cell) => {
            if (cell.kind === GridCellKind.Text) return cell.data ?? '';
            return '';
          })
          .join('\t')
      );
    }
    return rowsText.join('\n');
  };

  const handleKeyDown = async (args: GridKeyEventArgs) => {
    const isCopy = (args.ctrlKey || args.metaKey) && args.key.toLowerCase() === 'c';
    const isCut = (args.ctrlKey || args.metaKey) && args.key.toLowerCase() === 'x';
    if (!isCopy && !isCut) return;
    const selection = gridSelection;
    if (!selection) return;
    const range = selection.current?.range;
    let startCol = range?.x ?? 0;
    let startRow = range?.y ?? 0;
    let width = range?.width ?? 0;
    let height = range?.height ?? 0;

    if (!range) {
      const rowsSel = selection.rows.toArray();
      const colsSel = selection.columns.toArray();
      if (rowsSel.length > 0 && colsSel.length === 0) {
        startCol = 0;
        startRow = Math.min(...rowsSel);
        width = orderedFields.length;
        height = rowsSel.length;
      } else if (colsSel.length > 0 && rowsSel.length === 0) {
        startCol = Math.min(...colsSel);
        startRow = 0;
        width = colsSel.length;
        height = rows.length;
      } else {
        return;
      }
    }

    const cells = getCellsForSelection({ x: startCol, y: startRow, width, height });
    const text = buildClipboardText(cells, copyHeaders, startCol);
    try {
      await navigator.clipboard.writeText(text);
      args.preventDefault();
      if (isCut) {
        onDelete(selection);
      }
    } catch {
      // ignore clipboard errors
    }
  };

  const handleHeaderClick = (col: number, event: HeaderClickedEventArgs) => {
    const now = Date.now();
    const last = lastHeaderClickRef.current;
    if (last && last.col === col && now - last.time < 350) {
      // Auto-size on double click
      const field = orderedFields[col];
      if (field) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const font = getComputedStyle(document.body).font || '14px system-ui';
          ctx.font = font;
          const sample = rows.slice(0, 200);
          let maxWidth = ctx.measureText(field.label).width;
          for (const row of sample) {
            const raw = (row as Record<string, string | null>)[field.field_key] ?? '';
            const display = formatDisplayValue(raw, formats[field.field_key]);
            maxWidth = Math.max(maxWidth, ctx.measureText(display).width);
          }
          const targetWidth = Math.min(520, Math.max(100, Math.ceil(maxWidth + 32)));
          setPrefs((prev) => ({
            ...prev,
            widths: { ...prev.widths, [field.field_key]: targetWidth },
          }));
        }
      }
    }
    lastHeaderClickRef.current = { col, time: now };
    onHeaderClick?.(col, event);
  };

  return (
    <div ref={gridRef} className="h-[520px] w-full" data-glide-grid tabIndex={0}>
      <DataEditor
        width={size.width}
        height={size.height}
        rows={rows.length}
        columns={columns}
        minColumnWidth={100}
        maxColumnWidth={520}
        rowMarkers="checkbox"
        rowSelect="multi"
        rowSelectionMode="multi"
        columnSelect="multi"
        rangeSelect="multi-rect"
        getCellContent={getCellContent}
        getCellsForSelection={getCellsForSelection}
        onCellsEdited={handleCellsEdited}
        onPaste={onPaste}
        onDelete={onDelete}
        onKeyDown={handleKeyDown}
        onCellContextMenu={(cell, event) => {
          event.preventDefault();
          onCellContextMenu?.(cell, event);
        }}
        fillHandle
        onFillPattern={onFillPattern}
        trailingRowOptions={{ hint: 'Add row', sticky: true }}
        onRowAppended={onAppendRow}
        onGridSelectionChange={setGridSelection}
        gridSelection={gridSelection}
        onColumnResizeEnd={handleColumnResize}
        onColumnResize={handleColumnResize}
        onHeaderClicked={handleHeaderClick}
        onRowMoved={onRowMoved}
        onColumnMoved={handleColumnMoved}
        freezeColumns={1}
        smoothScrollX
        smoothScrollY
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CompactSelection,
  DataEditor,
  EditListItem,
  GridCell,
  GridCellKind,
  GridColumn,
  GridSelection,
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
  onCellsEdited: (edits: readonly EditListItem[]) => Promise<void> | void;
  onPaste: (target: Item, values: readonly (readonly string[])[]) => boolean;
  onDelete: (selection: GridSelection) => boolean | GridSelection;
  onSelectedIdsChange?: (ids: Set<string>) => void;
};

export function GlideLeadGrid({
  rows,
  orderedFields,
  outreachOptions,
  prefs,
  setPrefs,
  onCellsEdited,
  onPaste,
  onDelete,
  onSelectedIdsChange,
}: GlideLeadGridProps) {
  const { ref: gridRef, size } = useGridSize<HTMLDivElement>();
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    rows: CompactSelection.empty(),
    columns: CompactSelection.empty(),
  });

  const columns: GridColumn[] = useMemo(
    () =>
      orderedFields.map((field) => ({
        id: field.field_key,
        title: field.label,
        width: prefs.widths[field.field_key] ?? 160,
      })),
    [orderedFields, prefs.widths]
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
      const displayValue =
        field.field_key === 'outreach_method'
          ? outreachOptions.find((option) => option.key === value)?.label || value
          : value;
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: displayValue || '',
        allowOverlay: true,
      };
    },
    [orderedFields, rows, outreachOptions]
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

  const handleColumnResizeEnd = (column: GridColumn, width: number) => {
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

  return (
    <div ref={gridRef} className="h-[520px] w-full" data-glide-grid tabIndex={0}>
      <DataEditor
        width={size.width}
        height={size.height}
        rows={rows.length}
        columns={columns}
        rowMarkers="checkbox"
        rowSelect="multi"
        columnSelect="multi"
        rangeSelect="multi-rect"
        getCellContent={getCellContent}
        getCellsForSelection={getCellsForSelection}
        onCellsEdited={handleCellsEdited}
        onPaste={onPaste}
        onDelete={onDelete}
        onGridSelectionChange={setGridSelection}
        gridSelection={gridSelection}
        onColumnResizeEnd={handleColumnResizeEnd}
        onColumnMoved={handleColumnMoved}
        freezeColumns={1}
        smoothScrollX
        smoothScrollY
      />
    </div>
  );
}

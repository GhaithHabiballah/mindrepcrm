export function Documentation() {
  return (
    <div className="space-y-6 text-gray-100">
      <h2 className="text-2xl font-semibold">CRM Documentation</h2>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Master Leads</h3>
        <div className="text-sm text-gray-300">
          Master is the single source of truth. All outreach tabs read/write the same leads.
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Outreach Tabs</h3>
        <div className="text-sm text-gray-300">
          Each outreach tab filters by the Outreach Method. Any edit here updates Master and vice versa.
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Temp Leads (Persistent)</h3>
        <div className="text-sm text-gray-300">
          Temp leads are stored persistently in a separate table until you delete them or move them to Master.
        </div>
        <div className="text-sm text-gray-300">
          Use “Check Duplicates” to remove leads already in Master. Then click “Add Remaining to Master”.
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Excel‑Style Paste</h3>
        <div className="text-sm text-gray-300">
          Click any cell and paste (Ctrl/Cmd+V). Multi‑row and multi‑column paste is supported.
        </div>
        <div className="text-sm text-gray-300">
          Auto‑add rows on paste can be toggled in Columns → Auto‑add rows on paste.
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Columns</h3>
        <div className="text-sm text-gray-300">
          Use the Columns menu to hide/show fields and reorder columns. Changes are saved per tab.
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Saved Views</h3>
        <div className="text-sm text-gray-300">
          Save a view to persist your search + column layout. Apply or delete views from the Views menu.
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Bulk Actions</h3>
        <div className="text-sm text-gray-300">
          Select rows with checkboxes to apply Outreach Method or delete in bulk.
        </div>
      </section>
    </div>
  );
}

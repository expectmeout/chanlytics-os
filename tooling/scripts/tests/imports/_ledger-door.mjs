/**
 * The imports ledger's one write door, import_ledger_note, as 00499 keeps it (decision 0086), over a world's
 * `tables.imports`: one row a mailbox for what a mailbox brings, one a workspace for every other source (no mailbox).
 * A writer that names a mailbox with no row of its own first takes the workspace's row an earlier ledger kept for it
 * (its cursor names that mailbox, or it is still going and names none). Counts are added (p_add) or set; the oldest is
 * the earliest; the cursor, the via and the parts are kept where a write names none. A start or Stop takes the row for
 * its run (p_take); a write of a run the row is no longer held by changes nothing. `notes`, where given, keeps each
 * call's arguments, as the tests that read what was asked keep them.
 */
export function ledgerDoor(tables, notes = null) {
  return (a) => {
    notes?.push(a);
    const rows = tables.imports;
    const conn = a.p_connection_id ?? null;
    const same = (r, c) => r.tenant_id === a.p_tenant_id && r.source === a.p_source && (r.connection_id ?? null) === c;
    if (conn && !rows.some((r) => same(r, conn))) {
      const kept = rows.find((r) => same(r, null));
      const named = kept?.job_cursor?.connection ?? "";
      if (kept && (named === conn || (!named && (kept.state === "queued" || kept.state === "running"))))
        kept.connection_id = conn;
    }
    const i = rows.findIndex((r) => same(r, conn));
    const was = i >= 0 ? rows[i] : null;
    const run = typeof a.p_run === "string" && a.p_run.trim() ? a.p_run.trim() : null;
    if (was && !a.p_take && run && was.run && was.run !== run) return null;
    const counts = { ...(a.p_add ? (was?.counts ?? {}) : {}) };
    for (const [k, n] of Object.entries(a.p_counts ?? {})) counts[k] = (a.p_add ? (counts[k] ?? 0) : 0) + n;
    const oldest = [was?.oldest, a.p_oldest].filter(Boolean).sort()[0] ?? null;
    const next = {
      tenant_id: a.p_tenant_id,
      source: a.p_source,
      connection_id: conn,
      run: was ? (a.p_take ? run : (was.run ?? null)) : run,
      state: a.p_state,
      counts,
      parts_done: a.p_parts_done ?? was?.parts_done ?? 0,
      parts_total: a.p_parts_total ?? was?.parts_total ?? null,
      oldest,
      via: a.p_via ?? was?.via ?? null,
      job_cursor: a.p_cursor ?? was?.job_cursor ?? null,
      last_error: a.p_state === "failed" ? (a.p_error ?? null) : null,
    };
    if (i >= 0) rows[i] = next;
    else rows.push(next);
    return null;
  };
}

/**
 * The platform's own pager. Not a tenant's mailbox: the platform addresses
 * that notify.ts already knows (LEAD_FROM / LEAD_TO, one or several). One
 * page per condition key per six hours, stamped only after delivery -- a page
 * that did not send earns no quiet, so the next tick tries again.
 *
 * Four conditions call it today: the heartbeat failing many jobs in one run
 * (api/jobs/tick.ts), a provider refusing a send with 401 or 403 -- credentials,
 * not content (core/messages/send.ts), due jobs nobody is claiming
 * (api/cron/health.ts), and the receptionist having no model key
 * (whatsapp/inbound.ts). Each is the platform's to fix, never an owner's.
 *
 * The callers do not act on the outcome: the memory does. A condition whose
 * last firing was never told (a failed or unaddressed page) is readable as
 * such through pageStates(), which /api/diag shows -- so a broken alarm
 * channel is at least visible from the one door that does not depend on it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { post, platformFrom, platformTo } from "./notify.js";

export const PAGE_WINDOW_MS = 6 * 3600_000;

export type PageOutcome = "sent" | "suppressed" | "unaddressed" | "failed";

export interface PagePorts {
  db: SupabaseClient<Database>;
  /** The transport; Resend through notify.ts unless a test hands in its own. */
  send?: (from: string, to: string[], subject: string, body: string) => Promise<boolean>;
  /** Epoch ms; injected so the window is testable. */
  now?: () => number;
}

export async function pageOperator(ports: PagePorts, key: string, subject: string, body: string): Promise<PageOutcome> {
  const now = ports.now?.() ?? Date.now();
  const send = ports.send ?? post;
  const { data: row, error: readErr } = await ports.db
    .from("operator_pages")
    .select("alerted_at, count")
    .eq("key", key)
    .maybeSingle();
  if (readErr) {
    // A pager that cannot read its own memory pages anyway: a duplicate page
    // is cheaper than a silence nobody chose.
    console.error(JSON.stringify({ level: "error", event: "operator_page_memory_unreadable", key, error: readErr.message }));
  }
  const { error: writeErr } = await ports.db.from("operator_pages").upsert(
    { key, last_at: new Date(now).toISOString(), count: (row?.count ?? 0) + 1 },
    { onConflict: "key" },
  );
  if (writeErr) console.error(JSON.stringify({ level: "error", event: "operator_page_memory_unwritable", key, error: writeErr.message }));
  if (row?.alerted_at && now - Date.parse(row.alerted_at) < PAGE_WINDOW_MS) return "suppressed";
  const to = platformTo();
  const from = platformFrom();
  if (!to.length || !from) {
    console.error(JSON.stringify({ level: "error", event: "operator_page_unaddressed", key, subject }));
    return "unaddressed";
  }
  const ok = await send(from, to, `[Chanlytics] ${subject}`, body).catch((e: unknown) => {
    console.error(JSON.stringify({ level: "error", event: "operator_page_send_threw", key, error: e instanceof Error ? e.message : String(e) }));
    return false;
  });
  if (!ok) return "failed";
  await ports.db.from("operator_pages").update({ alerted_at: new Date(now).toISOString() }).eq("key", key);
  return "sent";
}

/** One row of the pager's memory, as the table holds it. */
export interface PageRow {
  key: string;
  first_at: string;
  last_at: string;
  count: number;
  alerted_at: string | null;
}

export interface PageState extends PageRow {
  /**
   * Whether a person heard about the LAST firing: a page went out for it, or
   * one had gone out inside the window before it (suppressed, by design). False
   * is a firing nobody was told of -- the transport refused, or nothing was
   * addressed -- and it stays false until the condition fires again and pages.
   */
  told: boolean;
  /** True while the condition has fired inside the last window: what is current, as opposed to history. */
  recent: boolean;
}

/**
 * The pager's memory, judged. Pure: the same rule pageOperator suppresses by,
 * read back so a page that did not send can be seen rather than inferred.
 */
export function pageStates(rows: PageRow[], now = Date.now()): PageState[] {
  return rows.map((r) => {
    const last = Date.parse(r.last_at);
    const alerted = r.alerted_at ? Date.parse(r.alerted_at) : null;
    return {
      ...r,
      told: alerted != null && last - alerted < PAGE_WINDOW_MS,
      recent: now - last < PAGE_WINDOW_MS,
    };
  });
}

/** The conditions that fired inside the window and reached nobody: what an operator reading diag must act on. */
export function untoldPages(rows: PageRow[], now = Date.now()): string[] {
  return pageStates(rows, now).filter((s) => s.recent && !s.told).map((s) => s.key);
}

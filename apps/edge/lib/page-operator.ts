/**
 * The platform's own pager. Not a tenant's mailbox: the platform address that
 * notify.ts already knows (LEAD_FROM / LEAD_TO). One page per condition key
 * per six hours, stamped only after delivery -- a page that did not send
 * earns no quiet, so the next tick tries again.
 *
 * Three conditions call it today: the heartbeat failing many jobs in one run,
 * a provider refusing a send with 401 or 403 (credentials, not content), and
 * due jobs nobody is claiming. Each is the platform's to fix, never an owner's.
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
  if (!to || !from) {
    console.error(JSON.stringify({ level: "error", event: "operator_page_unaddressed", key, subject }));
    return "unaddressed";
  }
  const ok = await send(from, [to], `[Chanlytics] ${subject}`, body).catch((e: unknown) => {
    console.error(JSON.stringify({ level: "error", event: "operator_page_send_threw", key, error: e instanceof Error ? e.message : String(e) }));
    return false;
  });
  if (!ok) return "failed";
  await ports.db.from("operator_pages").update({ alerted_at: new Date(now).toISOString() }).eq("key", key);
  return "sent";
}

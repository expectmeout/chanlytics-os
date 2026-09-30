/**
 * The platform's own pager. Not a tenant's mailbox: the platform addresses
 * that notify.ts already knows (LEAD_FROM / LEAD_TO, one or several). One
 * page per condition key per six hours, stamped only after delivery -- a page
 * that did not send earns no quiet, so the next tick tries again.
 *
 * Who calls it: the heartbeat failing many jobs in one run (api/jobs/tick.ts);
 * a provider refusing a send with 401 or 403 -- credentials, not content -- a
 * workspace's credentials that could not be READ, the reply left queued for a
 * fresh job, and the mail provider's day or month used up (core/messages/send.ts); due jobs
 * nobody is claiming, WhatsApp messages Meta accepted that have had no receipt
 * for six hours, and the mail domain losing its standing (api/cron/health.ts);
 * a customer waiting in a workspace with nobody on file to tell
 * (api/cron/deadman.ts); the receptionist having no model key
 * (core/inbound/model-turn.ts); and cold email's own: a sending domain another
 * workspace holds, one the cold account already holds verified with no
 * workspace's row, or one the provider no longer knows (lib/email/sending-domains.ts),
 * receipts that never arrive (lib/email/cold-receipts.ts), and unsubscribe links
 * that do not open (lib/email/unsubscribe-probe.ts). Each reaches the platform,
 * never an owner.
 *
 * A page is mail, sent with the platform's own provider key. So a condition
 * that IS that key failing -- its 401, its used-up quota -- is recorded here
 * and shown on /api/diag, and its mail cannot leave until the key works again.
 *
 * The callers do not act on the outcome: the memory does. A condition whose
 * last firing was never told (a failed or unaddressed page) is readable as
 * such through pageStates(), which /api/diag shows -- so a broken alarm
 * channel is at least visible from the one door that does not depend on it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { post, platformFrom, platformTo } from "./notify.js";
import { logger, errField } from "../log.js";

export const PAGE_WINDOW_MS = 6 * 3600_000;

export type PageOutcome = "sent" | "suppressed" | "unaddressed" | "failed";

export interface PagePorts {
  db: SupabaseClient<Database>;
  /** The transport; Resend through notify.ts unless a test hands in its own. */
  send?: (from: string, to: string[], subject: string, body: string) => Promise<boolean>;
  /** Epoch ms; injected so the window is testable. */
  now?: () => number;
}

/**
 * The pages of each key in flight in this instance, one after another. The memory is read, then the page sent, then
 * stamped: two firings of one condition at the same moment (the ledger's slots run jobs side by side, and two replies
 * held on one unreadable vault page together) would both read no stamp and both send. In turn, the second reads the
 * first's stamp and is suppressed; and when the first could not send, the second tries, as the next tick would.
 */
const inFlight = new Map<string, Promise<PageOutcome>>();

export async function pageOperator(ports: PagePorts, key: string, subject: string, body: string): Promise<PageOutcome> {
  const before = inFlight.get(key);
  const mine = (before ?? Promise.resolve()).then(
    () => pageOnce(ports, key, subject, body),
    () => pageOnce(ports, key, subject, body),
  );
  inFlight.set(key, mine);
  try {
    return await mine;
  } finally {
    if (inFlight.get(key) === mine) inFlight.delete(key);
  }
}

async function pageOnce(ports: PagePorts, key: string, subject: string, body: string): Promise<PageOutcome> {
  const L = logger();
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
    L.error("operator_page_memory_unreadable", { key, error: readErr.message });
  }
  // The count is left alone when the read failed. `(row?.count ?? 0) + 1` cannot
  // tell "no row yet" from "the row is there and I could not read it", and on
  // the second it wrote 1 over the running total -- so the history a person
  // reads on /api/diag to judge how long a condition has been firing was reset
  // by the very database trouble most likely to be firing it.
  const memory = { key, last_at: new Date(now).toISOString(), ...(readErr ? {} : { count: (row?.count ?? 0) + 1 }) };
  const { error: writeErr } = await ports.db.from("operator_pages").upsert(memory, { onConflict: "key" });
  if (writeErr) L.error("operator_page_memory_unwritable", { key, error: writeErr.message });
  if (row?.alerted_at && now - Date.parse(row.alerted_at) < PAGE_WINDOW_MS) return "suppressed";
  const to = platformTo();
  const from = platformFrom();
  if (!to.length || !from) {
    L.error("operator_page_unaddressed", { key, subject });
    return "unaddressed";
  }
  const ok = await send(from, to, `[Chanlytics] ${subject}`, body).catch((e: unknown) => {
    L.error("operator_page_send_threw", { key, error: errField(e) });
    return false;
  });
  if (!ok) return "failed";
  await ports.db
    .from("operator_pages")
    .update({ alerted_at: new Date(now).toISOString() })
    .eq("key", key);
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
  return pageStates(rows, now)
    .filter((s) => s.recent && !s.told)
    .map((s) => s.key);
}

/**
 * WhatsApp receipts that stopped coming back.
 *
 * Meta answers a send with its message id at once, and says what became of
 * the message later, on the webhook: delivered, read or failed (api/whatsapp.ts,
 * the "messages" field's statuses). When those stop arriving, nothing anyone
 * looks at changes: every row just stays `sent`. The salon's two broadcast
 * messages of 8 Sep 2026 had sat like that for six days when a read of
 * production found them.
 *
 * So a message Meta accepted that has had no receipt for six hours is watched.
 * But one recipient's phone being off is not the platform's problem, and a
 * pager that fires for it is a pager people learn to ignore. A workspace is
 * reported only when nothing in it has been receipted since its latest silent
 * message went out: then it is the webhook, not a phone. A receipt that could
 * not be looked for cannot clear a workspace, so it is reported.
 *
 * When a message went out: a send straight from the door is written `sent`,
 * so created_at is the moment; a queued one becomes `sent` later, and
 * messages_guard stamps status_updated_at then (00015). A row still `sent` has
 * had no status change since, so that stamp is still its send. Meta's own
 * "sent" status changes nothing on such a row, so only delivered, read and
 * failed count as a receipt.
 *
 * Cross-workspace: the health sweep reads every workspace's unreceipted WhatsApp sends and only reports them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { HOUR_MS } from "../packages/contracts.js";

/** How long a receipt may take before its absence is a condition. */
const NO_RECEIPT_AFTER_MS = 6 * HOUR_MS;
/** How long a silent message stays watched after that: a day, and then it is history rather than news. */
const WATCHED_FOR_MS = 24 * HOUR_MS;
/** Far past any real incident; the count is of what was read. */
const READ_LIMIT = 1000;

interface SilentWorkspace {
  tenantId: string;
  /** Messages Meta accepted that have had no receipt for six hours. */
  count: number;
  /** When the first and the latest of them went out. */
  firstSentAt: string;
  lastSentAt: string;
}

interface ReceiptsWatch {
  /** The workspaces to report, the longest silent first. */
  silent: SilentWorkspace[];
  /** The last read that failed, for the log. */
  error: string | null;
}

export async function whatsappWithoutReceipts(db: SupabaseClient<Database>, nowMs: number): Promise<ReceiptsWatch> {
  try {
    const quietSince = new Date(nowMs - NO_RECEIPT_AFTER_MS).toISOString();
    const watchedSince = new Date(nowMs - NO_RECEIPT_AFTER_MS - WATCHED_FOR_MS).toISOString();
    const accepted = () =>
      db
        .from("messages")
        .select("tenant_id, created_at, status_updated_at")
        .eq("channel", "whatsapp")
        .eq("direction", "outbound")
        .eq("status", "sent")
        .not("external_id", "is", null);
    const [direct, queued] = await Promise.all([
      accepted()
        .is("status_updated_at", null)
        .lt("created_at", quietSince)
        .gte("created_at", watchedSince)
        .limit(READ_LIMIT),
      accepted().lt("status_updated_at", quietSince).gte("status_updated_at", watchedSince).limit(READ_LIMIT),
    ]);
    const unread = direct.error ?? queued.error;
    if (unread) return { silent: [], error: unread.message };

    const byTenant = new Map<string, SilentWorkspace>();
    for (const row of [...(direct.data ?? []), ...(queued.data ?? [])]) {
      const sentAt = row.status_updated_at ?? row.created_at;
      const w = byTenant.get(row.tenant_id);
      if (!w) {
        byTenant.set(row.tenant_id, { tenantId: row.tenant_id, count: 1, firstSentAt: sentAt, lastSentAt: sentAt });
        continue;
      }
      w.count += 1;
      if (Date.parse(sentAt) < Date.parse(w.firstSentAt)) w.firstSentAt = sentAt;
      if (Date.parse(sentAt) > Date.parse(w.lastSentAt)) w.lastSentAt = sentAt;
    }

    const silent: SilentWorkspace[] = [];
    let error: string | null = null;
    for (const w of byTenant.values()) {
      const { data: heard, error: heardErr } = await db
        .from("messages")
        .select("id")
        .eq("tenant_id", w.tenantId)
        .eq("channel", "whatsapp")
        .eq("direction", "outbound")
        .in("status", ["delivered", "read", "failed"])
        .not("external_id", "is", null)
        .gt("status_updated_at", w.lastSentAt)
        .limit(1);
      if (heardErr) error = heardErr.message;
      if (heardErr || !heard?.length) silent.push(w);
    }
    silent.sort((a, b) => Date.parse(a.firstSentAt) - Date.parse(b.firstSentAt));
    return { silent, error };
  } catch (e) {
    return { silent: [], error: e instanceof Error ? e.message : String(e) };
  }
}

const minute = (iso: string) => `${new Date(Date.parse(iso)).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * The page. Workspaces, counts and times only: it goes to the platform's
 * mailbox, and no customer, message or conversation is named in it.
 */
export function describeSilentReceipts(silent: SilentWorkspace[], nowMs: number): { subject: string; body: string } {
  const total = silent.reduce((n, w) => n + w.count, 0);
  const lines = silent.map((w) => {
    const hours = Math.floor((nowMs - Date.parse(w.lastSentAt)) / HOUR_MS);
    const when =
      w.count === 1
        ? `sent ${minute(w.firstSentAt)}`
        : `sent between ${minute(w.firstSentAt)} and ${minute(w.lastSentAt)}`;
    return `  workspace ${w.tenantId}: ${w.count} ${w.count === 1 ? "message" : "messages"}, ${when}, the latest ${hours} hours ago`;
  });
  return {
    subject: `${total} WhatsApp ${total === 1 ? "message has" : "messages have"} had no receipt for six hours`,
    body:
      `Meta accepted these WhatsApp messages, and none of them has had a receipt since: not delivered, not read, not failed. ` +
      `Nothing else in the same workspace has been receipted since they went out either, so this is not one person's phone being off.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Receipts come back on the WhatsApp webhook (POST /api/whatsapp, the "messages" field's statuses), and the edge logs each one as wa_status. ` +
      `If there are no wa_status lines since then, Meta is not sending them here: check the app's webhook subscription to the messages field, ` +
      `and that META_APP_SECRET still matches the app, since a request that fails its signature is refused as bad_signature. ` +
      `If the lines are there, the receipts arrive and are not recorded: the number may not route to a workspace, or the update failed (record_status_failed).\n\n` +
      `Further pages are suppressed for six hours.\n`,
  };
}

/**
 * Write the receptionist's reply as a DRAFT and schedule its send.
 *
 * Two callers: the WhatsApp handler when the reply waits (the hold window or
 * the confidence dial), and the steer endpoint when an owner has a held
 * draft rewritten. One writer, so the row and the job always agree on shape.
 *
 * Returns the message id, or null when it could not be queued; the handler
 * then sends immediately, deliberately: an un-vetoed reply is a worse
 * outcome than a vetoed one, and no reply at all is worse than both.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../packages/db.js";
import { recordOutbound } from "../packages/db.js";
import { scheduleJob } from "../packages/jobs.js";
import type { BrainMeta } from "../packages/contracts.js";

export type DraftSource = "veto_window" | "low_confidence" | "steered";

interface DraftArgs {
  tenantId: string;
  conversationId: string;
  contactId: string | null;
  toPhone: string;
  body: string;
  delayMs: number;
  /** Why the draft waits. */
  source: DraftSource;
  /** What the row remembers about the answer (contracts/brain.ts). */
  brainMeta?: BrainMeta;
  /** Anything else the row should carry (a steer's instruction, its origin). */
  extra?: Record<string, unknown>;
  /** The wire the draft goes out on; WhatsApp unless said. */
  channel?: "whatsapp" | "sms";
}

interface DraftLog {
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export async function queueDraft(db: SupabaseClient<Database>, a: DraftArgs, L: DraftLog): Promise<string | null> {
  // Declared out here so the catch can undo it. The message is written before
  // the job, so a scheduling failure used to leave a `queued` message behind
  // while the caller — correctly — sent the same words immediately: the Inbox
  // then showed a held draft with Edit and Hold controls for a reply the
  // customer already had, and a job that had in fact been written before the
  // error surfaced later found the message still queued and sent it twice.
  let messageId: string | null = null;
  try {
    messageId = await recordOutbound(db, {
      tenantId: a.tenantId,
      conversationId: a.conversationId,
      contactId: a.contactId,
      sender: "ai",
      type: "text",
      body: a.body,
      externalId: null,
      status: "queued",
      channel: a.channel ?? "whatsapp",
      meta: { source: a.source, delay_ms: a.delayMs, ...(a.brainMeta ?? {}), ...(a.extra ?? {}) } as Json,
    });
    if (!messageId) return null;
    await scheduleJob(db, {
      tenantId: a.tenantId,
      kind: "outbound_send",
      dueAt: new Date(Date.now() + a.delayMs),
      payload: {
        message_id: messageId,
        conversation_id: a.conversationId,
        to_phone: `+${a.toPhone.replace(/^\+/, "")}`,
        body: a.body,
      },
    });
    return messageId;
  } catch (e) {
    L.error("wa_queue_failed", { error: e instanceof Error ? e.message : String(e) });
    if (messageId) {
      // The caller may be about to send these exact words immediately. Retire
      // the draft first so it cannot be sent a second time and cannot render
      // as a pending one, and mark it canceled rather than deleting it — the
      // row is the only record that a hold was attempted and did not happen.
      const { error } = await db
        .from("messages")
        .update({ status: "canceled", error: { reason: "scheduling_failed" } })
        .eq("id", messageId)
        .eq("status", "queued");
      if (error) L.error("wa_queue_rollback_failed", { message_id: messageId, error: error.message });
    }
    return null;
  }
}

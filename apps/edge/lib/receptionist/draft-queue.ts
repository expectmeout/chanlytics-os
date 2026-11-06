/**
 * Write the receptionist's reply as a DRAFT and schedule its send.
 *
 * Two callers: the WhatsApp handler when the reply waits (the hold window or
 * the confidence dial), and the steer endpoint when an owner has a held
 * draft rewritten. One writer, so the row and the job always agree on shape, and one statement, so neither is ever
 * written without the other.
 *
 * Returns the message id, or null when it could not be queued; the handler
 * then sends immediately, deliberately: an un-vetoed reply is a worse
 * outcome than a vetoed one, and no reply at all is worse than both.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { queueSend } from "@chanlytics/db";
import type { BrainMeta } from "@chanlytics/contracts";
import type { InboundChannel } from "@chanlytics/core";
import type { LogEvent } from "../shared/log.js";

export type DraftSource = "veto_window" | "low_confidence" | "steered";

interface DraftArgs {
  tenantId: string;
  conversationId: string;
  contactId: string | null;
  /** Where it goes: the number on a phone's wire (with or without its "+"), the person's Instagram-scoped id on a DM's. */
  to: string;
  body: string;
  delayMs: number;
  /** Why the draft waits. */
  source: DraftSource;
  /** What the row remembers about the answer (contracts/brain.ts). */
  brainMeta?: BrainMeta;
  /** Anything else the row should carry (a steer's instruction, its origin). */
  extra?: Record<string, unknown>;
  /** The wire the draft goes out on; WhatsApp unless said. */
  channel?: InboundChannel;
}

interface DraftLog {
  warn(event: LogEvent, fields?: Record<string, unknown>): void;
  error(event: LogEvent, fields?: Record<string, unknown>): void;
}

export async function queueDraft(db: SupabaseClient<Database>, a: DraftArgs, L: DraftLog): Promise<string | null> {
  // The draft and its job in one statement (00527 queue_send): both are written or neither is. The draft used to be
  // written, then its job, so a run killed between the two left a queued reply nothing would send, and a job that failed
  // to be written left one the caller (correctly sending the same words at once) had to withdraw. A write that fails
  // now leaves nothing to undo, and the caller sends the words itself.
  // An address never travels in a field read as a number: a DM's is its own (core SendPayload). It is frozen on the row
  // (meta.to, last, so nothing the brain says of the draft moves it), where the send reads it; the payload's copy is an
  // older edge's, for either deploy order.
  const to = a.channel === "instagram" ? a.to : `+${a.to.replace(/^\+/, "")}`;
  try {
    return await queueSend(db, {
      tenantId: a.tenantId,
      conversationId: a.conversationId,
      contactId: a.contactId,
      channel: a.channel ?? "whatsapp",
      sender: "ai",
      body: a.body,
      meta: { source: a.source, delay_ms: a.delayMs, ...(a.brainMeta ?? {}), ...(a.extra ?? {}), to },
      dueAt: new Date(Date.now() + a.delayMs),
      payload: a.channel === "instagram" ? { to_instagram: to } : { to_phone: to },
    });
  } catch (e) {
    L.error("wa_queue_failed", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

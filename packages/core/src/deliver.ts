/**
 * deliver(): the one door a message leaves through.
 *
 * Four sequences used to put words on a wire, each assembled by hand: the
 * outbox job asked "opted out?" and nothing about the thread, the broadcast
 * asked the one predicate with the template's purpose and then checked the
 * pause, the voice booking link asked a gate of its own, and the webhook's
 * reply is the statement order of a 300-line function. They disagreed about
 * the pause and about marketing consent, and the disagreements were the
 * defects: a promotional template reaching someone who had said yes to
 * appointments and no to offers; a held draft firing under the owner's own
 * words.
 *
 * This is the door for the first three, and the shape the fourth grows into.
 * It RE-READS the facts at the wire -- the person's consent, the thread's
 * pause, the workspace's status -- because the moment before the send is the
 * one place a stale answer cannot be taken back. It knows nothing about who
 * should be told when a send fails: it returns what happened, and the caller
 * (a job with an owner to alert, a broadcast with a recipient to mark, a
 * voice agent with a caller waiting) says so in its own words.
 *
 * Every send NAMES ITS PURPOSE. A template's purpose is what Meta says it is
 * (purposeOfTemplate fails closed to marketing); words in a conversation are
 * conversational. A send is PROACTIVE when it starts a conversation rather
 * than answering one, and that decides whether a recorded yes is needed for
 * conversational words at all.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText, sendTemplate, type SendResult, type WaConfig } from "@chanlytics/channels";
import { mayMessageFor, purposeOfTemplate, type SendPurpose, type EventKind } from "@chanlytics/contracts";
import { emitEvent, recordOutbound, type Database, type Json } from "@chanlytics/db";

export type Db = SupabaseClient<Database>;
type MessagePatch = Database["public"]["Tables"]["messages"]["Update"];

export type Channel = "whatsapp" | "sms";

/**
 * What a send IS, for the door's rules -- never read off `sender`, which is a
 * fact about who wrote the words and is recorded as such.
 *  - "reply": a person's own words in a conversation; every pause exists for
 *    them, so none holds it.
 *  - "draft": the receptionist's held reply, queued; a person speaking since
 *    retires it, and the pause it now meets does not.
 *  - "broadcast": proactive and automated; it respects every pause like the
 *    machine it is.
 *  - "system": words the rules require of us -- an opt-in confirmation naming
 *    the program, HELP and STOP; a held thread does not hold them, a paused
 *    workspace does.
 *  - "answer": the receptionist answering now; every pause holds it.
 */
export type SendKind = "reply" | "draft" | "broadcast" | "system" | "answer";

export interface TemplateSend {
  name: string;
  language: string;
  params: string[];
}

export interface WirePayload {
  body: string;
  template?: TemplateSend;
}

/** How to put words on one channel's wire. Owns its own address format. */
export type Sender = (to: string, p: WirePayload) => Promise<SendResult>;

/**
 * The wires one workspace has. `undefined`: this runtime has no such
 * channel at all. `null`: the channel exists but this workspace holds no
 * credentials or line for it -- refused here, never guessed from the
 * environment, which is how one business's message left on another's line.
 */
export type Wire = Partial<Record<Channel, Sender | null>>;

/**
 * WhatsApp's wire from a workspace's credentials. Graph wants bare digits,
 * so the "+" is stripped here rather than by a caller who should not know.
 */
export function whatsappSender(cfg: WaConfig | null): Sender | null {
  if (!cfg) return null;
  return (to, p) => {
    const digits = to.replace(/^\+/, "");
    return p.template ? sendTemplate(cfg, digits, p.template) : sendText(cfg, digits, p.body);
  };
}

export interface Delivery {
  tenantId: string;
  conversationId: string;
  contactId: string | null;
  /** E.164, with or without the "+"; each wire shapes it. */
  to: string;
  channel: Channel;
  sender: "ai" | "human" | "system";
  purpose: SendPurpose;
  /** True when this send starts a conversation rather than answering one. */
  proactive: boolean;
  body: string;
  template?: TemplateSend;
  /**
   * An outbox row already written as `queued` (the honest undo): finalized
   * in place rather than inserted, and only while it is still queued, so a
   * cancel that wins the row is never overwritten.
   */
  messageId?: string | null;
  /** What this send is, for the rules (SendKind). Absent, the door derives it the way it always read `sender`: see kindOf. */
  kind?: SendKind;
  /** Recorded on a row this call writes. */
  meta?: Record<string, Json>;
}

/** The policy a send goes under: as declared, or as the door always derived it from who wrote the words. */
function kindOf(d: Delivery): SendKind {
  if (d.kind) return d.kind;
  if (d.sender === "human") return d.proactive ? "broadcast" : "reply";
  return d.messageId ? "draft" : "answer";
}

/** Why the door stayed shut. Each is a fact about the person, the thread or the workspace, never about us. */
export type DeliveryRefusal =
  | "opted_out"
  | "not_opted_in"
  | "no_marketing_consent"
  | "erased"
  | "paused"
  | "human_has_it"
  | "superseded_by_human"
  | "sms_carries_no_promotions";

export type Delivered =
  | { outcome: "sent"; messageId: string | null; externalId: string | null }
  | { outcome: "refused"; reason: DeliveryRefusal; messageId: string | null }
  | {
      outcome: "failed";
      /** Ours: no wire for the channel, no credentials for it, the provider said no, or the facts could not be read. */
      reason: "no_sender_for_channel" | "no_credentials" | "provider" | "wire_unreadable";
      status: number;
      errorBody: string | null;
      messageId: string | null;
    };

export interface DeliverPorts {
  db: Db;
  wire: Wire;
  /** Epoch ms; injected so the pause is testable. */
  now?: () => number;
}

interface WireFacts {
  pausedUntil: string | null;
  /** The person who took the thread over, when one did. */
  assignee: string | null;
  contact: { consent: string | null; dnc: boolean | null; marketing_consent: string | null; erased_at: string | null; erasing_since: string | null };
  tenantStatus: string | null;
}

/**
 * The facts the wire re-reads, in one query: the thread's pause, the person's
 * consent row, and the workspace's status. A read that fails throws, because
 * "we could not check" is not "yes" -- the outbox retries, the broadcast
 * leaves the person queued, and the voice agent says it could not send.
 */
async function wireFacts(db: Db, d: Delivery): Promise<WireFacts> {
  const { data, error } = await db
    .from("conversations")
    .select("paused_until, assignee_user_id, contacts (consent, dnc, marketing_consent, erased_at, erasing_since), tenants (status)")
    .eq("id", d.conversationId)
    .eq("tenant_id", d.tenantId)
    .maybeSingle();
  if (error) throw new Error(`deliver: cannot read the wire for conversation ${d.conversationId}: ${error.message}`);
  if (!data) throw new Error(`deliver: no conversation ${d.conversationId} in workspace ${d.tenantId}`);
  const row = data as unknown as {
    paused_until: string | null;
    assignee_user_id?: string | null;
    contacts: WireFacts["contact"] | null;
    tenants: { status: string | null } | null;
  };
  return {
    pausedUntil: row.paused_until ?? null,
    assignee: row.assignee_user_id ?? null,
    contact: row.contacts ?? { consent: null, dnc: null, marketing_consent: null, erased_at: null, erasing_since: null },
    tenantStatus: row.tenants?.status ?? null,
  };
}

/** Why the door is shut for this send, or null when it may go. */
function refusalFor(d: Delivery, f: WireFacts, nowMs: number): DeliveryRefusal | null {
  // A person who asked to be forgotten is never messaged, whatever the row
  // that survived says -- from the moment they asked (erasing_since, written
  // before anything is destroyed), not only once the erasure finished.
  if (f.contact.erased_at || f.contact.erasing_since) return "erased";
  // The texting line is registered with the carriers for replies and
  // appointment messages, and nothing else: an informational campaign, filed
  // that way after the fourth refusal (30896). A promotion by text would go out
  // under a consent the carriers were never told about, whatever the person
  // said to us -- so it does not, whoever asks. Offers and news go by WhatsApp.
  if (d.channel === "sms" && d.purpose === "marketing") return "sms_carries_no_promotions";
  // Consent outranks everything, asked with this message's own purpose.
  const may = mayMessageFor(f.contact, d.purpose, { proactive: d.proactive });
  if (!may.ok) return may.reason;
  const kind = kindOf(d);
  // A person's own reply goes out even when the machine is told to stop: the
  // pause exists for them, and a paused workspace may still answer by hand.
  // A broadcast is a person's words too, but it is proactive and automated,
  // and it respects the pause like the machine it is.
  if (kind === "reply") return null;
  if (f.tenantStatus === "paused") return "paused";
  // A thread a person holds does not take the receptionist's draft. Taking
  // over withdraws the drafts written before it; this is the same promise
  // kept at the wire, for the withdrawal that failed or the draft written in
  // the same second. Only the draft: an answer meets the pause below, a
  // system message is owed whoever holds the thread.
  if (kind === "draft" && f.assignee) return "human_has_it";
  // The thread's pause holds the receptionist answering now, and a broadcast.
  // It does not hold a queued draft, written before the pause it now meets --
  // the receptionist's own escalation pauses the thread and queues its holding
  // message in the same breath -- so for a draft the question is not "is the
  // thread paused" but "did a person speak since", which overtakenByHuman
  // answers below; and every pause writer withdraws the drafts that came
  // before it (pauseConversation, withdrawDrafts) besides. Nor does it hold a
  // system message: an opt-in confirmation is owed the moment the yes was
  // given, whoever holds the thread.
  if (kind !== "draft" && kind !== "system" && f.pausedUntil && nowMs < new Date(f.pausedUntil).getTime()) return "human_has_it";
  return null;
}

/**
 * A person spoke after this draft was written. A held reply exists so a
 * human can get there first; the fact is a newer human message on the
 * thread, and the draft is retired, never sent. Asked only of a draft that
 * sits in the outbox, which is the only kind that can be overtaken. A
 * broadcast's row is a person's words too, but not a person speaking on this
 * thread: it retires nothing.
 */
async function overtakenByHuman(db: Db, d: Delivery): Promise<string | null> {
  const { data: mine, error: mineErr } = await db
    .from("messages")
    .select("created_at")
    .eq("id", d.messageId!)
    .eq("tenant_id", d.tenantId)
    .maybeSingle();
  if (mineErr) throw new Error(`deliver: cannot read message ${d.messageId}: ${mineErr.message}`);
  if (!mine) return null;
  const { data: newer, error } = await db
    .from("messages")
    .select("id, meta")
    .eq("conversation_id", d.conversationId)
    .eq("tenant_id", d.tenantId)
    .eq("direction", "outbound")
    .eq("sender", "human")
    .gt("created_at", mine.created_at)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`deliver: cannot read the thread for ${d.messageId}: ${error.message}`);
  const spoke = (newer ?? []).find((m) => (m.meta as { source?: unknown } | null)?.source !== "broadcast");
  return spoke ? spoke.id : null;
}

/** The same writer every other event goes through: a failed insert is logged there, never dropped. */
function event(db: Db, d: Delivery, kind: EventKind, messageId: string | null, data: Record<string, Json>): Promise<void> {
  return emitEvent(db, d.tenantId, kind, "message", "message", messageId, data);
}

/** The thread stamped with the send, as recordOutbound stamps it on the row it writes. */
async function stampThread(db: Db, d: Delivery, nowMs: number): Promise<void> {
  const { error } = await db.from("conversations").update({ last_message_at: new Date(nowMs).toISOString() }).eq("id", d.conversationId).eq("tenant_id", d.tenantId);
  if (error) console.error("deliver_stamp_failed", JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, error: error.message }));
}

/**
 * Finalize an outbox row that is still queued. Zero rows means a cancel won
 * it first; a write that FAILED throws, because "the row did not change" and
 * "the row could not be changed" are different facts, and reading the second
 * as the first left a sent message queued for ever under a false race event.
 */
async function finalizeQueued(db: Db, d: Delivery, patch: MessagePatch): Promise<boolean> {
  const { data, error } = await db
    .from("messages")
    .update(patch)
    .eq("id", d.messageId!)
    .eq("status", "queued")
    .select("id");
  if (error) throw new Error(`deliver: cannot finalize message ${d.messageId}: ${error.message}`);
  return !!data && data.length > 0;
}

export async function deliver(ports: DeliverPorts, d: Delivery): Promise<Delivered> {
  const nowMs = (ports.now ?? Date.now)();
  const facts = await wireFacts(ports.db, d);

  const refusal = refusalFor(d, facts, nowMs);
  const overtakenBy = !refusal && kindOf(d) === "draft" ? await overtakenByHuman(ports.db, d) : null;
  const reason = refusal ?? (overtakenBy ? "superseded_by_human" : null);
  if (reason) {
    // A queued row is canceled with its reason, so the thread shows why the
    // words never left; a send with no row yet leaves none, and the caller
    // records the refusal where it lives (a recipient's row, a spoken reply).
    if (d.messageId) {
      await finalizeQueued(ports.db, d, { status: "canceled", error: { reason } });
      await event(ports.db, d, "message.send_blocked", d.messageId, {
        reason, purpose: d.purpose, consent: facts.contact.consent, dnc: facts.contact.dnc,
        marketing_consent: facts.contact.marketing_consent, ...(overtakenBy ? { after: overtakenBy } : {}),
      });
    }
    return { outcome: "refused", reason, messageId: d.messageId ?? null };
  }

  const send = ports.wire[d.channel];
  const sent: SendResult & { reason?: "no_sender_for_channel" | "no_credentials" } =
    send === undefined ? { ok: false, wamid: null, status: 0, errorBody: "no_sender_for_channel", reason: "no_sender_for_channel" }
    : send === null ? { ok: false, wamid: null, status: 503, errorBody: "no_credentials", reason: "no_credentials" }
    : await send(d.to, { body: d.body, template: d.template });

  if (sent.ok) {
    if (d.messageId) {
      // The text is already gone, so the row must say `sent` -- but a cancel
      // that won the row between the send and this write is the signal, not
      // something to overwrite silently. A write that failed is neither: the
      // words left, so it is logged with the wamid and the send still reported.
      const marked = await finalizeQueued(ports.db, d, { status: "sent", ...(sent.wamid ? { external_id: sent.wamid } : {}) }).catch((e: unknown) => {
        console.error("deliver_finalize_failed", JSON.stringify({ tenant: d.tenantId, message: d.messageId, wamid: sent.wamid, error: e instanceof Error ? e.message : String(e) }));
        return null;
      });
      await Promise.all([
        marked === false ? event(ports.db, d, "message.send_raced_cancel", d.messageId, { wamid: sent.wamid }) : Promise.resolve(),
        stampThread(ports.db, d, nowMs),
        event(ports.db, d, "message.sent", d.messageId, { sender: d.sender }),
      ]);
      return { outcome: "sent", messageId: d.messageId, externalId: sent.wamid };
    }
    // recordOutbound stamps the thread and writes message.sent itself. The
    // words are already gone, so a row that cannot be written is logged and
    // the send still reported: a caller that took "not recorded" for "not
    // sent" would send them again.
    const messageId = await recordOutbound(ports.db, {
      tenantId: d.tenantId, conversationId: d.conversationId, contactId: d.contactId,
      sender: d.sender, type: d.template ? "template" : "text", body: d.body, channel: d.channel,
      externalId: sent.wamid, status: "sent", meta: d.meta ?? {},
    }).catch((e: unknown) => {
      console.error("deliver_record_failed", JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, wamid: sent.wamid, error: e instanceof Error ? e.message : String(e) }));
      return null;
    });
    return { outcome: "sent", messageId, externalId: sent.wamid };
  }

  const failure = { http_status: sent.status, body: sent.errorBody ?? null };
  let messageId: string | null = d.messageId ?? null;
  if (d.messageId) {
    await finalizeQueued(ports.db, d, { status: "failed", error: failure });
  } else {
    // Recorded as a failed row rather than dropped: the business should see
    // that it tried and could not reach them.
    messageId = await recordOutbound(ports.db, {
      tenantId: d.tenantId, conversationId: d.conversationId, contactId: d.contactId,
      sender: d.sender, type: d.template ? "template" : "text", body: d.body, channel: d.channel,
      externalId: null, status: "failed", meta: { ...(d.meta ?? {}), ...failure },
    });
  }
  await event(ports.db, d, "message.send_failed", messageId, { ...failure, reason: sent.reason ?? "provider" });
  return { outcome: "failed", reason: sent.reason ?? "provider", status: sent.status, errorBody: sent.errorBody ?? null, messageId };
}

/**
 * Which yes a queued template needs. Meta's category is the authority -- it
 * can recategorise a live template -- and purposeOfTemplate fails closed, so
 * a template whose category we do not have reads as marketing. A read that
 * fails throws: a purpose that cannot be read is not "utility".
 */
export async function templatePurpose(db: Db, tenantId: string, template: { name: string; language: string } | undefined | null): Promise<SendPurpose> {
  if (!template) return "conversational";
  const { data, error } = await db
    .from("templates")
    .select("category")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", template.name)
    .eq("language", template.language)
    .maybeSingle();
  if (error) throw new Error(`deliver: cannot read template ${template.name}: ${error.message}`);
  return purposeOfTemplate(data?.category);
}

/**
 * The door for a caller that must never see it throw: the webhook, whose
 * outer catch only logs, so a thrown read used to be a customer's reply lost
 * with nobody told. A wire that cannot be read is a failure with its own
 * name, and the caller alerts a person the way it does for a provider's no.
 */
export async function deliverSafely(ports: DeliverPorts, d: Delivery): Promise<Delivered> {
  try {
    return await deliver(ports, d);
  } catch (e) {
    const errorBody = e instanceof Error ? e.message : String(e);
    console.error("deliver_threw", JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, error: errorBody }));
    return { outcome: "failed", reason: "wire_unreadable", status: 0, errorBody, messageId: d.messageId ?? null };
  }
}

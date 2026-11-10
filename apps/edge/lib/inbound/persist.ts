/**
 * The Postgres bookkeeping of one inbound customer message: ingest first (the
 * customer's message is never lost to a later failure), the memory read, the
 * held draft, and the sink every branch of the receptionist reports through
 * (packages/core/src/inbound/answer.ts, through its persist port). Every
 * method no-ops when Postgres is unconfigured and never throws into the
 * handling path, with one exception: pgIngest throws IngestFailed when the
 * write itself failed, because that is the one loss the provider can undo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLinkedMedia } from "@chanlytics/channels/instagram";
import { fetchMediaBytes, type WaMediaRef } from "@chanlytics/channels/whatsapp";
import { isLinkedMedia, type InboundMessage } from "@chanlytics/channels/inbound";
import { publicFetcher } from "@chanlytics/channels/shared";
import {
  ingestInbound,
  type IngestResult,
  markProcessed,
  pauseConversation,
  stampHandled,
  storeMedia,
} from "@chanlytics/db/channels";
import {
  claimReplyTurn,
  holdsReplyTurn,
  readLiveHold,
  readThreadState,
  saveMessageMedia,
  wasRepliedTo,
} from "@chanlytics/db/conversations";
import { emitEvent, recordActivation } from "@chanlytics/db/events";
import { openBookingRequest } from "@chanlytics/db/calendar";
import type { Database, Json } from "@chanlytics/db/types";
import { upsertEscalation, type EscalationOutcome } from "@chanlytics/jobs";
import {
  deliverSafely,
  IngestFailed,
  liveHoldOf,
  unreadableThread,
  type BookingRequestHold,
  type Delivered,
  type InboundChannel,
  type SendKind,
  type ThreadState,
  type Wire,
} from "@chanlytics/core";
import { loadTenantNotifications, waCfgFor, type TenantRuntime } from "../shared/tenant-runtime.js";
import { notify } from "../shared/alerts/notify.js";
import { queueDraft } from "../ai/draft-queue.js";
import { recordTokens } from "../ai/budget.js";
import {
  addressOf,
  clockTime,
  heldReplyNotice,
  type BrainIntent,
  type BrainMeta,
  type Handled,
  type SendPurpose,
  DbFailure,
} from "@chanlytics/contracts";
import { logger, errField } from "../shared/log.js";
import { noteEmailTheyGave } from "@chanlytics/db/people";
import { asJson, jsonCopyOf } from "@chanlytics/db/shared";
import type { TenantId } from "@chanlytics/contracts";

/**
 * Postgres-sourced thread state, or an UNKNOWN thread when it cannot be
 * produced — "Postgres couldn't answer", which is not "empty thread".
 *
 * Postgres is the receptionist's only memory, so there is nowhere to fall
 * back to: the handler hands an unknown thread to a person rather than
 * answering a customer mid-conversation from an invented empty history.
 */
export async function readPgThread(
  db: SupabaseClient<Database>,
  tenantId: TenantId | null,
  ing: IngestResult | null,
): Promise<ThreadState> {
  if (!db || !tenantId || !ing) return unreadableThread();
  try {
    // The memory, and beside it the thread's live hold (00132: a call in progress, a person who took it over), read
    // as the send door reads it at the wire (core liveHoldOf), so the gates can ask the door's own question before the
    // model is asked (core reply-gates.ts). A hold that could not be read is a thread that could not be, below.
    const [s, hold] = await Promise.all([
      readThreadState(db, tenantId, ing.conversation_id, ing.paused_until),
      readLiveHold(db, tenantId, ing.conversation_id),
    ]);
    return {
      history: s.history,
      pausedUntil: s.pausedUntil,
      replies: s.replies,
      // Carried so the handler does not have to infer "a text of ours has reached this person" from the history,
      // where a voice call note (an inbound row whose sender is "system") reads as an assistant turn, and a
      // campaign on another wire as something we texted.
      textedBefore: s.textedBefore,
      control: liveHoldOf(hold ?? {}),
    };
  } catch (e) {
    logger({ tenant_id: tenantId }).error("pg_thread_read_failed", { error: errField(e) });
    return unreadableThread();
  }
}

// Credential resolution moved to tenant-runtime (waCfgFor) once a second send
// path needed it; this alias keeps the call sites below unchanged.
const waCfg = waCfgFor;

/**
 * Write the receptionist's reply as a DRAFT and schedule it to fire.
 *
 * Returns the draft's id, or null when it could not be queued, and the caller
 * then sends immediately (core inbound/dispatch.ts heldOrKept). That fallback is deliberate: an un-vetoed reply is a worse
 * outcome than a vetoed one, and no reply at all is worse than both. An
 * unreachable database or a scheduling failure must not leave a customer
 * waiting on an answer that was already written.
 */
export async function queueReply(
  db: SupabaseClient<Database>,
  tenantId: TenantId | null,
  ing: IngestResult | null,
  /** Where the draft goes: the number on a phone's wire, the person's Instagram-scoped id on a DM's. */
  to: string,
  body: string,
  delayMs: number,
  log: ReturnType<typeof logger>,
  /** Why the draft waits: the hold window, or the confidence dial. */
  source: "veto_window" | "low_confidence" = "veto_window",
  /** What the row remembers about the answer (contracts/brain.ts). */
  brainMeta?: BrainMeta,
  /** The wire the draft will go out on. */
  channel: InboundChannel = "whatsapp",
): Promise<string | null> {
  if (!db || !tenantId || !ing) {
    log.warn("wa_queue_unavailable", {
      has_db: !!db,
      has_tenant: !!tenantId,
      has_ingest: !!ing,
    });
    return null;
  }
  // One writer for a held draft (lib/draft-queue.ts): the steer endpoint
  // queues the same row and the same job when an owner has one rewritten.
  const id = await queueDraft(
    db,
    {
      tenantId,
      conversationId: ing.conversation_id,
      contactId: ing.contact_id,
      to,
      body,
      delayMs,
      source,
      brainMeta,
      channel,
      // The message the draft answers (the sink's sends say it too): a text's answer taken up again finds it here.
      extra: { reply_to: ing.message_id },
    },
    log,
  );
  return id;
}

/**
 * The ingest write itself failed. The message is NOT recorded, and the provider
 * must be told so it retries.
 *
 * Declared in packages/core (inbound/ports.ts) because both sides need it: the
 * verb catches it to copy the customer's words to the workspace mailbox, and
 * this adapter throws it. Re-exported so the two doors that count it into
 * their 503 go on importing it from the module that throws it.
 */
export { IngestFailed };

/**
 * The thread's reply turn (00284; the verb's rule is core inbound/turn.ts), through its two SQL doors. A call that
 * failed throws, and the verb reads that as a turn held: a reply is never lost to this bookkeeping.
 */
export const replyTurn = { claim: claimReplyTurn, holds: holdsReplyTurn };

/**
 * Whether a reply names this message already (packages/db wasRepliedTo): what a text's answer, taken up again after its
 * runner died mid-turn, asks before it speaks (core inbound/ingest.ts). Every word a message's path says names it in
 * `meta.reply_to`: the sink's sends and queueReply's draft. No database or no workspace is nothing known to have
 * answered it.
 */
export async function readPgAnswered(
  db: SupabaseClient<Database>,
  tenantId: TenantId | null,
  ing: IngestResult,
): Promise<boolean> {
  if (!db || !tenantId) return false;
  return wasRepliedTo(db, tenantId, ing.conversation_id, ing.message_id);
}

/**
 * Persist first. A write that FAILED is IngestFailed, and so is a deployment with no database to write to: the caller
 * says so to the provider, which retries, rather than acknowledging words that exist only in an email.
 */
export async function runPgIngest(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  /** The message in the one inbound shape, on its own wire (decision 0001). */
  inboundMessage: InboundMessage & { channel: InboundChannel },
  line: string | null = null,
): Promise<IngestResult> {
  if (!db) throw new IngestFailed("no database to keep the message in");
  try {
    return await ingestInbound(db, {
      tenantId,
      channel: inboundMessage.channel,
      identityExternalId: inboundMessage.identity.externalId,
      phoneE164: inboundMessage.identity.phoneE164,
      waProfileName: inboundMessage.profileName,
      messageExternalId: inboundMessage.externalId,
      type: inboundMessage.type,
      body: inboundMessage.body,
      channelTs: inboundMessage.channelTsIso,
      media: inboundMessage.media ? asJson(inboundMessage.media) : null,
      meta: {
        raw_type: inboundMessage.rawType,
        // K3: the line it came in on and the ad it came from ride in the row's meta, where the database's own trigger
        // (00306) reads them for the first touch of the person this message made. Absent keys, never nulls.
        ...(line ? { line } : {}),
        ...(inboundMessage.referral
          ? {
              referral: {
                source_id: inboundMessage.referral.sourceId,
                source_type: inboundMessage.referral.sourceType,
              },
            }
          : {}),
      },
      optOut: inboundMessage.consent.optOut,
      optIn: inboundMessage.consent.optIn,
      optInMarketing: inboundMessage.consent.optInMarketing,
    });
  } catch (e) {
    logger().error("ingest_pg_failed", { tenant_id: tenantId, message: inboundMessage.externalId, error: errField(e) });
    throw new IngestFailed(e instanceof Error ? e.message : String(e));
  }
}

/** The steps runPgSafe guards; each logs `pg_<step>_failed`, a name in LOG_EVENTS, when it throws. */
type PgStep =
  | "allowlist_evt"
  | "booking_request"
  | "cost"
  | "echo"
  | "escalation"
  | "handled"
  | "media_fetch"
  | "note_email"
  | "offers_stop"
  | "pause"
  | "processed"
  | "reply_held"
  | "status"
  | "unreachable_evt"
  | "usage"
  | "veto_fallback_evt";

export async function runPgSafe<T>(label: PgStep, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    logger().error(`pg_${label}_failed`, { error: errField(e) });
    return undefined;
  }
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

/**
 * What a reply's usage event writes: its tokens and quality signal, and, for the receptionist's first answer to a customer
 * (not a held draft), the funnel's second milestone.
 */
async function recordUsage(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  conversationId: string,
  u: Record<string, unknown>,
): Promise<void> {
  await recordTokens(db, tenantId, conversationId, u);
  if (u.held == null) await recordActivation(db, tenantId, "first_reply", "receptionist");
}

/**
 * The message is finished with: marked processed (the deadman sweep reads it), and, when the way out says what it
 * became, stamped with that (K1, core's handled.ts). Two doors in parallel, each guarded alone, so a stamp the database
 * refuses never costs the message its processed_at and the reverse, and neither is ever thrown into the handling path.
 */
function pgProcessed(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  messageId: string,
  handled?: Handled,
  intent?: BrainIntent | null,
) {
  return Promise.all([
    runPgSafe("processed", () => markProcessed(db, tenantId, messageId)),
    handled ? pgStamp(db, tenantId, messageId, handled, intent) : undefined,
  ]);
}

/**
 * What the message became, and nothing else: the one stamp, behind its one guard and its one log line (`pg_handled_failed`).
 * `processed` writes it beside processed_at; `noteHandled` writes it alone, for the message a failed send leaves
 * unprocessed on purpose (core's handled.ts).
 */
function pgStamp(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  messageId: string,
  handled: Handled,
  intent?: BrainIntent | null,
) {
  return runPgSafe("handled", () => stampHandled(db, tenantId, messageId, handled, intent ?? null));
}

/** What the sink's `processed` says: what the message became, and what it was about where the model read it. */
type Said = [handled?: Handled, intent?: BrainIntent | null];

/**
 * The two ways a way out says its message is finished with, as the sink's methods: `processed` marks it and stamps it,
 * `noteHandled` only stamps it. Both resolve at once where there is no database, a workspace and an ingested row.
 */
function pgFinishing(db: SupabaseClient<Database> | null, tenantId: TenantId | null, ing: IngestResult | null) {
  const on = !!(db && tenantId && ing);
  return {
    processed: (...outcome: Said) => (on ? pgProcessed(db, tenantId, ing.message_id, ...outcome) : Promise.resolve()),
    noteHandled: (handled: Handled, intent?: BrainIntent | null) =>
      on ? pgStamp(db, tenantId, ing.message_id, handled, intent) : Promise.resolve(),
  };
}

/**
 * A reply in the thread they wrote in: it starts no conversation, it is about something of theirs (MessageAbout), and it
 * is no playbook's run, so no moment's (Delivery.trigger).
 */
const AN_ANSWER = { proactive: false, about: "theirs", trigger: null } as const;

/** What the draft queue says of a reply it holds: when it goes, whether the confidence dial held it, its words, whose. */
type HeldReplyFacts = { atMs: number; unsure: boolean; reply: string; who: string | null };

/**
 * The receptionist's reply waits to go in the owner's name (decision 0064, step 2): told once, as it is queued, on the
 * bell and the phones that take it (no mail: it waits minutes), opening its thread, with when it goes by the business's
 * clock. The server closes the row when the reply goes or is stopped (00462). A notice that fails is logged by runPgSafe,
 * never the reply's failure: the sink's `replyHeld`.
 */
function tellReplyHeld(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  rt: TenantRuntime | null | undefined,
  ing: IngestResult,
  heldReplyFacts: HeldReplyFacts,
) {
  return runPgSafe("reply_held", async () => {
    const target = await loadTenantNotifications(db, tenantId);
    const notice = heldReplyNotice({
      who: heldReplyFacts.who ?? "a customer",
      reply: heldReplyFacts.reply,
      at: `at ${clockTime(heldReplyFacts.atMs, rt?.timezone ?? "UTC")}`,
      unsure: heldReplyFacts.unsure,
    });
    await notify(
      { tenantId, ...target },
      {
        kind: "reply_held",
        route: addressOf({ kind: "conversation", id: ing.conversation_id }),
        about: { type: "conversation", id: ing.conversation_id },
        subject: notice.subject,
        body: notice.body,
      },
    );
  });
}

/**
 * A booking the receptionist asks for (decision 0061), the sink's `request`: the request and its hold opened together
 * (00443 booking_request_open), so neither is ever there without the other. A slot an hour away or less, or a door that
 * failed, is a person's to answer (booking_reply): the customer was told the team will confirm.
 */
async function requestOpened(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  ing: IngestResult,
  req: BookingRequestHold,
  details: string,
): Promise<EscalationOutcome | undefined> {
  try {
    const at = { tenantId, conversationId: ing.conversation_id, contactId: ing.contact_id };
    const result = await openBookingRequest(db, { ...at, ...req });
    if (!("error" in result)) return result.hold;
    logger().info("booking_request_too_soon", { tenant_id: tenantId });
  } catch (e) {
    logger().error("booking_request_open_failed", { tenant_id: tenantId, error: errField(e) });
  }
  return upsertEscalation(db, tenantId, ing.conversation_id, "booking_reply", details.slice(0, 400));
}

/** A WhatsApp attachment's bytes, asked for by its id with the workspace's own token; nothing without one, said. */
async function whatsappMediaOf(
  rt: TenantRuntime | null | undefined,
  ref: WaMediaRef,
  logFields: { tenant_id: TenantId; message: string },
): Promise<{ bytes: ArrayBuffer; mime: string | null } | null> {
  const cfg = waCfg(rt);
  // Nothing threw, so runPgSafe logs nothing: without this line a tenant whose vault read failed, or an SMS-only one, has
  // every photo and voice note their customers send stamped "failed" forever with no trace of why.
  if (!cfg) logger().error("media_no_credentials", logFields);
  return cfg ? await fetchMediaBytes(cfg, ref.provider_media_id) : null;
}

/**
 * All PG bookkeeping for one inbound message; every method no-ops when unconfigured.
 *
 * `rt` is threaded in so the media download uses the TENANT's credentials. fetchMediaBytes ran on waCfg() with no
 * argument, the environment pair, while the runtime holding this tenant's own credentials was already in scope at every
 * call site: for a second tenant that is a download attempted with another business's token against their WABA, which
 * cannot succeed, so every voice note and photo their customers send would fail to store.
 */
export function pgSink(
  db: SupabaseClient<Database>,
  tenantId: TenantId | null,
  ing: IngestResult | null,
  rt?: TenantRuntime | null,
  /** The wire this message's replies go out on. */
  channel: InboundChannel = "whatsapp",
  /** This message's wires, bound by the handler where the credentials are. */
  wire: Wire = {},
) {
  const on = !!(db && tenantId && ing);
  return {
    on,
    /**
     * The words leave through the one door (packages/core deliver): the person's consent, the thread's pause and the
     * workspace's status are re-read at the wire, the send goes on THIS message's wire, and the row is recorded either
     * way -- sent with its id, or failed with the status and a message.send_failed event. Without Postgres there is no
     * thread to re-read and no row to write, so nothing is sent: the handler has already handed such a message to a
     * person.
     *
     * The PURPOSE is the caller's, not a constant. It was hardcoded "conversational", so the one send this handler
     * makes that is genuinely marketing -- the confirmation of a YES OFFERS -- reached the door claiming to be a reply,
     * and the two rules that exist for it (the marketing yes, and offers never going by text) were never asked. The
     * default is the honest one for everything else the receptionist says.
     */
    deliver: (
      to: string,
      text: string,
      meta?: Record<string, Json>,
      purpose: SendPurpose = "conversational",
      kind?: SendKind,
    ): Promise<Delivered> =>
      on
        ? deliverSafely(
            { db, wire },
            {
              tenantId,
              conversationId: ing.conversation_id,
              contactId: ing.contact_id,
              to,
              channel,
              sender: "ai",
              purpose,
              ...AN_ANSWER,
              // What the send is, when it is not the receptionist answering:
              // an opt-in confirmation is a system message, owed whoever holds the thread.
              ...(kind ? { kind } : {}),
              body: text,
              meta: { ...meta, reply_to: ing.message_id },
            },
          )
        : Promise.resolve({
            outcome: "failed",
            reason: "no_sender_for_channel",
            status: 0,
            errorBody: "no_database",
            messageId: null,
          }),
    ...pgFinishing(db, tenantId, ing),
    allowlistSkip: () =>
      on
        ? runPgSafe("allowlist_evt", () =>
            emitEvent(db, tenantId, "ingest.allowlist_skip", "message", ing.message_id, {}),
          )
        : Promise.resolve(),
    /**
     * The sender cannot receive a reply. Recorded like any other message, and
     * not answered — see the guard in inbound.ts.
     */
    unreachableSender: () =>
      on
        ? runPgSafe("unreachable_evt", () =>
            emitEvent(db, tenantId, "ingest.unreachable_sender", "message", ing.message_id, {}),
          )
        : Promise.resolve(),
    /**
     * An address the customer gave in their own words (core's ingest.ts, contracts addressInMessage), kept only where the
     * person has none, in one call under their row's lock (db noteEmailTheyGave, 00593). Another person here holding the
     * address is said in the log, never moved: the owner merges them.
     */
    noteEmail: (address: string) =>
      on
        ? runPgSafe("note_email", async () => {
            const noted = await noteEmailTheyGave(db, tenantId, ing.contact_id, address);
            if (noted === "taken")
              logger().info("inbound_email_taken", { tenant_id: tenantId, contact: ing.contact_id });
          })
        : Promise.resolve(),
    replyHeld: (n: HeldReplyFacts) => (on ? tellReplyHeld(db, tenantId, rt, ing, n) : Promise.resolve()),
    /**
     * A veto window this workspace CONFIGURED did not happen, and the customer has the receptionist's words already. The
     * reply itself is fine — the promise the setting made is what broke, and a setting that quietly stops applying is the
     * failure mode this project keeps finding.
     */
    vetoFallback: (delayMs: number, source: "veto_window" | "low_confidence" = "veto_window") =>
      on
        ? runPgSafe("veto_fallback_evt", () =>
            emitEvent(db, tenantId, "policy.veto_window_skipped", "conversation", ing.conversation_id, {
              delay_ms: delayMs,
              // WHICH hold did not happen. The confidence dial rides this same
              // window, and labelling its hold a veto window sent owners who
              // have no veto window configured looking for one.
              source,
              // Scheduling is one insert now, so there is one cause left to name.
              reason: "scheduling_failed",
            }),
          )
        : Promise.resolve(),
    /** The thread handed to a person; its held drafts go with it, all but the one this handoff queued. */
    pause: (iso: string, keepMessageId?: string) =>
      on
        ? runPgSafe("pause", () => pauseConversation(db, tenantId, ing.conversation_id, iso, { keepMessageId }))
        : Promise.resolve(),
    /** Tokens in and out, and the quality signal beside them (intent,
     *  confidence, latency, whether it waited or handed off). */
    usage: (u: Record<string, unknown>) =>
      on ? runPgSafe("usage", () => recordUsage(db, tenantId, ing.conversation_id, u)) : Promise.resolve(),
    /** Resolves to how the escalation landed — "opened" for a new one,
     *  "refreshed" when the thread already had one open — so a caller can
     *  alert once per hold rather than once per message. Undefined when
     *  Postgres is off or the write failed. */
    escalate: (reason: string, details: string): Promise<EscalationOutcome | undefined> =>
      on
        ? runPgSafe("escalation", () =>
            upsertEscalation(db, tenantId, ing.conversation_id, reason, details.slice(0, 400)),
          )
        : Promise.resolve(undefined),
    request: (req: BookingRequestHold, details: string) =>
      on
        ? runPgSafe("booking_request", () => requestOpened(db, tenantId, ing, req, details))
        : Promise.resolve(undefined),
    /** Download from Meta, upload to storage, record where it went. Resolves
     *  to the bytes when they were fetched — a photo the receptionist looks
     *  at reads them — and to nothing on failure. A DM's attachment is a link to
     *  Meta's CDN, fetched by it (channels fetchLinkedMedia, through the guarded
     *  public fetch); WhatsApp's is asked for by its id with the tenant's token. */
    media: (inboundMessage: InboundMessage) =>
      on && inboundMessage.media
        ? runPgSafe("media_fetch", async () => {
            const ref = inboundMessage.media;
            if (!ref) return;
            const result = isLinkedMedia(ref)
              ? await fetchLinkedMedia(ref.url, publicFetcher())
              : await whatsappMediaOf(rt, ref, { tenant_id: tenantId, message: ing.message_id });
            const mediaOut = { ...ref };
            if (result) {
              const ext = MIME_EXT[result.mime || ""] || "bin";
              const path = `${tenantId}/${ing.conversation_id}/${ing.message_id}.${ext}`;
              const { error } = await storeMedia(db, path, result.bytes, result.mime || "application/octet-stream");
              if (error) throw new DbFailure(error);
              mediaOut.fetch_state = "stored";
              mediaOut.storage_path = path;
              mediaOut.mime_type = result.mime;
            } else {
              mediaOut.fetch_state = "failed";
            }
            // Checked, like the upload two lines above. A discarded error here
            // resolves as if everything worked while the row keeps
            // `fetch_state: "pending"` forever: the bytes are in storage, the
            // Inbox shows an attachment that is still downloading, and no
            // reconciliation can tell it from a genuinely in-flight fetch.
            const { error: rowErr } = await saveMessageMedia(db, tenantId, ing.message_id, jsonCopyOf(mediaOut));
            if (rowErr) throw new Error(rowErr.message);
            return result;
          })
        : Promise.resolve(null),
  };
}

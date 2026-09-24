/**
 * Everything answerInbound reaches outside itself, as one object.
 *
 * The verb is the customer path: nine hundred lines of decisions, most of them
 * pure steps (./steps.ts), joined to the world by a dozen modules -- the
 * database, the memory, the tenant runtime, the sink and the sender, the
 * alerts, the pager, the model. On the edge those were module imports, which
 * is why no test could run the handler and fifty source reads pinned its text
 * instead; here they are named ports, and the adapter that knows the tables,
 * the provider and the environment is apps/edge/lib/whatsapp/ports.ts.
 *
 * Every member was `typeof someEdgeModule` there. Written out here because a
 * verb may not import the edge: the signature is the contract, copied from the
 * declaration it used to point at. Nothing in this file decides anything.
 */
import type {
  BrainConfig,
  BrainMeta,
  CalendarConfig,
  FeaturesConfig,
  KnownFacts,
  NotificationsConfig,
  PolicyLimits,
  SendPurpose,
} from "@chanlytics/contracts";
// TYPES ONLY, and only these: the normalised message is the channels package's
// shape and the verb speaks it, but a value from channels would be a provider
// inside a verb. That is a port, not a widening (hygiene.test.mjs).
import type { NormalizedInbound, WaConfig } from "@chanlytics/channels";
import type { IngestResult, Json, LeadContext, RoutedChannel } from "@chanlytics/db";
import type { Delivered, SendKind, Sender, Wire } from "../deliver";
import type { ThreadState, ThreadTurn } from "./thread";

/** The text channels a thread can arrive on (the edge's alerts.ts says them in an owner's words). */
export type InboundChannel = "whatsapp" | "sms";

/**
 * The database handle, opaque here on purpose.
 *
 * The verb never calls it. It takes one from `db()` and hands it to the
 * persist, runtime, leads, budget and pager ports -- all of them the
 * adapter's, and the adapter is where the tables are. Typing it as the real
 * client would put @supabase/supabase-js inside a verb, which is the one thing
 * a verb may not know.
 */
export interface InboundDb {
  /**
   * The real client's table accessor. Never read here: it is only what makes a
   * genuine client satisfy this type, and an empty object not.
   */
  readonly from: unknown;
}

/**
 * The ingest write itself failed. The message is NOT recorded, and the provider
 * must be told so it retries.
 *
 * Core owns it because both sides need it: the verb catches it to copy the
 * customer's words to the workspace mailbox, and the edge's persist adapter
 * throws it (apps/edge/lib/whatsapp/persist.ts re-exports it for the two doors
 * that count it into their 503).
 */
export class IngestFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestFailed";
  }
}

/**
 * A logger with context bound to it, as the verb uses one: three levels and a
 * JSON-carrying field bag. The edge's lib/log.ts `Logger` is this plus a child;
 * the verb binds once and never narrows, so it names only what it uses.
 */
export interface InboundLog {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * The control plane's answer for one workspace, as the verb reads it: the
 * persona, the policy, the credentials, the recipients and the facts the
 * prompt states. The shape of `TenantRuntime` in apps/edge/lib/tenant-runtime.ts,
 * which is the one door that loads it.
 */
export interface InboundRuntime {
  tenantId: string;
  /** null = this tenant's receptionist does not speak (unconfigured persona —
   *  persist + escalate only; silence over someone else's voice). */
  brain: BrainConfig | null;
  notifications: NotificationsConfig | null;
  /** The calendar the receptionist may read for open times; null = none set. */
  calendar: CalendarConfig | null;
  /** Opt-in abilities (features.vision, …); null = none set. */
  features: FeaturesConfig | null;
  /** Workspace-level policy modes, class → mode. Unexpected/missing → 'ask'. */
  policy: Record<string, { mode: string; limits: PolicyLimits }>;
  /** Per-tenant WhatsApp credentials from Vault; null = the channel carries none, or the vault did not answer. */
  waCreds: { accessToken: string; phoneId: string } | null;
  /** This workspace's WhatsApp number IS the environment's own pilot line. */
  envNumber: boolean;
  /** IANA zone from `tenants.timezone`; null only when the row could not be read. */
  timezone: string | null;
  /** tenants.status = 'paused', written by billing for a workspace whose subscription stopped. */
  paused: boolean;
  /** What the platform KNOWS, as opposed to what somebody typed. */
  known: KnownFacts;
  /** True when the control plane could not be read (infra blip, not config absence). */
  loadFailed: boolean;
  /** The config row EXISTS but does not parse — a mistake somebody can fix. */
  configBroken?: boolean;
}

/**
 * Everything about a handoff other than the words: who is told, on which wire
 * the conversation is, where the bell sends the reader, and whether this branch
 * actually took the receptionist out of the thread. The edge's alerts.ts
 * `HandoffContext`.
 */
export interface InboundHandoff {
  target: {
    /** The tenant this message is ABOUT. */
    tenantId: string | null;
    /** That tenant's configured notification settings, when we could read them. */
    notifications: NotificationsConfig | null;
    /** True when this tenant is the env-default one, whose owner IS the address in LEAD_TO. */
    isEnvDefault: boolean;
  };
  /** The wire the customer wrote on. WhatsApp unless the text came in on a carrier's. */
  channel?: InboundChannel;
  /** How long the receptionist is out of this thread, when THIS branch paused it. */
  pausedHours?: number | null;
  /** Where the bell sends the reader: the thread when it is known, else the Inbox. */
  route?: string;
  /** The customer's name when the channel gave one; the number stands in otherwise. */
  who?: string | null;
  /** The conversation the row is about, so the bell can say a thing once. */
  about?: { type: string; id: string } | null;
}

/** What the model answered, and what the row remembers about it (the edge's brain.ts `BrainReply`). */
export interface InboundBrainReply {
  text: string;
  escalate: boolean;
  reason?: "human_token" | "refusal" | "brain_error";
  usage?: { input_tokens: number; output_tokens: number };
  /** Absent when the model's answer could not be read and the holding reply went out instead. */
  meta?: BrainMeta;
}

/**
 * All the Postgres bookkeeping of one inbound message, as one object every
 * branch reports through. Every method no-ops when Postgres is unconfigured and
 * none of them throws into the handling path (the edge's persist.ts `pgSink`).
 */
export interface InboundSink {
  /** Whether there is a database, a workspace and an ingested row to write against. */
  on: boolean;
  /** The words leave through the one door (../deliver.ts), which re-reads consent, the pause and the workspace's status. */
  deliver(
    to: string,
    text: string,
    meta?: Record<string, Json>,
    purpose?: SendPurpose,
    kind?: SendKind,
  ): Promise<Delivered>;
  processed(): Promise<unknown>;
  allowlistSkip(): Promise<unknown>;
  /** The sender cannot receive a reply (a short code). Recorded like any other message, and not answered. */
  unreachableSender(): Promise<unknown>;
  /** An address the customer gave in their own words: kept only where none is on file; a taken address is said, never moved. */
  noteEmail(address: string): Promise<unknown>;
  /** A veto window this workspace CONFIGURED did not happen, and the customer has the words already. */
  vetoFallback(delayMs: number, source?: "veto_window" | "low_confidence"): Promise<unknown>;
  /** The thread handed to a person; its held drafts go with it, all but the one this handoff queued. */
  pause(iso: string, keepMessageId?: string): Promise<unknown>;
  /** Tokens in and out, and the quality signal beside them. */
  usage(u: Record<string, unknown>): Promise<unknown>;
  /**
   * Resolves to how the escalation landed — "opened" for a new one, "refreshed"
   * when the thread already had one open — so a caller can alert once per hold
   * rather than once per message. Undefined when Postgres is off or the write
   * failed. The set is packages/jobs escalate.ts `EscalationOutcome`.
   */
  escalate(reason: string, details: string): Promise<"opened" | "changed" | "refreshed" | "failed" | undefined>;
  /** Download from the provider, upload to storage, record where it went. The bytes when they were fetched. */
  media(n: NormalizedInbound): Promise<{ bytes: ArrayBuffer; mime: string | null } | null | undefined>;
}

export interface InboundPorts {
  /** The database, or null when this deployment persists nothing. */
  db(): InboundDb | null;
  /** The control plane's one door: the workspace's persona, policy, credentials. */
  runtime(db: InboundDb, routed: RoutedChannel): Promise<InboundRuntime>;
  leads: {
    /** Who this person is, from the rows: the same reader the voice agent uses. */
    read(db: InboundDb, tenantId: string, phoneE164: string, historyLimit?: number): Promise<LeadContext>;
    /** People → profile → "Receptionist for …": this person's own mode, or null. */
    personReplyMode(db: InboundDb, tenantId: string, contactId: string): Promise<string | null>;
    /**
     * That context in a line or two, for the model. A VALUE from the db package
     * on the edge, so it arrives as a port rather than as an import. The zone is
     * the business's, for the dates a deal's sentence says (0004).
     */
    describe(lead: LeadContext, now?: Date, tz?: string): string;
  };
  calendar: {
    openings(rt: InboundRuntime, now?: Date): Promise<string | null>;
    visits(rt: InboundRuntime, who: { phone: string | null; name: string | null }, now?: Date): Promise<string | null>;
  };
  budget: {
    /** A rolling day of this workspace's model usage; it may stop counting at `stopAt`. */
    tokensLast24h(db: InboundDb, tenantId: string, stopAt?: number): Promise<number>;
  };
  /** The Postgres bookkeeping of one message: ingest, the memory, the held draft, the sink. */
  persist: {
    /** The rows as memory, or an UNKNOWN thread when they cannot be produced. */
    thread(db: InboundDb | null, tenantId: string | null, ing: IngestResult | null): Promise<ThreadState>;
    /** Persist first. Null when there is nothing to record for; IngestFailed when the write FAILED. */
    ingest(
      db: InboundDb | null,
      tenantId: string | null,
      n: NormalizedInbound,
      channel?: InboundChannel,
    ): Promise<IngestResult | null>;
    sink(
      db: InboundDb | null,
      tenantId: string | null,
      ing: IngestResult | null,
      rt?: InboundRuntime | null,
      channel?: InboundChannel,
      wire?: Wire,
    ): InboundSink;
    /** The reply written as a DRAFT and scheduled to fire; null when it could not be queued. */
    queueReply(
      db: InboundDb | null,
      tenantId: string | null,
      ing: IngestResult | null,
      toPhone: string,
      body: string,
      delayMs: number,
      L: InboundLog,
      source?: "veto_window" | "low_confidence",
      brainMeta?: BrainMeta,
      channel?: InboundChannel,
    ): Promise<string | null>;
  };
  /** The workspace's handoff mail: the customer's words, what the bot said, and why a person is needed. */
  alertStaff(threadId: string, userText: string, botText: string, reason: string, ctx: InboundHandoff): Promise<void>;
  /** The PLATFORM's pager, once per condition per window. Never an owner. */
  page(
    ports: { db: InboundDb },
    key: string,
    subject: string,
    body: string,
  ): Promise<"sent" | "suppressed" | "unaddressed" | "failed">;
  /** WhatsApp's wire from a workspace's credentials. */
  sender(cfg: WaConfig | null): Sender | null;
  /** The model, loaded only when there is a key: it is the one import that pulls the SDK. */
  brain(): Promise<{
    generateReply(
      history: ThreadTurn[],
      userText: string,
      systemPrompt: string,
      fallbackText: string,
      leadNote?: string,
      nowNote?: string,
      image?: { mime: string; base64: string },
      steer?: string,
    ): Promise<InboundBrainReply>;
  }>;
  /**
   * A logger FACTORY, not a logger: the verb binds the tenant once, where it
   * becomes known, and every line beneath it carries it. The edge hands in
   * `logger` from lib/log.ts, which already has this shape.
   */
  log(base: Record<string, unknown>): InboundLog;
  /**
   * Which WhatsApp credentials this message's replies leave on: the tenant's
   * own, or the environment pair for the environment's own number.
   */
  waCfg(rt?: InboundRuntime | null, arrivedOnEnvNumber?: boolean): WaConfig | null;
  env: {
    /** The pilot allowlist for the environment's own number: comma-separated E.164 digits; empty disables it. */
    allowlist: string;
    modelKey: string | undefined;
  };
}

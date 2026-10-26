/**
 * What one inbound message is, before anything is decided about it (./answer.ts is the order).
 *
 * openInbound reads the control plane and binds what stays fixed for the whole message: who wrote, on which
 * wire, the workspace's persona, policy and limits, and the logger every line carries. The phases after it
 * read these and never rebind them. The shapes they add, the ingest's and the mode in force, are declared
 * here too, so each phase is handed one type.
 */
import { phoneTail, fallbackMessages, pauseHoursOf, pauseMsOf } from "@chanlytics/contracts";
import type { BrainConfig, NotificationsConfig, SendPurpose } from "@chanlytics/contracts";
// TYPES ONLY: the one inbound shape is the channels package's, and a value from there would be a provider in a verb.
import type { InboundMessage, NormalizedInbound } from "@chanlytics/channels";
import type { IngestResult, Json } from "@chanlytics/db";
import type { Delivered } from "../deliver";
import { replyPosture } from "./reply-posture";
import type { EscalateOutcome, InboundHandoff, InboundPorts, InboundSink } from "./ports";
import { MAX_REPLIES_PER_DAY } from "./steps";
import type { ThreadState } from "./thread";
import type { InboundInput, InboundRaw } from "./answer";

/** What a phase returns when the message goes on to the next one. A phase that stops the message returns nothing. */
export const GO = Symbol("go on");

/**
 * A message in the one inbound shape, as the phases read a message today: WhatsApp's normalised record and the raw
 * fields beside it (decision 0001, step 2). Exact, field for field, for what the doors make of WhatsApp and of a text
 * (tooling/scripts/tests/inbound): the sender's digits are their number without its "+", and the provider's timestamp
 * is the second the message carries, as a number's words.
 */
function readAsToday(m: InboundMessage): { message: NormalizedInbound; raw: InboundRaw } {
  const digits = m.identity.phoneE164?.replace(/^\+/, "") ?? "";
  return {
    message: {
      waId: m.identity.externalId,
      phoneDigits: digits,
      profileName: m.profileName,
      messageId: m.externalId,
      type: m.type,
      kind: m.kind,
      rawType: m.rawType,
      body: m.body,
      channelTsIso: m.channelTsIso,
      media: m.media,
      optOut: m.consent.optOut,
      optIn: m.consent.optIn,
      optInMarketing: m.consent.optInMarketing,
      referral: m.referral,
    },
    raw: {
      id: m.externalId,
      from: digits,
      type: m.rawType,
      timestamp: m.channelTsIso === null ? null : String(Date.parse(m.channelTsIso) / 1000),
    },
  };
}

/** The control plane, read once, and everything that is fixed for this whole message. */
export async function openInbound(input: InboundInput, ports: InboundPorts) {
  const { tenantId, routed, isEnvDefault, carrier } = input;
  const { message: n, raw } = "inbound" in input ? readAsToday(input.inbound) : input;
  const from = raw.from;
  const channel: "whatsapp" | "sms" = carrier?.channel ?? "whatsapp";
  const db = ports.db();
  const t0 = Date.now();
  // Bound once, here, where the tenant becomes known. Every line below carries
  // it, which is the only way that stays true as this function changes.
  const L = ports.log({ tenant_id: tenantId, wamid: raw.id, from_tail: phoneTail(from), type: raw.type });
  // The control plane, through its one door (PRD §03). A tenant with no brain
  // profile never auto-replies, and a control plane that cannot be READ holds
  // the thread for a person: silence over someone else's voice, and no second
  // copy of anyone's profile to answer from.
  const rt = db && routed ? await ports.runtime(db, routed) : null;
  // The posture rules live in ./reply-posture.ts, dependency-free and tested as
  // a truth table — they were four inline booleans, and one of them made
  // `status='disabled'` fail to silence the receptionist.
  const posture = replyPosture({
    runtimeUsable: !!rt && !rt.loadFailed,
    policyMode: rt?.policy["reply"]?.mode,
  });
  const brainCfg: BrainConfig | null = rt?.brain ?? null;
  // What goes out in the business's name when the receptionist cannot answer, with its details as they are now (S5).
  const fallbacks = brainCfg ? fallbackMessages(brainCfg, rt?.known) : null;
  const notif: NotificationsConfig | null = rt?.notifications ?? null;
  // One addressing decision per message, reused by every alert below.
  const notifyTarget: InboundHandoff["target"] = {
    tenantId,
    notifications: notif,
    isEnvDefault,
    // Read with the runtime, so an alert's mail links the workspace's page without a read of its own.
    ...(rt?.slug !== undefined ? { slug: rt.slug } : {}),
  };
  const replyLimits = rt?.policy["reply"]?.limits ?? {};
  const maxRepliesDay = replyLimits.max_replies_day ?? MAX_REPLIES_PER_DAY;
  const pauseMs = pauseMsOf(replyLimits);
  // The number the handoff email states, read by the rule the pause and
  // Settings read, so the three never disagree about it.
  const pauseHours = pauseHoursOf(replyLimits);
  return {
    ports,
    n,
    raw,
    tenantId,
    routed,
    isEnvDefault,
    carrier,
    from,
    channel,
    db,
    t0,
    L,
    rt,
    posture,
    brainCfg,
    fallbacks,
    notifyTarget,
    replyLimits,
    maxRepliesDay,
    pauseMs,
    pauseHours,
  };
}

/** Everything fixed for this whole message, as openInbound bound it. */
export type InboundContext = Awaited<ReturnType<typeof openInbound>>;

/** What the owner's handoff notice says, when a branch tells it itself. */
export interface HoldWords {
  /** What the customer sent: their words, or what kind of message it was. */
  said: string;
  /** What the receptionist answered, or why nothing was. */
  answered: string;
  /** Why it is a person's, in the notice's words. */
  why: string;
  /** The hours this thread is paused for, when this branch paused it. */
  pausedHours?: number | null;
}

/** What the ingest adds for the phases after it: the rows, the memory, the sink, and the three ways out. */
export interface Ingested {
  ing: IngestResult | null;
  thread: ThreadState;
  ingestMs: number;
  sink: InboundSink;
  wire: (text: string) => string;
  send: (text: string, meta?: Record<string, Json>, purpose?: SendPurpose, kind?: "system") => Promise<Delivered>;
  /**
   * The owner's handoff notice, for a hold that was not written (`asked` answered failed, or nothing: no database): a hold
   * that was is told from its event, once, after the commit (decision 0043, core SUBSCRIBERS.owner_notice).
   */
  tell: (asked: Promise<EscalateOutcome> | null, words: HoldWords) => Promise<void>;
}

/** The mode in force for this one message, once the person's own setting is known. */
export interface ModeInForce {
  replyMode: string;
  personMode: string | null;
}

/** What every phase after the person's own mode is handed. */
export type Answering = InboundContext & Ingested & ModeInForce;

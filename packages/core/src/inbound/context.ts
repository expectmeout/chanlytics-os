/**
 * What one inbound message is, before anything is decided about it (./answer.ts is the order).
 *
 * openInbound reads the control plane and binds what stays fixed for the whole message: who wrote, on which
 * wire, the workspace's persona, policy and limits, and the logger every line carries. The phases after it
 * read these and never rebind them. The shapes they add, the ingest's and the mode in force, are declared
 * here too, so each phase is handed one type.
 */
import { phoneTail, fallbackMessages } from "@chanlytics/contracts";
import type { BrainConfig, NotificationsConfig, SendPurpose } from "@chanlytics/contracts";
import type { IngestResult, Json } from "@chanlytics/db";
import type { Delivered } from "../deliver";
import { replyPosture } from "./reply-posture";
import type { InboundHandoff, InboundPorts, InboundSink } from "./ports";
import { MAX_REPLIES_PER_DAY, PAUSE_MS } from "./steps";
import type { ThreadState } from "./thread";
import type { InboundInput } from "./answer";

/** What a phase returns when the message goes on to the next one. A phase that stops the message returns nothing. */
export const GO = Symbol("go on");

/** The control plane, read once, and everything that is fixed for this whole message. */
export async function openInbound(input: InboundInput, ports: InboundPorts) {
  const { message: n, raw, tenantId, routed, isEnvDefault, carrier } = input;
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
  const notifyTarget: InboundHandoff["target"] = { tenantId, notifications: notif, isEnvDefault };
  const replyLimits = rt?.policy["reply"]?.limits ?? {};
  const maxRepliesDay = replyLimits.max_replies_day ?? MAX_REPLIES_PER_DAY;
  const pauseMs = replyLimits.pause_hours ? replyLimits.pause_hours * 3600 * 1000 : PAUSE_MS;
  // The number the handoff email states. It reads the same limit the pause
  // does, so the email and Settings never disagree about it.
  const pauseHours = Math.round(pauseMs / 3600000);
  return {
    ports,
    n,
    raw,
    tenantId,
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

/** What the ingest adds for the phases after it: the rows, the memory, the sink, and the three ways out. */
export interface Ingested {
  ing: IngestResult | null;
  thread: ThreadState;
  ingestMs: number;
  sink: InboundSink;
  wire: (text: string) => string;
  send: (text: string, meta?: Record<string, Json>, purpose?: SendPurpose, kind?: "system") => Promise<Delivered>;
  tell: (userText: string, botText: string, reason: string, pausedHours?: number | null) => Promise<void>;
}

/** The mode in force for this one message, once the person's own setting is known. */
export interface ModeInForce {
  replyMode: string;
  personMode: string | null;
}

/** What every phase after the person's own mode is handed. */
export type Answering = InboundContext & Ingested & ModeInForce;

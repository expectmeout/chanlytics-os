/**
 * What a workspace's capabilities are, computed from records.
 *
 * PRD ON-02: a capability is available only when its records allow it;
 * readiness and owner activation are separate; blockers carry a code a
 * machine can act on and words a person can. Nothing here is persisted but
 * the owner's activation (capability_activations, 00108). Evidence is what
 * the records show -- a call answered, a message replied to -- never a claim
 * the product makes about itself.
 *
 * Texting is deliberately the honest one: until the carriers approve a real
 * registration it is not sold, and this says so rather than "not yet".
 */
import type { SetupDto } from "./setup";
import { lineCredentialFailure } from "../lines/line-failure";
import { agoWords } from "../shared/time";

export const CAPABILITY_KINDS = ["voice", "whatsapp", "sms"] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

/** One row of capability_activations, as the dashboard reads it. */
export interface ActivationRecord {
  capability: CapabilityKind;
  activated_at: string;
  activated_by: string | null;
  deactivated_at: string | null;
  note?: string | null;
}

export interface CapabilityBlocker {
  /** Stable, for a machine: no_line, line_provisioning, line_failed, channel_off, no_business_facts, not_connected, meta_waiting, texting_not_sold. */
  code: string;
  words: string;
}

export interface CapabilityStatus {
  kind: CapabilityKind;
  /** The records say it can work. */
  ready: boolean;
  /** Why not, in dependency order; empty when ready. */
  blockers: CapabilityBlocker[];
  /** The last real interaction on the capability: evidence that it works, never a claim. */
  tested: { at: string; what: string } | null;
  /** The owner's act, when it stands (not deactivated). */
  activated: { at: string; by: string | null } | null;
  /** ready, tested and activated: what the product may say is live. */
  live: boolean;
  /** One sentence for the owner. */
  words: string;
}

export type CapabilityInputs = Pick<SetupDto, "channels" | "business" | "templates" | "lines"> & {
  activations?: ActivationRecord[];
};

function activationOf(i: CapabilityInputs, kind: CapabilityKind): CapabilityStatus["activated"] {
  const r = (i.activations ?? []).find((a) => a.capability === kind && !a.deactivated_at);
  return r ? { at: r.activated_at, by: r.activated_by } : null;
}

const factsMissing = (i: CapabilityInputs): CapabilityBlocker | null =>
  !i.business.name || !i.business.hours
    ? {
        code: "no_business_facts",
        words: "The receptionist has no facts to answer with yet: the business name and hours first.",
      }
    : null;

export function capabilityStatus(kind: CapabilityKind, i: CapabilityInputs, nowMs = Date.now()): CapabilityStatus {
  const blockers: CapabilityBlocker[] = [];
  let tested: CapabilityStatus["tested"] = null;

  if (kind === "voice") {
    const v = i.channels.voice;
    const own = i.lines?.rows.find((l) => l.provider !== "carrier") ?? null;
    if (v.present && v.active) {
      const f = factsMissing(i);
      if (f) blockers.push(f);
    } else if (v.present) {
      blockers.push({ code: "channel_off", words: "Your line is switched off." });
    } else if (own && own.voice_state === "provisioning") {
      blockers.push({ code: "line_provisioning", words: "Your line is being set up; it answers the moment it is." });
    } else if (own && own.voice_state === "failed" && lineCredentialFailure(own.last_error)) {
      blockers.push({
        code: "line_failed",
        words:
          "Setting up your line stopped at the vault that keeps its credentials; a person at Chanlytics has it, and a retry cannot help until they restore them.",
      });
    } else if (own && own.voice_state === "failed") {
      blockers.push({
        code: "line_failed",
        words: "Setting up your line stopped; a person at Chanlytics has it, and Retry is on the row.",
      });
    } else {
      blockers.push({ code: "no_line", words: "No line yet: get a number, or keep the one you have." });
    }
    if (v.lastInboundAt) tested = { at: v.lastInboundAt, what: "a call was answered" };
  } else if (kind === "whatsapp") {
    const w = i.channels.whatsapp;
    if (w.present && w.active) {
      const t = i.templates;
      if (t.approved === 0 && t.pending > 0)
        blockers.push({ code: "meta_waiting", words: "Your first messages are with Meta for approval." });
      const f = factsMissing(i);
      if (f) blockers.push(f);
    } else if (w.present) {
      blockers.push({ code: "channel_off", words: "Your WhatsApp number is connected but switched off." });
    } else {
      blockers.push({ code: "not_connected", words: "Connect the WhatsApp number customers write to." });
    }
    if (w.lastInboundAt) tested = { at: w.lastInboundAt, what: "a message was answered" };
  } else {
    const line = i.lines?.rows.find((l) => l.sms_state === "active" && !l.reg_mock) ?? null;
    if (!line)
      blockers.push({
        code: "texting_not_sold",
        words: "Texting is not part of what is sold yet: it arrives with a line the carriers have approved.",
      });
  }

  const ready = blockers.length === 0;
  const activated = activationOf(i, kind);
  const live = ready && !!tested && !!activated;
  const words = live
    ? `Active since ${agoWords(Date.parse(activated.at), nowMs)}.`
    : activated && !ready
      ? `Activated, but not ready: ${blockers[0].words}`
      : ready && tested
        ? `Tested (${tested.what} ${agoWords(Date.parse(tested.at), nowMs)}). Activate it to say it is yours.`
        : ready
          ? "Ready. Try it from your own phone, then activate it."
          : blockers[0].words;
  return { kind, ready, blockers, tested, activated, live, words };
}

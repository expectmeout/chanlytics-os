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
import type { SetupDto } from "./lines";
import { lineCredentialFailure } from "../lines/failure";
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
        words: "AI has no facts to answer with yet: the business name and hours first.",
      }
    : null;

/** What stands between the phone line and a call answered: the facts, a line switched off, being set up, failed, or none yet. */
function voiceBlockersOf(inputs: CapabilityInputs): CapabilityBlocker[] {
  const voice = inputs.channels.voice;
  const own = inputs.lines?.rows.find((l) => l.provider !== "carrier") ?? null;
  if (voice.present && voice.active) {
    const f = factsMissing(inputs);
    return f ? [f] : [];
  }
  if (voice.present) return [{ code: "channel_off", words: "Your line is switched off." }];
  if (own && own.voice_state === "provisioning")
    return [{ code: "line_provisioning", words: "Your line is being set up · it answers the moment it is." }];
  if (own && own.voice_state === "failed" && lineCredentialFailure(own.last_error))
    return [
      {
        code: "line_failed",
        words:
          "Setting up your line stopped at the vault that keeps its keys. Chanlytics is on it, and trying again can't help until they're restored.",
      },
    ];
  if (own && own.voice_state === "failed")
    return [
      {
        code: "line_failed",
        words: "Setting up your line stopped · a person at Chanlytics has it, and Retry is on the row.",
      },
    ];
  return [{ code: "no_line", words: "No line yet: get a number, or keep the one you have." }];
}

/** What stands between WhatsApp and a message answered: Meta's approval of the first messages, the facts, or the number. */
function whatsappBlockersOf(inputs: CapabilityInputs): CapabilityBlocker[] {
  const whatsapp = inputs.channels.whatsapp;
  if (whatsapp.present && whatsapp.active) {
    const blockers: CapabilityBlocker[] = [];
    const t = inputs.templates;
    if (t.approved === 0 && t.pending > 0)
      blockers.push({ code: "meta_waiting", words: "Your first messages are with Meta for approval." });
    const f = factsMissing(inputs);
    if (f) blockers.push(f);
    return blockers;
  }
  if (whatsapp.present) return [{ code: "channel_off", words: "Your WhatsApp number is connected but switched off." }];
  return [{ code: "not_connected", words: "Connect the WhatsApp number customers write to." }];
}

/** Texting: nothing stands in its way but a line the phone networks have approved. */
function textingBlockersOf(inputs: CapabilityInputs): CapabilityBlocker[] {
  const line = inputs.lines?.rows.find((l) => l.sms_state === "active" && !l.reg_mock) ?? null;
  return line
    ? []
    : [
        {
          code: "texting_not_sold",
          words: "Texting is not part of what is sold yet: it arrives with a line the phone networks have approved.",
        },
      ];
}

/** When the capability was last seen working: a call answered, or a message answered. */
function testedOf(kind: CapabilityKind, inputs: CapabilityInputs): CapabilityStatus["tested"] {
  if (kind === "voice") {
    const at = inputs.channels.voice.last_inbound_at;
    return at ? { at, what: "a call was answered" } : null;
  }
  if (kind === "whatsapp") {
    const at = inputs.channels.whatsapp.last_inbound_at;
    return at ? { at, what: "a message was answered" } : null;
  }
  return null;
}

/** What the row says: active since when, on but not ready, tested and waiting to be turned on, ready to try, or what stands in its way. */
function capabilityWords(
  status: Pick<CapabilityStatus, "ready" | "blockers" | "tested" | "activated" | "live">,
  nowMs: number,
): string {
  const { ready, blockers, tested, activated } = status;
  if (status.live && activated) return `Active since ${agoWords(Date.parse(activated.at), nowMs)}.`;
  if (activated && !ready) return `Turned on, but not ready: ${blockers[0]?.words ?? ""}`;
  if (ready && tested)
    return `Tested (${tested.what} ${agoWords(Date.parse(tested.at), nowMs)}). Turn it on to say it is yours.`;
  if (ready) return "Ready. Try it from your own phone, then turn it on.";
  return blockers[0]?.words ?? "";
}

export function capabilityStatus(
  kind: CapabilityKind,
  capabilityInputs: CapabilityInputs,
  nowMs = Date.now(),
): CapabilityStatus {
  const blockers =
    kind === "voice"
      ? voiceBlockersOf(capabilityInputs)
      : kind === "whatsapp"
        ? whatsappBlockersOf(capabilityInputs)
        : textingBlockersOf(capabilityInputs);
  const tested = testedOf(kind, capabilityInputs);
  const ready = blockers.length === 0;
  const activated = activationOf(capabilityInputs, kind);
  const live = ready && !!tested && !!activated;
  const words = capabilityWords({ ready, blockers, tested, activated, live }, nowMs);
  return { kind, ready, blockers, tested, activated, live, words };
}

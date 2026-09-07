/**
 * Keep the number you have: forward its calls to the receptionist's line.
 *
 * Forwarding needs no provisioning (plan §5). The product gives the owner
 * the code to dial on the phone that has the number, in their carrier's
 * words, then a test window: a call to the kept number that arrives on the
 * receptionist's line inside the window marks the row verified. The rule
 * lives here, pure, so the webhook and a test apply the same one.
 *
 * Codes: Verizon's and AT&T's every-call codes come from the carriers' own
 * pages; the conditional codes are the ones the carriers document for their
 * networks (GSM on AT&T and T-Mobile). Phones and plans differ, so every
 * card says what to do when a code is refused.
 */
import { normalizePhone } from "./phone";

export type Carrier = "verizon" | "att" | "tmobile" | "other";
export type ForwardingMode = "unanswered" | "always";

export const CARRIERS: readonly Carrier[] = ["verizon", "att", "tmobile", "other"];
export const FORWARDING_MODES: readonly ForwardingMode[] = ["unanswered", "always"];

export const CARRIER_WORDS: Record<Carrier, string> = {
  verizon: "Verizon",
  att: "AT&T",
  tmobile: "T-Mobile",
  other: "Another carrier or a landline",
};

export const MODE_WORDS: Record<ForwardingMode, string> = {
  unanswered: "Only calls you don't answer",
  always: "Every call",
};

/** How long a test window stays open once the owner presses Test it. */
export const FORWARDING_TEST_WINDOW_MS = 30 * 60_000;

export interface ForwardingCode {
  /** As dialed. */
  code: string;
  /** A tel: link a phone can dial: + and # escaped, * kept. */
  tel: string;
}

export interface ForwardingCodes {
  on: ForwardingCode;
  off: ForwardingCode;
  /** What the owner should know, in order: how to dial, what can break it. */
  notes: string[];
}

export function telHref(code: string): string {
  return `tel:${code.replace(/\+/g, "%2B").replace(/#/g, "%23")}`;
}

/** The ten national digits of a +1 number; every digit otherwise. */
function national(e164: string): string {
  const d = e164.replace(/[^\d]/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

const code = (c: string): ForwardingCode => ({ code: c, tel: telHref(c) });

const UNANSWERED_NOTE =
  "Your phone rings first. After your carrier's timer, usually 15 to 30 seconds, the call comes to the receptionist. If voicemail picks up first, calls never arrive: ask your carrier to lengthen the ring time, or forward every call.";
const DIAL_NOTE = "Dial it on the phone that has the number you keep, wait for the tone or the message, then hang up.";

export function forwardingCodes(carrier: Carrier, mode: ForwardingMode, destinationE164: string): ForwardingCodes {
  const n10 = national(destinationE164);
  const full = normalizePhone(destinationE164) ?? destinationE164;
  const conditional = mode === "unanswered";
  switch (carrier) {
    case "verizon":
      return {
        on: code(conditional ? `*71${n10}` : `*72${n10}`),
        off: code("*73"),
        notes: [DIAL_NOTE, ...(conditional ? [UNANSWERED_NOTE] : []), "Verizon forwards calls only, never texts."],
      };
    case "att":
      return {
        on: code(conditional ? `*61*${n10}#` : `*21*${n10}#`),
        off: code(conditional ? "#61#" : "#21#"),
        notes: [
          DIAL_NOTE,
          ...(conditional
            ? [UNANSWERED_NOTE, `Busy too: dial *67*${n10}#. If AT&T refuses these codes, dial *92 then the number for no answer and *90 then the number for busy, or ask AT&T for your plan's codes.`]
            : []),
        ],
      };
    case "tmobile":
      return {
        on: code(conditional ? `**004*${full}#` : `**21*${full}#`),
        off: code(conditional ? "##004#" : "##21#"),
        notes: [DIAL_NOTE, ...(conditional ? [UNANSWERED_NOTE] : []), "T-Mobile takes the number with +1 in front."],
      };
    default:
      return {
        on: code(conditional ? `*92${n10}` : `*72${n10}`),
        off: code(conditional ? "*93" : "*73"),
        notes: [
          DIAL_NOTE,
          ...(conditional ? [UNANSWERED_NOTE] : []),
          "Codes vary by carrier. If these are refused, ask your carrier for its call-forwarding codes: most landlines use *72 for every call and *92 or *71 for calls you don't answer.",
        ],
      };
  }
}

/** What the page and the webhook read off a forwarded line's facts. */
export interface ForwardingFacts {
  carrier?: string | null;
  mode?: string | null;
  destination_e164?: string | null;
  test_from?: string | null;
  test_started_at?: string | null;
  test_until?: string | null;
  verified_at?: string | null;
}

export const isCarrier = (v: unknown): v is Carrier => typeof v === "string" && (CARRIERS as readonly string[]).includes(v);
export const isForwardingMode = (v: unknown): v is ForwardingMode => typeof v === "string" && (FORWARDING_MODES as readonly string[]).includes(v);

/**
 * The verification rule: an inbound call that started inside the test
 * window, on the receptionist's line, from the phone the owner said they
 * would call from when they said one. A minute of clock slack at the start:
 * the owner's phone and ours do not agree to the second.
 */
export function forwardingMatch(
  facts: ForwardingFacts,
  call: { fromE164: string | null; toE164: string | null; startedAtIso: string | null },
  nowMs: number = Date.now(),
): boolean {
  const started = call.startedAtIso ? Date.parse(call.startedAtIso) : nowMs;
  const from = typeof facts.test_started_at === "string" ? Date.parse(facts.test_started_at) : NaN;
  const until = typeof facts.test_until === "string" ? Date.parse(facts.test_until) : NaN;
  if (Number.isNaN(started) || Number.isNaN(from) || Number.isNaN(until)) return false;
  if (started < from - 60_000 || started > until) return false;
  const dest = typeof facts.destination_e164 === "string" ? normalizePhone(facts.destination_e164) : null;
  if (dest && call.toE164 && normalizePhone(call.toE164) !== dest) return false;
  const testFrom = typeof facts.test_from === "string" && facts.test_from ? normalizePhone(facts.test_from) : null;
  if (testFrom && (!call.fromE164 || normalizePhone(call.fromE164) !== testFrom)) return false;
  return true;
}

/** Whether a test window is open at `nowMs`. */
export function forwardingTestOpen(facts: ForwardingFacts, nowMs: number = Date.now()): boolean {
  const until = typeof facts.test_until === "string" ? Date.parse(facts.test_until) : NaN;
  return !Number.isNaN(until) && until > nowMs;
}

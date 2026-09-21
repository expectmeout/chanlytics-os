/**
 * One tone vocabulary for every state the product shows.
 *
 * Six tones, and what each means everywhere, so the same colour never says
 * two things on two pages:
 *
 *   accent   live, right now -- the signature accent, never decorative
 *   warn     a person is needed, or should look
 *   info     in progress, scheduled, on its way, waiting on someone else
 *   ok       done, healthy, approved, connected, answered
 *   danger   failed, refused, broken
 *   plain    neutral: ended, quiet, not started, unknown
 *
 * Before this map the pages spent the tones by feel. "Needs you" was the
 * accent in the Inbox, amber in Conversations and the accent again on a
 * playbook; a broadcast's scheduled and failed states wore the same neutral
 * pill; the People list kept a four-colour class family of its own; ten
 * components drew a pill, each with its own colours. One map, one pill
 * (data-bits.jsx StatePill, through the chrome bridge), and the words from
 * the label maps contracts already keeps.
 *
 * The toast's tones (chrome.ts) are the four of these that a flash can be.
 */
import { BROADCAST_STATE_LABELS } from "./broadcasts";
import { PERSON_MODE_WORDS, PERSON_STATE_LABELS } from "./people";
import { ROLE_WORDS } from "./identity";
import { SETUP_STATE_WORDS } from "./setup";
import { CALENDAR_FEED_WORDS } from "./calendar";
import { SOURCE_WORDS, type FactSource } from "./facts";
import {
  LEAD_CALL_OUTCOME_TONES, LEAD_CALL_OUTCOME_WORDS, LEAD_CLASS_WORDS,
  LEAD_EMAIL_WORDS, LEAD_FIT_WORDS, LEAD_STAGE_WORDS,
} from "./leads";

export type Tone = "accent" | "warn" | "info" | "ok" | "danger" | "plain";
export const TONES: readonly Tone[] = ["accent", "warn", "info", "ok", "danger", "plain"];

/** The families of state a pill can name. */
export type StateKind =
  | "thread"      // an Inbox thread, or a Conversations row's outcome
  | "standing"    // what the receptionist is doing on a thread right now (people.ts rightNow)
  | "call"        // a phone call, on Live or in Conversations
  | "person"      // People's smart-list state
  | "consent"     // a person's answer
  | "mode"        // the receptionist's mode for one person
  | "broadcast"
  | "playbook"
  | "template"    // a WhatsApp template at Meta
  | "template_quality" // the rating WhatsApp gives a template (its quality_score)
  | "setup"       // a Setup row
  | "role"        // a teammate's role
  | "tone"        // a tone the caller already holds (a Connections row, the back office), said as itself
  | "calendar"    // the calendar feed the receptionist reads: the Calendar's pill, Connections and Setup (C3)
  /** Where a fact came from: the chip beside a value on the Business tab. */
  | "fact"
  | "escalation"
  // Leads. The scope had registered none of these and grew a private colour family instead, which drifted in five
  // places: a mailbox still being checked read as "nothing there", a bounce drew fainter than a success, and the
  // accent -- which this file reserves for what is live right now -- sat on Ready, the state every lead starts in.
  | "lead_class"        // qualified, needs review, left out
  | "lead_stage"        // ready, contacted, talking, closed
  | "lead_fit"          // how well the lead matches what the search asked for
  | "reach"             // a mailbox's state: the Reach column, and the peek's email row
  | "lead_call_outcome";

/**
 * The tone of each source a fact can have, typed by `FactSource` itself.
 *
 * Not inlined below, and the difference matters. `LABEL_OF.fact` spreads
 * `SOURCE_WORDS`, which IS typed by `FactSource` — so a sixth source forces
 * that map to answer and flows through automatically. `TONE_OF`'s value type
 * is `Record<string, Tone>`, so an inlined literal here would let the new
 * source gain a label and quietly keep no tone: a grey pill with a raw
 * internal string on it, and a label that looks handled. The provenance this
 * models has already drifted once in production (facts.ts), so it is the kind
 * of set that grows.
 */
const FACT_SOURCE_TONE: Record<FactSource, Tone> = {
  verified: "ok",
  provisioned: "ok",
  workspace: "plain",
  typed: "plain",
  absent: "plain",
};

const TONE_OF: Record<StateKind, Record<string, Tone>> = {
  thread: { escalated: "warn", needs_you: "warn", snoozed: "info", done: "plain", open: "plain", handled: "plain", booked: "ok", decided: "ok" },
  standing: { escalated: "warn", queued: "info", snoozed: "info", paused: "plain", silent: "plain", answering: "ok" },
  call: { live: "accent", missed: "plain", handled: "plain", stale: "plain", ended: "plain", abandoned: "warn", callback: "warn" },
  person: { needs_you: "warn", waiting_on_you: "warn", new: "info", active: "ok", quiet: "plain", opted_out: "plain" },
  consent: { opted_in: "ok", opted_out: "warn", unknown: "plain" },
  mode: { auto: "ok", ask: "warn", never: "plain", inherit: "plain" },
  broadcast: { pending_approval: "warn", scheduled: "info", sending: "accent", sent: "ok", canceled: "plain", failed: "danger" },
  playbook: { running: "accent", paused: "warn", approval: "warn" },
  template: { approved: "ok", pending: "info", rejected: "danger", paused: "warn", disabled: "warn" },
  template_quality: { GREEN: "ok", YELLOW: "warn", RED: "danger", UNKNOWN: "plain" },
  setup: { waiting_you: "warn", waiting_them: "info", ready: "ok", not_started: "plain" },
  role: { owner: "info", operator: "plain", viewer: "plain" },
  tone: { accent: "accent", warn: "warn", info: "info", ok: "ok", danger: "danger", plain: "plain" },
  calendar: { ok: "ok", stale: "warn", unavailable: "warn", none: "plain" },
  // Two sources are a claim somebody else stands behind; the rest are neutral, and a
  // disagreement is warn because a person has to settle it. `disputed` is not a
  // FactSource -- it is what the caller passes when a typed value and a verified one
  // disagree, and only the page knows that.
  fact: { ...FACT_SOURCE_TONE, disputed: "warn" },
  escalation: { open: "warn", resolved: "ok" },
  // Ready is the silent default every lead starts in, so it is plain: the eye should be drawn to what has moved.
  lead_class: { qualified: "plain", review: "warn", excluded: "plain" },
  lead_stage: { ready: "plain", nurture: "info", converted: "ok", archived: "plain" },
  // A strong fit is a good outcome, not an urgent one. Only the accent means "right now".
  lead_fit: { strong: "ok", look: "plain", long: "plain" },
  // A check still running is in progress; a server that accepts every address is a caveat; a bounce is a failure.
  reach: { ok: "ok", catch_all: "warn", checking: "info", unknown: "warn", invalid: "danger", none: "plain" },
  lead_call_outcome: LEAD_CALL_OUTCOME_TONES,
};

/** The words a pill says when the page has none better. */
const LABEL_OF: Partial<Record<StateKind, Record<string, string>>> = {
  thread: { escalated: "Needs you", needs_you: "Needs you", snoozed: "Snoozed", done: "Done", open: "Customer wrote last", handled: "Receptionist replied", booked: "Booked", decided: "Handled" },
  standing: { escalated: "Needs you", queued: "Reply queued", snoozed: "Snoozed", paused: "Paused", silent: "Silent", answering: "Answering" },
  call: { live: "Live", missed: "Never connected", handled: "Handled", stale: "No word from the provider", ended: "Ended", abandoned: "Hung up early", callback: "Asked for a call back" },
  person: PERSON_STATE_LABELS,
  consent: { opted_in: "Opted in", opted_out: "Opted out", unknown: "Consent unknown" },
  mode: PERSON_MODE_WORDS,
  broadcast: BROADCAST_STATE_LABELS,
  playbook: { running: "Running", paused: "Paused", approval: "Needs you" },
  template: { approved: "Approved", pending: "In review", rejected: "Rejected", paused: "Paused", disabled: "Disabled" },
  template_quality: { GREEN: "High quality", YELLOW: "Medium quality", RED: "Low quality", UNKNOWN: "Quality not rated yet" },
  setup: SETUP_STATE_WORDS,
  role: ROLE_WORDS,
  calendar: CALENDAR_FEED_WORDS,
  // facts.ts already wrote these words for the row; a second copy is one that would drift.
  fact: { ...SOURCE_WORDS, disputed: "doesn't match" },
  escalation: { open: "Open", resolved: "Resolved" },
  lead_class: LEAD_CLASS_WORDS,
  lead_stage: LEAD_STAGE_WORDS,
  lead_fit: LEAD_FIT_WORDS,
  reach: LEAD_EMAIL_WORDS,
  lead_call_outcome: LEAD_CALL_OUTCOME_WORDS,
};

/** The tone for a state, or plain for one this map has never heard of. */
export function stateTone(kind: StateKind, value: unknown): Tone {
  return (typeof value === "string" && TONE_OF[kind][value]) || "plain";
}

/** The words for a state, or the value itself when nobody has written any. */
export function stateLabel(kind: StateKind, value: unknown): string {
  const v = typeof value === "string" ? value : String(value ?? "");
  return LABEL_OF[kind]?.[v] ?? v;
}

/** Both at once: what the pill draws. */
export function stateOf(kind: StateKind, value: unknown): { tone: Tone; label: string } {
  return { tone: stateTone(kind, value), label: stateLabel(kind, value) };
}

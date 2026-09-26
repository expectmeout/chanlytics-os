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
  LEAD_CALL_OUTCOME_TONES,
  LEAD_CALL_OUTCOME_WORDS,
  LEAD_CLASS_WORDS,
  LEAD_EMAIL_WORDS,
  LEAD_FIT_WORDS,
  LEAD_LEFT_OUT_WORD,
  LEAD_REVIEW_WORD,
  LEAD_STAGE_WORDS,
} from "./leads";
import { DEAL_STAGE_WORDS } from "./deals";

export type Tone = "accent" | "warn" | "info" | "ok" | "danger" | "plain";
export const TONES: readonly Tone[] = ["accent", "warn", "info", "ok", "danger", "plain"];

/** The families of state a pill can name. */
export type StateKind =
  | "thread" // an Inbox thread, or a Conversations row's outcome
  | "standing" // what the receptionist is doing on a thread right now (people.ts rightNow)
  | "call" // a phone call, on Live or in Conversations
  | "person" // People's smart-list state
  | "consent" // a person's answer
  | "mode" // the receptionist's mode for one person
  | "broadcast"
  | "playbook"
  | "template" // a WhatsApp template at Meta
  | "template_quality" // the rating WhatsApp gives a template (its quality_score)
  | "setup" // a Setup row
  | "role" // a teammate's role
  | "tone" // a tone the caller already holds (a Connections row, the back office), said as itself
  | "calendar" // the calendar feed the receptionist reads: the Calendar's pill, Connections and Setup (C3)
  /** Where a fact came from: the chip beside a value on the Business tab. */
  | "fact"
  | "escalation"
  // Leads. The scope had registered none of these and grew a private colour family instead, which drifted in five
  // places: a mailbox still being checked read as "nothing there", a bounce drew fainter than a success, and the
  // accent -- which this file reserves for what is live right now -- sat on Ready, the state every lead starts in.
  | "lead_class" // qualified, needs review, left out
  | "lead_stage" // ready, contacted, talking, closed
  | "lead_fit" // how well the lead matches what the search asked for
  | "reach" // a mailbox's state: the Reach column, and the peek's email row
  | "lead_call_outcome"
  // The row's own state, which its left edge, its tag and its pin on the map all say. The map kept a sixth
  // private family for exactly this, in CSS, keyed by words no tone vocabulary knows.
  | "lead_row_state"
  | "deal"; // a deal's stage on a person (0004): proposed, won, lost, ended

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

/**
 * Built inside a call marked pure, and the difference is what the four packages
 * that bundle contracts carry. The spread in `fact` below is a side effect to the
 * bundler (a spread can run a getter), so a plain literal here kept this table,
 * `LABEL_OF` and every word map they name in the channels, core, db and jobs
 * dists, none of which reads a pill. Marked pure, an unused table is dropped.
 */
const TONE_OF: Record<StateKind, Record<string, Tone>> = /* @__PURE__ */ (() => ({
  thread: {
    escalated: "warn",
    needs_you: "warn",
    snoozed: "info",
    done: "plain",
    open: "plain",
    handled: "plain",
    booked: "ok",
    decided: "ok",
  },
  standing: { escalated: "warn", queued: "info", snoozed: "info", paused: "plain", silent: "plain", answering: "ok" },
  call: {
    live: "accent",
    missed: "plain",
    handled: "plain",
    stale: "plain",
    ended: "plain",
    abandoned: "warn",
    callback: "warn",
  },
  person: {
    needs_you: "warn",
    waiting_on_you: "warn",
    new: "info",
    active: "ok",
    quiet: "plain",
    opted_out: "plain",
    unheard: "plain",
  },
  consent: { opted_in: "ok", opted_out: "warn", unknown: "plain" },
  mode: { auto: "ok", ask: "warn", never: "plain", inherit: "plain" },
  broadcast: {
    pending_approval: "warn",
    scheduled: "info",
    sending: "accent",
    sent: "ok",
    canceled: "plain",
    failed: "danger",
  },
  // Running is a standing rule that is on -- healthy, ok. It is not happening
  // right now: its RUN is, while it sends, and that is the broadcast's own
  // "sending", which keeps the accent.
  playbook: { running: "ok", paused: "warn", approval: "warn" },
  template: { approved: "ok", pending: "info", rejected: "danger", paused: "warn", disabled: "warn" },
  template_quality: { GREEN: "ok", YELLOW: "warn", RED: "danger", UNKNOWN: "plain" },
  setup: { waiting_you: "warn", waiting_them: "info", ready: "ok", not_started: "plain" },
  // A role is a name, not a state: Team draws it as a chip. Blue on the owner said "in progress".
  role: { owner: "plain", operator: "plain", partner: "plain", viewer: "plain" },
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
  // `contacted` and `talking` are `nurture` and `converted` in the owner's words, so they take those tones.
  // Review is the one state that wants a person. Ready and left-out are both silent, for opposite reasons.
  lead_row_state: { ready: "plain", contacted: "info", talking: "ok", review: "warn", out: "plain" },
  // A proposal out is waiting on someone else; a client is a good outcome; passed and ended are quiet.
  deal: { proposed: "info", won: "ok", lost: "plain", ended: "plain" },
}))();

/** The words a pill says when the page has none better. Marked pure for the reason `TONE_OF` is. */
const LABEL_OF: Partial<Record<StateKind, Record<string, string>>> = /* @__PURE__ */ (() => ({
  thread: {
    escalated: "Needs you",
    needs_you: "Needs you",
    snoozed: "Snoozed",
    done: "Done",
    open: "Customer wrote last",
    handled: "Receptionist replied",
    booked: "Booked",
    decided: "Handled",
  },
  standing: {
    escalated: "Needs you",
    queued: "Reply queued",
    snoozed: "Snoozed",
    paused: "Paused",
    silent: "Silent",
    answering: "Answering",
  },
  call: {
    live: "Live",
    missed: "Never connected",
    handled: "Handled",
    stale: "No word from the provider",
    ended: "Ended",
    abandoned: "Hung up early",
    callback: "Asked for a call back",
  },
  person: PERSON_STATE_LABELS,
  consent: { opted_in: "Opted in", opted_out: "Opted out", unknown: "Consent unknown" },
  mode: PERSON_MODE_WORDS,
  broadcast: BROADCAST_STATE_LABELS,
  playbook: { running: "Running", paused: "Paused", approval: "Needs you" },
  template: {
    approved: "Approved",
    pending: "In review",
    rejected: "Rejected",
    paused: "Paused",
    disabled: "Disabled",
  },
  template_quality: {
    GREEN: "High quality",
    YELLOW: "Medium quality",
    RED: "Low quality",
    UNKNOWN: "Quality not rated yet",
  },
  setup: SETUP_STATE_WORDS,
  role: ROLE_WORDS,
  calendar: CALENDAR_FEED_WORDS,
  // facts.ts already wrote these words for the row; a second copy is one that would drift.
  fact: { ...SOURCE_WORDS, disputed: "doesn't match" },
  escalation: { open: "Open", resolved: "Resolved" },
  lead_class: LEAD_CLASS_WORDS,
  lead_stage: LEAD_STAGE_WORDS,
  deal: DEAL_STAGE_WORDS,
  lead_fit: LEAD_FIT_WORDS,
  reach: LEAD_EMAIL_WORDS,
  lead_call_outcome: LEAD_CALL_OUTCOME_WORDS,
  // `lead_row_state` is a tone and no words: the row composes its own tag (`Contacted · 2m`) in toLeadRowVM,
  // and nothing ever asks this map for it. Words here would be a second set of the same five. A map whose
  // values are read off another map (`LEAD_STAGE_WORDS.ready`) once kept this whole registry and its five
  // label maps in channels, core, db and jobs: +693 lines for words nobody reads. Built in a call marked pure
  // (see TONE_OF), this map is dropped wherever nothing reads it, property reads and all.
}))();

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

/** What a pin needs to know about a lead to take a tone: the state its row wears. */
export interface LeadPinnable {
  state: string;
}

/**
 * The tone a lead's pin wears on the map: its row's state, from the registry the row's own tag reads, so a pin and
 * the row under the map say the same thing (leadMapLegend, below, says which colour is which).
 *
 * The map kept a table of its own, in leads.css, keyed by `strong`/`part`/`talking` -- words no tone vocabulary
 * knows -- so it was a sixth colour family that this file could not reach. It had already drifted: a `look` fit
 * drew amber on a pin while this map calls it plain. And because those rules named no element, and leads.css is
 * imported after clients.css, `.tone-ok` painted EVERY `tone-ok` in the app solid green -- a Today attention row,
 * and the peek's own Interested chip. Both now come through here. It was coloured three ways too (fit, reach,
 * stage) by a switch with no key, two of which repeated the row; the state is the one (25 Sep).
 *
 * A pin is data, so by the chart kit's rule it never wears the accent, and the state's tones never are it.
 */
export function leadPinTone(lead: LeadPinnable): Tone {
  return stateTone("lead_row_state", lead.state);
}

/** A lead's row state, as the row wears it (lead-row.ts LeadRowVM["state"]). */
type LeadMapState = "ready" | "contacted" | "talking" | "review" | "out";

/** The legend's order: what is furthest along first, then what waits on the owner, then the rest. */
const LEAD_MAP_LEGEND_ORDER: readonly LeadMapState[] = ["talking", "contacted", "review", "ready", "out"];

/** Each state's words, the row's own (the row's tag and the rail's lists); "out" is both of the ways a lead leaves. */
const LEAD_MAP_STATE_WORDS: Record<LeadMapState, string> = {
  talking: LEAD_STAGE_WORDS.converted,
  contacted: LEAD_STAGE_WORDS.nurture,
  review: LEAD_REVIEW_WORD,
  ready: LEAD_STAGE_WORDS.ready,
  out: `${LEAD_STAGE_WORDS.archived} or ${LEAD_LEFT_OUT_WORD.toLowerCase()}`,
};

/**
 * What the map's pins mean, said under the map: one entry per state a pin on it wears, in the pin's own tone.
 *
 * The map had a switch of three colourings (Fit, Reach, Stage) and no key, so green meant a strong fit, a reachable
 * lead or one talking to you depending on a control nothing explained, and two of the three repeated what each row
 * under the map already says (25 Sep). A pin now says what the row's tag says, and this says which colour is which.
 */
export function leadMapLegend(
  rows: ReadonlyArray<{ state: string }>,
): Array<{ state: LeadMapState; tone: Tone; label: string; out: boolean }> {
  const present = new Set(rows.map((r) => r.state));
  return LEAD_MAP_LEGEND_ORDER.filter((s) => present.has(s)).map((state) => ({
    state,
    tone: leadPinTone({ state }),
    label: LEAD_MAP_STATE_WORDS[state],
    out: state === "out",
  }));
}

import { BROADCAST_STATE_LABELS } from "../broadcasts/broadcasts.js";
import { STOP_WORDS } from "../consent/consent.js";
import { CALL_OUTCOME_WORDS } from "../conversations/call-dto.js";
import { HELD_WORDS, NEEDS_YOU_WORD } from "../conversations/standing.js";
import { PERSON_MODE_WORDS } from "../people/person-receptionist.js";
import { PERSON_STATE_LABELS } from "../people/person-state.js";
import { ROLE_WORDS } from "./identity.js";
import { SETUP_STATE_WORDS } from "../setup/setup.js";
import { CALENDAR_FEED_WORDS } from "../calendar/calendar-words.js";
import { SOURCE_WORDS } from "../config/facts.js";
import {
  LEAD_CALL_OUTCOME_TONES,
  LEAD_CALL_OUTCOME_WORDS,
  LEAD_CLASS_WORDS,
  LEAD_EMAIL_WORDS,
  LEAD_FIT_WORDS,
  LEAD_LEFT_OUT_WORD,
  LEAD_REVIEW_WORD,
  LEAD_STAGE_WORDS
} from "../leads/leads.js";
import { DEAL_STAGE_WORDS } from "../deals/deal-words.js";
import { TEMPLATE_STATUS_WORDS } from "../templates/templates.js";
import { REPLY_CHIP_WORDS } from "../reach-out/reach-out-replies.js";
export const TONES = ["accent", "warn", "info", "ok", "danger", "plain"];
const FACT_SOURCE_TONE = {
  verified: "ok",
  provisioned: "ok",
  workspace: "plain",
  typed: "plain",
  absent: "plain"
};
const TONE_OF = /* @__PURE__ */ (() => ({
  thread: {
    escalated: "warn",
    needs_you: "warn",
    // Flagged and held: yours is in hand, a teammate's is theirs to answer -- neither is a warning to this reader.
    yours: "info",
    theirs: "plain",
    snoozed: "info",
    done: "plain",
    open: "plain",
    handled: "plain",
    booked: "ok",
    decided: "ok"
  },
  // A thread somebody has wears the Inbox's own tones for it (`thread` above): yours is in hand, a teammate's is theirs.
  standing: {
    escalated: "warn",
    queued: "info",
    snoozed: "info",
    paused: "plain",
    yours: "info",
    theirs: "plain",
    silent: "plain",
    answering: "ok"
  },
  call: {
    live: "accent",
    missed: "plain",
    // The provider could not place or keep the call: a fault, not a customer's choice.
    failed: "warn",
    // A call that is over and was simply handled: Live, Conversations and the thread's call card all say it so (callOutcomeFor).
    handled: "plain",
    stale: "plain",
    abandoned: "warn",
    callback: "warn",
    voicemail: "plain"
  },
  person: {
    needs_you: "warn",
    // You have it: in hand, as the Inbox, Conversations and the person's page draw it -- one tone for one word (the wiring's
    // second audit, R11 S9-5). The rail's amber count is People's own choice (lists.ts listAsks), not this tone.
    waiting_on_you: "info",
    new: "info",
    active: "ok",
    quiet: "plain",
    opted_out: "plain",
    unheard: "plain"
  },
  // A STOP is news, not a wait (decision 0048): the kit's consent pill wore the amber of "Needs you" for it, which no page drew.
  consent: { opted_in: "ok", opted_out: STOP_WORDS.tone, unknown: "plain" },
  mode: { auto: "ok", ask: "warn", never: "plain", inherit: "plain" },
  broadcast: {
    pending_approval: "warn",
    scheduled: "info",
    sending: "accent",
    sent: "ok",
    canceled: "plain",
    failed: "danger"
  },
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
  // A reply to a reach-out, by how it was read. Interested is a good outcome (the Leads peek's chip wears the same ok), a
  // question wants an answer, not now and away say when to write again (scheduled: info), and a no, a wrong person and a
  // reply that could not be read are quiet: they ask nothing of the owner.
  reply: {
    interested: "ok",
    question: "warn",
    not_now: "info",
    no: "plain",
    wrong_person: "plain",
    away: "info",
    other: "plain"
  }
}))();
const LABEL_OF = /* @__PURE__ */ (() => ({
  thread: {
    escalated: NEEDS_YOU_WORD,
    needs_you: NEEDS_YOU_WORD,
    yours: HELD_WORDS.yours.pill,
    theirs: HELD_WORDS.theirs.pill,
    snoozed: "Snoozed",
    done: "Done",
    open: "Customer wrote last",
    handled: "Receptionist replied",
    booked: "Booked",
    decided: "Handled"
  },
  standing: {
    escalated: NEEDS_YOU_WORD,
    queued: "Reply queued",
    snoozed: "Snoozed",
    paused: "Paused",
    // A thread somebody has says what the Inbox's pill says of it (standing.ts HELD_WORDS).
    yours: HELD_WORDS.yours.pill,
    theirs: HELD_WORDS.theirs.pill,
    silent: "Silent",
    answering: "Answering"
  },
  // How a call ended is the ladder's (callOutcomeFor), said once (CALL_OUTCOME_WORDS) for Live, Conversations, the thread's
  // call card and a person's History; a call the provider has gone quiet about is no ending, and is said beside them.
  call: { ...CALL_OUTCOME_WORDS, stale: "No word from the provider" },
  person: PERSON_STATE_LABELS,
  consent: { opted_in: "Opted in", opted_out: STOP_WORDS.pill, unknown: "Consent unknown" },
  mode: PERSON_MODE_WORDS,
  broadcast: BROADCAST_STATE_LABELS,
  // The Library's words for where WhatsApp has a version (templates.ts), one for a refusal on the row, the pane and the picker.
  template: TEMPLATE_STATUS_WORDS,
  template_quality: {
    GREEN: "High quality",
    YELLOW: "Medium quality",
    RED: "Low quality",
    UNKNOWN: "Quality not rated yet"
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
  // The chip's words (reach-out-replies.ts); the strip's sentence ("Wrote back · interested") keeps REPLY_INTENT_WORDS.
  reply: REPLY_CHIP_WORDS
  // `lead_row_state` is a tone and no words: the row composes its own tag (`Contacted · 2m`) in toLeadRowVM,
  // and nothing ever asks this map for it. Words here would be a second set of the same five. A map whose
  // values are read off another map (`LEAD_STAGE_WORDS.ready`) once kept this whole registry and its five
  // label maps in channels, core, db and jobs: +693 lines for words nobody reads. Built in a call marked pure
  // (see TONE_OF), this map is dropped wherever nothing reads it, property reads and all.
}))();
export function stateTone(kind, value) {
  return typeof value === "string" && TONE_OF[kind][value] || "plain";
}
export function stateLabel(kind, value) {
  const v = typeof value === "string" ? value : String(value ?? "");
  return LABEL_OF[kind]?.[v] ?? v;
}
export function stateWordList() {
  return Object.entries(LABEL_OF).flatMap(
    ([kind, words]) => Object.entries(words ?? {}).map(([value, label]) => ({ kind, value, label }))
  );
}
export function stateOf(kind, value) {
  return { tone: stateTone(kind, value), label: stateLabel(kind, value) };
}
export function leadPinTone(lead) {
  return stateTone("lead_row_state", lead.state);
}
const LEAD_MAP_LEGEND_ORDER = ["talking", "contacted", "review", "ready", "out"];
const LEAD_MAP_STATE_WORDS = {
  talking: LEAD_STAGE_WORDS.converted,
  contacted: LEAD_STAGE_WORDS.nurture,
  review: LEAD_REVIEW_WORD,
  ready: LEAD_STAGE_WORDS.ready,
  out: `${LEAD_STAGE_WORDS.archived} or ${LEAD_LEFT_OUT_WORD.toLowerCase()}`
};
export function leadMapLegend(rows) {
  const present = new Set(rows.map((r) => r.state));
  return LEAD_MAP_LEGEND_ORDER.filter((s) => present.has(s)).map((state) => ({
    state,
    tone: leadPinTone({ state }),
    label: LEAD_MAP_STATE_WORDS[state],
    out: state === "out"
  }));
}

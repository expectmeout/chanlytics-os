import { STOP_WORDS } from "../consent/consent.js";
import { HELD_WORDS, heldPill } from "../conversations/standing.js";
import { shortTime } from "../conversations/thread-clock.js";
import { ts } from "./person-helpers.js";
import { reasonLabelOf, reasonShort, waitsOnAPerson } from "../conversations/escalations.js";
import { holderOf, personStanding } from "./person-state.js";
export const PERSON_MODES = ["auto", "ask", "never"];
export const PERSON_MODE_LABELS = { auto: "Answer", ask: "Ask me first", never: "Never" };
export const PERSON_MODE_WORDS = {
  ...PERSON_MODE_LABELS,
  inherit: "Follow the workspace"
};
export function asPersonMode(s) {
  return s && PERSON_MODES.includes(s) ? s : null;
}
export const OWN_MODE_NAMED = 20;
export function ownModesOf(rows, names) {
  const by_mode = { auto: 0, ask: 0, never: 0 };
  const named = [];
  for (const r of rows) {
    const mode = asPersonMode(r.mode);
    if (!mode) continue;
    by_mode[mode] += 1;
    const name = names.get(r.id);
    if (name && named.length < OWN_MODE_NAMED) named.push({ id: r.id, name, mode });
  }
  return { total: by_mode.auto + by_mode.ask + by_mode.never, by_mode, named };
}
const OWN_MODE_ORDER = ["never", "ask", "auto"];
export function ownModesWords(d) {
  if (!d || d.total === 0) return null;
  return {
    label: "People set differently",
    value: d.total === 1 ? "1 person" : `${d.total} people`,
    hint: OWN_MODE_ORDER.filter((m) => d.by_mode[m] > 0).map((m) => `${d.by_mode[m]} ${PERSON_MODE_LABELS[m]}`).join(" \xB7 "),
    header: d.named.length < d.total ? `The ${d.named.length} changed last` : "Their own reply mode"
  };
}
const HELD_THREAD = {
  yours: {
    tone: "yours",
    label: HELD_WORDS.yours.pill,
    title: HELD_WORDS.yours.pill,
    detail: HELD_WORDS.yours.sentence
  },
  theirs: {
    tone: "theirs",
    label: HELD_WORDS.theirs.pill,
    title: HELD_WORDS.theirs.pill,
    detail: HELD_WORDS.theirs.sentence
  },
  someone: {
    tone: "paused",
    label: "Paused, a person owns the thread",
    title: "Paused, a person owns this thread",
    detail: "A person owns this thread; automatic replies resume when it is handed back."
  }
};
export function heldThreadOf(holder, name) {
  const held = HELD_THREAD[holder];
  const who = name?.trim();
  if (holder !== "theirs" || !who) return held;
  const said = heldPill("theirs", who);
  return {
    ...held,
    label: said,
    title: said,
    detail: `${who} is answering this. The receptionist stays quiet until they hand it back.`
  };
}
export const SILENT_STOP = {
  label: `Silent, ${STOP_WORDS.pill.toLowerCase()}`,
  detail: `${STOP_WORDS.said("They")} \u2014 nothing goes out to them until they ask again.`
};
export function askedFor(r) {
  return r.open_escalation_reason && waitsOnAPerson(r.open_escalation_reason) ? r.open_escalation_reason : null;
}
export function snoozedAsk(r) {
  const asked = askedFor(r);
  if (asked) return reasonLabelOf(asked);
  return r.needs_human ? "Waiting for a person" : null;
}
function snoozedReceptionist(r, tz, nowMs) {
  const wake = ts(r.latest_snooze_until);
  const wakes = wake !== null && wake > nowMs ? shortTime(r.latest_snooze_until, tz, new Date(nowMs)) : null;
  const asked = askedFor(r);
  const asks = asked ? `still waiting for you (${reasonShort(asked)})` : r.needs_human ? "still waiting for you" : null;
  return {
    tone: "snoozed",
    label: [`Snoozed${wakes ? ` until ${wakes}` : ""}`, asks].filter(Boolean).join(" \xB7 "),
    ...wakes ? { wakes } : {}
  };
}
export function receptionistOf(r, tz, nowMs, viewerId, names = null) {
  if (personStanding(r, nowMs, viewerId).standing === "snoozed")
    return r.queued_reply_at ? { tone: "queued", label: "Reply queued" } : snoozedReceptionist(r, tz, nowMs);
  const held = holderOf(r, nowMs, viewerId);
  if (held) {
    const holder = held === "theirs" && r.latest_assignee_user_id ? names?.(r.latest_assignee_user_id) : null;
    const { tone, label } = heldThreadOf(held, holder);
    return { tone, label };
  }
  const asked = askedFor(r);
  if (asked) return { tone: "escalated", label: `Escalated, ${reasonShort(asked)}` };
  if (r.needs_human) return { tone: "escalated", label: "Waiting for a person" };
  if (r.queued_reply_at) return { tone: "queued", label: "Reply queued" };
  if (r.consent === "opted_out" || r.dnc) return { tone: "silent", label: SILENT_STOP.label };
  if (r.effective_reply_mode === "never")
    return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.never}` };
  if (r.effective_reply_mode === "ask")
    return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.ask}` };
  return { tone: "answering", label: "Answering" };
}

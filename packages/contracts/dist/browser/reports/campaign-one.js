import { shiftKey } from "../calendar/day-keys.js";
import { sequenceRoute } from "../sequences/sequence-address.js";
import { SEQUENCE_WORDS } from "../sequences/sequence-words.js";
import {
  SEQUENCE_HISTORY_WORDS,
  batchWent,
  historyDayWords,
  historyFigures,
  historyStamp
} from "../sequences/sequence-tab-words.js";
import { zoneDayKey } from "../shared/clock.js";
import { plural } from "../shared/words.js";
import { CAMPAIGN_SCOPE_ALL, campaignScopeKey } from "./lenses.js";
import { dayPointOf } from "./reports.js";
export const CAMPAIGN_SCOPE_WORDS = {
  label: "Which campaign",
  all: "All campaigns",
  /** The sequence's own pages, from its report. */
  open: "Open it",
  reading: "Reading what it sent\u2026",
  /** What a failed read could not read: "Couldn't read what it sent". */
  failed: "what it sent",
  gone: "This campaign isn\u2019t in this workspace.",
  days: { title: "Sent, day by day", aria: "Messages it sent per day. The arrow keys read each day." },
  byStep: { title: "By step", line: "What each step sent, and what came of it." },
  sends: { title: "Each send", line: "Newest first, with what came of each." },
  heads: { when: "When", what: "What came of it", sent: "Sent" },
  nothing: (name) => `Nothing went out from ${name} in these days`,
  nothingBody: "Its History says what it sent before, and what goes next."
};
const SAID = CAMPAIGN_SCOPE_WORDS;
const batchDayOf = (b, tz) => b.run_for ?? zoneDayKey(Date.parse(b.at), tz);
function daysFrom(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 400; d = shiftKey(d, 1)) out.push(d);
  return out;
}
const batchCount = (b, k) => b.counts[k] ?? 0;
function byStepOf(went, steps) {
  if (steps < 2) return null;
  const places = [...new Set(went.map((b) => b.place ?? 1))].sort((a, b) => a - b);
  return places.map((place) => {
    const of = went.filter((b) => (b.place ?? 1) === place);
    const sum = (k) => of.reduce((n, b) => n + batchCount(b, k), 0);
    const label = SEQUENCE_HISTORY_WORDS.step(place);
    return {
      place,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      sent: sum("sent"),
      delivered: sum("delivered"),
      read: sum("read"),
      replied: sum("replied")
    };
  });
}
function oneHeadOf(name, sent, replied) {
  if (sent === 0) return `${SAID.nothing(name)}.`;
  const back = replied === 0 ? "nobody has written back yet" : `${replied} drew a reply`;
  return `${name} sent ${plural(sent, "message")}: ${back}.`;
}
export function campaignOneOf(input) {
  const { id, name, timezone: tz, from, to } = input;
  const inDays = input.batches.filter((b) => {
    const day = batchDayOf(b, tz);
    return day >= from && day <= to;
  });
  const went = inDays.filter(batchWent);
  const figures = historyFigures(went);
  const points = daysFrom(from, to).map((day) => {
    const of = went.filter((b) => batchDayOf(b, tz) === day);
    const sent2 = of.reduce((n, b) => n + batchCount(b, "sent"), 0);
    const replied2 = of.reduce((n, b) => n + batchCount(b, "replied"), 0);
    const point = dayPointOf(day);
    return {
      ...point,
      sent: sent2,
      replied: replied2,
      sentWords: `${point.label}: ${plural(sent2, "message")} sent`,
      answeredWords: replied2 === 0 ? "No replies" : plural(replied2, "reply", "replies")
    };
  });
  const sent = went.reduce((n, b) => n + batchCount(b, "sent"), 0);
  const replied = went.reduce((n, b) => n + batchCount(b, "replied"), 0);
  const sends = inDays.map((b) => {
    const place = b.place && input.steps > 1 ? SEQUENCE_HISTORY_WORDS.step(b.place) : null;
    const said = historyDayWords(b, place);
    return { id: b.id, when: historyStamp(Date.parse(b.at), tz, input.nowMs), ...said, went: batchWent(b) };
  });
  return {
    name,
    head: oneHeadOf(name, sent, replied),
    figures,
    points,
    sentAny: sent > 0,
    byStep: byStepOf(went, input.steps),
    sends,
    empty: went.length === 0 ? { title: SAID.nothing(name), body: SAID.nothingBody } : null,
    door: { label: SAID.open, to: sequenceRoute(id, "history") }
  };
}
const groupOf = (row) => row.starts === "leads" ? "leads" : row.starts === "date" ? "dates" : "customers";
export const CAMPAIGN_CHOICE_GROUPS = {
  customers: SEQUENCE_WORDS.groups.customers,
  leads: SEQUENCE_WORDS.groups.leads,
  dates: SEQUENCE_WORDS.groups.dates
};
export function campaignChoicesOf(rows, scope) {
  const named = scope.kind === "sequence" ? scope.id : null;
  const sent = rows.filter((r) => r.id === named || r.state !== "draft" && r.last !== null).sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
  const order = ["customers", "leads", "dates"];
  const choices = order.flatMap(
    (group) => sent.filter((r) => groupOf(r) === group).map((r) => ({ key: campaignScopeKey({ kind: "sequence", id: r.id }), label: r.name, group }))
  );
  return [{ key: campaignScopeKey(CAMPAIGN_SCOPE_ALL), label: SAID.all, group: "all" }, ...choices];
}

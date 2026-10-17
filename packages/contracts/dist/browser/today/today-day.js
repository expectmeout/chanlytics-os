import { visitDoor } from "../calendar/appointment-key.js";
import {
  VISIT_ASK_WORDS,
  VISIT_WORDS,
  clockLabel,
  visitLineOfBlock,
  visitStands
} from "../calendar/calendar-words.js";
import { HELD_WORDS, NEEDS_YOU_WORD } from "../conversations/standing.js";
import { initialsOf } from "../conversations/thread-contact.js";
import { appointmentWordWhere, appointmentWords } from "../journey/appointment-word.js";
import { triggerOf, triggerWords } from "../playbooks/playbook-triggers.js";
export function durationLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? m ? `${h}h ${m}m` : `${h}h` : `${m}m`;
}
const FLAG_WORDS = {
  needs_you: `${NEEDS_YOU_WORD} \u2014 in Inbox`,
  waiting_on_you: `${HELD_WORDS.yours.pill} \u2014 in Inbox`
};
function markedOf(b) {
  const status = b.visit?.status;
  return status === "kept" || status === "missed" ? { status, word: VISIT_WORDS[status] } : null;
}
export const TODAY_DAY_MAX = 5;
function capDay(items, max) {
  if (items.length <= max) return items;
  const keep = /* @__PURE__ */ new Set();
  for (const i of items) if (i.phase !== "past" && keep.size < max) keep.add(i.id);
  for (const i of [...items].reverse()) if (i.phase === "past" && keep.size < max) keep.add(i.id);
  return items.filter((i) => keep.has(i.id));
}
export function todayDay(cal, playbooks, people = null, max = TODAY_DAY_MAX) {
  const word = playbooks ? playbooks.word : appointmentWordWhere(!!people?.dealsOn);
  if (!cal) return { feed: "none", frames: [], nextOpening: null, reminders: null, word };
  const feed = cal.feed.state;
  const idx = cal.days.findIndex((d) => d.today);
  const picked = idx >= 0 ? cal.days.slice(idx, idx + 2) : [];
  const stateOf = new Map((people?.rows ?? []).map((r) => [r.id, r.state]));
  const item = (b, dayKey, allDay, phase) => ({
    id: b.id,
    start: allDay ? "All day" : clockLabel(b.t),
    time: b.time,
    dur: allDay ? "" : durationLabel(b.dur),
    title: b.title,
    service: b.service,
    person: b.person ? { id: b.person.id, name: b.person.name } : null,
    allDay,
    phase,
    flag: b.person ? FLAG_WORDS[stateOf.get(b.person.id) ?? ""] ?? null : null,
    said: markedOf(b),
    to: visitDoor(dayKey, b.visit?.id)
  });
  const frames = picked.map((d) => {
    const standing = (blocks) => blocks.filter((b) => visitStands(b.visit));
    let nextTaken = false;
    const timed = standing(d.blocks).sort((a, b) => a.t - b.t).map((b) => {
      let phase = "later";
      if (d.today) {
        const end = b.t + b.dur / 60;
        if (b.visit?.status === "missed" || end <= cal.now) phase = "past";
        else if (b.t <= cal.now) phase = "now";
        else if (!nextTaken) {
          phase = "next";
          nextTaken = true;
        }
      }
      return item(b, d.key, false, phase);
    });
    const items = [...standing(d.allDay).map((b) => item(b, d.key, true, "later")), ...timed];
    const flagged = items.filter((i) => i.flag).length;
    const missed = items.filter((i) => i.said?.status === "missed").length;
    const booked = items.length - missed;
    const shown = capDay(items, max);
    const more = items.length - shown.length;
    return {
      key: d.key,
      label: `${d.today ? "Today" : "Tomorrow"} \xB7 ${d.long}`,
      today: d.today,
      past: d.past,
      closed: d.closed,
      items: shown,
      more,
      moreLine: more ? `${more} more on the Calendar` : null,
      summary: booked ? {
        booked: `${booked} booked`,
        flagged: flagged ? `${flagged} need${flagged === 1 ? "s" : ""} you` : null
      } : null,
      missed,
      open: d.closed.yes || d.past ? [] : d.windows.map((w) => w.label)
    };
  });
  let reminders = null;
  if (feed === "ok" && playbooks) {
    const visit = playbooks.rows.filter((p) => (p.trigger === "visit_tomorrow" || p.trigger === "visited") && p.runs);
    const W = appointmentWords(word);
    reminders = visit.length === 0 ? {
      // "Write", not "text": a campaign goes by WhatsApp, text or email, whichever each person is reached on. A
      // person reads "campaign", never "playbook" (decision 19 of 9 Oct 2026).
      text: `No ${W.one} reminders yet \u2014 a campaign can write the day before ${W.a} and the day after.`,
      to: "outbound"
    } : {
      text: visit.map((p) => {
        const t = triggerOf(p.trigger);
        return `${t ? triggerWords(t, word).label : p.trigger}: ${p.candidates == null ? "" : `${p.candidates} ${p.candidates === 1 ? "person" : "people"} \xB7 `}next run ${p.next}`;
      }).join(" \xB7 "),
      to: "outbound"
    };
  }
  return {
    feed,
    frames,
    nextOpening: feed === "ok" && cal.stats.next !== "\u2014" ? cal.stats.next : null,
    reminders,
    word
  };
}
const TODAY_VISITS_MAX = 3;
const VISITS_ASKED_WORDS = {
  rest: (n, W) => `${n} more ${n === 1 ? W.one : W.many} to mark`,
  restSentence: "Nobody has said whether they came, yesterday.",
  open: "Open",
  calendar: "on the Calendar"
};
export function todayVisitsSub(n, word) {
  const W = appointmentWords(word);
  return `${n} ${n === 1 ? W.one : W.many} to mark`;
}
export function todayVisitsFoot(n, word) {
  return `${todayVisitsSub(n, word)} ${VISITS_ASKED_WORDS.calendar}`;
}
export function todayVisitsAsked(cal, nowMs, word, max = TODAY_VISITS_MAX) {
  if (!cal) return null;
  const idx = cal.days.findIndex((d) => d.today);
  const yesterday = idx > 0 ? cal.days[idx - 1] : null;
  if (!yesterday) return null;
  const asked = [];
  for (const b of [...yesterday.blocks].sort((x, y) => x.t - y.t)) {
    if (!b.person || !b.visit || !b.visit.id || !b.start || !b.end) continue;
    const to = visitDoor(yesterday.key, b.visit.id);
    const line = visitLineOfBlock(
      {
        id: b.id,
        title: b.title,
        time: b.time,
        start: b.start,
        end: b.end,
        visit: { id: b.visit.id, status: b.visit.status },
        person: b.person
      },
      nowMs,
      "Yesterday",
      to
    );
    if (line.unmarked) asked.push({ line, markId: b.visit.id, person: { id: b.person.id, name: b.person.name }, to });
  }
  if (!asked.length) return null;
  return { items: asked.slice(0, max), count: asked.length, word, to: `calendar/${yesterday.key}` };
}
function visitRow(a) {
  const { line, person } = a;
  return {
    id: `q-visit-${a.markId}`,
    kind: "visit",
    conversationId: null,
    callId: null,
    person_id: person.id,
    who: person.name,
    initials: initialsOf(person.name),
    channel: "Calendar",
    when: [line.day, line.time].filter(Boolean).join(", "),
    sentence: VISIT_ASK_WORDS.question,
    quoted: false,
    status: [VISIT_ASK_WORDS.unmarked, line.title],
    tone: "warn",
    warn: false,
    cta: { label: VISIT_WORDS.kept, to: a.to },
    also: null,
    visit: { id: a.markId, asks: line.asks },
    waitedMs: Number.NEGATIVE_INFINITY
  };
}
function visitsRestRow(asked) {
  const rest = asked.count - asked.items.length;
  const W = appointmentWords(asked.word);
  return {
    id: "q-visits-more",
    kind: "visits",
    conversationId: null,
    callId: null,
    person_id: null,
    who: VISITS_ASKED_WORDS.rest(rest, W),
    initials: `+${rest}`,
    channel: "Calendar",
    when: "",
    sentence: VISITS_ASKED_WORDS.restSentence,
    quoted: false,
    status: [VISIT_ASK_WORDS.unmarked, VISITS_ASKED_WORDS.calendar],
    tone: "warn",
    warn: false,
    cta: { label: VISITS_ASKED_WORDS.open, to: asked.to },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY
  };
}
export function withVisitsAsked(rows, asked) {
  if (!asked) return rows;
  const mine = asked.items.map(visitRow);
  if (asked.count > asked.items.length) mine.push(visitsRestRow(asked));
  const firstCall = rows.findIndex((r) => r.kind === "call");
  const at = firstCall < 0 ? rows.length : firstCall;
  return [...rows.slice(0, at), ...mine, ...rows.slice(at)];
}

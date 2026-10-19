import { VISIT_WORDS } from "../calendar/calendar-words.js";
import { plural } from "../shared/words.js";
const RUNGS = 4;
export const UP_NEXT_WORDS = {
  title: "Up next",
  gotIt: "Got it",
  leftYouANote: (who, when) => `${who === "You" ? "You left yourself" : `${who} left you`} a note \xB7 ${when}`,
  /**
   * "Did Emily come on Sat Oct 10?": the day as a question says it, with no comma after the weekday (canvas A); a visit
   * of today or yesterday is asked without the "on" ("Did Emily come yesterday?").
   */
  didTheyCome: (who, day) => day === "Today" || day === "Yesterday" ? `Did ${who} come ${day.toLowerCase()}?` : `Did ${who} come on ${day.replace(/,/g, "")}?`,
  done: "Done",
  recordYes: "Record a yes",
  /** Their yes to messages, not asked with a visit ahead: the folded Messages summary's words for it. */
  visitNotAsked: "Messages not asked",
  more: (n) => `${plural(n, "more", "more")}`
};
function dealRungSub(c) {
  const low = (s) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  const waits = c.flags.map((x) => x.words);
  if (waits.length) return [...waits, c.pace ? low(c.pace) : null].filter(Boolean).join(" \xB7 ");
  if (!c.link) return c.facts[0] ?? null;
  return c.facts.filter(Boolean).join(" \xB7 ") || null;
}
export function personNextOf(f) {
  const rows = [];
  for (const n of f.notes) {
    if (!n.forMe || n.step || n.suggested || n.forSeen) continue;
    rows.push({
      id: `note:${n.id}`,
      title: UP_NEXT_WORDS.leftYouANote(n.who, n.when),
      sub: n.body.length > 140 ? `${n.body.slice(0, 139).trimEnd()}\u2026` : n.body,
      act: { kind: "got-it", noteId: n.id, label: UP_NEXT_WORDS.gotIt }
    });
  }
  const asking = [f.lastVisit, ...f.ahead.map((a) => a.visit ?? null)].find(
    (v) => !!v && v.asks.length > 0
  );
  if (asking)
    rows.push({
      id: `visit:${asking.id}`,
      title: UP_NEXT_WORDS.didTheyCome(f.who, asking.day),
      sub: [asking.title, asking.time].filter(Boolean).join(" \xB7 "),
      act: { kind: "visit", line: asking, label: asking.asks.map((a) => VISIT_WORDS[a]).join(" \xB7 ") }
    });
  for (const c of f.deals.cards) {
    if (!c.next) continue;
    rows.push({
      id: `deal:${c.id ?? c.title}`,
      title: c.title,
      sub: dealRungSub(c),
      act: { kind: "deal", dealId: c.id, act: c.next, label: c.next.label }
    });
  }
  const q = f.deals.quiet;
  if (q && (q.primary || f.talking && !q.dealId))
    rows.push({
      id: "deal:quiet",
      title: q.words,
      sub: q.sub,
      act: { kind: "deal", dealId: q.dealId, act: q.act, label: q.act.label }
    });
  if (f.step)
    rows.push({
      id: `step:${f.step.id}`,
      title: f.step.words,
      sub: [f.step.day.words, f.step.forWho].filter(Boolean).join(" \xB7 "),
      act: { kind: "step-done", stepId: f.step.id, label: UP_NEXT_WORDS.done }
    });
  const nextVisit = f.ahead[0];
  if (f.visitYesHeld && nextVisit)
    rows.push({
      id: "consent:visit",
      title: UP_NEXT_WORDS.visitNotAsked,
      sub: `${nextVisit.title} ${nextVisit.day} ${nextVisit.time}`.trim(),
      act: { kind: "record-yes", label: UP_NEXT_WORDS.recordYes }
    });
  const shown = rows.slice(0, RUNGS);
  const rest = rows.slice(RUNGS);
  return {
    rows: shown,
    more: rest.length ? { count: rest.length, label: UP_NEXT_WORDS.more(rest.length), rows: rest } : null
  };
}

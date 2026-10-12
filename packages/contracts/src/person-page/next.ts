/**
 * Up next on a person's page (canvas A): one ladder of what is true for them now, in the order an owner deals with it,
 * at most four rows, the rest under "2 more". Each row is a fact and its one act; the page's own primary (Open the thread)
 * is never a rung, and nothing here is said again below it.
 *
 *   1. A note for you, unacknowledged: Got it.
 *   2. Did they come? A visit of theirs that began and nobody marked: Kept / Missed.
 *   3. Each open deal's next act (dealNextAct, through the deal card), or, with none open, the one act that fits
 *      ("Start a proposal" after a consultation, or for someone at a business you are talking to).
 *   4. Their next step: Done.
 *   5. Before a visit whose message was held for want of a yes: Record a yes.
 */
import { VISIT_WORDS, type VisitLineVM } from "../calendar/calendar-words";
import type { DealAct } from "../deals/sheet/deal-acts";
import type { DealCardVM, DealQuietVM } from "../deals/sheet/deal-card";
import type { PersonNextStepVM } from "../notes/steps";
import type { PersonNoteVM } from "../notes/person-notes";
import { plural } from "../shared/words";

/** What a rung's one act does: the page maps each kind to its verb. */
export type UpNextAct =
  | { kind: "got-it"; noteId: string; label: string }
  | { kind: "visit"; line: VisitLineVM; label: string }
  | { kind: "deal"; dealId: string | null; act: DealAct; label: string }
  | { kind: "step-done"; stepId: string; label: string }
  | { kind: "record-yes"; label: string };

export interface UpNextRowVM {
  id: string;
  title: string;
  sub: string | null;
  act: UpNextAct;
}

export interface UpNextVM {
  rows: UpNextRowVM[];
  /** "2 more", or null when every row is shown. */
  more: { count: number; label: string; rows: UpNextRowVM[] } | null;
}

/** What the ladder is made of, as the page's view model holds it. */
export interface UpNextFacts {
  notes: readonly PersonNoteVM[];
  /** Their last visit as the one visit line (it asks "Did they come?" while unmarked), and the visits not yet over. */
  lastVisit: VisitLineVM | null;
  ahead: readonly { visit?: VisitLineVM | null; title: string; day: string; time: string }[];
  deals: { cards: DealCardVM[]; quiet: DealQuietVM | null };
  dealsOn: boolean;
  /** They work at a business you are talking to: with no deal, a proposal is the next thing. */
  talking: boolean;
  step: PersonNextStepVM | null;
  /** Their visit messages are not asked, and one was held back for it. */
  visitYesHeld: boolean;
}

/** The most rungs shown before "N more". */
const RUNGS = 4;

export const UP_NEXT_WORDS = {
  title: "Up next",
  gotIt: "Got it",
  leftYouANote: (who: string, when: string) =>
    `${who === "You" ? "You left yourself" : `${who} left you`} a note · ${when}`,
  didTheyCome: (when: string) => `Did they come? ${when}`,
  done: "Done",
  recordYes: "Record a yes",
  visitNotAsked: "Visit messages not asked",
  more: (n: number) => `${plural(n, "more", "more")}`,
} as const;

/** The ladder: every true rung in its order, four shown, the rest folded. */
export function personNextOf(f: UpNextFacts): UpNextVM {
  const rows: UpNextRowVM[] = [];
  for (const n of f.notes) {
    if (!n.forMe || n.step || n.suggested || n.forSeen) continue;
    rows.push({
      id: `note:${n.id}`,
      title: UP_NEXT_WORDS.leftYouANote(n.who, n.when),
      sub: n.body.length > 140 ? `${n.body.slice(0, 139).trimEnd()}…` : n.body,
      act: { kind: "got-it", noteId: n.id, label: UP_NEXT_WORDS.gotIt },
    });
  }
  // Did they come: the last visit that began and nobody marked, else one under way.
  const asking = [f.lastVisit, ...f.ahead.map((a) => a.visit ?? null)].find(
    (v): v is VisitLineVM => !!v && v.asks.length > 0,
  );
  if (asking)
    rows.push({
      id: `visit:${asking.id}`,
      title: UP_NEXT_WORDS.didTheyCome([asking.day, asking.time].filter(Boolean).join(" · ")),
      sub: asking.title,
      act: { kind: "visit", line: asking, label: asking.asks.map((a) => VISIT_WORDS[a]).join(" · ") },
    });
  if (f.dealsOn) {
    for (const c of f.deals.cards) {
      if (!c.next) continue;
      rows.push({
        id: `deal:${c.id ?? c.title}`,
        title: c.title,
        sub: [...c.flags.map((x) => x.words), ...c.facts].filter(Boolean).join(" · ") || null,
        act: { kind: "deal", dealId: c.id, act: c.next, label: c.next.label },
      });
    }
    const q = f.deals.quiet;
    if (q && (q.primary || (f.talking && !q.dealId)))
      rows.push({
        id: "deal:quiet",
        title: q.words,
        sub: q.sub,
        act: { kind: "deal", dealId: q.dealId, act: q.act, label: q.act.label },
      });
  }
  if (f.step)
    rows.push({
      id: `step:${f.step.id}`,
      title: f.step.words,
      sub: [f.step.day.words, f.step.forWho].filter(Boolean).join(" · "),
      act: { kind: "step-done", stepId: f.step.id, label: UP_NEXT_WORDS.done },
    });
  const nextVisit = f.ahead[0];
  if (f.visitYesHeld && nextVisit)
    rows.push({
      id: "consent:visit",
      title: UP_NEXT_WORDS.visitNotAsked,
      sub: `${nextVisit.title} ${nextVisit.day} ${nextVisit.time}`.trim(),
      act: { kind: "record-yes", label: UP_NEXT_WORDS.recordYes },
    });
  const shown = rows.slice(0, RUNGS);
  const rest = rows.slice(RUNGS);
  return {
    rows: shown,
    more: rest.length ? { count: rest.length, label: UP_NEXT_WORDS.more(rest.length), rows: rest } : null,
  };
}

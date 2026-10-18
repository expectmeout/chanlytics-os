/**
 * The four figures at the top of a person's page (canvas A): how the relationship stands, in the few numbers the data
 * supports, each a door to the tab (or the sheet) that says more. Never a score, never a ribbon, and an amount says
 * "recorded". A figure with nothing true to say is not drawn, and a thin record draws none.
 */
import { capitalize, plural } from "../shared/words";
import type { AppointmentWord } from "../journey/appointment-word";
import { personTabWord, type PersonTab } from "./route";

/** One figure: its label, its value, the line under it, and where a press goes (a tab, the business sheet, or nowhere). */
export interface PersonFigureVM {
  id: "last" | "lead" | "deals" | "step" | "calls" | "visits" | "emails";
  label: string;
  value: string;
  sub: string;
  to: PersonTab | "business" | null;
}

/** What the figures are made of, as the page's view model holds it. */
export interface PersonFigureFacts {
  thin: boolean;
  /** "Sep 24" and "You replied" (PersonLastContact), or null with no contact on record. */
  last: { value: string; sub: string } | null;
  /** The business's stage word and since when, for a person who works at a lead; null otherwise. */
  lead: { stage: string; since: string } | null;
  /** Their open deals and what they add up to, recorded ("$2,500 recorded"); count 0 with none. */
  deals: { count: number; recorded: string | null };
  /** Their next step's day ("Tue") and words, when it is due or near. */
  step: { day: string; words: string } | null;
  calls: { count: number; minutes: string };
  /** Their visits ahead, the past ones a member said they kept, and the ended ones nobody has said of. */
  visits: { ahead: number; kept: number; toMark: number; any: boolean };
  /** What the workspace calls an appointment: the visits' figure says it, as the tab it opens does (personTabWord). */
  word: AppointmentWord;
  /** A reach-out's emails to their business, and its answers. */
  emails: { out: number; back: number } | null;
}

/** The most figures a page draws. */
const FIGURES = 4;

/**
 * The figures, most telling first, four at most: when they were last in touch; the business's stage for a person who works
 * at a lead; their open deals; a step that is due; the reach-out's emails; their calls; their visits.
 */
export function personFiguresOf(f: PersonFigureFacts): PersonFigureVM[] {
  if (f.thin) return [];
  const out: PersonFigureVM[] = [];
  if (f.last) out.push({ id: "last", label: "Last contact", value: f.last.value, sub: f.last.sub, to: "history" });
  if (f.lead) out.push({ id: "lead", label: "Lead", value: f.lead.stage, sub: f.lead.since, to: "business" });
  if (f.deals.count > 0)
    out.push({
      id: "deals",
      label: "Open deals",
      value: String(f.deals.count),
      sub: f.deals.recorded ?? plural(f.deals.count, "proposal"),
      to: "deals",
    });
  if (f.step)
    out.push({ id: "step", label: "Step due", value: capitalize(f.step.day), sub: f.step.words, to: "overview" });
  if (f.emails && f.emails.out > 0)
    out.push({
      id: "emails",
      label: "Emails",
      value: `${f.emails.out} out`,
      sub: `${f.emails.back} back`,
      to: "history",
    });
  if (f.calls.count > 0)
    out.push({ id: "calls", label: "Calls", value: String(f.calls.count), sub: f.calls.minutes, to: "history" });
  if (f.visits.any)
    out.push({
      id: "visits",
      label: personTabWord("visits", f.word),
      value: f.visits.ahead > 0 ? `${f.visits.ahead} ahead` : "None ahead",
      sub:
        f.visits.toMark > 0
          ? `${f.visits.toMark} to mark`
          : f.visits.kept > 0
            ? `${f.visits.kept} kept`
            : "none marked yet",
      to: "visits",
    });
  return out.slice(0, FIGURES);
}

/** Words: notes. */

import type { LeadRoundEnding } from "../search/sets";
import { LEAD_ENDING_WORDS } from "../search/endings";
import { plural } from "../../shared/words";
import type { LEAD_CALL_OUTCOMES, LeadStage } from "./lists";

export const LEAD_CALL_QUESTION = "How did the call go?";

export const LEAD_NOTE_PLACEHOLDER = "A note for next time, if you like";

export const LEAD_NOTE_MAX = 280;

/** A stage click never converts (§9.6): the control says where the yes comes from. */
export const LEAD_TALKING_NOTE = "They join People when they write or call in, or when a call goes well.";

/** How much of the note is left, said in the field (§9.4). */
export function leadNoteLeft(left: number, max: number): string {
  return left >= max ? `Up to ${max} characters` : `${left} left`;
}

/** An unclaimed listing rarely watches its email; the peek says so, quietly (D2). */
export const LEAD_UNCLAIMED_NOTE = "Listing not claimed by the owner";

/** Below this, the unhappy reviews are the ordinary few every business has, and saying so would be noise. */
export const LEAD_LOW_SHARE_FLOOR = 0.15;

/**
 * The one thing five bars said that the average cannot: how much of the score is carried by people who were unhappy.
 * A 4.5 out of forty reviews and a 4.5 out of forty where a quarter gave one star are different businesses to call,
 * and the mean hides it. So the peek says it in words, and only when it changes the picture -- under a sixth at one
 * or two stars is the ordinary tail of any listing, and a line about it would be noise on every lead.
 *
 * Null when the listing published no breakdown, when it has no reviews, or when nothing is worth saying.
 */
/**
 * The five counts as bars, five stars first, each as its share of all the reviews (rounded): the spread the peek draws
 * under the score in Glass (canvas L2), so "4.1" is read beside how the ratings fall. [] when there are none.
 */
export function leadRatingSpread(dist: {
  one: number;
  two: number;
  three: number;
  four: number;
  five: number;
}): { stars: number; pct: number }[] {
  const total = dist.one + dist.two + dist.three + dist.four + dist.five;
  if (total <= 0) return [];
  return [dist.five, dist.four, dist.three, dist.two, dist.one].map((n, i) => ({
    stars: 5 - i,
    pct: Math.round((n / total) * 100),
  }));
}

export function leadLowShare(
  dist: { one: number; two: number; three: number; four: number; five: number } | null,
): string | null {
  if (!dist) return null;
  const total = dist.one + dist.two + dist.three + dist.four + dist.five;
  if (total <= 0) return null;
  const share = (dist.one + dist.two) / total;
  if (share < LEAD_LOW_SHARE_FLOOR) return null;
  return `${Math.round(share * 100)}% at 1–2 stars`;
}

/* ------------------------------------------------- the planner's refusals */

/**
 * The three things the planner says instead of a plan (§8.8). They are words for
 * whoever asked -- the composer prints them under the input, Ask's tool hands
 * them to the model to say -- and never a card with a problem in it.
 */
export const LEAD_NO_CARD_LINE = "I can find local businesses for now.";

export const LEAD_OUTSIDE_US_LINE =
  "I can only find businesses in the US for now. The rules for emailing businesses in Canada, the UK and the EU are different, and Chanlytics follows the US ones.";

/** The second: what the workspace sells, in the owner's own words, or "what you do". */
export function leadNotBusinessesLine(want: string | null): string {
  return `I find businesses, not people at home. People who want ${want && want.trim() ? want.trim() : "what you do"} find you, and your receptionist answers them. Businesses whose clients need you next are a good start:`;
}

/** The third: what was asked for, named, and what the one card can do. The ask is logged as demand (§0.3). */
export function leadNoCardLine(text: string | null): string {
  return text && text.trim() ? `I can't search ${text.trim()} yet. ${LEAD_NO_CARD_LINE}` : LEAD_NO_CARD_LINE;
}

/* ------------------------------------------ the nine endings, said once -- */

/** The platform's switch, in the owner's words: nothing about a vendor, nothing about money. */
export const LEAD_PAUSED_TITLE = "Lead searches are paused for now";

export interface LeadEndingFacts {
  /** The plan's subject in the owner's words: "personal trainers". */
  name: string;
  /** Where it looked, in the owner's words: "Austin". */
  area: string;
  counted: number;
  target: number;
  emails: number;
  phones: number;
  excluded: number;
  /** A stopped round whose emails are still being checked (S12). */
  checking: boolean;
  /** question_unanswered: how many were counted before it asked. */
  foundBefore: number;
  /** few_new_matches / searched_everything: where to look next, in the owner's words. */
  nearby: string[];
  /** How many places the source returned at all, and what left them all out. */
  seen: number;
  leftOutBy: string | null;
}

export interface LeadEndingLine {
  /** A's word for the ending; the strip's accessible name, never its sentence. */
  mark: string;
  title: string;
  parts: string[];
  step: { id: string; label: string } | null;
}

/** "Alpine and Fort Davis"; "Round Rock, Pflugerville and Kyle". */
/**
 * Where the nearest areas are, as a sentence says it: "near 10005, 10464 and 10467" when every label is a ZIP's
 * ("near 10005"), else "in Round Rock and Pflugerville". Joining the labels whole read "in near 10005, near 10464".
 */
export function leadNearWhere(labels: readonly string[]): string {
  const isNear = (l: string) => l.toLowerCase().startsWith("near ");
  return labels.length && labels.every(isNear)
    ? `near ${leadAnd(labels.map((l) => l.slice(5).trim()))}`
    : `in ${leadAnd(labels)}`;
}

export function leadAnd(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Whether an ending is the first of leadEndingLine's two shapes, "Found N ...": the round delivered what it was for.
 * Only such an ending wears the strip's check; one that did not deliver ("Stopped ...", or a search that never ran) wore
 * it too, and a search the source could not start was drawn as done (29 Oct 2026).
 */
export function leadEndingFound(ending: LeadRoundEnding, leadEndingFacts: Pick<LeadEndingFacts, "counted">): boolean {
  if (ending === "target_reached") return true;
  return (ending === "searched_everything" || ending === "few_new_matches") && leadEndingFacts.counted > 0;
}

/**
 * Every ending, said once (§8.8, the States artboard): what happened, what was
 * kept, what was counted, and one next step. Two shapes only -- "Found N ..."
 * when the round delivered what it was for, "Stopped ..." when it did not --
 * because an owner reads the first word and must know which of the two this is.
 * LEAD_ENDING_WORDS stays A's short name for the ending and rides along as
 * `mark`, for the strip's accessible name and the kept-search menu.
 *
 * No dollar amount: the month's allowance and the searching budget are both
 * spoken as leads (§0.2), and no line here names what any of it is bought from.
 */
export function leadEndingLine(ending: LeadRoundEnding, leadEndingFacts: LeadEndingFacts): LeadEndingLine {
  const mark = LEAD_ENDING_WORDS[ending];
  const yours = `the ${leadEndingFacts.counted} found are yours`;
  const one = leadEndingFacts.name.replace(/s$/, "");
  switch (ending) {
    case "target_reached":
      return {
        mark,
        title: `Found ${leadEndingFacts.counted} ${leadEndingFacts.name}`,
        parts: [
          `${leadEndingFacts.emails} you can email`,
          `${leadEndingFacts.phones} by phone`,
          `${leadEndingFacts.excluded} left out`,
        ],
        step:
          leadEndingFacts.excluded > 0
            ? { id: "excluded", label: `${leadEndingFacts.excluded} left out` }
            : { id: "sort_fit", label: "Sort by fit" },
      };
    case "searched_everything":
      if (leadEndingFacts.counted === 0) {
        return {
          mark,
          title: `There are ${plural(leadEndingFacts.seen, one, leadEndingFacts.name)} in ${leadEndingFacts.area}, and ${leadEndingFacts.seen === 1 ? "it is" : "all of them are"} ${leadEndingFacts.leftOutBy ?? "outside what you asked for"}, which you asked me to leave out.`,
          parts: ["Nothing was counted."],
          step: leadEndingFacts.nearby.length
            ? { id: "nearby", label: `Look ${leadNearWhere(leadEndingFacts.nearby)}` }
            : null,
        };
      }
      return {
        mark,
        title: `Found ${leadEndingFacts.counted} ${leadEndingFacts.name}`,
        parts: [`everything these searches returned in ${leadEndingFacts.area}`],
        step: {
          id: "nearby",
          label: `Find ${Math.max(0, leadEndingFacts.target - leadEndingFacts.counted)} more nearby`,
        },
      };
    case "month_leads_used":
      return {
        mark,
        title: `Stopped at ${leadEndingFacts.counted}`,
        parts: ["this month's leads are used", yours],
        step: null,
      };
    case "budget_used":
      return {
        mark,
        title: `Stopped at ${leadEndingFacts.counted}`,
        parts: ["this month's searching is used up", yours],
        step: null,
      };
    case "few_new_matches":
      return {
        mark,
        // What it found of what was asked, and where. "Found all" said the area had run dry, and this ending means only
        // that the round stopped short: five of ten salons in a city of hundreds said it (5 Nov 2026).
        title: `Found ${leadEndingFacts.counted} of ${leadEndingFacts.target} ${leadEndingFacts.name} in ${leadEndingFacts.area}`,
        parts: [
          ...(leadEndingFacts.counted > 0 ? [yours] : []),
          ...(leadEndingFacts.nearby.length ? [`Look further out, ${leadNearWhere(leadEndingFacts.nearby)}?`] : []),
        ],
        // One word (Ruben, 25 Sep): the line before it says what was found and where; the parts say where next.
        step: leadEndingFacts.nearby.length ? { id: "look_further", label: "Widen" } : null,
      };
    case "stopped":
      return leadEndingFacts.checking
        ? {
            mark,
            title: "Stopping",
            parts: [`checking the emails of the ${leadEndingFacts.counted} found`, "nothing else was counted"],
            step: null,
          }
        : {
            mark,
            title: `Stopped at ${leadEndingFacts.counted}`,
            parts: [yours, "nothing else was counted"],
            step: { id: "carry_on", label: "Carry on" },
          };
    case "source_failed":
      // Nothing returned: the source never ran the search (refused at its start, or failed before its first place),
      // so nothing "stopped answering" (23 Oct 2026: a build the source had deleted refused every start, and the
      // strip said "Stopped at 0: the source stopped answering").
      if (leadEndingFacts.seen === 0)
        return {
          mark,
          title: "The search didn't run: the source couldn't start it",
          parts: ["nothing was counted"],
          step: { id: "try_again", label: "Try again" },
        };
      return {
        mark,
        title: `Stopped at ${leadEndingFacts.seen}: the source stopped answering`,
        parts: [yours, "nothing more was counted"],
        step: { id: "try_again", label: "Try again" },
      };
    case "question_unanswered":
      return {
        mark,
        title: "Stopped after a day without your answer",
        parts: [`the ${leadEndingFacts.foundBefore} found before it asked are yours`],
        step: { id: "answer_now", label: "Answer now" },
      };
    case "paused":
      return {
        mark,
        title: LEAD_PAUSED_TITLE,
        parts: ["your leads are all here", "nothing is being counted"],
        step: null,
      };
  }
}

/** The plan card's and the strip's one unit: leads, never dollars (§0.2). */
export function leadAllowanceFact(left: number): string {
  return `${left} left this month`;
}

/** What a call outcome does to the stage (§9.4). Only Interested converts; Wrong number keeps the stage. */
export function outcomeMove(value: (typeof LEAD_CALL_OUTCOMES)[number]): {
  stage: LeadStage | null;
  closedReason: string | null;
  converts: boolean;
} {
  switch (value) {
    case "interested":
      return { stage: "converted", closedReason: null, converts: true };
    case "not_interested":
      return { stage: "archived", closedReason: "said_no", converts: false };
    case "wrong_number":
      return { stage: null, closedReason: null, converts: false };
    default:
      return { stage: "nurture", closedReason: null, converts: false };
  }
}

/**
 * A lead's row in a table (the table review of 5 Nov 2026): the one status its Stage cell says, with the line under it,
 * and the one press the row offers. It stands in the sheet's folder because it speaks the sheet's words: where a lead
 * stands is the sequence's own reading (sequence-place.ts placeWordOf), and a press is named as the sheet's dock names
 * it (lead-sheet-dock.ts), so a row and the sheet it opens never say two things. A row reads less than the sheet does
 * (its place and no sends, no dry answer from the add door: one for every row would be a round trip a lead), so a press
 * that needs more opens the sheet, and an add the door refuses says why as the bulk bar's does.
 *
 *   leadStatusOf    one answer to "where does this lead stand": the word, its tone, the line under it
 *   leadRowActOf    the one press a row offers, or none
 *   leadGroupOf     the head a row of the queue stands under (a stage sort, 00552)
 *   leadFootOf      what the table's foot says the view holds
 */
import {
  PLACE_NOT_PLANNED_WORD,
  placeNotPlannedOf,
  placeStands,
  placeWordOf,
  type SequencePlaceOfDto,
} from "../../sequences/sequence-place";
import { agoWords } from "../../shared/time";
import type { LeadViewCountsDto } from "../lead-dtos";
import { LEAD_REVIEW_ACT_WORDS } from "../lead-review";
import type { LeadRowVM } from "../lead-row";
import { LEAD_LEFT_OUT_WORD, LEAD_REVIEW_WORD, LEAD_STAGE_WORDS, LEAD_STATUS_GROUP_WORDS } from "../lead-words";
import { LEAD_DOCK_WORDS } from "./lead-sheet-dock";

/* ------------------------------------------------------------------------------------------------ the status -- */

/** A status's tone: amber needs you, green runs, blue is under way, plain is over, quiet is the default nobody marks. */
export type LeadStatusTone = "warn" | "ok" | "info" | "plain" | "quiet";

/** What a row's Stage cell says: one word, its tone, and the line under it where there is more to say. */
export interface LeadStatusVM {
  word: string;
  tone: LeadStatusTone;
  line: string | null;
  /** What said it: the finder's class, the lead's place in a sequence, or its own stage (whose Talking is a door). */
  by: "class" | "place" | "stage";
}

/**
 * Where a lead stands, said once. In this order: what the finder left out, with why; what waits on a look, with what
 * would resolve it; its place in a sequence while that stands (the sequence's own word and line); else its own stage,
 * a contacted lead with how long ago; and a place that is over only for a lead whose stage says nothing of its own.
 * Not contacted is the default, and is said quietly: the rows that need you are the ones a tone marks. Under a head that
 * says it (`grouped`, a stage sort's run; leadGroupOf) a row stops repeating it: see underAHead.
 */
export function leadStatusOf(
  l: Pick<LeadRowVM, "cls" | "state" | "stageLabel" | "waitsOn" | "fitLabel" | "fit" | "why"> & {
    /** When a contacted lead was contacted (the read's `contacted_at`), for the line under Contacted; none says none. */
    contactedAt?: string | null;
  },
  place: SequencePlaceOfDto | null,
  clock: { tz: string; nowMs: number },
  grouped = false,
): LeadStatusVM {
  const said = statusOf(l, place, clock);
  return grouped ? underAHead(said, place, l) : said;
}

/**
 * What a row says once a head has said its group: Not contacted says what chooses between the rows, its fit and why (the
 * queue's order inside the group; the fit's pill by the name then gives way), Contacted says how long ago, and In sequence
 * gives way to its step, with the sequence under it. What needs you still says what it needs: the head says only that it
 * does.
 */
function underAHead(
  said: LeadStatusVM,
  place: SequencePlaceOfDto | null,
  l: Pick<LeadRowVM, "fit" | "fitLabel" | "why">,
): LeadStatusVM {
  if (said.by === "stage" && said.tone === "quiet")
    return l.fit ? { ...said, word: l.fitLabel, line: l.why || null } : { ...said, word: "" };
  if (said.by === "stage" && said.word === LEAD_STAGE_WORDS.nurture)
    return { word: said.line ?? "", tone: "quiet", line: null, by: "stage" };
  if (said.by !== "place" || !place || said.tone !== "ok" || said.word === PLACE_NOT_PLANNED_WORD) return said;
  const tail = ` · ${place.name}`;
  const line = said.line ?? "";
  return line.endsWith(tail) ? { ...said, word: line.slice(0, -tail.length), line: place.name } : said;
}

function statusOf(
  l: Parameters<typeof leadStatusOf>[0],
  place: SequencePlaceOfDto | null,
  clock: { tz: string; nowMs: number },
): LeadStatusVM {
  if (l.cls === "excluded") return { word: LEAD_LEFT_OUT_WORD, tone: "plain", line: l.fitLabel || null, by: "class" };
  if (l.cls === "review") return { word: LEAD_REVIEW_WORD, tone: "warn", line: l.waitsOn, by: "class" };
  const placed = (): LeadStatusVM | null =>
    place ? { ...placeWordOf(place, { name: place.name, state: place.state }, clock, "line"), by: "place" } : null;
  // Wrote back is over as a place and still the one thing to say: it needs an answer.
  const standing = place && (placeStands(place.group) || place.group === "replied") ? placed() : null;
  if (standing) return standing;
  if (l.state === "contacted") {
    const ago = l.contactedAt ? agoWords(Date.parse(l.contactedAt), clock.nowMs) : null;
    return { word: LEAD_STAGE_WORDS.nurture, tone: "info", line: ago, by: "stage" };
  }
  if (l.state === "talking") return { word: LEAD_STAGE_WORDS.converted, tone: "ok", line: null, by: "stage" };
  if (l.state === "out") return { word: l.stageLabel, tone: "plain", line: null, by: "stage" };
  return placed() ?? { word: LEAD_STAGE_WORDS.ready, tone: "quiet", line: null, by: "stage" };
}

/* --------------------------------------------------------------------------------------------------- the act -- */

/**
 * What a row's press does: Keep and Put back are the review's own; `add` adds to the search's pick; `pick` and `open`
 * open the lead's sheet, whose dock holds the rest (the picker, the email to decide on, the answer); `call` opens the
 * ways to call.
 */
export type LeadRowActKind = "keep" | "put_back" | "add" | "pick" | "call" | "open";

export interface LeadRowActVM {
  kind: LeadRowActKind;
  label: string;
}

/** The words a row's press says that the sheet's dock does not: each opens the sheet at what the word names. */
const LEAD_ROW_ACT_WORDS = {
  review: "Review",
  send: "Send it",
  why: "See why",
} as const;

/** An address the add door may take: one found, not bounced, and no longer being checked. The door decides the rest. */
const mayBeWritten = (l: Pick<LeadRowVM, "email" | "emailState">): boolean =>
  !!l.email && l.emailState !== "invalid" && l.emailState !== "checking" && l.emailState !== "none";

/**
 * The one press a row offers, by what the row itself knows. What waits on a look is kept or put back; a place that
 * needs you opens the sheet at it; one no batch can take is a call where there is a number, else its reason; a place
 * that runs, or is over, offers nothing (the sheet has its quiet ways on); a lead not contacted goes to the pick, or to
 * the picker where none is chosen, or is a call where no address can be written to. Nothing where nothing can be done.
 */
export function leadRowActOf(
  l: Pick<LeadRowVM, "cls" | "state" | "email" | "emailState" | "phone" | "phoneWrong">,
  place: SequencePlaceOfDto | null,
  pick: { name: string } | null,
): LeadRowActVM | null {
  if (l.cls === "excluded") return { kind: "put_back", label: LEAD_DOCK_WORDS.putBack };
  if (l.cls === "review") return { kind: "keep", label: LEAD_REVIEW_ACT_WORDS.keep };
  const call: LeadRowActVM | null = l.phone && !l.phoneWrong ? { kind: "call", label: LEAD_DOCK_WORDS.call } : null;
  if (place) {
    if (place.group === "waiting" || place.group === "held") return { kind: "open", label: LEAD_ROW_ACT_WORDS.review };
    if (place.group === "to_send") return { kind: "open", label: LEAD_ROW_ACT_WORDS.send };
    if (place.group === "replied") return { kind: "open", label: LEAD_DOCK_WORDS.answer };
    if (place.group === "queued" && placeNotPlannedOf(place.why))
      return call ?? { kind: "open", label: LEAD_ROW_ACT_WORDS.why };
    return null;
  }
  if (l.state !== "ready") return null;
  if (l.emailState === "checking") return null;
  if (mayBeWritten(l))
    return pick
      ? { kind: "add", label: LEAD_DOCK_WORDS.addTo(pick.name) }
      : { kind: "pick", label: LEAD_DOCK_WORDS.addToOne };
  return call;
}

/* -------------------------------------------------------------------------------------------------- the queue -- */

/**
 * The head a row of the queue stands under: Needs you and In a sequence with the view's own counts, then the rest under
 * their stage's word, which the view does not count apart. A review's rows and the left out are no queue's.
 */
export function leadGroupOf(
  l: Pick<LeadRowVM, "cls" | "stage" | "statusGroup">,
  counts: LeadViewCountsDto["status_groups"] | null | undefined,
): { key: string; label: string; count: number | null } | null {
  if (l.cls !== "qualified") return null;
  if (l.statusGroup) {
    return {
      key: l.statusGroup,
      label: LEAD_STATUS_GROUP_WORDS[l.statusGroup],
      count: counts?.[l.statusGroup] ?? null,
    };
  }
  return { key: l.stage, label: LEAD_STAGE_WORDS[l.stage], count: null };
}

/**
 * What the table's foot says the view holds, in the words the search's own line uses ("88 you can email", "72 by phone"),
 * and none it could not read. Nobody waiting is not said; a way to reach nobody is.
 */
export function leadFootOf(counts: Partial<LeadViewCountsDto> | null | undefined): string[] {
  const needs = counts?.status_groups?.needs ?? 0;
  return [
    ...(needs > 0 ? [`${needs} ${needs === 1 ? "needs" : "need"} you`] : []),
    ...(typeof counts?.with_email === "number" ? [`${counts.with_email} you can email`] : []),
    ...(typeof counts?.with_phone === "number" ? [`${counts.with_phone} by phone`] : []),
  ];
}

/**
 * The lead sheet's five lines (the canvas "Lead sheet, redesigned", 1 Nov 2026): Fit, Contact, Company or About, Sequence
 * and History, the same five in the same order on every lead, each saying its answer while it is closed, as a sequence's
 * People tab folds its groups, and one press from the whole. A fact has one home: what a line says is said nowhere else
 * on the sheet. Every sentence is here.
 *
 *   leadLinesOf     the five lines, closed
 *   leadHistoryOf   History: how we found them, then what happened since, oldest first
 */
import { clockDate } from "../../shared/clock";
import { capitalize } from "../../shared/words";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../../reach-out/reach-out-replies";
import type { SequencePlaceDto } from "../../sequences/sequence-place";
import { sequenceLeftWords } from "../../sequences/sequence-words";
import type { LeadPeekVM } from "../lead-peek";
import { LEAD_CALL_OUTCOME_WORDS, type LeadCallOutcome } from "../lead-words";
import { LEAD_SHEET_WORDS as SW } from "./lead-sheet";
import type { LeadSheetChecksLineVM, LeadSheetEmailLineVM } from "./lead-sheet-card";

export const LEAD_LINE_WORDS = {
  fit: "Fit",
  contact: "Contact",
  company: "Company",
  about: "About",
  sequence: "Sequence",
  history: "History",
  /** The verdict in a line: its word without the word the line's label says. */
  verdict: (word: string) => word.replace(/ fit$/i, ""),
  notConfirmed: "Not confirmed",
  noWay: "No way to reach them yet",
  named: (n: number) => `${n} named`,
  claimed: "Claimed",
  unclaimed: "Not claimed",
  notInOne: "Not in one yet",
  addsTo: (name: string) => `adds to ${name}`,
  left: (name: string) => `Left ${name}`,
  stepOf: (at: number, of: number | null) => (of ? `Step ${at} of ${of}` : `Step ${at}`),
  added: (name: string) => `You added them to ${name}`,
  joined: (name: string) => `Joined ${name} on its own`,
  sent: (place: number) => `Step ${place} sent`,
  wrote: (intent: string | null) => (intent ? `Wrote back · ${intent}` : "Wrote back"),
  left_: (why: string) => capitalize(why),
  lastCall: (word: string, note: string | null) => (note ? `${word}: ${note}` : word),
} as const;

const W = LEAD_LINE_WORDS;

export type LeadLineId = "fit" | "contact" | "about" | "sequence" | "history";

/** One line, closed: its label, its answer, a quieter word after it, and what marks it. */
export interface LeadLineVM {
  id: LeadLineId;
  label: string;
  value: string;
  note: string | null;
  /** Said in amber after the value: what is not as it should be. */
  warn: string | null;
  /** The address it writes to checked out. */
  tick: boolean;
  /** Fit's dots: a dot a check. */
  dots: LeadSheetChecksLineVM["dots"] | null;
}

/** One thing that happened: the day, and what. */
export interface LeadHistoryRowVM {
  at: string;
  what: string;
}

const dayOf = (iso: string | null | undefined, tz: string, nowMs: number): string | null => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? clockDate(ms, tz, nowMs) : null;
};

/** A found step's day: its stamp as the peek says it, less the minute ("Sep 20, 2:02 PM"). */
const foundDay = (at: string) => at.split(",")[0]?.trim() ?? at;

/** What they said, as a place's reply reads. */
const wroteOf = (place: SequencePlaceDto): string => {
  const reply = place.place.reply;
  return W.wrote(reply && isReplyIntent(reply.intent) ? REPLY_INTENT_WORDS[reply.intent] : null);
};

/** What a sequence did for them, oldest first: joining it, each step that went, and how it ended. */
function placeRows(place: SequencePlaceDto, tz: string, nowMs: number): LeadHistoryRowVM[] {
  const name = place.sequence.name;
  const rows: LeadHistoryRowVM[] = [];
  const joined = place.joined ? dayOf(place.joined.at, tz, nowMs) : null;
  if (joined && place.joined) rows.push({ at: joined, what: place.joined.auto ? W.joined(name) : W.added(name) });
  for (const s of place.sends) {
    const at = dayOf(s.sent_at, tz, nowMs);
    if (at) rows.push({ at, what: W.sent(s.place) });
  }
  const at = dayOf(place.place.at, tz, nowMs);
  if (at && place.place.group === "replied") rows.push({ at, what: wroteOf(place) });
  if (at && place.place.group === "left")
    rows.push({ at, what: W.left_(sequenceLeftWords(place.place.why) || "taken out") });
  return rows;
}

/** History: how we found them, what a sequence did, and your last call with its note, each said once. */
export function leadHistoryOf(p: {
  vm: Pick<LeadPeekVM, "found" | "worked">;
  place: SequencePlaceDto | null;
  tz: string;
  nowMs: number;
}): LeadHistoryRowVM[] {
  const found = p.vm.found.map((f) => ({ at: foundDay(f.at), what: f.what }));
  const worked = p.vm.worked;
  const outcome = worked.outcome ? (LEAD_CALL_OUTCOME_WORDS[worked.outcome as LeadCallOutcome] ?? null) : null;
  const called = dayOf(worked.at, p.tz, p.nowMs);
  return [
    ...found,
    ...(p.place ? placeRows(p.place, p.tz, p.nowMs) : []),
    ...(outcome && called ? [{ at: called, what: W.lastCall(outcome, worked.note) }] : []),
  ];
}

/** What the lines read. */
export interface LeadLinesFacts {
  vm: Pick<LeadPeekVM, "company" | "claimed" | "weekSummary" | "reach" | "slots" | "fit">;
  checks: LeadSheetChecksLineVM | null;
  email: LeadSheetEmailLineVM;
  /** Where they stand, where a sequence has them. */
  place: SequencePlaceDto | null;
  /** How many steps their sequence has, where it is known. */
  steps: number | null;
  /** The sequence Add goes to. */
  pick: { name: string } | null;
  /** A lead no sequence can take says so on its line rather than the pick's name. */
  canJoin: boolean;
  history: readonly LeadHistoryRowVM[];
}

const fitLine = (f: LeadLinesFacts): LeadLineVM => ({
  id: "fit",
  label: W.fit,
  value: W.verdict(f.vm.fit.word.split(" — ")[0] ?? f.vm.fit.word),
  note: f.checks ? f.checks.words.replace(/ checks?$/, "") : null,
  warn: null,
  tick: false,
  dots: f.checks ? f.checks.dots : null,
});

/** Contact: the address the sequence writes to and how it checked, else the phone, else that there is neither. */
function contactLine(f: LeadLinesFacts): LeadLineVM {
  const base = { id: "contact", label: W.contact, note: null, warn: null, tick: false, dots: null } as const;
  const { email } = f;
  if (email.address)
    return {
      ...base,
      value: email.address,
      tick: email.tone === "ok",
      note: email.tone === "plain" ? email.words : null,
      warn: email.tone === "warn" ? email.words : null,
    };
  const phone = f.vm.reach.phone;
  if (phone)
    return {
      ...base,
      value: phone.value,
      warn: f.vm.slots.phone.state === "ok" ? null : W.notConfirmed,
    };
  return { ...base, value: W.noWay };
}

/** Company, or About for a place: how big and who is named, or its listing and its week. */
function aboutLine(f: LeadLinesFacts): LeadLineVM {
  const { company } = f.vm;
  const base = { id: "about", warn: null, tick: false, dots: null } as const;
  if (company)
    return {
      ...base,
      label: W.company,
      value: company.size ?? SW.directory,
      note: company.people.length ? W.named(company.people.length) : null,
    };
  const open = f.vm.weekSummary.split(" · ")[0] || null;
  const claim = f.vm.claimed === null ? null : f.vm.claimed ? W.claimed : W.unclaimed;
  return { ...base, label: W.about, value: claim ?? open ?? SW.noListing, note: claim ? open : null };
}

/** Sequence: the one that has them and their step, or where Add would take them. */
function sequenceLine(f: LeadLinesFacts): LeadLineVM {
  const base = { id: "sequence", label: W.sequence, warn: null, tick: false, dots: null } as const;
  const { place } = f;
  if (place)
    return {
      ...base,
      value: place.sequence.name,
      note: W.stepOf(place.place.place ?? 1, f.steps),
    };
  return { ...base, value: W.notInOne, note: f.pick && f.canJoin ? W.addsTo(f.pick.name) : null };
}

/** History's line: the last thing that happened. */
function historyLine(f: LeadLinesFacts): LeadLineVM {
  const last = f.history.at(-1);
  return {
    id: "history",
    label: W.history,
    value: last ? last.what : "",
    note: last ? last.at : null,
    warn: null,
    tick: false,
    dots: null,
  };
}

/** The five lines, in their order. History stands down where nothing is known of a lead yet. */
export const leadLinesOf = (f: LeadLinesFacts): LeadLineVM[] => [
  fitLine(f),
  contactLine(f),
  aboutLine(f),
  sequenceLine(f),
  ...(f.history.length ? [historyLine(f)] : []),
];

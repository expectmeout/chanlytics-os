/**
 * The lead sheet's five lines (the canvas "Lead sheet, redesigned", 1 Nov 2026): Fit, Contact, Company or About, Sequence
 * and History, the same five in the same order on every lead, each saying its answer while it is closed, as a sequence's
 * People tab folds its groups, and one press from the whole. A fact has one home: what a line says is said nowhere else
 * on the sheet. Every sentence is here.
 *
 *   leadLinesOf     the five lines, closed
 *   leadHistoryOf   History: how we found them, then what happened since, oldest first
 */
import {
  clockDate,
  capitalize,
  REPLY_INTENT_WORDS,
  isReplyIntent,
  sequenceLeftWords,
  LEAD_CALL_OUTCOME_WORDS,
  type LeadCallOutcome,
  LEAD_OWN_EMAIL_WORDS,
  leadEmailLineOf,
  type LeadEmailDto,
} from "@chanlytics/contracts";
import type { SequencePlaceDto, LeadPeekVM } from "@chanlytics/contracts";

import { LEAD_SHEET_WORDS as SW } from "./view";
import type { LeadSheetChecksLineVM, LeadSheetEmailLineVM } from "./card";

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
  left_: (reason: string) => capitalize(reason),
  lastCall: (word: string, note: string | null) => (note ? `${word}: ${note}` : word),
  /** "Did you send it?", answered yes, from before an email of your own had a row. */
  wroteYourself: LEAD_OWN_EMAIL_WORDS.row.yourself,
} as const;

const LW = LEAD_LINE_WORDS;

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

/** When something happened, as briefly as it can be said, in the workspace's zone; null where nothing says when. */
export const leadDayOf = (iso: string | null | undefined, tz: string, nowMs: number): string | null => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? clockDate(ms, tz, nowMs) : null;
};

/** A found step's day: its stamp as the peek says it, less the minute ("Sep 20, 2:02 PM"). */
const foundDay = (at: string) => at.split(",")[0]?.trim() ?? at;

/** What they said, as a place's reply reads. */
const wroteOf = (place: SequencePlaceDto): string => {
  const reply = place.place.reply;
  return LW.wrote(reply && isReplyIntent(reply.intent) ? REPLY_INTENT_WORDS[reply.intent] : null);
};

/** A row of History with when it happened, for the one order the sequence's rows and your own emails share. */
type TimedRow = LeadHistoryRowVM & { ms: number };

/** One thing that happened at a moment; nothing where nothing says when. */
const rowAt = (iso: string | null | undefined, text: string, tz: string, nowMs: number): TimedRow[] => {
  const at = leadDayOf(iso, tz, nowMs);
  return at ? [{ at, what: text, ms: Date.parse(iso ?? "") }] : [];
};

/** What a sequence did for them, oldest first: joining it, each step that went, and how it ended. */
function placeRows(place: SequencePlaceDto, tz: string, nowMs: number): TimedRow[] {
  const name = place.sequence.name;
  const { group, at, why } = place.place;
  return [
    ...(place.joined ? rowAt(place.joined.at, place.joined.auto ? LW.joined(name) : LW.added(name), tz, nowMs) : []),
    ...place.sends.flatMap((s) => rowAt(s.sent_at, LW.sent(s.place), tz, nowMs)),
    ...(group === "replied" ? rowAt(at, wroteOf(place), tz, nowMs) : []),
    ...(group === "left" ? rowAt(at, LW.left_(sequenceLeftWords(why) || "taken out"), tz, nowMs) : []),
  ];
}

/** Each email of your own that came to anything, on its own day. */
const emailRows = (emails: readonly LeadEmailDto[], tz: string, nowMs: number): TimedRow[] =>
  emails.flatMap((e) => {
    const line = leadEmailLineOf(e);
    return line ? rowAt(e.at, line, tz, nowMs) : [];
  });

/**
 * Your last word with them: a call, or an email of your own. `emailed` on the lead can't tell an email of yours from a
 * sequence's (db recordLeadWritten writes the same word), so it speaks only for a mark from before an email had a row of its
 * own, and where no send of a sequence has gone: one that has is said already, as its step.
 */
function lastWordOf(
  outcome: string | null,
  place: SequencePlaceDto | null,
  emails: readonly LeadEmailDto[],
): string | null {
  if (outcome === "emailed")
    return emails.length > 0 || (place && place.sends.some((s) => s.sent_at)) ? null : LW.wroteYourself;
  return outcome ? (LEAD_CALL_OUTCOME_WORDS[outcome as LeadCallOutcome] ?? null) : null;
}

/** History: how we found them, what a sequence did and your own emails in time, and your last word with them. */
export function leadHistoryOf(params: {
  vm: Pick<LeadPeekVM, "found" | "worked">;
  place: SequencePlaceDto | null;
  emails: readonly LeadEmailDto[];
  tz: string;
  nowMs: number;
}): LeadHistoryRowVM[] {
  const found = params.vm.found.map((f) => ({ at: foundDay(f.at), what: f.what }));
  const worked = params.vm.worked;
  const outcome = lastWordOf(worked.outcome, params.place, params.emails);
  const called = leadDayOf(worked.at, params.tz, params.nowMs);
  const since = [
    ...(params.place ? placeRows(params.place, params.tz, params.nowMs) : []),
    ...emailRows(params.emails, params.tz, params.nowMs),
  ]
    .sort((a, b) => a.ms - b.ms)
    .map(({ at, what }) => ({ at, what }));
  return [...found, ...since, ...(outcome && called ? [{ at: called, what: LW.lastCall(outcome, worked.note) }] : [])];
}

/** What the lines read. */
interface LeadLinesFacts {
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
  label: LW.fit,
  value: LW.verdict(f.vm.fit.word.split(" — ")[0] ?? f.vm.fit.word),
  note: f.checks ? f.checks.words.replace(/ checks?$/, "") : null,
  warn: null,
  tick: false,
  dots: f.checks ? f.checks.dots : null,
});

/** Contact: the address the sequence writes to and how it checked, else the phone, else that there is neither. */
function contactLine(leadLinesFacts: LeadLinesFacts): LeadLineVM {
  const base = { id: "contact", label: LW.contact, note: null, warn: null, tick: false, dots: null } as const;
  const { email } = leadLinesFacts;
  if (email.address)
    return {
      ...base,
      value: email.address,
      tick: email.tone === "ok",
      note: email.tone === "plain" ? email.words : null,
      warn: email.tone === "warn" ? email.words : null,
    };
  const phone = leadLinesFacts.vm.reach.phone;
  if (phone)
    return {
      ...base,
      value: phone.value,
      warn: leadLinesFacts.vm.slots.phone.state === "ok" ? null : LW.notConfirmed,
    };
  return { ...base, value: LW.noWay };
}

/** Company, or About for a place: how big and who is named, or its listing and its week. */
function aboutLine(leadLinesFacts: LeadLinesFacts): LeadLineVM {
  const { company } = leadLinesFacts.vm;
  const base = { id: "about", warn: null, tick: false, dots: null } as const;
  if (company)
    return {
      ...base,
      label: LW.company,
      value: company.size ?? SW.directory,
      note: company.people.length ? LW.named(company.people.length) : null,
    };
  const open = leadLinesFacts.vm.weekSummary.split(" · ")[0] || null;
  const claim = leadLinesFacts.vm.claimed === null ? null : leadLinesFacts.vm.claimed ? LW.claimed : LW.unclaimed;
  return { ...base, label: LW.about, value: claim ?? open ?? SW.noListing, note: claim ? open : null };
}

/** Sequence: the one that has them and their step, or where Add would take them. */
function sequenceLine(leadLinesFacts: LeadLinesFacts): LeadLineVM {
  const base = { id: "sequence", label: LW.sequence, warn: null, tick: false, dots: null } as const;
  const { place } = leadLinesFacts;
  if (place)
    return {
      ...base,
      value: place.sequence.name,
      note: LW.stepOf(place.place.place ?? 1, leadLinesFacts.steps),
    };
  return {
    ...base,
    value: LW.notInOne,
    note: leadLinesFacts.pick && leadLinesFacts.canJoin ? LW.addsTo(leadLinesFacts.pick.name) : null,
  };
}

/** History's line: the last thing that happened. */
function historyLine(leadLinesFacts: LeadLinesFacts): LeadLineVM {
  const last = leadLinesFacts.history.at(-1);
  return {
    id: "history",
    label: LW.history,
    value: last ? last.what : "",
    note: last ? last.at : null,
    warn: null,
    tick: false,
    dots: null,
  };
}

/** The five lines, in their order. History stands down where nothing is known of a lead yet. */
export const leadLinesOf = (leadLinesFacts: LeadLinesFacts): LeadLineVM[] => [
  fitLine(leadLinesFacts),
  contactLine(leadLinesFacts),
  aboutLine(leadLinesFacts),
  sequenceLine(leadLinesFacts),
  ...(leadLinesFacts.history.length ? [historyLine(leadLinesFacts)] : []),
];

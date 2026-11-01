/**
 * What the lead sheet says of its checks and its address (the canvas "Lead sheet, redesigned", 1 Nov 2026). Under the name,
 * one line of who and where; on the card and Fit's line, how many passed and what did not; in Fit, what did not pass
 * first, each with why (decision 07), and one legend for a mark seen and a mark read.
 *
 *   leadSheetSubOf          the line under the name: the kind, the street, the rating ("4.7 (312)")
 *   leadSheetChecksLineOf   the checks in a line: their dots, how many passed, and what did not
 *   leadSheetEmailLineOf    the address the sequence writes to, and how its mailbox checked
 *   leadSheetWhyOf          Fit's checks: the exceptions with why, then the passed ones, and the legend
 */
import type { LeadCheckKey } from "../lead-dtos";
import { LEAD_READ_SOURCES } from "../lead-words";
import type { LeadPeekVM } from "../lead-peek";

/** What the sheet says of its checks. */
export const LEAD_SHEET_CARD_WORDS = {
  checks: (passed: number, of: number) => `${passed} of ${of} checks`,
  couldntTell: (n: number, what: readonly string[]) =>
    what.length ? `${n} couldn't tell: ${what.join(", ")}` : `${n} couldn't tell`,
  failed: (n: number) => `${n} failed`,
  /** The legend under Fit's checks: a mark seen, and a mark read, by Claude or by Chanlytics AI (LEAD_READ_SOURCES). */
  seen: "seen on the map or in the mailbox",
  read: "read by Claude from the listing and their site",
  readByAi: "read by Chanlytics AI",
} as const;

const CW = LEAD_SHEET_CARD_WORDS;

/** A check that couldn't tell, said short for the card's line ("phone not confirmed"). */
const UNSURE_WORDS: Partial<Record<LeadCheckKey, string>> = {
  phone_two_sources: "phone not confirmed",
  mailbox: "mailbox not confirmed",
  own_address: "address not confirmed",
  on_maps: "listing not confirmed",
  in_area: "area not confirmed",
  independent: "ownership unclear",
  right_kind: "kind unclear",
};

/** What couldn't be told, said in a word beside others ("area, phone"), where its short words have one. */
const unsureWordOf = (key: string): string | null => {
  const short = UNSURE_WORDS[key as LeadCheckKey];
  return short ? (short.replace(/ (not confirmed|unclear)$/, "") ?? null) : null;
};

/** A check that did not pass, as Fit's row says it first: what is not so, in its short words, capitalized. */
export const leadSheetExceptionWords = (key: string, label: string): string => {
  const short = UNSURE_WORDS[key as LeadCheckKey];
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : label;
};

/**
 * The line under the name: the kind, the street (else the area), and the rating with how many rated it ("4.7 (312)").
 */
export function leadSheetSubOf(vm: Pick<LeadPeekVM, "sub" | "where" | "rated" | "company">): string {
  if (vm.company) return vm.sub;
  const [kind, ...rest] = vm.sub.split(" · ");
  const [first] = vm.where ? vm.where.line.split(",") : [];
  const street = first ? first.trim() : rest.join(" · ");
  const rated = vm.rated ? `★ ${vm.rated.score} (${vm.rated.count})` : null;
  return [kind, street, rated].filter(Boolean).join(" · ");
}

/** A check as Fit reads it: its key, words, how it was known, its answer, its source, and why it did not pass. */
export interface LeadSheetCheckVM {
  key: string;
  label: string;
  how: "seen" | "read";
  answer: "yes" | "no" | "unknown";
  source: string;
  reason: string | null;
}

const checksOf = (vm: Pick<LeadPeekVM, "groups">): LeadSheetCheckVM[] =>
  vm.groups.flatMap((g) =>
    g.checks.map((c) => ({
      key: c.key,
      label: c.label,
      how: g.how,
      answer: c.answer,
      source: c.source,
      reason: c.reason,
    })),
  );

/** The checks in a line: a dot a check (a passed one read shaded apart), how many passed, and what did not. */
export interface LeadSheetChecksLineVM {
  dots: ("ok" | "read" | "warn" | "no")[];
  words: string;
  /** What did not pass, short and in amber: one by its own words, several by how many and what. Null when all passed. */
  exception: string | null;
}

/** The check the email's own line says already (Checked, or not confirmed): the mailbox. */
const REACH_CHECKS: ReadonlySet<string> = new Set<LeadCheckKey>(["mailbox"]);

/**
 * What did not pass, said short: one by its own words, else how many couldn't tell and how many failed. Where every one
 * is a way in, the ways-in line under it says so in amber, and this line does not say it again.
 */
function exceptionOf(checks: LeadSheetCheckVM[]): string | null {
  const unsure = checks.filter((c) => c.answer === "unknown");
  const failed = checks.filter((c) => c.answer === "no");
  if (!unsure.length && !failed.length) return null;
  if ([...unsure, ...failed].every((c) => REACH_CHECKS.has(c.key))) return null;
  const [only] = unsure;
  const one = only && unsure.length === 1 && !failed.length ? UNSURE_WORDS[only.key as LeadCheckKey] : undefined;
  if (one) return one;
  const said = unsure.flatMap((c) => unsureWordOf(c.key) ?? []);
  return [
    failed.length ? CW.failed(failed.length) : null,
    unsure.length ? CW.couldntTell(unsure.length, said.length === unsure.length ? said : []) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function leadSheetChecksLineOf(vm: Pick<LeadPeekVM, "groups" | "checkDots">): LeadSheetChecksLineVM | null {
  if (!vm.checkDots.length) return null;
  const checks = checksOf(vm);
  const passed = vm.checkDots.filter((d) => d.answer === "yes").length;
  return {
    dots: vm.checkDots.map((d) =>
      d.answer === "yes" ? (d.how === "read" ? "read" : "ok") : d.answer === "unknown" ? "warn" : "no",
    ),
    words: CW.checks(passed, vm.checkDots.length),
    exception: exceptionOf(checks),
  };
}

/** The address the sequence writes to, and how its mailbox checked. */
export interface LeadSheetEmailLineVM {
  address: string | null;
  /** "Checked", "Checking…", "Not confirmed", or that none was found. */
  words: string;
  tone: "ok" | "warn" | "plain";
}

const LEAD_EMAIL_LINE_WORDS = {
  checked: "Checked",
  checking: "Checking…",
  notConfirmed: "Not confirmed",
  none: "No email found",
} as const;

export function leadSheetEmailLineOf(vm: Pick<LeadPeekVM, "reach" | "slots">): LeadSheetEmailLineVM {
  const E = LEAD_EMAIL_LINE_WORDS;
  const address = vm.reach.email.address;
  if (!address) return { address: null, words: E.none, tone: "plain" };
  const state = vm.slots.mailbox.state;
  if (state === "ok") return { address, words: E.checked, tone: "ok" };
  if (state === "checking") return { address, words: E.checking, tone: "plain" };
  return { address, words: E.notConfirmed, tone: "warn" };
}

/** Fit's checks: the exceptions first, each with why, then the passed ones, and the legend where a check was read. */
export interface LeadSheetWhyVM {
  exceptions: LeadSheetCheckVM[];
  passed: LeadSheetCheckVM[];
  /** A check failed that says something of the lead: a way in missing is the lead's plain state, and Contact's to say. */
  failed: boolean;
  /**
   * Where a check was read rather than seen, the words for the read mark, which say who read it: Claude, where it read
   * one of them, else Chanlytics AI (the screen, decision 0085, or the company judge); null where every check was seen.
   */
  legend: string | null;
}

/** The checks Chanlytics AI read: the screen's (decision 0085) and a company judge's. Every other read is Claude's. */
const READ_BY_AI: ReadonlySet<string> = new Set([LEAD_READ_SOURCES.screen, LEAD_READ_SOURCES.company]);

/** The read mark's words, naming who read: Chanlytics AI where it read every read check, else Claude. */
function legendOf(checks: ReadonlyArray<{ how: string; source: string }>): string | null {
  const read = checks.filter((c) => c.how === "read");
  if (!read.length) return null;
  return read.every((c) => READ_BY_AI.has(c.source)) ? CW.readByAi : CW.read;
}

export function leadSheetWhyOf(vm: Pick<LeadPeekVM, "groups">): LeadSheetWhyVM | null {
  const checks = checksOf(vm);
  if (!checks.length) return null;
  const passed = checks.filter((c) => c.answer === "yes");
  return {
    exceptions: checks.filter((c) => c.answer !== "yes"),
    passed,
    failed: checks.some((c) => c.answer === "no" && !REACH_CHECKS.has(c.key)),
    legend: legendOf(checks),
  };
}

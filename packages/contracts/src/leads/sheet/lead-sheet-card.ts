/**
 * The lead sheet's card, as the refined canvas draws it (17 Oct 2026, its Main and PhoneHalf boards): under the name, one
 * line of who and where; then the reason in plain type, one line for the checks (their dots, how many passed, the first
 * exception in amber), one line for the ways in (the address, the phone in amber where it is not confirmed, the site),
 * and the sequence box. Each line opens its tab. What failed comes first in Why too (decision 07): the exceptions, then
 * the rest folded under "N passed", and one legend for a mark seen and a mark read.
 *
 *   leadSheetSubOf          the line under the name: the kind, the street, the rating (short on a phone: "4.7 (312)")
 *   leadSheetChecksLineOf   the card's checks line, and its words
 *   leadSheetContactLineOf  the card's ways-in line
 *   leadSheetWhyOf          Why's checks: the exceptions, the passed ones, their count and the legend
 */
import type { LeadCheckKey } from "../lead-dtos";
import type { LeadPeekVM } from "../lead-peek";

/** The card's and Why's own words. */
export const LEAD_SHEET_CARD_WORDS = {
  /** Why's first head, its count at the end ("5 of 7"). */
  checksHead: "Checks",
  checks: (passed: number, of: number) => `${passed} of ${of} checks`,
  couldntTell: (n: number) => `${n} couldn't tell`,
  failed: (n: number) => `${n} failed`,
  passed: (n: number) => `${n} passed`,
  noEmail: "No email found",
  noPhone: "No phone",
  site: "site",
  linkedin: "LinkedIn",
  /** The legend under Why's checks: a mark seen, and a mark Claude read. */
  seen: "seen on the map or in the mailbox",
  read: "read by Claude from the listing and their site",
  /** What the card's two lines open, said to a screen reader and on hover. */
  openWhy: "Why it fits, every check",
  openContact: "Every way to reach them",
} as const;

const CW = LEAD_SHEET_CARD_WORDS;

/** A check that couldn't tell, said short for the card's line ("phone unconfirmed"). */
const UNSURE_WORDS: Partial<Record<LeadCheckKey, string>> = {
  phone_two_sources: "phone unconfirmed",
  mailbox: "mailbox unconfirmed",
  own_address: "address unconfirmed",
  on_maps: "listing unconfirmed",
  in_area: "area unconfirmed",
  independent: "ownership unclear",
  right_kind: "kind unclear",
};

/**
 * The line under the name: the kind, the street (else the area), and the rating with its reviews; on a phone the rating
 * short, as the canvas's PhoneHalf has it ("4.7 (312)"), so the line keeps to one.
 */
export function leadSheetSubOf(vm: Pick<LeadPeekVM, "sub" | "where" | "rated" | "company">, short = false): string {
  if (vm.company) return vm.sub;
  const [kind, ...rest] = vm.sub.split(" · ");
  const [first] = vm.where ? vm.where.line.split(",") : [];
  const street = first ? first.trim() : rest.join(" · ");
  const rated = !vm.rated
    ? null
    : short
      ? `${vm.rated.score} (${vm.rated.count})`
      : `${vm.rated.score} from ${vm.rated.reviews}`;
  return [kind, street, rated].filter(Boolean).join(" · ");
}

/** A check as Why and the card read it: its key, words, how it was known, its answer, and its source. */
export interface LeadSheetCheckVM {
  key: string;
  label: string;
  how: "seen" | "read";
  answer: "yes" | "no" | "unknown";
  source: string;
}

const checksOf = (vm: Pick<LeadPeekVM, "groups">): LeadSheetCheckVM[] =>
  vm.groups.flatMap((g) =>
    g.checks.map((c) => ({ key: c.key, label: c.label, how: g.how, answer: c.answer, source: c.source })),
  );

/** The card's checks line: a dot a check (a passed one read shaded apart), how many passed, the first exception. */
export interface LeadSheetChecksLineVM {
  dots: ("ok" | "read" | "warn" | "no")[];
  words: string;
  /** What did not pass, short and in amber: one by its own words, several by how many. Null when all passed. */
  exception: string | null;
  /** The verdict in full, for a screen reader and on hover ("5 checks passed · 2 couldn't tell"). */
  tip: string;
  /**
   * The fit's word where it is news, before the count: Worth a look, or what left it out and by which of the owner's
   * criteria ("Left out — Chain gyms"); null for a strong fit.
   */
  fit: string | null;
}

/** What did not pass, said short: one by its own words, else how many couldn't tell and how many failed. */
function exceptionOf(checks: LeadSheetCheckVM[]): string | null {
  const unsure = checks.filter((c) => c.answer === "unknown");
  const failed = checks.filter((c) => c.answer === "no");
  if (!unsure.length && !failed.length) return null;
  const [only] = unsure;
  const one = only && unsure.length === 1 && !failed.length ? UNSURE_WORDS[only.key as LeadCheckKey] : undefined;
  if (one) return one;
  return [failed.length ? CW.failed(failed.length) : null, unsure.length ? CW.couldntTell(unsure.length) : null]
    .filter(Boolean)
    .join(" · ");
}

export function leadSheetChecksLineOf(
  vm: Pick<LeadPeekVM, "groups" | "checkDots" | "checksSummary" | "fit">,
): LeadSheetChecksLineVM | null {
  if (!vm.checkDots.length) return null;
  const checks = checksOf(vm);
  const passed = vm.checkDots.filter((d) => d.answer === "yes").length;
  return {
    dots: vm.checkDots.map((d) =>
      d.answer === "yes" ? (d.how === "read" ? "read" : "ok") : d.answer === "unknown" ? "warn" : "no",
    ),
    words: CW.checks(passed, vm.checkDots.length),
    exception: exceptionOf(checks),
    tip: vm.checksSummary,
    fit: (vm.fit.cls === "look" || vm.fit.cls === "out") && vm.fit.word ? vm.fit.word : null,
  };
}

/** One way in on the card's line: its words, and amber where it is not as it should be. */
export interface LeadSheetWayVM {
  text: string;
  warn: boolean;
}

/** The card's ways-in line: the address (or that none was found), the phone, the site (a company's LinkedIn). */
export interface LeadSheetContactLineVM {
  email: LeadSheetWayVM;
  phone: LeadSheetWayVM | null;
  site: string | null;
}

export function leadSheetContactLineOf(
  vm: Pick<LeadPeekVM, "reach" | "slots" | "links" | "company">,
): LeadSheetContactLineVM {
  const address = vm.reach.email.address;
  const site = vm.company && vm.links.linkedin ? CW.linkedin : vm.links.website ? CW.site : null;
  return {
    email: address ? { text: address, warn: vm.slots.mailbox.state !== "ok" } : { text: CW.noEmail, warn: true },
    phone: vm.reach.phone ? { text: vm.reach.phone.value, warn: vm.slots.phone.state !== "ok" } : null,
    site,
  };
}

/** Why's checks: the exceptions first, the passed ones folded, their count, and the legend where a check was read. */
export interface LeadSheetWhyVM {
  /** "5 of 7", the end of Why's Checks head. */
  count: string;
  exceptions: LeadSheetCheckVM[];
  passed: LeadSheetCheckVM[];
  /** "5 passed", the fold's words. */
  fold: string;
  /** Whether a passed check was read rather than seen: the legend says the two marks apart. */
  legend: boolean;
}

export function leadSheetWhyOf(vm: Pick<LeadPeekVM, "groups">): LeadSheetWhyVM | null {
  const checks = checksOf(vm);
  if (!checks.length) return null;
  const passed = checks.filter((c) => c.answer === "yes");
  return {
    count: `${passed.length} of ${checks.length}`,
    exceptions: checks.filter((c) => c.answer !== "yes"),
    passed,
    fold: CW.passed(passed.length),
    legend: checks.some((c) => c.how === "read"),
  };
}

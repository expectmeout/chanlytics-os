/**
 * The lead sheet's card, as the refined canvas draws it (17 Oct 2026, its Main and PhoneHalf boards): under the name, one
 * line of who and where; then the reason in plain type, one line for the checks (their dots, how many passed, the first
 * exception in amber), one line for the ways in (the address, the phone in amber where it is not confirmed, the site),
 * and the sequence box. Each line opens its tab. What failed comes first in Why too (decision 07): the exceptions, then
 * the rest folded under "N passed", and one legend for a mark seen and a mark read.
 *
 *   leadSheetSubOf          the line under the name: the kind, the street, the rating ("4.7 (312)"), on one line
 *   leadSheetChecksLineOf   the card's checks line, its words, and what a screen reader hears of it
 *   leadSheetContactLineOf  the card's ways-in line, and what a screen reader hears of it
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
  opens: (tab: string) => `Opens ${tab}.`,
  notConfirmed: "not confirmed",
  email: "Email",
  phone: "Phone",
  theirSite: "their site",
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
 * The line under the name: the kind, the street (else the area), and the rating with how many rated it, short as the
 * canvas's PhoneHalf has it ("4.7 (312)"), so the line keeps to one on a desk's panel and a phone alike.
 */
export function leadSheetSubOf(vm: Pick<LeadPeekVM, "sub" | "where" | "rated" | "company">): string {
  if (vm.company) return vm.sub;
  const [kind, ...rest] = vm.sub.split(" · ");
  const [first] = vm.where ? vm.where.line.split(",") : [];
  const street = first ? first.trim() : rest.join(" · ");
  const rated = vm.rated ? `${vm.rated.score} (${vm.rated.count})` : null;
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

/** The checks the ways-in line says in amber already: the phone's two sources, and the mailbox. */
const REACH_CHECKS: ReadonlySet<string> = new Set<LeadCheckKey>(["phone_two_sources", "mailbox"]);

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

/** The checks line as a screen reader hears it: its words in order, then the tab it opens. */
export const leadSheetChecksSaid = (line: LeadSheetChecksLineVM): string =>
  `${[line.fit, line.words, line.exception].filter(Boolean).join(", ")}. ${CW.opens("Why")}`;

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

/** The ways-in line as a screen reader hears it: each way apart, what is not confirmed said, then the tab it opens. */
export function leadSheetContactSaid(line: LeadSheetContactLineVM): string {
  const way = (what: string, w: LeadSheetWayVM) => `${what} ${w.text}${w.warn ? `, ${CW.notConfirmed}` : ""}`;
  const email = line.email.text === CW.noEmail ? CW.noEmail : way(CW.email, line.email);
  const parts = [email, line.phone ? way(CW.phone, line.phone) : null, line.site ? CW.theirSite : null];
  return `${parts.filter(Boolean).join("; ")}. ${CW.opens("Contact")}`;
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

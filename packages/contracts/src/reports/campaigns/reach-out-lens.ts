/**
 * Reports › Campaigns › Reach-outs, in businesses (the Campaigns lens, C4): what a workspace's reach-outs wrote over the
 * period, and what came of it, said in the unit each number is of.
 *
 * The database counts two things (00404 reach_out_report) and this keeps them apart. An email is one that left: a business
 * with three is three. A business is counted once, at the last email that wrote to it, and it is the population wrote back,
 * interested, booked and said no are counts of, as they stand now: so a share of an outcome is of businesses, never of
 * emails, and no list mixes the two. Of the period before only what was written is known (emails written, delivered,
 * bounced): an outcome is state now, so it is set against nothing. A share is said only of five or more (REPORT_MIN_N) and
 * is a count under that; the strip carries the count a share is of, for the kit to grey it. A database before 00404 sends no
 * `businesses`: the part says so in words and the emails part stands.
 *
 * The day series, the mailboxes and the handed line were the first fold's (before 11 Oct 2026, reach-out-report.ts held it), and
 * are said here now. A mailbox's cells follow the same rule as the rest: a share only of five emails sent or more, the count
 * under that.
 * Pure, and only Reports' page reads it (PAGE_ONLY in tooling/scripts/gen/contracts-browser-entry.mjs).
 */
import { mailboxHoldWords } from "../../email/mailbox-standing";
import { stepLabelOf } from "../../reach-out/reach-out-sheet";
import { clockDate, clockNear } from "../../shared/clock";
import { pct, sumOf } from "../../shared/numbers";
import { isCount } from "../../shared/unknown";
import { plural } from "../../shared/words";
import type {
  ReachOutMailboxRow,
  ReachOutReportChainDto,
  ReachOutReportCounts,
  ReachOutReportMailboxDto,
  ReachOutReportDto,
  ReachOutReportStepDto,
} from "../reach-out-report";
import { mixOf, noMix, type MixEntry, type MixPartVM, type RateRowVM } from "../report-mix";
import {
  REPORT_MIN_N,
  compareWords,
  isThinShare,
  shareSaid,
  shareWasWords,
  type ReportStripTile,
} from "../report-tiles";
import { dayPointOf, endedOn, rangeLabelOf, withinWords } from "../reports";
import { sequenceRoute } from "../../sequences/sequence-address";

/**
 * A line of the sources table: a reach-out, then each of its steps on its own line. Every cell is words, in businesses
 * where it is a share of an outcome.
 */
export interface ReachOutLensSourceLine {
  id: string;
  kind: "chain" | "step";
  name: string;
  meta: string;
  /** The chain's row on Playbooks, for a reach-out's line. */
  to: string | null;
  /** Emails written. */
  written: string;
  /** Emails landed: a share of the emails written, from five. */
  delivered: string;
  /** Businesses written to, each once at its last email. */
  businesses: string;
  /** Businesses that wrote back: a share of the businesses, from five. */
  wroteBack: string;
  interested: string;
  booked: string;
  /** Won (00426): a dash on a database before it. */
  won: string;
  saidNo: string;
  bounced: string;
  last: string;
}

export interface ReachOutLensVM {
  /** Draw the part: the workspace has a reach-out. */
  present: boolean;
  /** Nothing was written or handed in the period. */
  empty: boolean;
  days: number;
  /** As the database gave them (`businesses` absent before 00404). */
  totals: ReachOutReportCounts;
  /** [emails written, landed, bounced] */
  strip: ReportStripTile[];
  /** Written, delivered, bounced: emails. */
  emails: MixPartVM;
  /** Written to, wrote back, interested, booked, said no: businesses. */
  businesses: MixPartVM;
  /**
   * The share of the businesses whose last email had each angle that wrote back. A bar is a rate: `n` is the businesses it is of
   * and `minN` the fewest that say anything, so the page greys a bar of fewer than five (D9, as the messages' rates are).
   */
  angles: {
    rows: RateRowVM[];
    line: string | null;
    empty: string | null;
  };
  mailboxes: ReachOutMailboxRow[];
  /** A day written, with what a screen reader says of it (`writtenWords`). */
  points: Array<{ day: string; label: string; short: string; written: number; writtenWords: string }>;
  table: { columns: string[]; rows: Array<Array<string | number>> };
  /** A line a reach-out and a line a step under it, in businesses. */
  sources: ReachOutLensSourceLine[];
  /** `sources` is the line under the sources table: each business counts once, and what came of it is as it stands now. */
  lines: { written: string; mailboxes: string; empty: string; sources: string };
}

type AngleRow = ReachOutLensVM["angles"]["rows"][number];

/** When the period was, in the three ways a sentence says it. */
interface WhenWords {
  /** The day the report ended, where that was before today (endedOn). */
  until: string | null;
  /** "in these 30 days", or "today" / "on Sep 20" for a period of one day. */
  within: string;
  /** "in these days", or the one day's own words. */
  these: string;
}

const NO_BUSINESSES = "This database does not count businesses yet.";
const MAILBOXES_LINE = "Where it left from, and how it landed. Past 3% bounced, a mailbox holds itself.";
/** Who answered, was interested, booked or said no is state now; the cards that show it by angle and by step say so. */
const STANDS_NOW = "as they stand now";
const SOURCES_LINE =
  "A business counts once, at the last email that wrote to it. What came of each is as it stands now.";
const DASH = "—";
const NO_EMAILS: ReachOutReportCounts = {
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0,
};

const pctText = (n: number, d: number): string => {
  const share = pct(n, d);
  return share === null ? DASH : `${share}%`;
};
/** A rate to a tenth, where two in a hundred is the line a domain holds at: 2.4 (null of none, as pct is). */
const tenthOf = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/**
 * The businesses a record counts, where it is a count: absent, `null` and anything else that is no count are all "not
 * counted" (a database before 00404 sends none), never a number to print or to divide by.
 */
const countedBusinesses = (c: { businesses?: unknown }): number | undefined =>
  isCount(c.businesses) ? c.businesses : undefined;

/**
 * The answer as the part reads it, each list and count present: an answer missing one (a server before 00241 answers the
 * route with nothing of it) is a workspace with nothing to draw, never a part that throws.
 */
function wholeOf(raw: Partial<ReachOutReportDto>): ReachOutReportDto {
  const { businesses, ...counts }: Partial<ReachOutReportCounts> = raw.totals ?? {};
  return {
    timezone: raw.timezone || "UTC",
    days: raw.days ?? 30,
    today: raw.today ?? "",
    end: raw.end ?? raw.today ?? "",
    since: raw.since ?? "",
    has_reach_out: raw.has_reach_out === true,
    totals: { ...NO_EMAILS, ...counts, ...(isCount(businesses) ? { businesses } : {}) },
    ...(raw.before ? { before: raw.before } : {}),
    series: raw.series ?? [],
    chains: raw.chains ?? [],
    angles: raw.angles ?? [],
    other_angles: raw.other_angles ?? { written: 0, wrote_back: 0 },
    no_angle: raw.no_angle ?? 0,
    mailboxes: raw.mailboxes ?? [],
  };
}

/** A period of one day is its day, as withinWords says it; any other is "these days". */
function whenOf(dto: ReachOutReportDto): WhenWords {
  const until = endedOn(dto);
  const oneDay = dto.days === 1 ? withinWords(1, until) : null;
  return { until, within: oneDay ?? `in these ${plural(dto.days, "day")}`, these: oneDay ?? "in these days" };
}

/* ------------------------------------------------------------------------------------------------ the strip */

/** The first figure's line under it: the businesses the emails went to, or (before 00404) the emails alone. */
function writtenMeta(counts: ReachOutReportCounts): string {
  const { written } = counts;
  const businesses = countedBusinesses(counts);
  if (businesses !== undefined) return `${plural(businesses, "business", "businesses")} written to`;
  return written === 0 ? "none in this period" : plural(written, "email");
}

/**
 * Emails written, landed and bounced, each against the period before in counts (the share of the landed against its own,
 * from five, else its count: shareWasWords). The period before is set beside this one only where it wrote: a workspace too
 * young to compare says nothing.
 */
function stripFigures(dto: ReachOutReportDto): ReportStripTile[] {
  const { written, delivered, bounced } = dto.totals;
  const range = rangeLabelOf(dto.days);
  const prior = dto.before !== undefined && dto.before.written > 0 ? dto.before : null;
  const emails = plural(written, "email");
  return [
    {
      id: "emails-written",
      metric: "emails_written",
      label: "Emails written",
      value: String(written),
      meta: writtenMeta(dto.totals),
      compare: prior && compareWords(written, prior.written, range, true),
    },
    {
      id: "emails-landed",
      metric: "emails_landed",
      label: "Landed",
      value: pctText(delivered, written),
      meta: written > 0 ? `${delivered} of ${emails} delivered` : "nothing written",
      compare: prior && shareWasWords(written, { part: prior.delivered, of: prior.written }, range),
      // A share of the emails written: of fewer than five, it says nothing (the kit greys it).
      n: written,
      minN: REPORT_MIN_N,
    },
    {
      id: "emails-bounced",
      metric: "emails_bounced",
      label: "Bounced",
      value: String(bounced),
      meta: bounced > 0 ? `${bounced} of ${emails} bounced` : "none bounced",
      compare: prior && compareWords(bounced, prior.bounced, range, true),
    },
  ];
}

/* ------------------------------------------------------------------------------------------------ the mixes */

/** The emails, as they left, landed and bounced: a share of the emails written, from five. */
function emailsPart(dto: ReachOutReportDto, when: WhenWords): MixPartVM {
  const { written, delivered, bounced } = dto.totals;
  if (written === 0) return noMix(`Nothing was written ${when.these}.`);
  const entries: MixEntry[] = [
    ["written", "Written", written],
    ["delivered", "Delivered", delivered],
    ["bounced", "Bounced", bounced],
  ];
  const shares =
    written >= REPORT_MIN_N ? `: ${pct(delivered, written)}% were delivered and ${pct(bounced, written)}% bounced` : "";
  return mixOf(
    entries,
    `Of ${plural(written, "email")} written ${when.within}${shares}. No opens: only what came back.`,
  );
}

/** The businesses written to and what came of each: a share of the businesses, from five. */
function businessesPart(dto: ReachOutReportDto, when: WhenWords): MixPartVM {
  const { wrote_back, interested, booked, won, said_no } = dto.totals;
  const businesses = countedBusinesses(dto.totals);
  if (businesses === undefined) return noMix(NO_BUSINESSES);
  if (businesses === 0) return noMix(`No business was written to ${when.these}.`);
  const entries: MixEntry[] = [
    ["written_to", "Written to", businesses],
    ["wrote_back", "Wrote back", wrote_back],
    ["interested", "Interested", interested],
    ["booked", "Booked", booked],
    // Won (00426): a deal naming the business, won; not said where the database does not count it.
    ...(isCount(won) ? ([["won", "Won", won]] as MixEntry[]) : []),
    ["said_no", "Said no", said_no],
  ];
  const shares =
    businesses >= REPORT_MIN_N
      ? `: ${pct(wrote_back, businesses)}% wrote back and ${pct(interested, businesses)}% were interested`
      : "";
  const line = `Of ${plural(businesses, "business", "businesses")} written to ${when.within}${shares}. Each counts once, at the last email that wrote to it; a question counts as interested. Who wrote back, was interested, booked${isCount(won) ? ", won" : ""} or said no is as it stands now.`;
  return mixOf(entries, line);
}

/** One angle's bar: the share of the businesses whose last email had it that wrote back, said as a share from five. */
function angleRow(id: string, label: string, businesses: number, wroteBack: number): AngleRow {
  const of = `${wroteBack} of ${businesses}`;
  const display =
    businesses === 0 ? DASH : businesses >= REPORT_MIN_N ? `${of}  ${pctText(wroteBack, businesses)}` : of;
  return { id, label, value: pct(wroteBack, businesses) ?? 0, display, n: businesses, minN: REPORT_MIN_N };
}

/** Replies by angle: the eight most written, then the rest as one, of the businesses each angle was the last email to. */
function anglesPart(dto: ReachOutReportDto, when: WhenWords): ReachOutLensVM["angles"] {
  const other = dto.other_angles;
  const listed = dto.angles.map((a) => ({
    id: a.angle,
    label: a.angle,
    businesses: countedBusinesses(a),
    wroteBack: a.wrote_back,
  }));
  if (other.written > 0)
    listed.push({
      id: "other",
      label: "Other angles",
      businesses: countedBusinesses(other),
      wroteBack: other.wrote_back,
    });
  if (listed.length === 0)
    return {
      rows: [],
      line: null,
      empty: `No email ${when.these} had an opening, so there is no angle to compare.`,
    };
  // A database before 00404 sends angles without their businesses: a share of the emails would be a share of another unit.
  if (listed.some((a) => a.businesses === undefined)) return { rows: [], line: null, empty: NO_BUSINESSES };
  const unangled = dto.no_angle ? ` ${plural(dto.no_angle, "email")} had no opening, so no angle.` : "";
  return {
    rows: listed.map((a) => angleRow(a.id, a.label, a.businesses ?? 0, a.wroteBack)),
    line: `The opening written for each business, and who answered, ${STANDS_NOW}.${unangled}`,
    empty: null,
  };
}

/* ------------------------------------------------------------------------------------------------ the sources */

/**
 * The businesses that wrote back as a line says them: a share of the businesses with the count beside it from five, the count
 * it is of under that ("1 of 3", as shareSaid says it), and the count alone where the businesses are not counted (a database
 * before 00404) or there are none to take a share of.
 */
function answeredCell(wroteBack: number, businesses: number | undefined): string {
  if (businesses === undefined || businesses === 0) return String(wroteBack);
  const said = shareSaid(pct(wroteBack, businesses), wroteBack, businesses) ?? String(wroteBack);
  return isThinShare(businesses, REPORT_MIN_N) ? said : `${said} (${wroteBack})`;
}

/** The cells a line says: what a chain's steps sum to, or one step's own. */
function cellsOf(c: ReachOutReportCounts, businesses: number | undefined) {
  // A share of the emails written, from five (shareSaid: the count it is of under that, a dash of none); of the businesses likewise.
  const landed = shareSaid(pct(c.delivered, c.written), c.delivered, c.written) ?? DASH;
  const answered = answeredCell(c.wrote_back, businesses);
  return {
    written: String(c.written),
    delivered: landed,
    businesses: businesses === undefined ? DASH : String(businesses),
    wroteBack: answered,
    interested: String(c.interested),
    booked: String(c.booked),
    won: isCount(c.won) ? String(c.won) : DASH,
    saidNo: String(c.said_no),
    bounced: String(c.bounced),
  };
}

const HAND_CELLS = {
  written: DASH,
  delivered: DASH,
  businesses: DASH,
  wroteBack: DASH,
  interested: DASH,
  booked: DASH,
  won: DASH,
  saidNo: DASH,
  bounced: DASH,
};

/** A chain's steps summed, count by count. */
function summed(steps: ReachOutReportStepDto[]): ReachOutReportCounts {
  const total = { ...NO_EMAILS };
  for (const s of steps) {
    total.written += s.written;
    total.delivered += s.delivered;
    total.bounced += s.bounced;
    total.wrote_back += s.wrote_back;
    total.interested += s.interested;
    total.booked += s.booked;
    total.said_no += s.said_no;
    total.handed += s.handed;
  }
  // Won is summed only where every step counted it (a database before 00426 counts none: a dash, not a zero).
  return steps.every((s) => isCount(s.won)) ? { ...total, won: sumOf(steps.map((s) => s.won ?? 0)) } : total;
}

/**
 * A chain's businesses: its steps' summed (each business is counted at one step only, its last), said only where every
 * step that writes carries it. A hand step writes to no business, so it adds none and needs none.
 */
function chainBusinesses(steps: ReachOutReportStepDto[]): number | undefined {
  if (!steps.every((s) => s.hand !== null || countedBusinesses(s) !== undefined)) return undefined;
  return sumOf(steps.map((s) => countedBusinesses(s) ?? 0));
}

function chainSourceLine(c: ReachOutReportChainDto, nowMs: number, tz: string): ReachOutLensSourceLine {
  const last = c.last_at ? Date.parse(c.last_at) : NaN;
  const meta = [
    "To leads",
    plural(c.steps.length, "step"),
    plural(c.runs, "run"),
    c.search ? c.search.name : null,
    c.state === "running" ? null : "paused",
  ];
  return {
    id: c.root_id,
    kind: "chain",
    name: c.name,
    meta: meta.filter(Boolean).join(" · "),
    to: sequenceRoute(c.root_id),
    ...cellsOf(summed(c.steps), chainBusinesses(c.steps)),
    last: Number.isFinite(last) ? clockDate(last, tz, nowMs) : "",
  };
}

function stepSourceLine(root: string, s: ReachOutReportStepDto): ReachOutLensSourceLine {
  const line = {
    id: `${root}:${s.id}`,
    kind: "step",
    name: `${s.n + 1} · ${stepLabelOf({ n: s.n, hand: s.hand ? { kind: s.hand } : null })}`,
    to: null,
    last: "",
  } as const;
  if (s.hand) return { ...line, meta: `${s.handed} handed to you`, ...HAND_CELLS };
  return { ...line, meta: "", ...cellsOf(s, countedBusinesses(s)) };
}

function sourceLines(dto: ReachOutReportDto, nowMs: number): ReachOutLensSourceLine[] {
  return dto.chains.flatMap((c) => [
    chainSourceLine(c, nowMs, dto.timezone),
    ...c.steps.map((s) => stepSourceLine(c.root_id, s)),
  ]);
}

/* ---------------------------------------------------------------------------------------- mailboxes and lines */

/**
 * A mailbox's state as the card says it: connected, held since a day and why, or not sending; the emails their owner sent
 * from their own inbox (00429) are theirs.
 */
function mailboxStateWords(d: ReachOutReportMailboxDto, nowMs: number, tz: string): string {
  if (d.yours) return "You send these";
  if (d.address === null || d.state === "removed") return "Since removed";
  if (d.state === "connected") return "Connected";
  if (d.state === "held") {
    const held = d.held_at ? Date.parse(d.held_at) : NaN;
    const since = Number.isFinite(held) ? ` since ${clockNear(held, tz, nowMs)}` : "";
    return `Held${since}: ${mailboxHoldWords(d.held_why)}`;
  }
  if (d.state === "reconnect") return "Signed out: reconnect it";
  return "Paused";
}

/**
 * A mailbox's cell, as shareSaid says a share: of what it sent from five (REPORT_MIN_N) the share, the count it is of under that
 * ("2 of 3"), a dash where it sent none (D9: a share of fewer than five is never said). The limit its state words name is not a share.
 */
function mailboxCell(n: number, sent: number, share: (n: number, of: number) => number | null): string {
  return shareSaid(share(n, sent), n, sent) ?? DASH;
}

function mailboxRows(dto: ReachOutReportDto, nowMs: number): ReachOutMailboxRow[] {
  return dto.mailboxes.map((d) =>
    d.yours
      ? // Sent from their own inbox (00429): a bounce or a complaint reaches them, never us, so no share is said.
        {
          id: "your-inbox",
          address: "Your own inbox",
          state: mailboxStateWords(d, nowMs, dto.timezone),
          held: false,
          sent: d.sent,
          landed: DASH,
          bounced: DASH,
          complained: DASH,
        }
      : {
          id: d.address ?? "removed",
          address: d.address ?? "A mailbox since removed",
          state: mailboxStateWords(d, nowMs, dto.timezone),
          held: d.state === "held",
          sent: d.sent,
          landed: mailboxCell(d.delivered, d.sent, pct),
          bounced: mailboxCell(d.bounced, d.sent, tenthOf),
          complained: mailboxCell(d.complained, d.sent, tenthOf),
        },
  );
}

function periodLines(dto: ReachOutReportDto, when: WhenWords): ReachOutLensVM["lines"] {
  const handed = dto.totals.handed;
  return {
    written: handed ? `${plural(handed, "business", "businesses")} handed to you as a call or a note, too.` : "",
    mailboxes: MAILBOXES_LINE,
    empty: `No sequence to leads wrote ${withinWords(dto.days, when.until)}.`,
    sources: SOURCES_LINE,
  };
}

/** The Reach-outs part's own words, from the report the route answers (and the period before it, where there is one). */
export function toReachOutLensVM(raw: ReachOutReportDto, nowMs: number = Date.now()): ReachOutLensVM {
  const dto = wholeOf(raw);
  const when = whenOf(dto);
  const points = dto.series.map((d) => {
    const point = dayPointOf(d.day);
    return { ...point, written: d.written, writtenWords: `${point.label}: ${d.written} written` };
  });
  return {
    present: dto.has_reach_out,
    empty: dto.totals.written === 0 && dto.totals.handed === 0,
    days: dto.days,
    totals: dto.totals,
    strip: stripFigures(dto),
    emails: emailsPart(dto, when),
    businesses: businessesPart(dto, when),
    angles: anglesPart(dto, when),
    mailboxes: mailboxRows(dto, nowMs),
    points,
    table: { columns: ["Day", "Written"], rows: points.map((p) => [p.label, p.written]) },
    sources: sourceLines(dto, nowMs),
    lines: periodLines(dto, when),
  };
}

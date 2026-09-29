/**
 * Reports › Reach-outs (Reach out, Part 6: H1, H3–H6), and the day's numbers at 6 PM (H12): what a workspace's
 * reach-outs wrote over the period, and what came of it. Every number is a count the database holds (00241
 * reach_out_report, reach_out_day_due): written is an email that left; wrote back, interested, booked and said no count
 * each lead once, at the last email of the period that wrote to it; no opens and no clicks anywhere (decision 8).
 */
import { clockDate, clockNear } from "../shared/clock";
import { plural } from "../shared/words";
import { domainHoldWords } from "../email/sending-domains";
import { pct, stepLabelOf } from "../reach-out/reach-out-sheet";
import type { HandKind } from "../reach-out/reach-out-hand";
import { dayDate, fmtDay } from "./reports";

export interface ReachOutReportCounts {
  written: number;
  delivered: number;
  bounced: number;
  wrote_back: number;
  interested: number;
  booked: number;
  said_no: number;
  handed: number;
}

export interface ReachOutReportStepDto extends ReachOutReportCounts {
  id: string;
  n: number;
  hand: HandKind | null;
}

export interface ReachOutReportChainDto {
  root_id: string;
  name: string;
  state: string;
  search: { id: string; name: string } | null;
  last_at: string | null;
  runs: number;
  steps: ReachOutReportStepDto[];
}

export interface ReachOutReportDomainDto {
  /** Null for the emails of a domain since removed. */
  host: string | null;
  state: string | null;
  held_why: string | null;
  held_at: string | null;
  sent: number;
  delivered: number;
  /** Permanent bounces, the domain's own rule (00220 sending_domain_counts). */
  bounced: number;
  complained: number;
}

/** What `reach_out_report(tenant, days)` answers (00241). */
export interface ReachOutReportDto {
  timezone: string;
  days: number;
  today: string;
  since: string;
  /** The workspace has a reach-out at all: the section is drawn only then. */
  has_reach_out: boolean;
  totals: ReachOutReportCounts;
  series: Array<{ day: string; written: number }>;
  chains: ReachOutReportChainDto[];
  angles: Array<{ angle: string; written: number; wrote_back: number }>;
  other_angles: { written: number; wrote_back: number };
  no_angle: number;
  domains: ReachOutReportDomainDto[];
}

export interface ReachOutFunnelRow {
  id: string;
  label: string;
  value: number;
  display: string;
  color: string;
}

export interface ReachOutAngleRow {
  id: string;
  label: string;
  /** The share who wrote back, 0 to 100: what the bar measures. */
  value: number;
  display: string;
}

export interface ReachOutDomainRow {
  id: string;
  host: string;
  state: string;
  held: boolean;
  sent: number;
  landed: string;
  bounced: string;
  complained: string;
}

/** A line of the sources table: a reach-out, then each of its steps on its own line. */
export interface ReachOutSourceRow {
  id: string;
  kind: "chain" | "step";
  name: string;
  meta: string;
  /** The chain's row on Playbooks, for a reach-out's line. */
  to: string | null;
  written: string;
  delivered: string;
  wroteBack: string;
  interested: string;
  booked: string;
  saidNo: string;
  last: string;
}

export interface ReachOutReportVM {
  /** Draw the section: the workspace has a reach-out. */
  present: boolean;
  /** Nothing was written or handed in the period. */
  empty: boolean;
  days: number;
  totals: ReachOutReportCounts;
  funnel: { max: number; rows: ReachOutFunnelRow[] };
  angles: { rows: ReachOutAngleRow[]; max: number };
  domains: ReachOutDomainRow[];
  points: Array<{ day: string; label: string; short: string; written: number }>;
  table: { columns: string[]; rows: Array<Array<string | number>> };
  sources: ReachOutSourceRow[];
  lines: { funnel: string; angles: string; domains: string; written: string; empty: string };
}

const pctText = (n: number, d: number): string => (d ? `${pct(n, d)}%` : "—");
/** A rate to a tenth, where two in a hundred is the line a domain holds at: "2.4%". */
const rateText = (n: number, d: number): string => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

/** The funnel, from written to booked, then the two that end a chain (canvas board 13). */
function funnelOf(t: ReachOutReportCounts): ReachOutReportVM["funnel"] {
  const row = (id: string, label: string, value: number, color: string): ReachOutFunnelRow => ({
    id,
    label,
    value,
    display: id === "written" ? String(value) : `${value}  ${pctText(value, t.written)}`,
    color,
  });
  return {
    max: Math.max(1, t.written),
    rows: [
      row("written", "Written", t.written, "var(--chart-ramp-5)"),
      row("delivered", "Delivered", t.delivered, "var(--chart-ramp-4)"),
      row("wrote_back", "Wrote back", t.wrote_back, "var(--chart-ramp-3)"),
      row("interested", "Interested", t.interested, "var(--chart-ramp-3)"),
      row("booked", "Booked", t.booked, "var(--chart-ramp-3)"),
      row("said_no", "Said no", t.said_no, "var(--line-strong)"),
      row("bounced", "Bounced", t.bounced, "var(--line-strong)"),
    ],
  };
}

/** Replies by angle (H4): the share who wrote back, the eight most written, then the rest as one. */
function anglesOf(dto: ReachOutReportDto): ReachOutReportVM["angles"] {
  const rows: ReachOutAngleRow[] = dto.angles.map((a) => ({
    id: a.angle,
    label: a.angle,
    value: pct(a.wrote_back, a.written),
    display: `${a.wrote_back} of ${a.written}  ${pctText(a.wrote_back, a.written)}`,
  }));
  const o = dto.other_angles;
  if (o.written > 0)
    rows.push({
      id: "other",
      label: "Other angles",
      value: pct(o.wrote_back, o.written),
      display: `${o.wrote_back} of ${o.written}  ${pctText(o.wrote_back, o.written)}`,
    });
  return { rows, max: Math.max(1, ...rows.map((r) => r.value)) };
}

/** A domain's state as the card says it (H5): verified, held since a day and why, or not sending yet. */
function domainStateWords(d: ReachOutReportDomainDto, nowMs: number, tz: string): string {
  if (d.host === null) return "Since removed";
  if (d.state === "verified") return "Verified";
  if (d.state === "held") {
    const held = d.held_at ? Date.parse(d.held_at) : NaN;
    const since = Number.isFinite(held) ? ` since ${clockNear(held, tz, nowMs)}` : "";
    return `Held${since}: ${domainHoldWords(d.held_why)}`;
  }
  return "Not sending yet";
}

function domainsOf(dto: ReachOutReportDto, nowMs: number): ReachOutDomainRow[] {
  return dto.domains.map((d) => ({
    id: d.host ?? "removed",
    host: d.host ?? "A domain since removed",
    state: domainStateWords(d, nowMs, dto.timezone),
    held: d.state === "held",
    sent: d.sent,
    landed: pctText(d.delivered, d.sent),
    bounced: rateText(d.bounced, d.sent),
    complained: rateText(d.complained, d.sent),
  }));
}

/** A count and its share of what was written: "12% (3)". */
const shareOf = (n: number, of: number): string => (of ? `${pct(n, of)}% (${n})` : String(n));

function chainRowOf(c: ReachOutReportChainDto, nowMs: number, tz: string): ReachOutSourceRow {
  const sum = (k: keyof ReachOutReportCounts) => c.steps.reduce((t, s) => t + (s[k] ?? 0), 0);
  const written = sum("written");
  const last = c.last_at ? Date.parse(c.last_at) : NaN;
  return {
    id: c.root_id,
    kind: "chain",
    name: c.name,
    meta: [
      "Reach-out",
      plural(c.steps.length, "step"),
      plural(c.runs, "run"),
      c.search ? c.search.name : null,
      c.state === "running" ? null : "paused",
    ]
      .filter(Boolean)
      .join(" · "),
    to: `outbound/${c.root_id}`,
    written: String(written),
    delivered: pctText(sum("delivered"), written),
    wroteBack: shareOf(sum("wrote_back"), written),
    interested: String(sum("interested")),
    booked: String(sum("booked")),
    saidNo: String(sum("said_no")),
    last: Number.isFinite(last) ? clockDate(last, tz, nowMs) : "",
  };
}

function stepRowOf(root: string, s: ReachOutReportStepDto): ReachOutSourceRow {
  const name = `${s.n + 1} · ${stepLabelOf({ n: s.n, hand: s.hand ? { kind: s.hand } : null })}`;
  if (s.hand)
    return {
      id: `${root}:${s.id}`,
      kind: "step",
      name,
      meta: `${s.handed} handed to you`,
      to: null,
      written: "—",
      delivered: "—",
      wroteBack: "—",
      interested: "—",
      booked: "—",
      saidNo: "—",
      last: "",
    };
  return {
    id: `${root}:${s.id}`,
    kind: "step",
    name,
    meta: "",
    to: null,
    written: String(s.written),
    delivered: pctText(s.delivered, s.written),
    wroteBack: shareOf(s.wrote_back, s.written),
    interested: String(s.interested),
    booked: String(s.booked),
    saidNo: String(s.said_no),
    last: "",
  };
}

function linesOf(dto: ReachOutReportDto): ReachOutReportVM["lines"] {
  const t = dto.totals;
  const angled = dto.angles.reduce((n, a) => n + a.written, 0) + dto.other_angles.written;
  return {
    funnel: t.written
      ? `Of ${plural(t.written, "email")} written in these ${dto.days} days. Each business counts once, at the last email that wrote to it; a question counts as interested. No opens: only what came back.`
      : "Nothing was written in these days.",
    angles: angled
      ? `The opening written for each business, and who answered.${dto.no_angle ? ` ${plural(dto.no_angle, "email")} had no opening, so no angle.` : ""}`
      : "No email in these days had an opening, so there is no angle to compare.",
    domains: "Where it left from, and how it landed. Past 2% bounced, a domain holds itself.",
    written: t.handed ? `${plural(t.handed, "business", "businesses")} handed to you as a call or a note, too.` : "",
    empty: `No reach-out wrote in the last ${dto.days} days.`,
  };
}

const NO_COUNTS: ReachOutReportCounts = {
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0,
};

/**
 * The answer as the page reads it, each list and count present: an answer missing one (a server before 00241 answers
 * the route with nothing of it) is a workspace with nothing to draw, never a page that throws.
 */
function wholeOf(raw: Partial<ReachOutReportDto>): ReachOutReportDto {
  return {
    timezone: raw.timezone || "UTC",
    days: raw.days ?? 30,
    today: raw.today ?? "",
    since: raw.since ?? "",
    has_reach_out: raw.has_reach_out === true,
    totals: { ...NO_COUNTS, ...(raw.totals ?? {}) },
    series: raw.series ?? [],
    chains: raw.chains ?? [],
    angles: raw.angles ?? [],
    other_angles: raw.other_angles ?? { written: 0, wrote_back: 0 },
    no_angle: raw.no_angle ?? 0,
    domains: raw.domains ?? [],
  };
}

export function toReachOutReportVM(raw: ReachOutReportDto, nowMs: number = Date.now()): ReachOutReportVM {
  const dto = wholeOf(raw);
  const points = dto.series.map((d) => ({
    day: d.day,
    label: fmtDay(d.day),
    short: String(dayDate(d.day).getDate()),
    written: d.written,
  }));
  const sources: ReachOutSourceRow[] = [];
  for (const c of dto.chains) {
    sources.push(chainRowOf(c, nowMs, dto.timezone));
    for (const s of c.steps) sources.push(stepRowOf(c.root_id, s));
  }
  return {
    present: dto.has_reach_out,
    empty: dto.totals.written === 0 && dto.totals.handed === 0,
    days: dto.days,
    totals: dto.totals,
    funnel: funnelOf(dto.totals),
    angles: anglesOf(dto),
    domains: domainsOf(dto, nowMs),
    points,
    table: { columns: ["Day", "Written"], rows: points.map((p) => [p.label, p.written]) },
    sources,
    lines: linesOf(dto),
  };
}

/** The day's numbers (00241 reach_out_day_due). */
export interface ReachOutDayNumbers {
  written: number;
  wrote_back: number;
  interested: number;
  said_no: number;
  bounced: number;
  held: number;
}

/**
 * The bell's line at 6 PM (H12): "Today's reach-outs" over what they wrote, who wrote back and what waits, each clause
 * only when it is not zero.
 */
export function reachOutDayWords(n: ReachOutDayNumbers): { title: string; body: string } {
  const clauses: string[] = [];
  if (n.written) clauses.push(`${n.written} written`);
  if (n.wrote_back) clauses.push(`${n.wrote_back} wrote back${n.interested ? `, ${n.interested} interested` : ""}`);
  if (n.said_no) clauses.push(`${n.said_no} said no`);
  if (n.bounced) clauses.push(`${n.bounced} bounced`);
  if (n.held) clauses.push(`${n.held} wait${n.held === 1 ? "s" : ""} for your say`);
  return { title: "Today's reach-outs", body: clauses.length ? `${clauses.join(" · ")}.` : "Nothing happened today." };
}

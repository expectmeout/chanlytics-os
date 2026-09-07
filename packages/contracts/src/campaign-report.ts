/**
 * Reports › Campaigns — what the offers earned, as facts.
 *
 * Messages sent by broadcasts and playbook runs, WhatsApp's own delivered
 * and read receipts, who wrote back afterwards, and the people who said
 * yes or asked to stop — over the period and the one before it, and the
 * current period by source. Every number is a count over columns; the
 * shares are counts over counts; nothing is scored or estimated. Colors are
 * the page's.
 */
import { REPORT_RANGES, dayDate, deltaOf, fmtDay, pointsDelta, type ReportTileVM } from "./reports";
import { templateTitle } from "./template-library";

export interface CampaignDayDto {
  day: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  opt_ins: number;
  opt_outs: number;
}

export interface CampaignSourceDto {
  id: string;
  kind: "playbook" | "broadcast";
  name: string;
  template_name: string | null;
  runs: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  last_at: string | null;
}

/** What `campaign_series(tenant, days)` returns. `series` spans TWO periods, newest last; `sources` is the current one. */
export interface CampaignReportDto {
  timezone: string;
  days: number;
  span_days: number;
  today: string;
  series: CampaignDayDto[];
  sources: CampaignSourceDto[];
  error?: string;
}

export interface CampaignPointVM {
  day: string;
  label: string;
  short: string;
  sent: number;
  delivered: number;
  replied: number;
  optIns: number;
  optOuts: number;
}

export interface CampaignSourceVM {
  id: string;
  kind: "playbook" | "broadcast";
  kindLabel: string;
  name: string;
  templateName: string | null;
  /** The template's words for people; the page may swap in the workspace's own title. */
  template: string;
  runs: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  deliveredPct: number | null;
  readPct: number | null;
  repliedPct: number | null;
  lastLabel: string;
  /** 0..1 of the source that sent the most. */
  share: number;
}

export interface CampaignTotals {
  sent: number;
  delivered: number;
  replied: number;
  sends: number;
  optIns: number;
  optOuts: number;
}

export interface CampaignReportVM {
  days: number;
  tiles: ReportTileVM[];
  points: CampaignPointVM[];
  totals: CampaignTotals;
  sources: CampaignSourceVM[];
  /** Nothing went out and nobody answered about offers: no send, no yes, no stop. */
  empty: boolean;
  max: number;
  table: { columns: string[]; rows: (string | number)[][] };
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const pct = (n: number, d: number): number | null => (d ? Math.round((n / d) * 100) : null);
const WHEN = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });

export function toCampaignReportVM(dto: CampaignReportDto): CampaignReportVM {
  const days = dto.days;
  const series = dto.series ?? [];
  const current = series.slice(-days);
  const previous = series.slice(0, Math.max(0, series.length - days));
  const points: CampaignPointVM[] = current.map((d) => ({
    day: d.day,
    label: fmtDay(d.day),
    short: String(dayDate(d.day).getDate()),
    sent: d.sent,
    delivered: d.delivered,
    replied: d.replied,
    optIns: d.opt_ins,
    optOuts: d.opt_outs,
  }));
  const tot = {
    sent: sum(current.map((d) => d.sent)),
    delivered: sum(current.map((d) => d.delivered)),
    replied: sum(current.map((d) => d.replied)),
    optIns: sum(current.map((d) => d.opt_ins)),
    optOuts: sum(current.map((d) => d.opt_outs)),
  };
  const prev = {
    sent: sum(previous.map((d) => d.sent)),
    delivered: sum(previous.map((d) => d.delivered)),
    replied: sum(previous.map((d) => d.replied)),
    optIns: sum(previous.map((d) => d.opt_ins)),
    optOuts: sum(previous.map((d) => d.opt_outs)),
  };
  const noun = `${days} days`;
  const rawSources = dto.sources ?? [];
  const sends = sum(rawSources.map((s) => s.runs));
  const maxSent = Math.max(1, ...rawSources.map((s) => s.sent));
  const sources: CampaignSourceVM[] = rawSources.map((s) => ({
    id: s.id,
    kind: s.kind,
    kindLabel: s.kind === "playbook" ? "Playbook" : "Broadcast",
    name: s.name,
    templateName: s.template_name,
    template: s.template_name ? templateTitle(s.template_name) : "",
    runs: s.runs,
    sent: s.sent,
    delivered: s.delivered,
    read: s.read,
    replied: s.replied,
    deliveredPct: pct(s.delivered, s.sent),
    readPct: pct(s.read, s.sent),
    repliedPct: pct(s.replied, s.sent),
    lastLabel: s.last_at ? WHEN.format(new Date(s.last_at)) : "",
    share: s.sent / maxSent,
  }));

  const tiles: ReportTileVM[] = [
    {
      id: "sent",
      label: "Messages sent",
      value: String(tot.sent),
      meta: tot.sent ? `over ${sends} ${sends === 1 ? "send" : "sends"}` : "none in this period",
      delta: deltaOf(tot.sent, prev.sent, true, noun),
      spark: points.map((p) => p.sent),
    },
    {
      id: "delivered",
      label: "Delivered",
      value: pct(tot.delivered, tot.sent) === null ? "—" : `${pct(tot.delivered, tot.sent)}%`,
      meta: tot.sent ? `${tot.delivered} of ${tot.sent} · WhatsApp's receipts` : "nothing sent",
      delta: pointsDelta(pct(tot.delivered, tot.sent), pct(prev.delivered, prev.sent), noun),
      spark: points.map((p) => p.delivered),
    },
    {
      id: "replied",
      label: "Replied",
      value: pct(tot.replied, tot.sent) === null ? "—" : `${pct(tot.replied, tot.sent)}%`,
      meta: tot.sent ? `${tot.replied} wrote back within 3 days` : "nothing sent",
      delta: pointsDelta(pct(tot.replied, tot.sent), pct(prev.replied, prev.sent), noun),
      spark: points.map((p) => p.replied),
    },
    {
      id: "optins",
      label: "Said yes",
      value: String(tot.optIns),
      meta: tot.optIns ? "at the desk, or in their own words" : "nobody in this period",
      delta: deltaOf(tot.optIns, prev.optIns, true, noun),
      spark: points.map((p) => p.optIns),
    },
    {
      id: "optouts",
      label: "Asked to stop",
      value: String(tot.optOuts),
      meta: tot.optOuts ? "STOP, or recorded at the desk" : "nobody in this period",
      delta: deltaOf(tot.optOuts, prev.optOuts, false, noun),
      spark: points.map((p) => p.optOuts),
    },
  ];

  return {
    days,
    tiles,
    points,
    totals: { ...tot, sends },
    sources,
    empty: tot.sent === 0 && tot.optIns === 0 && tot.optOuts === 0,
    max: Math.max(1, ...points.map((p) => p.sent)),
    table: {
      columns: ["Day", "Sent", "Delivered", "Replied", "Said yes", "Asked to stop"],
      rows: points.map((p) => [p.label, p.sent, p.delivered, p.replied, p.optIns, p.optOuts]),
    },
  };
}

export const CAMPAIGN_REPORT_RANGES = REPORT_RANGES;

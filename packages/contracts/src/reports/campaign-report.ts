/**
 * Reports › Campaigns — what the campaigns sent and what came of it, as facts.
 *
 * Messages sent by broadcasts and playbook runs, each channel's own delivered
 * receipts (and WhatsApp's read receipts), who wrote back afterwards, and the people who said
 * yes or asked to stop — over the period and the one before it, and the
 * current period by source and by the channel each went by (0030). Every number is a count over columns; the
 * shares are counts over counts; nothing is scored or estimated. A read is a share of WhatsApp's own sends alone:
 * a text or an email keeps no read receipt. Colors are the page's.
 */
import { DELIVERY_RECEIPTS_WORDS, REPLY_WINDOW_WORDS } from "../broadcasts/broadcasts";
import { REPORT_CHANNELS, dayDate, fmtDay, priorOf, type ReportChannelKey } from "./reports";
import { deltaOf, pointsDelta, type ReportTileVM } from "./report-tiles";
import { templateTitle } from "../templates/template-titles";
import { sumOf } from "../shared/numbers";
import { formatterOnUse } from "../shared/time";
import { plural } from "../shared/words";

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

/** One channel's part of the current period (`campaign_series.by_channel`, 0030): a row naming none went by WhatsApp. */
interface CampaignChannelDto {
  channel: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
}

/** What `campaign_series(tenant, days)` returns. `series` spans TWO periods, newest last; `sources` is the current one. */
export interface CampaignReportDto {
  timezone: string;
  days: number;
  span_days: number;
  today: string;
  series: CampaignDayDto[];
  sources: CampaignSourceDto[];
  /** The current period by channel, the most sent first (0030); absent from a database before it. */
  by_channel?: CampaignChannelDto[];
  error?: string;
}

/** A channel a campaign sends on, in a report's own words for it (REPORT_CHANNELS): WhatsApp, a text, an email. */
type CampaignChannelKey = Exclude<ReportChannelKey, "voice">;

/** One channel's figures in the period, as the Campaigns lens draws them (0030). */
interface CampaignChannelVM {
  channel: CampaignChannelKey;
  label: string;
  sent: number;
  delivered: number;
  deliveredPct: number | null;
  /** WhatsApp's alone, of its own sends: no other channel keeps a read receipt, so any other's is null, never a zero. */
  read: number | null;
  readPct: number | null;
  replied: number;
  repliedPct: number | null;
  /** What its bar says beside it: what it sent, and how much of it was delivered. */
  display: string;
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
  repliedPct: number | null;
  lastLabel: string;
  /** 0..1 of the source that sent the most. */
  share: number;
}

export interface CampaignTotals {
  sent: number;
  delivered: number;
  /** WhatsApp's read receipts over the period (Campaigns' home draws them in its funnel). */
  read: number;
  /**
   * The sends a read is a share of: WhatsApp's own (0030), the one channel that keeps read receipts; every send from a
   * database before the channels were counted, as it always was.
   */
  readOf: number;
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
  /** Messages sent the period before, day for day beside this one's (null where there is no such day). */
  prior: (number | null)[];
  table: { columns: string[]; rows: (string | number)[][] };
  /** The channels that sent in the period, the most first (0030): the lens draws them where more than one did. */
  channels: CampaignChannelVM[];
  /**
   * The channels' figures as a table: each one's sent, delivered, read (WhatsApp's alone) and replies. A read that is no
   * figure is null: the kit's table draws its own dash, and its CSV an empty cell.
   */
  channelTable: { columns: string[]; rows: (string | number | null)[][] };
  /**
   * The one sentence under each campaign card: who said yes or stop (the funnel), how many runs sent it (null with none),
   * and what a read is, where more than one channel sent (null otherwise).
   */
  lines: { funnel: string; sent: string | null; channels: string | null };
}

/** The channels a campaign sends on, in a report's words and order. */
const CAMPAIGN_CHANNELS = REPORT_CHANNELS.filter(
  (c): c is { key: CampaignChannelKey; label: string } => c.key !== "voice",
);

const pct = (n: number, d: number): number | null => (d ? Math.round((n / d) * 100) : null);
const WHEN = formatterOnUse([], { month: "short", day: "numeric" });

/** Each channel that sent in the period, its figures over its own sends; a read is WhatsApp's alone (0030). */
function campaignChannelsOf(rows: readonly CampaignChannelDto[] | undefined): CampaignChannelVM[] {
  return (rows ?? []).flatMap((r): CampaignChannelVM[] => {
    const known = CAMPAIGN_CHANNELS.find((c) => c.key === r.channel);
    if (!known || !(r.sent > 0)) return [];
    const whatsapp = known.key === "whatsapp";
    const deliveredPct = pct(r.delivered, r.sent);
    return [
      {
        channel: known.key,
        label: known.label,
        sent: r.sent,
        delivered: r.delivered,
        deliveredPct,
        read: whatsapp ? r.read : null,
        readPct: whatsapp ? pct(r.read, r.sent) : null,
        replied: r.replied,
        repliedPct: pct(r.replied, r.sent),
        display: `${r.sent} · ${deliveredPct === null ? "—" : `${deliveredPct}%`} delivered`,
      },
    ];
  });
}

/** What a read is, said once under the channels where more than one sent (0030); null where one did or none. */
function channelsLine(channels: readonly CampaignChannelVM[]): string | null {
  if (channels.length < 2) return null;
  const whatsapp = channels.find((c) => c.channel === "whatsapp");
  return whatsapp
    ? `Read receipts are WhatsApp's alone: ${whatsapp.read} of its ${whatsapp.sent} were read.`
    : "A text or an email keeps no read receipt.";
}

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
    sent: sumOf(current.map((d) => d.sent)),
    delivered: sumOf(current.map((d) => d.delivered)),
    read: sumOf(current.map((d) => d.read)),
    replied: sumOf(current.map((d) => d.replied)),
    optIns: sumOf(current.map((d) => d.opt_ins)),
    optOuts: sumOf(current.map((d) => d.opt_outs)),
  };
  const prev = {
    sent: sumOf(previous.map((d) => d.sent)),
    delivered: sumOf(previous.map((d) => d.delivered)),
    replied: sumOf(previous.map((d) => d.replied)),
    optIns: sumOf(previous.map((d) => d.opt_ins)),
    optOuts: sumOf(previous.map((d) => d.opt_outs)),
  };
  // By channel (0030): a read is a share of WhatsApp's own sends; before the channels were counted, of every send.
  const channels = campaignChannelsOf(dto.by_channel);
  const whatsapp = channels.find((c) => c.channel === "whatsapp");
  const read = dto.by_channel ? (whatsapp?.read ?? 0) : tot.read;
  const readOf = dto.by_channel ? (whatsapp?.sent ?? 0) : tot.sent;
  const noun = plural(days, "day");
  const rawSources = dto.sources ?? [];
  const sends = sumOf(rawSources.map((s) => s.runs));
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
    repliedPct: pct(s.replied, s.sent),
    lastLabel: s.last_at ? WHEN.format(new Date(s.last_at)) : "",
    share: s.sent / maxSent,
  }));

  const tiles: ReportTileVM[] = [
    {
      id: "sent",
      metric: "messages_sent",
      label: "Messages sent",
      value: String(tot.sent),
      meta: tot.sent ? `over ${sends} ${sends === 1 ? "send" : "sends"}` : "none in this period",
      delta: deltaOf(tot.sent, prev.sent, true, noun),
      spark: points.map((p) => p.sent),
      compare: null,
    },
    {
      id: "delivered",
      metric: "delivered_share",
      label: "Delivered",
      value: pct(tot.delivered, tot.sent) === null ? "—" : `${pct(tot.delivered, tot.sent)}%`,
      meta: tot.sent ? `${tot.delivered} of ${tot.sent} · ${DELIVERY_RECEIPTS_WORDS}` : "nothing sent",
      delta: pointsDelta(pct(tot.delivered, tot.sent), pct(prev.delivered, prev.sent), noun),
      spark: points.map((p) => p.delivered),
      compare: null,
    },
    {
      id: "replied",
      metric: "replied_share",
      label: "Replied",
      value: pct(tot.replied, tot.sent) === null ? "—" : `${pct(tot.replied, tot.sent)}%`,
      meta: tot.sent ? `${tot.replied} wrote back ${REPLY_WINDOW_WORDS}` : "nothing sent",
      delta: pointsDelta(pct(tot.replied, tot.sent), pct(prev.replied, prev.sent), noun),
      spark: points.map((p) => p.replied),
      compare: null,
    },
    {
      id: "optins",
      metric: "said_yes",
      label: "Said yes",
      value: String(tot.optIns),
      meta: tot.optIns ? "at the desk, or in their own words" : "nobody in this period",
      delta: deltaOf(tot.optIns, prev.optIns, true, noun),
      spark: points.map((p) => p.optIns),
      compare: null,
    },
    {
      id: "optouts",
      metric: "asked_to_stop",
      label: "Asked to stop",
      value: String(tot.optOuts),
      meta: tot.optOuts ? "STOP, or recorded at the desk" : "nobody in this period",
      delta: deltaOf(tot.optOuts, prev.optOuts, false, noun),
      spark: points.map((p) => p.optOuts),
      compare: null,
    },
  ];

  return {
    days,
    tiles,
    points,
    totals: { ...tot, read, readOf, sends },
    sources,
    empty: tot.sent === 0 && tot.optIns === 0 && tot.optOuts === 0,
    max: Math.max(1, ...points.map((p) => p.sent)),
    prior: priorOf(current.length, previous, (d) => d.sent),
    table: {
      columns: ["Day", "Sent", "Delivered", "Replied", "Said yes", "Asked to stop"],
      rows: points.map((p) => [p.label, p.sent, p.delivered, p.replied, p.optIns, p.optOuts]),
    },
    channels,
    channelTable: {
      columns: ["Channel", "Sent", "Delivered", "Read", "Wrote back"],
      rows: channels.map((c) => [c.label, c.sent, c.delivered, c.read, c.replied]),
    },
    lines: {
      // A yes is to being messaged, never to an offer: a visit reminder is no offer (the wiring audit's C25).
      funnel:
        tot.optIns || tot.optOuts
          ? `${tot.optIns} ${tot.optIns === 1 ? "person" : "people"} said yes to messages, ${tot.optOuts} ${tot.optOuts === 1 ? "person" : "people"} asked to stop.`
          : "Nobody said yes to messages or asked to stop.",
      sent: sends
        ? sends === 1
          ? "From one broadcast or playbook run."
          : `From ${sends} broadcast and playbook runs.`
        : null,
      channels: channelsLine(channels),
    },
  };
}

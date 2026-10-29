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
import { REPORT_CHANNELS, dayPointOf, type ReportChannelKey } from "./reports";
import { REPORT_MIN_N, shareSaid } from "./report-tiles";
import { templateTitle } from "../templates/template-titles";
import { pct, sumOf } from "../shared/numbers";
import { usableZone } from "../calendar/zone-math";
import { dateFormat } from "../shared/time";

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
  /** What its bar says beside it: what it sent, and how much of it was delivered (a share from five sends, else the count: shareSaid). */
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
  /** What a screen reader hears of the day's column: the day and what it sent. */
  sentWords: string;
  /** What the column's pointer adds under its number: the messages of the day that were answered; null where none were. */
  answeredWords: string | null;
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
  /** What the table says of its delivered share: a percentage from five sends, else the count ("3 of 4"); a dash for none (shareSaid). */
  deliveredWords: string;
  /** What it says of the messages answered: a percentage with the count from five sends, else the count ("1 of 3"); a dash for none. */
  repliedWords: string;
  lastLabel: string;
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
  points: CampaignPointVM[];
  totals: CampaignTotals;
  /** The period before's messages sent, delivered and answered, and its yeses and stops: what the lens's strip sets this period beside. */
  before: { sent: number; delivered: number; replied: number; optIns: number; optOuts: number };
  sources: CampaignSourceVM[];
  /** Nothing went out and nobody answered about offers: no send, no yes, no stop. */
  empty: boolean;
  table: { columns: string[]; rows: (string | number)[][] };
  /** The channels that sent in the period, the most first (0030): the lens draws them where more than one did. */
  channels: CampaignChannelVM[];
  /**
   * The channels' figures as a table: each one's sent, delivered, read (WhatsApp's alone) and replies. A read that is no
   * figure is null: the kit's table draws its own dash, and its CSV an empty cell.
   */
  channelTable: { columns: string[]; rows: (string | number | null)[][] };
  /**
   * The one sentence under each campaign card: how many runs sent it (null with none), and what a read is, where more than
   * one channel sent (null otherwise). The funnel's sentence and the figures are the Campaigns lens's own (campaigns/campaign-lens.ts).
   */
  lines: { sent: string | null; channels: string | null };
}

/** The channels a campaign sends on, in a report's words and order. */
const CAMPAIGN_CHANNELS = REPORT_CHANNELS.filter(
  (c): c is { key: CampaignChannelKey; label: string } => c.key !== "voice",
);

/** "Oct 12": the day a campaign last sent, by the workspace's calendar, which the report's own read names. */
const sentOn = (iso: string, tz: string): string =>
  dateFormat("en-US", { timeZone: usableZone(tz), month: "short", day: "numeric" }).format(Date.parse(iso));

/**
 * Whether the period before was lived in: it sent something, or somebody said yes or stop in it. A yes or a stop is set
 * beside the period before's only then (compareWords' `priorHadAny`), which the Campaigns lens's strip asks.
 */
export const campaignPriorHadAny = (before: CampaignReportVM["before"]): boolean =>
  before.sent + before.optIns + before.optOuts > 0;

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
        display: `${r.sent} · ${shareSaid(deliveredPct, r.delivered, r.sent) ?? "—"} delivered`,
      },
    ];
  });
}

/** What a day's column says: to a screen reader the day and its sends, to a pointer the messages of the day that were answered (a count of messages, not of people). */
function columnWords(d: CampaignDayDto): Pick<CampaignPointVM, "sentWords" | "answeredWords"> {
  return {
    sentWords: `${dayPointOf(d.day).label}: ${d.sent} sent`,
    answeredWords: d.replied > 0 ? `${d.replied} answered` : null,
  };
}

/**
 * What a source's row says of its shares (D9), each of the source's own sends: of five or more a percentage (the answered with
 * their count beside it), under that the count it is of ("3 of 4"), and a dash for a source that sent none.
 */
function sourceWords(s: CampaignSourceDto): Pick<CampaignSourceVM, "deliveredWords" | "repliedWords"> {
  const delivered = shareSaid(pct(s.delivered, s.sent), s.delivered, s.sent);
  const replied = shareSaid(pct(s.replied, s.sent), s.replied, s.sent);
  return {
    deliveredWords: delivered ?? "—",
    repliedWords: replied === null ? "—" : s.sent >= REPORT_MIN_N ? `${replied} (${s.replied})` : replied,
  };
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
    ...dayPointOf(d.day),
    sent: d.sent,
    delivered: d.delivered,
    replied: d.replied,
    optIns: d.opt_ins,
    optOuts: d.opt_outs,
    ...columnWords(d),
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
  const rawSources = dto.sources ?? [];
  const sends = sumOf(rawSources.map((s) => s.runs));
  const sources: CampaignSourceVM[] = rawSources.map((s) => ({
    id: s.id,
    kind: s.kind,
    kindLabel: s.kind === "playbook" ? "Campaign" : "Sent once",
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
    ...sourceWords(s),
    lastLabel: s.last_at ? sentOn(s.last_at, dto.timezone) : "",
  }));

  return {
    days,
    points,
    totals: { ...tot, read, readOf, sends },
    before: prev,
    sources,
    empty: tot.sent === 0 && tot.optIns === 0 && tot.optOuts === 0,
    table: {
      columns: ["Day", "Sent", "Delivered", "Answered", "Said yes", "Asked to stop"],
      rows: points.map((p) => [p.label, p.sent, p.delivered, p.replied, p.optIns, p.optOuts]),
    },
    channels,
    channelTable: {
      columns: ["Channel", "Sent", "Delivered", "Read", "Answered"],
      rows: channels.map((c) => [c.label, c.sent, c.delivered, c.read, c.replied]),
    },
    lines: {
      sent: sends ? (sends === 1 ? "From one run." : `From ${sends} runs.`) : null,
      channels: channelsLine(channels),
    },
  };
}

/**
 * The demo's Campaigns lens: the sample business's sends (the report `GET reports/campaigns` answers) and the ledger beside them
 * (what `GET reports/campaigns/ledger` answers: the window beyond the sends' counts, and what is stuck now), both built over the
 * same days of the same business as the demo's report (sample.ts), so the page folds them through the real `toCampaignLensVM`
 * and a demo draws the one Campaigns lens there is. Deterministic: the same range on the same day is the same object. Every figure
 * agrees with its parts, as the demo's report does: the people are a share of the sends and none wrote back more than were
 * answered, the sources' sends are the messages' and the channels', the first replies are the answered sends, every
 * distribution adds up to the count it is of, and no message is counted as answered before its reply window is over. The
 * reach-outs are absent (nothing reads them in a demo), so that part of the lens draws nothing.
 */
import {
  DAY_MS,
  HOUR_MS,
  REPLY_WINDOW_MS,
  sumOf,
  type CampaignLedgerDto,
  type CampaignLedgerSeriesDto,
  type CampaignReportDto,
  type CampaignStuckNowDto,
  type ReportRange,
} from "@chanlytics/contracts";
import type { ReportWindowVM } from "@chanlytics/contracts/report-window";
import type { CampaignsSurface } from "./campaigns-surface";
import { DEMO_ZONE } from "../demo-zone";
import { business, sampleWindow, todayIn, type SampleDay } from "./sample";

/** The people a period's sends reached are this share of them: some are written to more than once. */
const PEOPLE_SHARE = 0.75;
/** Of the people sent to, the share who wrote back, held under the sends that were answered (a person can answer two). */
const WROTE_BACK_SHARE = 0.9;
/** The days a send's reply window lasts: its answer is counted only once they are over. */
const REPLY_DAYS_N = Math.round(REPLY_WINDOW_MS / DAY_MS);
/** How soon the middle answered send was answered, in seconds: an hour and a half. */
const FIRST_REPLY_MEDIAN_S = 5400;
/** How long the middle approved run waited for the owner's OK, in seconds: two hours. */
const APPROVAL_MEDIAN_S = 7200;
/** How long ago each source last ran, in hours, on the day the sample is read: the win-back a day and a bit, the offer days, the nudge more than a week. */
const WINBACK_LAST_RUN_HOURS_AGO = 30;
const OFFER_LAST_RUN_HOURS_AGO = 90;
const NUDGE_LAST_RUN_HOURS_AGO = 200;
/** The hour of the sample's day its sources' last runs are counted back from, the hour the run waiting was made, and the hour the number was checked (UTC). */
const SOURCES_CLOCK = "T15:00:00Z";
const RUN_WAITING_MADE_AT = "T13:00:00.000Z";
const NUMBER_CHECKED_AT = "T12:00:00.000Z";

/**
 * A count shared over parts in proportion to their caps, each part held under its cap; what rounding leaves goes to the
 * first part with room. The parts add up to the count wherever it is no more than the caps' sum.
 */
function sharedUnder(count: number, caps: readonly number[]): number[] {
  const whole = Math.max(1, sumOf(caps));
  const parts = caps.map((cap) => Math.min(cap, Math.floor((count * cap) / whole)));
  let left = count - sumOf(parts);
  for (let i = 0; i < parts.length && left > 0; i++) {
    const room = (caps[i] ?? 0) - (parts[i] ?? 0);
    const add = Math.min(room, left);
    parts[i] = (parts[i] ?? 0) + add;
    left -= add;
  }
  return parts;
}

/** The runs that sent in a period, by what ran: the win-back playbook, the quiet-month nudge, and the one-off offer (none where nothing went out). */
function runsSplit(days: readonly SampleDay[]): { winback: number; quiet: number; offer: number } {
  const runs = days.filter((d) => d.campaign.sent > 0).length;
  if (runs === 0) return { winback: 0, quiet: 0, offer: 0 };
  return { winback: Math.max(1, Math.ceil(runs / 2)), quiet: Math.max(1, Math.floor(runs / 2)), offer: 1 };
}

/** `total` shared by weight, the last part taking what rounding leaves: the parts add up to it. */
function splitBy(total: number, weights: readonly number[]): number[] {
  const whole = Math.max(1, sumOf(weights));
  let left = total;
  return weights.map((w, i) => {
    const part = i === weights.length - 1 ? left : Math.min(left, Math.floor((total * w) / whole));
    left -= part;
    return part;
  });
}

/* ------------------------------------------------------------------------------------------------ the sends */

function campaignDto(all: readonly SampleDay[], n: number, today: string): CampaignReportDto {
  const span = all.slice(-2 * n);
  const cur = span.slice(-n);
  const total = (k: "sent" | "delivered" | "read" | "replied") => sumOf(cur.map((d) => d.campaign[k]));
  const t = { sent: total("sent"), delivered: total("delivered"), read: total("read"), replied: total("replied") };
  const runs = runsSplit(cur);
  const at = (hoursAgo: number) => new Date(Date.parse(`${today}${SOURCES_CLOCK}`) - hoursAgo * HOUR_MS).toISOString();
  // Three sources share the period's sends: half the win-back playbook, three tenths a one-off offer, the rest a
  // quiet-month nudge. Each count splits the same way, so the parts add up to the whole.
  const part = (f: number) => ({
    sent: Math.round(t.sent * f),
    delivered: Math.round(t.delivered * f),
    read: Math.round(t.read * f),
    replied: Math.round(t.replied * f),
  });
  const a = part(0.5);
  const b = part(0.3);
  const c = {
    sent: t.sent - a.sent - b.sent,
    delivered: t.delivered - a.delivered - b.delivered,
    read: t.read - a.read - b.read,
    replied: t.replied - a.replied - b.replied,
  };
  const sources: CampaignReportDto["sources"] = t.sent
    ? [
        {
          id: "sample-winback",
          kind: "playbook",
          name: "Win-back",
          template_name: "winback_offer",
          runs: runs.winback,
          ...a,
          last_at: at(WINBACK_LAST_RUN_HOURS_AGO),
        },
        {
          id: "sample-offer",
          kind: "broadcast",
          name: "Loyalty offer",
          template_name: "quick_note",
          runs: runs.offer,
          ...b,
          last_at: at(OFFER_LAST_RUN_HOURS_AGO),
        },
        {
          id: "sample-quiet",
          kind: "playbook",
          name: "Quiet for a month",
          template_name: "quiet_nudge",
          runs: runs.quiet,
          ...c,
          last_at: at(NUDGE_LAST_RUN_HOURS_AGO),
        },
      ]
    : [];
  // The same sends by channel (0030): three quarters by WhatsApp, the rest by text and email. Each count is shared by
  // the sends' split and held under each channel's own sends, so the parts add up to the whole and no channel delivered
  // or heard back from more than it sent; a read is WhatsApp's alone.
  const textSent = Math.floor(t.sent * 0.15);
  const emailSent = Math.floor(t.sent * 0.1);
  const waSent = t.sent - textSent - emailSent;
  const sentParts = [waSent, textSent, emailSent];
  const [waD = 0, txD = 0, emD = 0] = sharedUnder(t.delivered, sentParts);
  const [waR = 0, txR = 0, emR = 0] = sharedUnder(t.replied, sentParts);
  const by_channel: CampaignReportDto["by_channel"] = t.sent
    ? [
        { channel: "whatsapp", sent: waSent, delivered: waD, read: Math.min(t.read, waD), replied: waR },
        { channel: "sms", sent: textSent, delivered: txD, read: 0, replied: txR },
        { channel: "email", sent: emailSent, delivered: emD, read: 0, replied: emR },
      ]
    : [];
  return {
    timezone: DEMO_ZONE,
    days: n,
    span_days: 2 * n,
    today,
    series: span.map((d) => d.campaign),
    sources,
    by_channel,
  };
}

/* ------------------------------------------------------------------------------------------------ the ledger */

/** The days the ledger is made over: the window, the same number of days before it, the sends' own report, and the business's day it is read on. */
interface LedgerWorld {
  cur: readonly SampleDay[];
  before: readonly SampleDay[];
  win: ReportWindowVM;
  report: CampaignReportDto;
  today: string;
}

const sentIn = (days: readonly SampleDay[]): number => sumOf(days.map((d) => d.campaign.sent));
const answeredIn = (days: readonly SampleDay[]): number => sumOf(days.map((d) => d.campaign.replied));

/** The people a period's sends reached, and how many of them wrote back (never more than were answered). */
function peopleOf(days: readonly SampleDay[]): { sent_to: number; wrote_back: number } {
  const sentTo = Math.round(sentIn(days) * PEOPLE_SHARE);
  return { sent_to: sentTo, wrote_back: Math.min(sentTo, Math.round(answeredIn(days) * WROTE_BACK_SHARE)) };
}

/** The sends whose reply window is not over: those of the last days of a window that ends today; none for one that ended. */
function newestSends({ cur, win }: Pick<LedgerWorld, "cur" | "win">): number {
  return win.live ? sentIn(cur.slice(-REPLY_DAYS_N)) : 0;
}

function peopleSeries(world: LedgerWorld): CampaignLedgerSeriesDto["people"] {
  const now = peopleOf(world.cur);
  const counting = Math.min(now.sent_to, Math.round(newestSends(world) * PEOPLE_SHARE));
  return { now: { ...now, counting }, before: peopleOf(world.before) };
}

function runsSeries(world: LedgerWorld): CampaignLedgerSeriesDto["runs"] {
  const count = (days: readonly SampleDay[]) => {
    const { winback, quiet, offer } = runsSplit(days);
    return { moment: winback + quiet, broadcast: offer };
  };
  return { now: count(world.cur), before: count(world.before) };
}

/** People a run did not send to: a twentieth of what went out, for the reasons the product has words for. */
function heldSeries(sent: number): CampaignLedgerSeriesDto["held"] {
  const total = Math.round(sent * 0.05);
  if (total === 0) return { total: 0, skipped: 0, failed: 0, by_reason: {} };
  const [optedOut = 0, noPhone = 0, noYes = 0] = splitBy(total, [5, 3, 2]);
  return {
    total,
    skipped: total,
    failed: 0,
    by_reason: { opted_out: optedOut, no_phone: noPhone, not_opted_in: noYes },
  };
}

/** One run in eight stopped on the way; none was canceled. */
function stoppedSeries(runs: number): CampaignLedgerSeriesDto["stopped"] {
  const failed = Math.floor(runs / 8);
  return { failed, canceled: 0, by_failure: failed > 0 ? { paused: failed } : {} };
}

/** A fiftieth of the sends failed after they left, for the one reason WhatsApp documents. */
function failedSends(sent: number): CampaignLedgerSeriesDto["failed_sends"] {
  const total = Math.round(sent * 0.02);
  return { total, by_code: total > 0 ? [{ channel: "whatsapp", code: 131049, kind: null, n: total }] : [] };
}

/** Each message's sends (the sources' own), the ones whose reply window is over, and the answered of those. */
function messageRows(world: LedgerWorld): CampaignLedgerSeriesDto["by_message"] {
  const { sources } = world.report;
  const sent = sumOf(sources.map((s) => s.sent));
  const newest = newestSends(world);
  return sources.flatMap((s) => {
    if (s.template_name === null) return [];
    const mature = Math.max(0, s.sent - Math.round((newest * s.sent) / Math.max(1, sent)));
    return [{ name: s.template_name, language: "en_US", sent: s.sent, mature, replied: Math.min(s.replied, mature) }];
  });
}

/** The answered sends, by how soon the first answer came: a middle of an hour and a half. */
function firstReplySeries(answered: number): CampaignLedgerSeriesDto["first_reply"] {
  const [m15 = 0, h1 = 0, h4 = 0, h24 = 0, h72 = 0] = splitBy(answered, [8, 14, 12, 11, 5]);
  return { n: answered, median_s: answered > 0 ? FIRST_REPLY_MEDIAN_S : null, buckets: { m15, h1, h4, h24, h72 } };
}

/** The runs that waited for an OK and were approved: at most four in the window, a middle of two hours. */
function approvalSeries(runs: number): CampaignLedgerSeriesDto["approval"] {
  const n = Math.min(runs, 4);
  const [h1 = 0, h4 = 0, h24 = 0, over = 0] = splitBy(n, [4, 3, 2, 1]);
  return { n, median_s: n > 0 ? APPROVAL_MEDIAN_S : null, buckets: { h1, h4, h24, over } };
}

/** The window the ledger is of, as the database names it: the zone, the business's day, the window's last day where it ended before it, and its days. */
function windowOf({ win, today }: Pick<LedgerWorld, "win" | "today">) {
  return { timezone: DEMO_ZONE, today, ...(win.live ? {} : { end: win.to }), days: win.days };
}

function ledgerSeries(world: LedgerWorld): CampaignLedgerSeriesDto {
  const sent = sentIn(world.cur);
  const runs = runsSeries(world);
  return {
    ...windowOf(world),
    people: peopleSeries(world),
    runs,
    held: heldSeries(sent),
    stopped: stoppedSeries(runs.now.moment + runs.now.broadcast),
    failed_sends: failedSends(sent),
    by_message: messageRows(world),
    first_reply: firstReplySeries(answeredIn(world.cur)),
    approval: approvalSeries(runs.now.moment + runs.now.broadcast),
  };
}

/** What is stuck as of now: one run waits for an OK, nothing failed, nobody waits, no message was stopped, and the number is healthy. */
function stuckNow(today: string): CampaignStuckNowDto {
  return {
    waiting: { n: 1, late: 0, oldest_at: `${today}${RUN_WAITING_MADE_AT}`, capped: false },
    failed: { n: 0, latest: null, capped: false },
    replies: { n: 0, oldest_at: null, capped: false },
    templates: { n: 0, items: [] },
    number: {
      state: "read",
      tone: "ok",
      can_send: true,
      label: "Number quality: good",
      checked_at: `${today}${NUMBER_CHECKED_AT}`,
    },
  };
}

function ledgerDto(world: LedgerWorld): CampaignLedgerDto {
  return { ...windowOf(world), series: ledgerSeries(world), stuck: stuckNow(world.today) };
}

const keptCampaigns = new Map<string, CampaignsSurface>();

/**
 * The demo's Campaigns lens for a range (anything that is none of ours is the default period) as of `today`, a YYYY-MM-DD key
 * in the business's zone: the sends over the same days as the demo's report, and the ledger over the same sends. Days a member
 * picked are those days of the same business, as the report says them.
 */
export function campaignsSample(range: ReportRange, today: string = todayIn(DEMO_ZONE)): CampaignsSurface {
  const win = sampleWindow(range, today);
  const key = `${win.key}:${today}`;
  const hit = keptCampaigns.get(key);
  if (hit) return hit;
  const n = win.days;
  const all = business(win.to);
  const report = campaignDto(all, n, win.to);
  const world: LedgerWorld = { cur: all.slice(-n), before: all.slice(-2 * n, -n), win, report, today };
  const surface: CampaignsSurface = { campaigns: report, ledger: ledgerDto(world), key: win.key };
  keptCampaigns.set(key, surface);
  return surface;
}

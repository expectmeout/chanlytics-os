/**
 * The demo's Reports: a sample business passed through the same contracts functions a real workspace's numbers go
 * through, so a demo session draws the one Reports page there is (spec section 7). Deterministic: the same period on
 * the same day is the same report. Every total agrees with its parts: the channels, the hours and the week add up to
 * the messages and calls, the replies to what the receptionist answered, the reasons to the handovers, the moods to
 * the calls and the sources to what was sent. The page imports it, and draws it only in a demo session that has read
 * nothing of its own (the standalone mockup's Reports went with the shell's: a moved surface is drawn by the app). The Reviews
 * lens has its own, a listing Google shows with no Business Profile behind it (`reviewsSample`), drawn the same way, and so has
 * the Receptionist lens (`receptionistSample`): the route's answer for the same business and days, which the lens folds as it
 * folds a workspace's.
 */
import {
  toReportVM,
  toCampaignReportVM,
  toBookingReportVM,
  toDealReportVM,
  toReviewsReportVM,
  reportFacts,
  type ReportDto,
  type CampaignReportDto,
  type BookingReportDto,
  type GoogleReviewDto,
  type ReviewsReportDto,
  type ReceptionistDto,
  type ReportVM,
  HOUR_MS,
  sumOf,
  REPORT_PERIOD_DEFAULT,
  isReportDays,
  isReportPeriod,
  type ReportRange,
} from "@chanlytics/contracts";
import { reportWindowOf, type ReportWindowVM } from "@chanlytics/contracts/report-window";
import type { ReceptionistSurface } from "./receptionist-surface";
import type { ReviewsSurface } from "./reviews-surface";
import type { ReportsSurface } from "./surface";

const ZONE = "America/New_York";
const SPAN = 180;
/** The reply hold the sample's business has set, in seconds: each reply it sends waits it out. */
const SAMPLE_HOLD_S = 60;

type ReportDay = ReportDto["series"][number];
type CampaignDay = CampaignReportDto["series"][number];

interface SampleDay {
  report: ReportDay;
  campaign: CampaignDay;
  /** The receptionist's reply to each message it answered, in seconds. */
  replies: number[];
  whatsapp: number;
  email: number;
  sms: number;
  /** Messages and calls by hour of the day. */
  hours: number[];
  /** Why it handed over, one per escalation. */
  reasons: string[];
  /** The voice provider's read of each call. */
  moods: string[];
  voicemail: number;
}

/** A seeded generator (a 32-bit LCG in exact integer arithmetic): the same seed, the same business. */
const seeded = (start: number) => {
  let s = start >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const back = (today: string, n: number): string => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Monday 0 to Sunday 6. */
const weekday = (day: string): number => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

/** A day of trade: busy late morning and after work, quiet at lunch, a few messages at night. */
const HOUR_WEIGHTS = [
  0.08, 0.04, 0.02, 0.02, 0.02, 0.05, 0.12, 0.35, 0.8, 1.3, 1.75, 1.9, 1.35, 1.1, 1.15, 1.3, 1.55, 1.8, 1.6, 1.1, 0.75,
  0.5, 0.3, 0.15,
];
const HOUR_TOTAL = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
const hourOf = (r: number): number => {
  let s = 0;
  for (let h = 0; h < 24; h++) {
    s += HOUR_WEIGHTS[h];
    if (r * HOUR_TOTAL <= s) return h;
  }
  return 23;
};

const tally = (xs: readonly string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
};

/** Half a year of the business, oldest first, ending today. */
function business(today: string): SampleDay[] {
  const r = seeded(7);
  const out: SampleDay[] = [];
  for (let i = SPAN - 1; i >= 0; i--) {
    const day = back(today, i);
    const wd = weekday(day);
    const closed = wd === 6;
    const busy = wd === 4 || wd === 5;
    const inbound = closed ? (r() > 0.7 ? 1 : 0) : Math.max(0, Math.round((busy ? 6 : 3) * (0.5 + r())));
    const you = inbound && r() > 0.78 ? 1 : 0;
    const none = inbound - you > 0 && r() > 0.9 ? 1 : 0;
    const ai = inbound - you - none;
    const calls = closed ? 0 : r() > 0.55 ? Math.ceil(r() * 2) : 0;
    const escalations = inbound && r() > 0.85 ? 1 : 0;
    const email = inbound && r() > 0.8 ? 1 : 0;
    const sms = inbound - email > 0 && r() > 0.9 ? 1 : 0;
    const hours = Array<number>(24).fill(0);
    for (let k = 0; k < inbound + calls; k++) hours[hourOf(r())] += 1;
    const reasons = Array.from({ length: escalations }, () => {
      const x = r();
      return x < 0.5 ? "human_token" : x < 0.75 ? "non_text" : x < 0.9 ? "policy_block" : "refusal";
    });
    const moods = Array.from({ length: calls }, () => {
      const x = r();
      return x > 0.35 ? "Positive" : x > 0.1 ? "Neutral" : "Negative";
    });
    // Playbooks run on Tuesdays and Fridays, so every week sends something.
    const sent = wd === 1 || wd === 4 ? Math.round(6 + r() * 12) : 0;
    out.push({
      report: {
        day,
        messages_in: inbound,
        conversations: Math.ceil(inbound / 2),
        answered_ai: ai,
        answered_you: you,
        unanswered: none,
        out_ai: ai,
        out_you: you,
        escalations,
        calls,
        call_seconds: calls * Math.round(70 + r() * 160),
        new_contacts: inbound && r() > 0.6 ? 1 : 0,
      },
      campaign: {
        day,
        sent,
        delivered: Math.round(sent * 0.93),
        read: Math.round(sent * 0.6),
        replied: Math.round(sent * 0.12),
        opt_ins: r() > 0.85 ? 1 : 0,
        opt_outs: r() > 0.94 ? 1 : 0,
      },
      // Every reply waits the business's hold: nearly all go out as it ends, one in ten takes longer.
      replies: Array.from({ length: ai }, () =>
        Math.round(SAMPLE_HOLD_S + (r() > 0.9 ? 60 + r() * 1500 : 2 + r() * 7)),
      ),
      whatsapp: inbound - email - sms,
      email,
      sms,
      hours,
      reasons,
      moods,
      voicemail: calls && r() > 0.8 ? 1 : 0,
    });
  }
  return out;
}

function reportDto(all: readonly SampleDay[], n: number, today: string): ReportDto {
  const span = all.slice(-2 * n);
  const cur = span.slice(-n);
  const prev = span.slice(0, n);
  const channels = (xs: readonly SampleDay[]) => ({
    whatsapp: sumOf(xs.map((d) => d.whatsapp)),
    voice: sumOf(xs.map((d) => d.report.calls)),
    email: sumOf(xs.map((d) => d.email)),
    sms: sumOf(xs.map((d) => d.sms)),
  });
  const hours = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const d of cur)
    d.hours.forEach((v, h) => {
      hours[weekday(d.report.day)][h] += v;
    });
  return {
    timezone: ZONE,
    days: n,
    span_days: 2 * n,
    today,
    series: span.map((d) => d.report),
    reasons: tally(cur.flatMap((d) => d.reasons)),
    reply_seconds: cur.flatMap((d) => d.replies).sort((a, b) => a - b),
    sentiments: tally(cur.flatMap((d) => d.moods)),
    voicemail: sumOf(cur.map((d) => d.voicemail)),
    replies: cur.flatMap((d) => d.replies.map((s) => ({ day: d.report.day, s, hold: SAMPLE_HOLD_S }))),
    channels: { current: channels(cur), previous: channels(prev) },
    hours,
  };
}

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

function campaignDto(all: readonly SampleDay[], n: number, today: string): CampaignReportDto {
  const span = all.slice(-2 * n);
  const cur = span.slice(-n);
  const total = (k: "sent" | "delivered" | "read" | "replied") => sumOf(cur.map((d) => d.campaign[k]));
  const t = { sent: total("sent"), delivered: total("delivered"), read: total("read"), replied: total("replied") };
  const runs = cur.filter((d) => d.campaign.sent > 0).length;
  const at = (hoursAgo: number) => new Date(Date.parse(`${today}T15:00:00Z`) - hoursAgo * HOUR_MS).toISOString();
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
          runs: Math.max(1, Math.ceil(runs / 2)),
          ...a,
          last_at: at(30),
        },
        {
          id: "sample-offer",
          kind: "broadcast",
          name: "Loyalty offer",
          template_name: "quick_note",
          runs: 1,
          ...b,
          last_at: at(90),
        },
        {
          id: "sample-quiet",
          kind: "playbook",
          name: "Quiet for a month",
          template_name: "quiet_nudge",
          runs: Math.max(1, Math.floor(runs / 2)),
          ...c,
          last_at: at(200),
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
  return { timezone: ZONE, days: n, span_days: 2 * n, today, series: span.map((d) => d.campaign), sources, by_channel };
}

/** Asked, then booked, counted for a window that ends today alone, as the server counts it (readers/report.ts bookingOf). */
function bookingDto(all: readonly SampleDay[], n: number, live: boolean): BookingReportDto {
  if (!live) return { calendar: "ended", days: n, asked: 0, booked: 0 };
  const asked = Math.max(1, Math.round(sumOf(all.slice(-n).map((d) => d.report.conversations)) * 0.45));
  return { calendar: "ok", days: n, asked, booked: Math.round(asked * 0.45) };
}

/** The window a sample is of: the range asked for (anything that is none of ours is the default period) as of `today`. */
const sampleWindow = (range: ReportRange, today: string): ReportWindowVM =>
  reportWindowOf(isReportPeriod(range) || isReportDays(range) ? range : REPORT_PERIOD_DEFAULT, today);

const todayIn = (zone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

const keptReports = new Map<string, ReportsSurface>();

/**
 * The demo's report for a range (anything that is none of ours is the default period) as of `today`, a YYYY-MM-DD key in
 * the business's zone. Days a member picked are those days of the same business: half a year of it ending on their last
 * day, said as the report says a window that ended before today (`end`).
 */
export function reportsSample(range: ReportRange, today: string = todayIn(ZONE)): ReportsSurface {
  const win = sampleWindow(range, today);
  const n = win.days;
  const key = `${win.key}:${today}`;
  const hit = keptReports.get(key);
  if (hit) return hit;
  const all = business(win.to);
  const vm = toReportVM({ ...reportDto(all, n, win.to), today, end: win.to }, { profile: null });
  const campaigns = toCampaignReportVM(campaignDto(all, n, win.to));
  const surface: ReportsSurface = {
    vm,
    campaigns,
    booking: toBookingReportVM(bookingDto(all, n, win.live)),
    // The demo is a salon: no deal was ever recorded, so Reports draws no Deals section (0004).
    deals: toDealReportVM(null, vm.period.within),
    facts: reportFacts(vm, campaigns),
    range: win.range,
    key: win.key,
    period: win.period,
    days: n,
    fetchedAt: 0,
  };
  keptReports.set(key, surface);
  return surface;
}

/** The five reviews Google shows of the demo's listing, newest first: who, how many stars, in what words, and how many days ago. */
const PUBLIC_REVIEWS: ReadonlyArray<readonly [string, number, string, number]> = [
  ["Ana P.", 5, "Careful and kind, and right on time.", 1],
  ["Marco D.", 5, "Booked in minutes, and they remembered my name.", 3],
  ["Bea R.", 4, "Lovely work. A little wait at the door.", 6],
  ["Jon K.", 5, "Fast, clear and fair.", 9],
  ["Lee W.", 3, "Good, though hard to reach by phone.", 15],
];

const keptReviews = new Map<string, ReviewsSurface>();

/**
 * The demo's Reviews for a period as of `today`: the listing Google shows with no Business Profile behind it, so the four figures it
 * counts, the ratings its daily readings gained, the five public reviews, and what a profile would add. Nothing here can be answered:
 * a demo posts no reply to Google.
 */
export function reviewsSample(range: ReportRange, today: string = todayIn(ZONE)): ReviewsSurface {
  const win = sampleWindow(range, today);
  const n = win.days;
  const key = `${win.key}:${today}`;
  const hit = keptReviews.get(key);
  if (hit) return hit;
  const r = seeded(11);
  let count = 180;
  // The listing's daily readings up to the window's last day: what the lens counts a gain from.
  const days = Array.from({ length: n + 1 }, (_, i) => {
    count += r() > 0.6 ? 1 : 0;
    return { day: back(win.to, n - i), rating: 4.8, review_count: count };
  });
  const reviews = PUBLIC_REVIEWS.map(([author, rating, body, ago], i): GoogleReviewDto => {
    const day = back(today, ago);
    return {
      id: `sample-review-${i + 1}`,
      review_id: `sample-${i + 1}`,
      origin: "places",
      rating,
      author,
      author_uri: null,
      author_photo_uri: null,
      body,
      language_code: "en",
      published_at: `${day}T14:00:00Z`,
      reply_text: null,
      replied_at: null,
      maps_uri: null,
      first_seen_at: `${day}T15:00:00Z`,
    };
  });
  const dto: ReviewsReportDto = {
    timezone: ZONE,
    today,
    ...(win.live ? {} : { end: win.to }),
    days: n,
    readable: true,
    ledger: null,
    google: {
      listing: {
        place_id: "sample-place",
        name: "Harbor Studio",
        address: "1 Dock Street",
        maps_uri: "https://maps.example.com/harbor",
        business_status: "OPERATIONAL",
        rating: 4.8,
        review_count: count,
        linked_at: `${back(today, 60)}T12:00:00Z`,
        checked_at: `${today}T12:00:00Z`,
        check_error: null,
      },
      connection: null,
      reviews,
      days,
      reply_mode: "ask",
    },
  };
  const surface: ReviewsSurface = {
    vm: toReviewsReportVM(dto, { nowMs: Date.parse(`${today}T16:00:00Z`) }),
    key: win.key,
  };
  keptReviews.set(key, surface);
  return surface;
}

type ReceptionistSeries = NonNullable<ReceptionistDto["series"]>;
type Totals = ReportVM["answered"]["totals"];

/** A count shared over parts in the proportion of their weights; what rounding leaves goes to the first part. */
function sharedOver(total: number, weights: readonly number[]): number[] {
  const whole = Math.max(1, sumOf(weights));
  const parts = weights.map((w) => Math.floor((total * w) / whole));
  const [first = 0, ...rest] = parts;
  return [first + total - sumOf(parts), ...rest];
}

/** What became of the replies held for the owner: those sent, and the few that did not go out as written. */
function sampleHold(totals: Totals): ReceptionistSeries["hold"] {
  const sent = totals.ai;
  const [canceled = 0, steered = 0, overtaken = 0, other = 0] = [0.04, 0.03, 0.02, 0.02].map((f) =>
    Math.round(sent * f),
  );
  const personFirst = Math.round(totals.you * 0.5);
  const total = sent + canceled + steered + overtaken + personFirst + other;
  return {
    now: {
      total,
      sent,
      canceled,
      steered,
      overtaken,
      person_first: personFirst,
      waiting: 0,
      other,
      low_confidence: Math.round(sent * 0.1),
    },
    before: { total: Math.round(total * 0.9), sent: Math.round(sent * 0.9) },
  };
}

/** What customers asked about: four in five of the texts and WhatsApp messages carry a topic, shared over five. */
const TOPIC_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["booking", 40],
  ["pricing", 25],
  ["hours", 15],
  ["services", 12],
  ["other", 8],
];

function sampleTopics(vm: ReportVM): ReceptionistSeries["topics"] {
  const texts = sumOf((vm.channels ?? []).filter((c) => c.key === "whatsapp" || c.key === "sms").map((c) => c.value));
  const stamped = Math.round(texts * 0.8);
  const counts = sharedOver(
    stamped,
    TOPIC_WEIGHTS.map(([, w]) => w),
  );
  return { of: texts, stamped, by_intent: Object.fromEntries(TOPIC_WEIGHTS.map(([id], i) => [id, counts[i] ?? 0])) };
}

/** The language of each reply it sent: mostly English, some Spanish (none, in a period too quiet to have one). */
function sampleLanguages(replies: number): ReceptionistSeries["languages"] {
  const es = Math.round(replies * 0.15);
  return { of: replies, stamped: replies, by_language: replies ? { en: replies - es, es } : {} };
}

/** The replies the send door refused: nearly all because a person had the thread. */
function sampleBlocked(totals: Totals): ReceptionistSeries["blocked"] {
  const total = Math.round(totals.ai * 0.05);
  const human = Math.ceil(total * 0.75);
  return { total, by_reason: { human_has_it: human, opted_out: total - human } };
}

/** How the calls that connected ended: those that reached voicemail did not connect. */
function sampleCallEndings(vm: ReportVM): ReceptionistSeries["call_endings"] {
  const total = Math.max(0, vm.calls.total - vm.calls.voicemail);
  const [user = 0, agent = 0, unknown = 0] = sharedOver(total, [60, 30, 10]);
  return { total, by_reason: { user_hangup: user, agent_hangup: agent, unknown } };
}

/** A handover and the middle of the two times that follow it; the period before had a fifth fewer, and took longer. */
function sampleHandovers(handovers: number): ReceptionistSeries["handover"] {
  const timed = (n: number, median: number) => ({ n, median_s: n ? median : null });
  const at = (share: number, replied: number, settled: number) => {
    const n = Math.round(handovers * share);
    return { n, replied: timed(Math.round(n * 0.9), replied), settled: timed(Math.round(n * 0.75), settled) };
  };
  return { now: at(1, 540, 3900), before: at(0.8, 780, 5400) };
}

/** The calls nobody took: a fifth of the calls, and the business reached three in five of the people within the hour. */
function sampleMissed(calls: number): ReceptionistSeries["missed"] {
  const at = (share: number) => {
    const n = Math.round(calls * share);
    return { n, touched: Math.round(n * 0.6), pending: 0, unknown: 0 };
  };
  return { now: at(0.2), before: at(0.25) };
}

/** The quarter hours the sample's customers write at: through the morning, the afternoon, and at nine in the evening. */
const MORNING_Q = 44;
const AFTERNOON_Q = 64;
const EVENING_Q = 84;

/**
 * Every customer message of the window by its day and quarter hour: a quarter of each day's in the evening, the rest split
 * through the day, so the messages add up to the period's. The receptionist answered first as many as it answered that day,
 * the evening's before the rest.
 */
function sampleAfterHours(points: ReportVM["answered"]["points"]): ReceptionistSeries["after_hours"] {
  return points.flatMap((p) => {
    const evening = Math.floor(p.in / 4);
    const morning = Math.ceil((p.in - evening) / 2);
    const afternoon = p.in - evening - morning;
    let answered = p.ai;
    return (
      [
        [EVENING_Q, evening],
        [MORNING_Q, morning],
        [AFTERNOON_Q, afternoon],
      ] as const
    ).flatMap(([q, n]) => {
      const a = Math.min(n, answered);
      answered -= a;
      return n > 0 ? [{ d: p.day, q, n, a }] : [];
    });
  });
}

/** Monday to Saturday, nine to six: the sample's Sundays and evenings are closed. */
const SAMPLE_PROFILE: NonNullable<ReceptionistDto["profile"]> = {
  hours: Object.fromEntries(
    ["mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, { open: "09:00", close: "18:00" }]),
  ),
};

/** The route's answer for the sample's business and window, from the numbers the report's sample already holds. */
function receptionistDto(vm: ReportVM, win: ReportWindowVM, today: string): ReceptionistDto {
  const totals = vm.answered.totals;
  const sent = Math.round(totals.ai * 0.3);
  const series: ReceptionistSeries = {
    timezone: ZONE,
    today,
    ...(win.live ? {} : { end: win.to }),
    days: win.days,
    hold: sampleHold(totals),
    topics: sampleTopics(vm),
    languages: sampleLanguages(totals.ai),
    blocked: sampleBlocked(totals),
    call_endings: sampleCallEndings(vm),
    handover: sampleHandovers(sumOf(vm.reasons.map((r) => r.value))),
    missed: sampleMissed(vm.calls.total),
    after_hours: sampleAfterHours(vm.answered.points),
    // Who booked since is not counted for days that ended before today, as the booking card is not.
    links: win.live
      ? { sent, booked: Math.round(sent * 0.45), calendar: "ok" }
      : { sent, booked: null, calendar: "ended" },
    stuck: { waiting: 2, oldest_at: `${today}T13:40:00Z`, callbacks: 1, capped: false },
  };
  return {
    timezone: ZONE,
    today,
    ...(win.live ? {} : { end: win.to }),
    days: win.days,
    series,
    profile: SAMPLE_PROFILE,
  };
}

const keptReceptionist = new Map<string, ReceptionistSurface>();

/**
 * The demo's Receptionist read for a range as of `today`: the route's answer for the same business and days as `reportsSample`
 * (the messages, handovers and calls it holds, shared into the hold, the topics, how calls ended, the link and the times), read at
 * four in the afternoon of that day, with two people waiting on the owner. The same range on the same day is the same object, which
 * the lens folds once.
 */
export function receptionistSample(range: ReportRange, today: string = todayIn(ZONE)): ReceptionistSurface {
  const win = sampleWindow(range, today);
  const key = `${win.key}:${today}`;
  const hit = keptReceptionist.get(key);
  if (hit) return hit;
  const surface: ReceptionistSurface = {
    dto: receptionistDto(reportsSample(range, today).vm, win, today),
    key: win.key,
    readAt: Date.parse(`${today}T16:00:00Z`),
  };
  keptReceptionist.set(key, surface);
  return surface;
}

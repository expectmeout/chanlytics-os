/**
 * The demo's Reports: a sample business passed through the same contracts functions a real workspace's numbers go
 * through, so a demo session draws the one Reports page there is (spec section 7). Deterministic: the same period on
 * the same day is the same report. Every total agrees with its parts: the channels, the hours and the week add up to
 * the messages and calls, the replies to what the receptionist answered, the reasons to the handovers, the moods to
 * the calls and the sources to what was sent. The page imports it, and draws it only in a demo session that has read
 * nothing of its own (the standalone mockup's Reports went with the shell's: a moved surface is drawn by the app).
 */
import {
  toReportVM,
  toCampaignReportVM,
  toBookingReportVM,
  toDealReportVM,
  reportFacts,
  type ReportDto,
  type CampaignReportDto,
  type BookingReportDto,
  HOUR_MS,
  sumOf,
} from "@chanlytics/contracts";
import type { ReportsSurface } from "./surface";

const ZONE = "America/New_York";
const SPAN = 180;

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
      replies: Array.from({ length: ai }, () => Math.round(r() > 0.9 ? 120 + r() * 1500 : 6 + r() * 60)),
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
    instagram: 0,
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
    replies: cur.flatMap((d) => d.replies.map((s) => ({ day: d.report.day, s }))),
    channels: { current: channels(cur), previous: channels(prev) },
    hours,
  };
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
  return { timezone: ZONE, days: n, span_days: 2 * n, today, series: span.map((d) => d.campaign), sources };
}

function bookingDto(all: readonly SampleDay[], n: number): BookingReportDto {
  const asked = Math.max(1, Math.round(sumOf(all.slice(-n).map((d) => d.report.conversations)) * 0.45));
  return { calendar: "ok", days: n, asked, booked: Math.round(asked * 0.45) };
}

const todayIn = (zone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

const keptReports = new Map<string, ReportsSurface>();

/** The demo's report for 7, 30 or 90 days (anything else is 30) as of `today`, a YYYY-MM-DD key in the business's zone. */
export function reportsSample(days: number, today: string = todayIn(ZONE)): ReportsSurface {
  const n = days === 7 || days === 90 ? days : 30;
  const key = `${n}:${today}`;
  const hit = keptReports.get(key);
  if (hit) return hit;
  const all = business(today);
  const vm = toReportVM(reportDto(all, n, today));
  const campaigns = toCampaignReportVM(campaignDto(all, n, today));
  const surface: ReportsSurface = {
    vm,
    campaigns,
    booking: toBookingReportVM(bookingDto(all, n)),
    // The demo is a salon: no deal was ever recorded, so Reports draws no Deals section (0004).
    deals: toDealReportVM(null, vm.rangeLabel),
    facts: reportFacts(vm, campaigns),
    days: n,
    fetchedAt: 0,
  };
  keptReports.set(key, surface);
  return surface;
}

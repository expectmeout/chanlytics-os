/**
 * The metrics as metrics_summary would count them, from the same rows, windowed to the business's day: every count
 * here is derived, so the figures agree with their receipts whatever hour the mockup is opened, not only at 4 PM.
 */
import type { CallDto, ConversationDto, MetricsSummaryDto } from "@chanlytics/contracts";
import { ZONE, type SampleClock } from "./clock";
import type { SampleEscalation } from "./escalations";

/** "YYYY-MM-DDTHH:MM:SS" on the business's clock: the naive wall time metrics_summary reports as now_local. */
function naiveLocal(ms: number, zone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

const tallyOf = (xs: readonly string[]) =>
  xs.reduce<Record<string, number>>((o, x) => ({ ...o, [x]: (o[x] ?? 0) + 1 }), {});

const firstMessageOf = (c: ConversationDto) =>
  [...c.messages].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

/**
 * The receptionist's reply gap for each of today's inbound messages, to the next delivered reply in its own
 * thread, in whole seconds.
 */
function replyGapsOf(conversations: ConversationDto[], midnight: number): number[] {
  const replyGaps: number[] = [];
  for (const c of conversations) {
    for (let i = 0; i < c.messages.length; i++) {
      const m = c.messages[i];
      if (m.direction !== "inbound" || Date.parse(m.created_at) < midnight) continue;
      const next = c.messages.slice(i + 1).find((x) => x.direction === "outbound" && x.status === "delivered");
      if (next) replyGaps.push(Math.round((Date.parse(next.created_at) - Date.parse(m.created_at)) / 1000));
    }
  }
  return replyGaps;
}

/** The median of those gaps, in whole seconds; null when nothing was answered today. */
function medianOf(replyGaps: number[]): number | null {
  if (!replyGaps.length) return null;
  const sorted = [...replyGaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function sampleMetrics(
  { nowMs, today, midnight }: SampleClock,
  conversations: ConversationDto[],
  escalations: SampleEscalation[],
  calls: CallDto[],
): MetricsSummaryDto {
  const since = new Date(midnight).toISOString();
  const inbound = conversations.flatMap((c) =>
    c.messages.filter((m) => m.direction === "inbound" && Date.parse(m.created_at) >= midnight),
  );
  const outAi = conversations.flatMap((c) =>
    c.messages.filter((m) => m.direction === "outbound" && Date.parse(m.created_at) >= midnight),
  );
  const answered = conversations.filter(
    (c) =>
      c.messages.some((m) => m.direction === "inbound" && Date.parse(m.created_at) >= midnight) &&
      c.messages.some(
        (m) => m.direction === "outbound" && m.status === "delivered" && Date.parse(m.created_at) >= midnight,
      ),
  ).length;

  // Calls today: the same set figuresOf reads (m.window.since is this same midnight), so the calls figure, its
  // voicemail name and its moods always agree with the count here.
  const callsToday = calls.filter((c) => c.started_at && Date.parse(c.started_at) >= midnight);
  // Escalations opened today; escalation_reasons stays the tally of every OPEN one (what the SQL returns) and is
  // never read by the view model, so it is not windowed.
  const escalationsToday = escalations.filter((e) => Date.parse(e.created_at) >= midnight);
  // New today: exactly figuresOf's own rule (the first real message is the customer's and lands today), so the
  // figure's count and its names can never disagree.
  const newToday = conversations.filter((c) => {
    const first = firstMessageOf(c);
    return !!first && first.sender === "customer" && Date.parse(first.created_at) >= midnight;
  });
  // Waiting on nothing: an inbound message came in today, and the thread's last word is still the customer's.
  const unansweredToday = conversations.filter((c) => {
    const hasInboundToday = c.messages.some((m) => m.direction === "inbound" && Date.parse(m.created_at) >= midnight);
    const last = c.messages.at(-1);
    return hasInboundToday && !!last && last.direction === "inbound";
  });
  const medianReplySeconds = medianOf(replyGapsOf(conversations, midnight));
  // The newest inbound and delivered reply over EVERY message, not only today's: a quiet early morning still proves
  // the lines were listening yesterday.
  const lastInboundAt =
    conversations
      .flatMap((c) => c.messages.filter((m) => m.direction === "inbound").map((m) => m.created_at))
      .sort()
      .at(-1) ?? null;
  const lastOutboundAt =
    conversations
      .flatMap((c) =>
        c.messages.filter((m) => m.direction === "outbound" && m.status === "delivered").map((m) => m.created_at),
      )
      .sort()
      .at(-1) ?? null;
  return {
    workspace: { name: "Marisa's Studio", timezone: ZONE, status: "active" },
    channels: [
      { kind: "whatsapp", status: "active", number: "+1 (305) 555-0100" },
      { kind: "voice", status: "active", number: "+1 (305) 555-0100" },
      { kind: "email", status: "active", number: null, address: "hello@marisas.example" },
    ],
    window: { days: 1, since, since_local: `${today}T00:00:00`, now_local: naiveLocal(nowMs, ZONE) },
    now: {
      escalations_open: escalations.length,
      oldest_open_escalation_at: escalations[0].created_at,
      threads_needing_human: escalations.length,
      threads_snoozed: 0,
      threads_awaiting_reply: unansweredToday.length,
      last_inbound_at: lastInboundAt,
      last_outbound_at: lastOutboundAt,
    },
    period: {
      messages_in: inbound.length,
      messages_out_ai: outAi.length,
      messages_out_you: 0,
      conversations_active: conversations.filter((c) => c.messages.some((m) => Date.parse(m.created_at) >= midnight))
        .length,
      answered_by_ai: answered,
      answered_by_you: 0,
      unanswered_in_window: unansweredToday.length,
      median_reply_seconds_ai: medianReplySeconds,
      send_failures: outAi.filter((m) => m.status === "failed").length,
      escalations_new: escalationsToday.length,
      escalation_reasons: tallyOf(escalations.map((e) => e.reason)),
      calls: callsToday.length,
      call_seconds: Math.round(callsToday.reduce((s, c) => s + (c.duration_ms ?? 0) / 1000, 0)),
      call_sentiments: tallyOf(callsToday.map((c) => c.sentiment).filter((x): x is string => !!x)),
      calls_voicemail: callsToday.filter((c) => c.in_voicemail).length,
      new_contacts: newToday.length,
    },
  };
}

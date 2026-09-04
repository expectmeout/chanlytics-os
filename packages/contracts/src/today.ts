/**
 * Today (Slice 4): the morning brief.
 *
 * The rule that shapes every line below: a number that cannot be traced to a
 * row does not appear, and a region with nothing true to say is not rendered
 * at all rather than rendered empty. Zero traffic stated positively — with a
 * timestamp and a channel status — is reassurance; the same morning rendered
 * as four zeroes and a flat sparkline reads as a product that died overnight.
 *
 * Every clock value comes from the SERVER's tenant-local time, never the
 * browser's: the owner of a New York salon checking from Madrid must still be
 * told what time it is at the salon.
 */
import {
  toCallVM,
  contactName,
  contactMeta,
  messageText,
  ESCALATION_REASON_LABELS,
  DISCONNECTION_LABELS,
  formatWaited,
  type ConversationDto,
  type EscalationDto,
  type CallDto,
} from "./viewmodels";
import { waWindow } from "./policy";

export interface MetricsSummaryDto {
  workspace: { name: string; timezone: string; status: string };
  channels: Array<{ kind: string; status: string; number: string | null }>;
  window: { days: number; since: string; since_local: string; now_local: string };
  now: {
    escalations_open: number;
    oldest_open_escalation_at: string | null;
    threads_needing_human: number;
    threads_snoozed: number;
    threads_awaiting_reply: number;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
  };
  period: {
    messages_in: number;
    messages_out_ai: number;
    messages_out_you: number;
    conversations_active: number;
    answered_by_ai: number;
    answered_by_you: number;
    unanswered_in_window: number;
    median_reply_seconds_ai: number | null;
    send_failures: number;
    escalations_new: number;
    escalation_reasons: Record<string, number>;
    calls: number;
    call_seconds: number;
    call_sentiments: Record<string, number>;
    calls_voicemail: number;
    new_contacts: number;
  };
}

export interface TodayNeedsRowVM {
  id: string;
  conversationId: string;
  escalationId: string;
  who: string;
  reason: string;
  waited: string;
  warn: boolean;
  quote: string;
  meta: string;
  windowNote: string | null;
  to: string;
}

export interface TodayCallRowVM {
  id: string;
  who: string;
  at: string;
  duration: string;
  note: string;
  to: string;
}

export interface TodayFactVM {
  label: string;
  value: string;
  hint?: string;
}

export interface TodaySentenceVM {
  text: string;
  /** True for the one line that must never read as calm: a reply that
   *  failed to deliver. */
  warn?: boolean;
}

export interface TodayVM {
  standing: {
    eyebrow: string;
    chips: Array<{ text: string; ok: boolean }>;
    alert: string | null;
    greeting: string;
    headline: string;
    detail: string | null;
    tone: "needs" | "calm" | "alert";
  };
  needsYou: { count: number; hint: string; rows: TodayNeedsRowVM[]; empty: string | null } | null;
  windowClosing: { label: string; hint: string; rows: Array<{ id: string; text: string; to: string }> } | null;
  recap: {
    label: string;
    sentences: TodaySentenceVM[];
    facts: TodayFactVM[];
    receipts: Array<{ at: string; text: string; to: string }>;
  } | null;
  /** Answered-by-AI ratio for the hero arc — null when nothing came in
   *  (an arc of 0/0 is a gauge with no needle). */
  pulse: { num: number; den: number } | null;
  calls: { line: string; rows: TodayCallRowVM[] } | null;
  launchpad: Array<{ label: string; to: string }>;
  updatedAt: string;
  quiet: {
    headline: string;
    sub: string;
    proof: Array<{ label: string; value: string }>;
    launchpad: { label: string; to: string } | null;
  } | null;
}

const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", voice: "Phone line" };

/** Wall-clock time AT THE SALON, whatever clock the reader is holding. */
function tzTime(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function tzDayAndTime(iso: string | null, tz: string, now: Date): string | null {
  if (!iso) return null;
  const t = tzTime(iso, tz);
  if (!t) return null;
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return t;
  try {
    const d = new Date(iso);
    if (days < 7) {
      const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(d);
      return `${day} at ${t}`;
    }
    const md = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: tz }).format(d);
    return `${md} at ${t}`;
  } catch {
    return t;
  }
}

/** "41s" / "1m 12s". Seconds are exact here — this is a measured median. */
function secondsPhrase(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

const SENT = ["sent", "delivered", "read"];

/** Retell's analysis lands a little after call_ended. Inside this window
 *  "no summary" is a fact about the clock, not about the call. */
const ANALYSIS_GRACE_MS = 10 * 60 * 1000;

export function toTodayVM(
  m: MetricsSummaryDto,
  conversations: ConversationDto[],
  escalations: Array<EscalationDto & { conversation_id: string }>,
  calls: CallDto[],
  now = new Date(),
): TodayVM {
  const tz = m.workspace.timezone;
  const p = m.period;
  const live = m.now;

  // now_local is a naive tenant-local wall clock ("2026-08-27T11:00:19"), so
  // parsing it as a local Date yields the salon's own hour and weekday.
  const localNow = new Date(m.window.now_local);
  const valid = !Number.isNaN(localNow.getTime());
  const hour = valid ? localNow.getHours() : now.getHours();
  const clock = valid ? localNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  // The mockup's eyebrow rhythm: "Saturday · April 26 · 12:04"
  const datePart = valid
    ? `${localNow.toLocaleDateString("en-US", { weekday: "long" })} · ${localNow.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : "";
  const greeting = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";

  const chips = m.channels.map((c) => ({
    text: `${CHANNEL_LABEL[c.kind] ?? c.kind} ${c.status === "active" ? "connected" : "disconnected"}`,
    ok: c.status === "active",
  }));

  // The alert is the one place Today raises its voice, and it SUPPRESSES every
  // reassuring line — "nothing needs you" is a lie while the number is dark.
  const down = m.channels.filter((c) => c.status !== "active");
  const alert =
    m.workspace.status === "paused"
      ? "This workspace is paused — the receptionist is not answering anything."
      : down.length
        ? `${down.map((c) => CHANNEL_LABEL[c.kind] ?? c.kind).join(" and ")} ${
            down.length > 1 ? "are" : "is"
          } disconnected — messages coming in are not being answered.`
        : null;

  const byConv = new Map(conversations.map((c) => [c.id, c]));
  const openEsc = escalations
    .filter((e) => e.state === "open")
    .sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest waiting first

  const needsRows: TodayNeedsRowVM[] = openEsc.map((e) => {
    const conv = byConv.get(e.conversation_id);

    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : undefined;
    const waitedMs = now.getTime() - new Date(e.created_at).getTime();
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    const closes = win?.open ? tzTime(win.closesAtIso, tz) : null;
    return {
      id: `th-${e.conversation_id}`,
      conversationId: e.conversation_id,
      escalationId: e.id,
      who: conv ? contactName(conv) : "Unknown",
      reason: ESCALATION_REASON_LABELS[e.reason] ?? e.reason,
      waited: formatWaited(waitedMs),
      warn: waitedMs > 30 * 60000,
      // her own words, never a generated characterization of them
      quote: lastCustomer ? messageText(lastCustomer).slice(0, 110) : "",
      meta: conv ? contactMeta(conv) : "WhatsApp",
      windowNote: closes ? `Reply window closes ${closes}` : null,
      to: `inbox/th-${e.conversation_id}`,
    };
  });

  // Threads where the customer spoke last and the free-reply window is running
  // out. Rendered ONLY when at least one qualifies — an empty deadline board
  // manufactures anxiety on a calm day.
  const escSet = new Set(openEsc.map((e) => e.conversation_id));
  const closingRows = conversations
    .filter((c) => {
      if (escSet.has(c.id)) return false;
      const last = c.messages[c.messages.length - 1];
      if (!last || last.sender !== "customer") return false;
      const w = waWindow(c.last_wa_inbound_at, now);
      return w.open && w.closesAtIso
        ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * 3600 * 1000
        : false;
    })
    .map((c) => {
      const w = waWindow(c.last_wa_inbound_at, now);
      const mins = w.closesAtIso
        ? Math.max(1, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / 60000))
        : 0;
      return {
        id: `wc-${c.id}`,
        text: `${contactName(c)} — window closes ${tzTime(w.closesAtIso, tz) ?? "soon"} (in ${formatWaited(mins * 60000)})`,
        to: `inbox/th-${c.id}`,
      };
    });

  const sinceMs = new Date(m.window.since).getTime();
  const callsInWindow = calls.filter(
    (c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs,
  );
  const callMinutes = Math.round(p.call_seconds / 60);

  const traffic = p.messages_in + p.calls + p.messages_out_you;
  const isQuiet = traffic === 0 && live.escalations_open === 0 && !alert;

  // The hero's stat strip is part of the design and always renders — a zero
  // is a real measurement, and "—" is a real "not enough data yet". What
  // never appears is a delta, a percentage, or a sparkline: a jump from 1
  // message to 3 is not "+200%", and the mockup's own delta logic painted a
  // FASTER reply time red.
  const facts: TodayFactVM[] = [
    { label: "Messages in", value: String(p.messages_in) },
    { label: "Answered by the receptionist", value: `${p.answered_by_ai} of ${p.messages_in}` },
    p.median_reply_seconds_ai === null
      ? { label: "Typical reply time", value: "—", hint: "Not enough replies yet" }
      : { label: "Typical reply time", value: secondsPhrase(p.median_reply_seconds_ai) },
    { label: "Calls", value: p.calls ? `${p.calls}${callMinutes ? ` · ${callMinutes} min` : ""}` : "0" },
  ];
  const pulse = p.messages_in > 0 ? { num: p.answered_by_ai, den: p.messages_in } : null;

  /* ---- the quiet day: prove we are listening, don't show a row of zeroes ---- */
  if (isQuiet) {
    const lastIn = tzDayAndTime(live.last_inbound_at, tz, now);
    const gap =
      live.last_outbound_at && live.last_inbound_at &&
      new Date(live.last_outbound_at) > new Date(live.last_inbound_at)
        ? Math.round(
            (new Date(live.last_outbound_at).getTime() - new Date(live.last_inbound_at).getTime()) / 1000,
          )
        : null;
    const names = m.channels.map((c) => CHANNEL_LABEL[c.kind] ?? c.kind).join(" and ");
    const plural = m.channels.length > 1 ? "are" : "is";
    const sub = lastIn
      ? `${names} ${plural} connected. The last message arrived ${lastIn}${
          gap !== null && gap > 0 && gap < 3600
            ? `, and the receptionist answered ${secondsPhrase(gap)} later.`
            : "."
        }`
      : `${names} ${plural} connected. No messages have arrived yet.`;
    return {
      standing: {
        eyebrow: `${datePart} · ${clock} · ${m.workspace.name}`,
        chips,
        alert: null,
        greeting,
        headline: "Nothing has come in yet today.",
        detail: null,
        tone: "calm",
      },
      needsYou: null,
      windowClosing: null,
      recap: { label: "Today so far", sentences: [], facts, receipts: [] },
      pulse: null,
      calls: null,
      launchpad: [{ label: "Conversations", to: "conversations" }],
      updatedAt: clock,
      quiet: {
        headline: "Nothing has come in yet today.",
        sub,
        proof: [
          ...m.channels.map((c) => ({
            label: CHANNEL_LABEL[c.kind] ?? c.kind,
            value: `${c.number ?? "connected"} · ${c.status}`,
          })),
          { label: "Checked", value: "just now" },
        ],
        launchpad: conversations.length
          ? {
              label: `Nothing waiting. ${conversations.length} earlier conversation${
                conversations.length === 1 ? "" : "s"
              } →`,
              to: "conversations",
            }
          : null,
      },
    };
  }

  /* ---- headline ladder: first match wins ---- */
  const oldest = tzTime(live.oldest_open_escalation_at, tz);
  let headline: string;
  let detail: string | null = null;
  let tone: "needs" | "calm" | "alert" = "calm";

  if (alert) {
    headline = "Check your connection before anything else.";
    tone = "alert";
  } else if (live.escalations_open > 1) {
    headline = `${live.escalations_open} conversations need you.`;
    if (oldest) detail = `The oldest has been waiting since ${oldest}.`;
    tone = "needs";
  } else if (live.escalations_open === 1) {
    headline = "One conversation needs you";
    const who = needsRows[0]?.who;
    if (who && oldest) detail = `${who} has been waiting since ${oldest}.`;
    tone = "needs";
  } else {
    const bits: string[] = [];
    if (p.messages_in) {
      bits.push(
        `${p.messages_in} message${p.messages_in === 1 ? "" : "s"}${
          p.conversations_active
            ? ` from ${p.conversations_active} ${p.conversations_active === 1 ? "person" : "people"}`
            : ""
        }`,
      );
    }
    if (p.calls) bits.push(`${p.calls} call${p.calls === 1 ? "" : "s"}`);
    headline = bits.length
      ? `The receptionist handled everything — ${bits.join(" and ")} today. Nothing needs you.`
      : "Nothing needs you.";
    if (p.median_reply_seconds_ai !== null && p.messages_in > 0) {
      detail = `It answered ${p.answered_by_ai} of the ${p.messages_in} on its own, typically in about ${secondsPhrase(
        p.median_reply_seconds_ai,
      )}.`;
    }
  }

  /* ---- recap: four facts, no deltas, no sparklines ----
     A jump from 1 message yesterday to 3 today is not "+200%", and the
     mockup's own delta logic painted a FASTER reply time red.

     Sentences carry only what the HEADLINE does not already say. When nothing
     needs you, the headline is "The receptionist handled everything — N
     messages and M calls", so repeating those counts here would be the brief
     reading its own first line back. When something DOES need you, the
     headline is spent on that, and the narrative belongs here instead. */
  const sentences: TodaySentenceVM[] = [];
  const headlineCoversTraffic = tone === "calm" && !alert;
  if (p.answered_by_ai && !headlineCoversTraffic) {
    sentences.push({
      text: `The WhatsApp receptionist answered ${p.answered_by_ai} message${p.answered_by_ai === 1 ? "" : "s"}${
        p.conversations_active
          ? ` from ${p.conversations_active} ${p.conversations_active === 1 ? "person" : "people"}`
          : ""
      }.`,
    });
  }
  if (p.calls && !headlineCoversTraffic) {
    sentences.push({
      text: `${p.calls} caller${p.calls === 1 ? "" : "s"} reached the phone line${
        callMinutes ? ` — ${callMinutes} minute${callMinutes === 1 ? "" : "s"} total` : ""
      }.`,
    });
  }
  if (p.messages_out_you) {
    sentences.push({ text: `You sent ${p.messages_out_you} repl${p.messages_out_you === 1 ? "y" : "ies"} yourself.` });
  }
  // A reply that never reached the customer is the one recap line that must
  // never be quiet — the send already escalated, but the brief saying
  // "handled everything" while a message died in transit would be a lie of
  // omission.
  if (p.send_failures) {
    sentences.push({
      text: `${p.send_failures} repl${p.send_failures === 1 ? "y" : "ies"} failed to deliver — the customer got no answer.`,
      warn: true,
    });
  }

  // Receipts quote the message that actually went out. She is spot-checking
  // tone, not reading a report — a summary of the reply defeats the purpose.
  //
  // Backfilled rows are excluded for the same reason the SQL excludes them:
  // their created_at is the moment the IMPORT ran, so the first live load
  // rendered weeks-old replies as "sent at 1:59 AM today". A receipt whose
  // timestamp is wrong is worse than no receipt.
  const receipts = conversations
    .flatMap((c) =>
      c.messages
        .filter(
          (x) =>
            x.direction === "outbound" &&
            SENT.includes(String(x.status)) &&
            x.meta?.backfill !== true &&
            new Date(x.created_at).getTime() >= sinceMs,
        )
        .map((x) => ({ conv: c, msg: x })),
    )
    .sort((a, b) => b.msg.created_at.localeCompare(a.msg.created_at))
    .slice(0, 3)
    .map(({ conv, msg }) => ({
      at: tzTime(msg.created_at, tz) ?? "",
      text: `replied to ${contactName(conv)}: “${messageText(msg).slice(0, 90)}”`,
      to: `inbox/th-${conv.id}`,
    }));

  /* ---- calls worth an ear: rows ONLY for the ones that need one.
     A call that went fine is a line in the aggregate, not a row demanding
     attention — the whole point of the region is that it stays short. ---- */
  const NEEDS_EAR = ["dial_no_answer", "inactivity", "concurrency_limit_reached", "marked_as_spam"];
  const callRows: TodayCallRowVM[] = callsInWindow
    // A dial that never connected is not a call, so it is not a call worth an ear.
    .filter((c) => c.status !== "not_connected")
    .map((c) => ({ c, vm: toCallVM(c, now) }))
    .filter(
      ({ c, vm }) =>
        vm.live ||
        c.in_voicemail ||
        c.sentiment === "Negative" ||
        !c.summary ||
        (c.disconnection_reason ? NEEDS_EAR.includes(c.disconnection_reason) : false),
    )
    .map(({ c, vm }) => {
      const endedMs = c.ended_at ? new Date(c.ended_at).getTime() : NaN;
      const analysisDue = !c.summary && Number.isFinite(endedMs) && now.getTime() - endedMs < ANALYSIS_GRACE_MS;
      return {
        id: c.id,
        who: vm.who,
        at: tzTime(c.started_at, tz) ?? "",
        duration: vm.duration ?? "",
        note: vm.live
          ? "In progress right now"
          : c.in_voicemail
            ? "Reached voicemail"
            : c.sentiment === "Negative"
              ? "Caller sentiment: Negative — the voice provider's own read"
              : analysisDue
                ? "Summary on its way from the voice provider"
                : !c.summary
                  ? "No summary from the voice provider"
                  : (DISCONNECTION_LABELS[c.disconnection_reason ?? ""] ?? "Ended early"),
        to: vm.live ? "live" : `conversations/cv-${c.id}`,
      };
    });

  return {
    standing: {
      eyebrow: `${datePart} · ${clock} · ${m.workspace.name}`,
      chips,
      alert,
      greeting,
      headline,
      detail,
      tone,
    },
    needsYou: {
      count: live.escalations_open,
      hint: "The receptionist stopped and asked for a human.",
      rows: needsRows,
      empty: needsRows.length
        ? null
        : "Nothing is waiting on you. The receptionist answered every message that came in, and nobody asked for a person.",
    },
    windowClosing: closingRows.length
      ? {
          label: "Reply window closing",
          hint: "WhatsApp only lets you write freely for 24 hours after someone messages you. After that it's an approved template.",
          rows: closingRows,
        }
      : null,
    recap: { label: "Today so far", sentences, facts, receipts },
    pulse,
    calls: p.calls
      ? {
          line: `${p.calls} call${p.calls === 1 ? "" : "s"} today${
            callMinutes ? ` · ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""
          }.`,
          rows: callRows,
        }
      : null,
    launchpad: [
      { label: `Inbox — ${live.escalations_open} need you`, to: "inbox" },
      { label: "Conversations", to: "conversations" },
      ...(p.calls ? [{ label: `Calls — ${p.calls} today`, to: "conversations/phone" }] : []),
    ],
    updatedAt: clock,
    quiet: null,
  };
}

/**
 * The brief's rows, each read from the facts (today-facts.ts): Ask's needs-you rows, the closing windows, who is
 * waiting with nothing back, the receipts, and the calls worth an ear. The queue that draws them in one grammar is
 * today-queue.ts.
 */
import { standingOf } from "../conversations/standing";
import { abandonedCall, DISCONNECTION_LABELS, type CallDto } from "../conversations/call-dto";
import { toCallVM, spokenDuration } from "../conversations/call-vm";
import { ESCALATION_REASON_LABELS } from "../conversations/escalations";
import { messageText } from "../conversations/message-words";
import { threadChannelWords } from "../conversations/thread-channel";
import { formatWaited } from "../conversations/thread-clock";
import { contactName, contactMeta } from "../conversations/thread-contact";
import { waWindow } from "../config/policy";
import { ANALYSIS_GRACE_MS } from "../voice/live";
import { MIN_MS, HOUR_MS } from "../shared/time";
import { tzClock, tzTime } from "./today-clock";
import type { TodayFacts } from "./today-facts";
import type { TodayCallRowVM, TodayNeedsRowVM, TodayNoReplyVM, TodayVM } from "./today-vm";

/** A string with words in it, trimmed; anything else is "". */
export const say = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

/** Ask's rows: the same escalations the queue draws, read once. */
function todayNeedsRows(f: TodayFacts): TodayNeedsRowVM[] {
  return f.escRecords.map((r) => ({
    id: `th-${r.e.conversation_id}`,
    conversationId: r.e.conversation_id,
    escalationId: r.e.id,
    who: r.who,
    reason: ESCALATION_REASON_LABELS[r.e.reason] ?? r.e.reason,
    waited: formatWaited(r.waitedMs),
    warn: r.warn,
    // The customer's words; for a call-back with none, the to-do the phone receptionist left.
    quote: r.quote || (r.e.reason === "callback" ? say(r.e.details) : ""),
    // A call-back is the phone's, whatever wire the thread's words travelled; the queue's row says "Phone" too.
    meta:
      r.e.reason === "callback"
        ? r.conv
          ? contactMeta(r.conv, "Phone")
          : "Phone"
        : r.conv
          ? contactMeta(r.conv, threadChannelWords(r.conv.messages))
          : "WhatsApp",
    windowNote: r.closes ? `Reply window closes ${r.closes}` : null,
    to: `inbox/th-${r.e.conversation_id}`,
  }));
}

/** Everything Ask reads about who needs you: the count, the rows, and what an empty list means. */
export function todayNeedsYou(f: TodayFacts): NonNullable<TodayVM["needsYou"]> {
  const rows = todayNeedsRows(f);
  const { period } = f;
  return {
    count: f.needsYouCount,
    hint: "The receptionist stopped and asked for a human.",
    rows,
    empty: rows.length
      ? null
      : period.unanswered_in_window === 0 && period.messages_out_you === 0
        ? "Nothing needs you. The receptionist answered every message that came in, and nobody asked for a person."
        : "Nothing needs you right now — nobody asked for a person.",
  };
}

/** The closing windows as a band: one line each, and nothing at all when none is closing. */
export function todayWindowClosing(f: TodayFacts): TodayVM["windowClosing"] {
  const { closingConvs, tz, now } = f;
  const rows = closingConvs.map((c) => {
    const w = waWindow(c.last_wa_inbound_at, now);
    const mins = w.closesAtIso
      ? Math.max(1, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / MIN_MS))
      : 0;
    return {
      id: `wc-${c.id}`,
      text: `${contactName(c)} — window closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} (in ${formatWaited(mins * MIN_MS)})`,
      to: `inbox/th-${c.id}`,
    };
  });
  return rows.length
    ? {
        label: "Reply window closing",
        hint: "WhatsApp only lets you write freely for 24 hours after someone messages you. After that it's an approved template.",
        rows,
      }
    : null;
}

/** A message with nothing back for this long is one nobody answered; the receptionist answers in seconds. */
export const NO_REPLY_AFTER_MS = HOUR_MS;

/**
 * Who is waiting with nothing back: the customer wrote last an hour ago or more, nobody replied, nobody holds the
 * thread (the one rule, standing.ts: a thread a person paused or claimed is not waiting on nobody), and no queue
 * row is about it (an escalation's thread and a closing window's thread are the queue's; nothing on this page is
 * said twice). The identity was in the conversations read all along and only the count survived into the view model.
 */
export function todayNoReply(f: TodayFacts): TodayNoReplyVM[] {
  const { conversations, escSet, closingConvs, now } = f;
  const closingSet = new Set(closingConvs.map((c) => c.id));
  return conversations
    .flatMap((c) => {
      // Archived is filed away, which standingOf reads as quiet; it is not waiting on anybody.
      if (escSet.has(c.id) || closingSet.has(c.id) || c.state === "archived") return [];
      const { standing } = standingOf(
        {
          state: c.state,
          paused_until: c.paused_until,
          assignee_user_id: c.assignee_user_id,
          assignee_is_me: c.assignee_is_me,
          open_escalation: false,
        },
        now.getTime(),
      );
      if (standing !== "quiet" && standing !== "needs_you") return [];
      const last = c.messages[c.messages.length - 1];
      if (!last || last.sender !== "customer") return [];
      const lastMs = new Date(last.created_at).getTime();
      if (now.getTime() - lastMs < NO_REPLY_AFTER_MS) return [];
      return [{ conversationId: c.id, who: contactName(c), sinceMs: lastMs, to: `inbox/th-${c.id}` }];
    })
    .sort((a, b) => a.sinceMs - b.sinceMs);
}

const SENT = ["sent", "delivered", "read"];

/**
 * Receipts quote the message that actually went out. She is spot-checking
 * tone, not reading a report — a summary of the reply defeats the purpose.
 *
 * Backfilled rows are excluded for the same reason the SQL excludes them:
 * their created_at is the moment the IMPORT ran, so the first live load
 * rendered weeks-old replies as "sent at 1:59 AM today". A receipt whose
 * timestamp is wrong is worse than no receipt.
 */
export function todayReceipts(f: TodayFacts): NonNullable<TodayVM["recap"]>["receipts"] {
  const { conversations, sinceMs, tz } = f;
  return conversations
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
}

/* ---- calls worth an ear: rows ONLY for the ones that need one.
   A call that went fine is a line in the aggregate, not a row demanding
   attention — the whole point of the region is that it stays short. ---- */
const NEEDS_EAR = ["dial_no_answer", "inactivity", "concurrency_limit_reached", "marked_as_spam"];

/** What a call worth an ear says under its name: the first of these that is true. */
function callNote(c: CallDto, live: boolean | undefined, analysisDue: boolean): string {
  if (live) return "In progress right now";
  if (c.in_voicemail) return "Reached voicemail";
  // BEFORE the summary branches, deliberately. A caller gone in six
  // seconds has no summary and never will have much of one, so the
  // chain below would have said "summary on its way" and buried the
  // only fact worth acting on.
  if (abandonedCall(c)) return `Hung up after ${spokenDuration(c.duration_ms)} — they left with nothing`;
  if (c.sentiment === "Negative") return "Caller sentiment: Negative — the voice provider's own read";
  if (analysisDue) return "Summary on its way from the voice provider";
  if (!c.summary) return "No summary from the voice provider";
  return DISCONNECTION_LABELS[c.disconnection_reason ?? ""] ?? "Ended early";
}

export function todayCallRows(f: TodayFacts): TodayCallRowVM[] {
  const { callsInWindow, tz, now } = f;
  return (
    callsInWindow
      // A dial that never connected is not a call, so it is not a call worth an ear.
      .filter((c) => c.status !== "not_connected")
      .map((c) => ({ c, vm: toCallVM(c, tz, now) }))
      .filter(
        ({ c, vm }) =>
          vm.live ||
          c.in_voicemail ||
          c.sentiment === "Negative" ||
          !c.summary ||
          // Somebody rang and left with nothing. Measured before writing this:
          // with a provider summary the row was not worth an ear at all, since
          // `user_hangup` is not in NEEDS_EAR and rightly so — every ordinary
          // call ends that way. Without one it did arrive, as "No summary from
          // the voice provider", which reads as our glitch rather than as the
          // day's one lost customer whose number the business already has.
          abandonedCall(c) ||
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
          note: callNote(c, vm.live, analysisDue),
          to: vm.live ? "live" : `conversations/cv-${c.id}`,
        };
      })
  );
}

/** The calls band: the day's count and minutes as one line over the rows worth an ear; null on a day with no call. */
export function todayCalls(f: TodayFacts, rows: TodayCallRowVM[]): TodayVM["calls"] {
  const { period, callMinutes } = f;
  return period.calls
    ? {
        line: `${period.calls} call${period.calls === 1 ? "" : "s"} today${
          callMinutes ? ` · ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""
        }.`,
        rows,
      }
    : null;
}

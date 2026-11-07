/**
 * The brief's rows, each read from the facts (today/facts.ts): Ask's needs-you rows, the closing windows, who is
 * waiting with nothing back, the receipts, and the calls worth an ear. The queue that draws them in one grammar is
 * today/queue.ts.
 */
import { CALL_ENDINGS_NEEDING_AN_EAR } from "../voice/call-endings";
import { addressOf } from "../activity/record-address";
import { abandonedCall, endedHowOf, neverConnected, reachedVoicemail, type CallDto } from "../conversations/call-dto";
import { toCallVM, spokenDuration } from "../conversations/call-vm";
import { reasonLabelOf } from "../conversations/escalations";
import { messageAuthor } from "../conversations/message-author";
import { messageText } from "../conversations/message-words";
import { threadChannelWords } from "../conversations/thread-channel";
import { formatWaited } from "../conversations/thread-clock";
import { contactName, contactMeta } from "../conversations/thread-contact";
import { waWindow } from "../config/policy/prices";
import { ANALYSIS_GRACE_MS } from "../voice/live";
import { MIN_MS, HOUR_MS } from "../shared/time";
import { tzClock, tzTime } from "./clock";
import type { TodayFacts } from "./facts";
import type { TodayCallRowVM, TodayNeedsRowVM, TodayNoReplyVM, TodayVM } from "./vm";

/** A string with words in it, trimmed; anything else is "". */
export const say = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : "");

/** Ask's rows: the same escalations the queue draws, read once. */
function todayNeedsRows(todayFacts: TodayFacts): TodayNeedsRowVM[] {
  const holds = todayFacts.escRecords.map((escRecord) => ({
    id: `th-${escRecord.e.conversation_id}`,
    conversationId: escRecord.e.conversation_id,
    escalationId: escRecord.e.id,
    who: escRecord.who,
    reason: reasonLabelOf(escRecord.e.reason),
    waited: formatWaited(escRecord.waitedMs),
    warn: escRecord.warn,
    // The customer's words; for a call-back with none, the to-do the phone receptionist left.
    quote: escRecord.quote || (escRecord.e.reason === "callback" ? say(escRecord.e.details) : ""),
    // A call-back is the phone's, whatever wire the thread's words travelled; the queue's row says "Phone" too.
    meta:
      escRecord.e.reason === "callback"
        ? escRecord.conv
          ? contactMeta(escRecord.conv, "Phone")
          : "Phone"
        : escRecord.conv
          ? contactMeta(escRecord.conv, threadChannelWords(escRecord.conv.messages))
          : "WhatsApp",
    windowNote: escRecord.closes ? `Reply window closes ${escRecord.closes}` : null,
    to: addressOf({ kind: "hold", conversationId: escRecord.e.conversation_id }),
  }));
  // Who the rule says waits with no hold open: Ask named a count of three over a list of one.
  const owed = todayFacts.owed.map(({ conv, who, waitedMs, word, quote }) => ({
    id: `th-${conv.id}`,
    conversationId: conv.id,
    escalationId: null,
    who,
    reason: word,
    waited: formatWaited(waitedMs),
    warn: waitedMs > 30 * MIN_MS,
    quote,
    meta: contactMeta(conv, threadChannelWords(conv.messages)),
    windowNote: null,
    to: addressOf({ kind: "conversation", id: conv.id }),
  }));
  return [...holds, ...owed];
}

/** Everything Ask reads about who needs you: the count, the rows, and what an empty list means. */
export function todayNeedsYou(todayFacts: TodayFacts): NonNullable<TodayVM["needsYou"]> {
  const rows = todayNeedsRows(todayFacts);
  const { period } = todayFacts;
  return {
    count: todayFacts.needsYouCount,
    holds: todayFacts.waits.holds,
    sends: todayFacts.waits.sends,
    hint: "The receptionist stopped and asked for a human.",
    rows,
    // Said only when nothing waits: a reply counting down to send is counted (threadsWaitingOnYou) and has no row here.
    empty: todayFacts.needsYouCount
      ? null
      : period.unanswered_in_window === 0 && period.messages_out_you === 0
        ? "Nothing needs you. The receptionist answered every message that came in, and nobody asked for a person."
        : "Nothing needs you right now — nobody asked for a person.",
  };
}

/** The closing windows as a band: one line each, and nothing at all when none is closing. */
export function todayWindowClosing(todayFacts: TodayFacts): TodayVM["windowClosing"] {
  const { closingConvs, tz, now } = todayFacts;
  const rows = closingConvs.map((closingConv) => {
    const result = waWindow(closingConv.last_wa_inbound_at, now);
    const mins = result.closesAtIso
      ? Math.max(1, Math.round((new Date(result.closesAtIso).getTime() - now.getTime()) / MIN_MS))
      : 0;
    return {
      id: `wc-${closingConv.id}`,
      text: `${contactName(closingConv)} — window closes ${tzClock(result.closesAtIso, tz, now) ?? "soon"} (in ${formatWaited(mins * MIN_MS)})`,
      to: addressOf({ kind: "conversation", id: closingConv.id }),
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
 * Who is waiting with nothing back: the rule says nobody has answered them (thread-move.ts `unanswered`), an hour ago or
 * more, and neither a hold's row nor a closing window's is about them. The identity was in the conversations read all
 * along and only the count survived into the view model.
 */
export function todayNoReply(todayFacts: TodayFacts): TodayNoReplyVM[] {
  return todayFacts.owed.flatMap(({ conv, move, who, waitedMs }) =>
    move.move === "unanswered" && move.sinceMs !== undefined && waitedMs >= NO_REPLY_AFTER_MS
      ? [{ conversationId: conv.id, who, sinceMs: move.sinceMs, to: addressOf({ kind: "conversation", id: conv.id }) }]
      : [],
  );
}

const SENT = ["sent", "delivered", "read"];

/**
 * Receipts quote the message that actually went out. She is spot-checking
 * tone, not reading a report — a summary of the reply defeats the purpose.
 * It is the receptionist's tone she checks, so a receipt is one of its replies (messageAuthor, the one statement of
 * who sent a message): not a person's own reply (the sentence over the receipts,
 * "You sent N replies yourself", is where those are said), and not a campaign's send or a system note.
 *
 * Backfilled rows are excluded for the same reason the SQL excludes them:
 * their created_at is the moment the IMPORT ran, so the first live load
 * rendered weeks-old replies as "sent at 1:59 AM today". A receipt whose
 * timestamp is wrong is worse than no receipt.
 */
export function todayReceipts(todayFacts: TodayFacts): NonNullable<TodayVM["recap"]>["receipts"] {
  const { conversations, sinceMs, tz } = todayFacts;
  return conversations
    .flatMap((conversation) =>
      conversation.messages
        .filter(
          (x) =>
            x.direction === "outbound" &&
            messageAuthor(x)?.kind === "receptionist" &&
            SENT.includes(String(x.status)) &&
            x.meta?.backfill !== true &&
            new Date(x.created_at).getTime() >= sinceMs,
        )
        .map((x) => ({ conv: conversation, msg: x })),
    )
    .sort((a, b) => b.msg.created_at.localeCompare(a.msg.created_at))
    .slice(0, 3)
    .map(({ conv, msg }) => ({
      at: tzTime(msg.created_at, tz) ?? "",
      text: `replied to ${contactName(conv)}: “${messageText(msg).slice(0, 90)}”`,
      to: addressOf({ kind: "conversation", id: conv.id }),
    }));
}

/* ---- calls worth an ear: rows ONLY for the ones that need one.
   A call that went fine is a line in the aggregate, not a row demanding
   attention — the whole point of the region is that it stays short. ---- */
/** The endings that leave a call worth an ear (voice/call-endings.ts): somebody rang and was not served. */
const NEEDS_EAR: readonly string[] = CALL_ENDINGS_NEEDING_AN_EAR;

/** What a call worth an ear says under its name: the first of these that is true. */
function callNote(call: CallDto, live: boolean | undefined, analysisDue: boolean): string {
  if (live) return "In progress right now";
  if (reachedVoicemail(call)) return "Reached voicemail";
  // BEFORE the summary branches, deliberately. A caller gone in six
  // seconds has no summary and never will have much of one, so the
  // chain below would have said "summary on its way" and buried the
  // only fact worth acting on.
  if (abandonedCall(call)) return `Hung up after ${spokenDuration(call.duration_ms)} — they left with nothing`;
  if (call.sentiment === "Negative") return "Caller sentiment: Negative — the voice provider's own read";
  if (analysisDue) return "Summary on its way from the voice provider";
  if (!call.summary) return "No summary from the voice provider";
  return endedHowOf(call) ?? "Ended early";
}

export function todayCallRows(todayFacts: TodayFacts): TodayCallRowVM[] {
  const { callsInWindow, tz, now } = todayFacts;
  return (
    callsInWindow
      // A dial that never connected is not a call, so it is not a call worth an ear.
      .filter((c) => !neverConnected(c))
      .map((c) => ({ c, vm: toCallVM(c, tz, now) }))
      .filter(
        ({ c, vm }) =>
          vm.live ||
          reachedVoicemail(c) ||
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
export function todayCalls(todayFacts: TodayFacts, rows: TodayCallRowVM[]): TodayVM["calls"] {
  const { period, callMinutes } = todayFacts;
  return period.calls
    ? {
        line: `${period.calls} call${period.calls === 1 ? "" : "s"} today${
          callMinutes ? ` · ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""
        }.`,
        rows,
      }
    : null;
}

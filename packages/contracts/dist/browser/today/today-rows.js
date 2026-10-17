import { addressOf } from "../activity/record-address.js";
import { standingOfThread } from "../conversations/standing.js";
import { abandonedCall, endedHowOf, neverConnected, reachedVoicemail } from "../conversations/call-dto.js";
import { toCallVM, spokenDuration } from "../conversations/call-vm.js";
import { reasonLabelOf } from "../conversations/escalations.js";
import { messageAuthor } from "../conversations/message-author.js";
import { lastExchanged, messageText } from "../conversations/message-words.js";
import { isTheirOwnWords, threadChannelWords } from "../conversations/thread-channel.js";
import { formatWaited } from "../conversations/thread-clock.js";
import { contactName, contactMeta } from "../conversations/thread-contact.js";
import { isOptedOut } from "../conversations/thread-dto.js";
import { waWindow } from "../config/policy.js";
import { ANALYSIS_GRACE_MS } from "../voice/live.js";
import { MIN_MS, HOUR_MS } from "../shared/time.js";
import { tzClock, tzTime } from "./today-clock.js";
export const say = (v) => typeof v === "string" && v.trim() ? v.trim() : "";
function todayNeedsRows(f) {
  return f.escRecords.map((r) => ({
    id: `th-${r.e.conversation_id}`,
    conversationId: r.e.conversation_id,
    escalationId: r.e.id,
    who: r.who,
    reason: reasonLabelOf(r.e.reason),
    waited: formatWaited(r.waitedMs),
    warn: r.warn,
    // The customer's words; for a call-back with none, the to-do the phone receptionist left.
    quote: r.quote || (r.e.reason === "callback" ? say(r.e.details) : ""),
    // A call-back is the phone's, whatever wire the thread's words travelled; the queue's row says "Phone" too.
    meta: r.e.reason === "callback" ? r.conv ? contactMeta(r.conv, "Phone") : "Phone" : r.conv ? contactMeta(r.conv, threadChannelWords(r.conv.messages)) : "WhatsApp",
    windowNote: r.closes ? `Reply window closes ${r.closes}` : null,
    to: addressOf({ kind: "hold", conversationId: r.e.conversation_id })
  }));
}
export function todayNeedsYou(f) {
  const rows = todayNeedsRows(f);
  const { period } = f;
  return {
    count: f.needsYouCount,
    holds: f.waits.holds,
    sends: f.waits.sends,
    hint: "The receptionist stopped and asked for a human.",
    rows,
    // Said only when nothing waits: a reply counting down to send is counted (threadsWaitingOnYou) and has no row here.
    empty: f.needsYouCount ? null : period.unanswered_in_window === 0 && period.messages_out_you === 0 ? "Nothing needs you. The receptionist answered every message that came in, and nobody asked for a person." : "Nothing needs you right now \u2014 nobody asked for a person."
  };
}
export function todayWindowClosing(f) {
  const { closingConvs, tz, now } = f;
  const rows = closingConvs.map((c) => {
    const w = waWindow(c.last_wa_inbound_at, now);
    const mins = w.closesAtIso ? Math.max(1, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / MIN_MS)) : 0;
    return {
      id: `wc-${c.id}`,
      text: `${contactName(c)} \u2014 window closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} (in ${formatWaited(mins * MIN_MS)})`,
      to: addressOf({ kind: "conversation", id: c.id })
    };
  });
  return rows.length ? {
    label: "Reply window closing",
    hint: "WhatsApp only lets you write freely for 24 hours after someone messages you. After that it's an approved template.",
    rows
  } : null;
}
export const NO_REPLY_AFTER_MS = HOUR_MS;
export function todayNoReply(f) {
  const { conversations, escSet, closingConvs, now } = f;
  const closingSet = new Set(closingConvs.map((c) => c.id));
  return conversations.flatMap((c) => {
    if (escSet.has(c.id) || closingSet.has(c.id) || c.state === "archived" || isOptedOut(c)) return [];
    const { standing } = standingOfThread(c, false, now.getTime());
    if (standing !== "quiet" && standing !== "needs_you") return [];
    const last = lastExchanged(c.messages);
    if (!last || !isTheirOwnWords(last)) return [];
    const lastMs = new Date(last.created_at).getTime();
    if (now.getTime() - lastMs < NO_REPLY_AFTER_MS) return [];
    return [
      {
        conversationId: c.id,
        who: contactName(c),
        sinceMs: lastMs,
        to: addressOf({ kind: "conversation", id: c.id })
      }
    ];
  }).sort((a, b) => a.sinceMs - b.sinceMs);
}
const SENT = ["sent", "delivered", "read"];
export function todayReceipts(f) {
  const { conversations, sinceMs, tz } = f;
  return conversations.flatMap(
    (c) => c.messages.filter(
      (x) => x.direction === "outbound" && messageAuthor(x)?.kind === "receptionist" && SENT.includes(String(x.status)) && x.meta?.backfill !== true && new Date(x.created_at).getTime() >= sinceMs
    ).map((x) => ({ conv: c, msg: x }))
  ).sort((a, b) => b.msg.created_at.localeCompare(a.msg.created_at)).slice(0, 3).map(({ conv, msg }) => ({
    at: tzTime(msg.created_at, tz) ?? "",
    text: `replied to ${contactName(conv)}: \u201C${messageText(msg).slice(0, 90)}\u201D`,
    to: addressOf({ kind: "conversation", id: conv.id })
  }));
}
const NEEDS_EAR = ["dial_no_answer", "inactivity", "concurrency_limit_reached", "marked_as_spam"];
function callNote(c, live, analysisDue) {
  if (live) return "In progress right now";
  if (reachedVoicemail(c)) return "Reached voicemail";
  if (abandonedCall(c)) return `Hung up after ${spokenDuration(c.duration_ms)} \u2014 they left with nothing`;
  if (c.sentiment === "Negative") return "Caller sentiment: Negative \u2014 the voice provider's own read";
  if (analysisDue) return "Summary on its way from the voice provider";
  if (!c.summary) return "No summary from the voice provider";
  return endedHowOf(c) ?? "Ended early";
}
export function todayCallRows(f) {
  const { callsInWindow, tz, now } = f;
  return callsInWindow.filter((c) => !neverConnected(c)).map((c) => ({ c, vm: toCallVM(c, tz, now) })).filter(
    ({ c, vm }) => vm.live || reachedVoicemail(c) || c.sentiment === "Negative" || !c.summary || // Somebody rang and left with nothing. Measured before writing this:
    // with a provider summary the row was not worth an ear at all, since
    // `user_hangup` is not in NEEDS_EAR and rightly so — every ordinary
    // call ends that way. Without one it did arrive, as "No summary from
    // the voice provider", which reads as our glitch rather than as the
    // day's one lost customer whose number the business already has.
    abandonedCall(c) || (c.disconnection_reason ? NEEDS_EAR.includes(c.disconnection_reason) : false)
  ).map(({ c, vm }) => {
    const endedMs = c.ended_at ? new Date(c.ended_at).getTime() : NaN;
    const analysisDue = !c.summary && Number.isFinite(endedMs) && now.getTime() - endedMs < ANALYSIS_GRACE_MS;
    return {
      id: c.id,
      who: vm.who,
      at: tzTime(c.started_at, tz) ?? "",
      duration: vm.duration ?? "",
      note: callNote(c, vm.live, analysisDue),
      to: vm.live ? "live" : `conversations/cv-${c.id}`
    };
  });
}
export function todayCalls(f, rows) {
  const { period, callMinutes } = f;
  return period.calls ? {
    line: `${period.calls} call${period.calls === 1 ? "" : "s"} today${callMinutes ? ` \xB7 ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""}.`,
    rows
  } : null;
}

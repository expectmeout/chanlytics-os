import { reachedVoicemail } from "../conversations/call-dto.js";
import { toCallVM } from "../conversations/call-vm.js";
import { reasonWhy } from "../conversations/escalations.js";
import { isPersonsWords } from "../conversations/message-author.js";
import { threadChannelWords } from "../conversations/thread-channel.js";
import { contactName } from "../conversations/thread-contact.js";
import { capitalize, plural } from "../shared/words.js";
import { andList, secondsPhrase, speedClause } from "./today-bands.js";
import { tzClock, tzDayAndTime } from "./today-clock.js";
import { todayReplySpeed } from "./today-metrics.js";
const COUNT_WORDS = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine"
};
const countWord = (n) => COUNT_WORDS[n] ?? String(n);
const timesWords = (n) => n === 1 ? "once" : n === 2 ? "twice" : `${countWord(n)} times`;
const wireWord = (w) => w === "WhatsApp" ? w : w.toLowerCase();
const counted = (o) => Object.entries(o ?? {}).map(([k, v]) => [k, Math.max(0, Math.round(Number(v) || 0))]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const tally = (xs) => counted(xs.reduce((o, x) => ({ ...o, [x]: (o[x] ?? 0) + 1 }), {}));
const UNNAMED_CALLER = /* @__PURE__ */ new Set(["Caller ID withheld", "Unknown caller", "Unknown"]);
function replyGapSeconds(live) {
  if (!live.last_outbound_at || !live.last_inbound_at) return null;
  const gap = Math.round((new Date(live.last_outbound_at).getTime() - new Date(live.last_inbound_at).getTime()) / 1e3);
  return gap > 0 && gap < 3600 ? gap : null;
}
export function todayProof(live, tz, now) {
  const lastIn = tzDayAndTime(live.last_inbound_at, tz, now);
  if (!lastIn) return "No messages have arrived yet.";
  const gap = replyGapSeconds(live);
  return `The last message arrived ${lastIn}${gap !== null ? `, and the receptionist answered ${secondsPhrase(gap)} later` : ""}.`;
}
const isCustomerMessage = (x) => x.direction === "inbound" && x.sender === "customer" && isPersonsWords(x.meta);
export function figuresOf(m, conversations, callsInWindow, escalations, tz, now) {
  const p = m.period;
  const live = m.now;
  if (p.messages_in + p.calls + p.new_contacts === 0) return null;
  const windowMs = new Date(m.window.since).getTime();
  const fresh = (x) => x.meta?.backfill !== true && new Date(x.created_at).getTime() >= windowMs;
  const gap = replyGapSeconds(live);
  const lastAt = tzClock(live.last_inbound_at, tz, now);
  const wires = tally(
    conversations.flatMap(
      (c) => c.messages.filter((x) => isCustomerMessage(x) && fresh(x)).map((x) => threadChannelWords([x]))
    )
  );
  const held = wires.reduce((s, [, n]) => s + n, 0);
  const split = andList(wires.map(([w, n]) => `${n} by ${wireWord(w)}`));
  const messages = {
    id: "messages",
    label: "customer messages",
    value: p.messages_in,
    meta: lastAt ? `last at ${lastAt}${gap !== null ? `, answered in ${secondsPhrase(gap)}` : ""}` : "none yet",
    receipt: wires.length ? {
      // What the page holds, said once: never "Of the 4 in the Inbox: 4 by WhatsApp."
      text: held !== p.messages_in ? held === 1 ? `The one the Inbox holds came by ${wireWord(wires[0][0])}.` : wires.length === 1 ? `The ${held} the Inbox holds ${held === 2 ? "both" : "all"} came by ${wireWord(wires[0][0])}.` : `Of the ${held} in the Inbox: ${split}.` : wires.length === 1 ? `All by ${wireWord(wires[0][0])}.` : `${split}.`,
      door: { label: "Open the Inbox", to: "inbox" }
    } : null
  };
  const todays = escalations.filter((e) => e.state === "open" && new Date(e.created_at).getTime() >= windowMs);
  const reasons = tally(todays.map((e) => e.reason));
  const resolved = Math.max(0, p.escalations_new - todays.length);
  const answeredMeta = [
    speedClause(todayReplySpeed(m)),
    p.escalations_new ? `${p.escalations_new} handed over` : p.answered_by_ai ? "none handed over" : ""
  ].filter(Boolean).join(", ") || (p.messages_in ? "none answered yet" : "nothing to answer yet");
  const handedOver = p.escalations_new;
  let handovers = "";
  if (handedOver) {
    const lead = `Handed over ${timesWords(handedOver)}`;
    if (!reasons.length) {
      handovers = `${lead}, ${handedOver === 1 ? "already resolved" : handedOver === 2 ? "both already resolved" : "all already resolved"}.`;
    } else if (reasons.length === 1 && reasons[0][1] === handedOver) {
      const [r, n] = reasons[0];
      handovers = `${lead}, ${n === 1 ? "" : n === 2 ? "both times " : "each time "}${reasonWhy(r)}.`;
    } else {
      const parts = reasons.map(([r, n]) => `${timesWords(n)} ${reasonWhy(r)}`).join(", ");
      const done = resolved ? ` ${capitalize(countWord(resolved))} ${resolved === 1 ? "is" : "are"} already resolved.` : "";
      handovers = `${lead}: ${parts}.${done}`;
    }
  }
  const answeredItself = handedOver && p.answered_by_ai ? "The rest it answered itself." : "";
  const sentMore = p.messages_out_ai > p.answered_by_ai ? `It sent ${plural(p.messages_out_ai, "message")} in all.` : "";
  const sentEach = p.messages_out_ai && p.messages_out_ai === p.answered_by_ai ? "One reply each." : "";
  const answeredWhy = (handedOver ? [handovers, answeredItself, sentMore] : [sentMore || sentEach]).filter(Boolean);
  const answered = {
    id: "answered",
    label: "answered by the receptionist",
    value: p.answered_by_ai,
    meta: answeredMeta,
    receipt: answeredWhy.length ? { text: answeredWhy.join(" "), door: p.escalations_new ? { label: "See the handovers", to: "inbox" } : null } : null
  };
  const moods = counted(p.call_sentiments);
  const moodOf = ([mood, n]) => n === p.calls ? p.calls === 1 ? `it as ${mood.toLowerCase()}` : `all of them as ${mood.toLowerCase()}` : `${n} as ${mood.toLowerCase()}`;
  const moodWords = moods.length ? `The voice provider read ${andList(moods.map(moodOf))}.` : "";
  const voicemail = [
    ...new Map(
      callsInWindow.filter((c) => reachedVoicemail(c)).map((c) => [c.contact_id ?? c.from_e164 ?? c.id, toCallVM(c, tz, now).who])
    ).values()
  ].filter((who) => !UNNAMED_CALLER.has(who));
  const voicemailWords = voicemail.length ? `${andList(voicemail.length > 3 ? [...voicemail.slice(0, 3), `${voicemail.length - 3} more`] : voicemail)} reached voicemail.` : "";
  const callsMeta = [
    p.call_seconds > 0 ? p.call_seconds < 60 ? "under a minute on the phone" : `${Math.round(p.call_seconds / 60)} min on the phone` : "",
    p.calls_voicemail ? `${p.calls_voicemail} to voicemail` : ""
  ].filter(Boolean).join(", ") || (p.calls ? "none connected" : "none yet");
  const calls = {
    id: "calls",
    label: "calls",
    value: p.calls,
    meta: callsMeta,
    receipt: moodWords || voicemailWords ? {
      text: [moodWords, voicemailWords].filter(Boolean).join(" "),
      door: { label: "Open the calls", to: "conversations/phone" }
    } : null
  };
  const newThreads = conversations.filter((c) => {
    const first = [...c.messages].filter((x) => x.meta?.backfill !== true).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return !!first && first.sender === "customer" && fresh(first);
  });
  const agree = p.new_contacts > 0 && newThreads.length === p.new_contacts;
  const newWires = tally(newThreads.map((c) => threadChannelWords(c.messages)));
  const names = agree ? newThreads.map((c) => contactName(c)) : [];
  const said = names.slice(0, 3);
  const newPeople = {
    id: "new",
    label: "new people",
    value: p.new_contacts,
    meta: !p.new_contacts ? "nobody new yet" : !agree ? "first contact today" : newWires.length === 1 ? `${p.new_contacts === 1 ? "on" : p.new_contacts === 2 ? "both on" : "all on"} ${wireWord(newWires[0][0])}` : `on ${andList(newWires.map(([w]) => wireWord(w)))}`,
    // Named when the two counts agree. When they do not, the figure still opens: the reason they disagree IS the answer
    // to what an owner is asking -- the count is everyone whose first message of their own, or first call to us, came
    // today (00394), and the page only holds the ones who wrote. Without this the fourth figure was the one stat on the
    // card with nothing under it, so a hover that worked three times in a row did nothing on the fourth.
    receipt: said.length ? {
      text: `${andList(names.length > 3 ? [...said, `${names.length - 3} more`] : said)} wrote for the first time today.`,
      door: { label: "Open People", to: "clients/seg:new_week" }
    } : p.new_contacts > 0 ? {
      text: `Counted however they reached you \u2014 a message or a call${newThreads.length < p.new_contacts ? ", so not everyone here has a thread to open yet" : ""}.`,
      door: { label: "Open People", to: "clients/seg:new_week" }
    } : null
  };
  return [messages, answered, calls, newPeople];
}
export function quietFigures(live, tz, now) {
  const lastIn = tzDayAndTime(live.last_inbound_at, tz, now);
  return [
    {
      id: "messages",
      label: "customer messages",
      value: 0,
      meta: lastIn ? `none today, the last ${lastIn}` : "none yet",
      receipt: null
    },
    { id: "answered", label: "answered by the receptionist", value: 0, meta: "nothing to answer yet", receipt: null },
    { id: "calls", label: "calls", value: 0, meta: "none yet", receipt: null },
    { id: "new", label: "new people", value: 0, meta: "nobody new yet", receipt: null }
  ];
}

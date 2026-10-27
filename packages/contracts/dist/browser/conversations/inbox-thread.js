import { formatPhoneDisplay } from "../shared/phone.js";
import { replyWhy } from "../config/brain.js";
import { replyWindow, windowClockOf } from "../config/policy.js";
import { needsYouCount, threadWait, threadWaits } from "../waits/waits.js";
import { HELD_WORDS, readingOf, replyWaitsOnYou, standingOfThread } from "./standing.js";
import { messageAt, isOptedOut } from "./thread-dto.js";
import { mayRing } from "../consent/consent.js";
import { agentFor, answerWireOf, isChatMessage, writtenChannelOf, THREAD_CHANNEL_WORDS } from "./thread-channel.js";
import { contactName, contactMeta, emailStoppedWords, initialsOf } from "./thread-contact.js";
import { shortTime, bubbleTime, inboxThreadClock, waitedSince } from "./thread-clock.js";
import { clockDate, clockHistoryDay, clockTime } from "../shared/clock.js";
import { mediaVM } from "./message-media.js";
import { emailLeftOutOf, emailFromNameOf, emailPartsOf, emailSignatureLine, emailSubjectsOf } from "./message-email.js";
import { replyLeftAsOf } from "../reach-out/reach-out-reply-words.js";
import {
  sentFactsOf,
  reachedCustomer,
  lastExchanged,
  isHeldDraft,
  heldDraftOf,
  draftSendsAtMs,
  messageWords,
  messageText,
  clipAtWord
} from "./message-words.js";
import { messageVia, messageAuthor, messageWhy, lastWordLine } from "./message-author.js";
import { openHoldAct, reasonLabelOf, reasonSummaryOf, waitsOnAPerson } from "./escalations.js";
export function threadStanding(dto, escalation, now = /* @__PURE__ */ new Date()) {
  const v = standingOfThread(dto, escalation, now.getTime());
  const state = v.standing === "snoozed" ? "snoozed" : v.flagged ? "escalated" : "done";
  return { state, takenOver: v.takenOver, needsYou: v.standing === "needs_you", claimedByOther: v.claimedByOther };
}
export function conversationWaitsOnYou(dto, escalation, now = /* @__PURE__ */ new Date()) {
  return threadWait(waitingThread(dto, escalation, now), now.getTime()) !== null;
}
function waitingThread(dto, escalation, now) {
  const draft = heldDraftOf(dto.messages);
  return {
    needsYou: threadStanding(dto, escalation, now).needsYou,
    send: draft ? { endsAtMs: draftSendsAtMs(draft) } : null
  };
}
export function threadWaitsOf(conversations, escalations, now) {
  const open = new Map(
    escalations.filter((e) => e.state === "open" && waitsOnAPerson(e.reason)).map((e) => [e.conversation_id, e])
  );
  const held = new Set(conversations.map((c) => c.id));
  return threadWaits({
    threads: conversations.map((c) => waitingThread(c, open.get(c.id) ?? null, now)),
    unreadHolds: [...open.keys()].filter((id) => !held.has(id)).length,
    nowMs: now.getTime()
  });
}
export function threadsWaitingOnYou(conversations, escalations, now) {
  return needsYouCount({ ...threadWaitsOf(conversations, escalations, now), runs: 0 });
}
export const HELD_BY_ID_MAX = 100;
export function heldThreadIds(listed, open) {
  const ids = /* @__PURE__ */ new Set();
  const holds = open.filter((e) => (e.state ?? "open") === "open" && !listed.has(e.conversation_id));
  for (const e of holds) if (waitsOnAPerson(e.reason)) ids.add(e.conversation_id);
  for (const e of holds) ids.add(e.conversation_id);
  return [...ids].slice(0, HELD_BY_ID_MAX);
}
export function heldDraftWaits(vm, nowMs) {
  return !!vm.heldDraft && replyWaitsOnYou({ endsAtMs: vm.heldDraft.sendsAtMs }, nowMs);
}
function replyFacts(dto, primaryChannel, tz, now) {
  return {
    optedOut: isOptedOut(dto),
    dnc: !mayRing(dto.contact),
    offersOk: dto.contact.marketing_consent === "opted_in",
    emailStopped: primaryChannel === "email" ? emailStoppedWords(dto.contact, tz, now) : null
  };
}
export function snoozedThreadWords(openRequest) {
  const hidden = "Hidden from your queue. The receptionist still answers, and a new message brings it back.";
  return openRequest ? `${hidden} ${openRequest}. That's still waiting for you.` : hidden;
}
export const THREAD_PANE_WORDS = {
  /** WhatsApp's window, shut: the bar's one quiet fact, and why a press away. */
  chatClosed: "Chat closed",
  chatClosedWhy: "A day after their last message, WhatsApp delivers only an approved message. Sending one reopens the chat.",
  /** Instagram's window, shut: a business may not write at all, and has no approved message to write with. */
  dmClosedWhy: "A day after their last message, Instagram lets you reply only once they write again.",
  /** The dock's acts on a thread left unanswered (THREAD_PANE_WORDS.unanswered). "No reply needed" archives it. */
  call: "Call",
  noReplyNeeded: "No reply needed",
  /** Asked in the dock before a hand back leaves what they wrote with nothing sent. */
  handBackAsk: (first) => `${first}'s message has no answer yet.`,
  handBackWhy: "Handing back sends nothing, and the receptionist won't come back to it.",
  answerFirst: "Answer first",
  handBackAnyway: "Hand back anyway",
  /** A thread you have, as the dock says it, with the one act it takes. */
  yours: "You have it.",
  yoursFact: "The receptionist is quiet",
  /** The reply box on a thread a teammate has: what a reply does. */
  takeFrom: (name) => `Reply to take it from ${name}\u2026`,
  /** Our words that did not send: send them again as they were, or put them in the box. */
  sendAgain: "Send again",
  edit: "Edit",
  /** The template box: what sending one does, what it is filled with, and its picker's head and groups. */
  reopens: "Reopens the chat",
  blank: (label) => label.toLowerCase(),
  pickTitle: (first) => `Reopen the chat with ${first}`,
  pickSub: "After a day, WhatsApp delivers only an approved message.",
  fitsNow: "Fits now",
  others: "Others",
  /** A template of the sample data, said beside its name where its title said "(sample)" (inboxTemplates `sample`). */
  sample: "Sample"
};
const wireOf = (m) => m.type === "call_summary" ? "phone" : writtenChannelOf(m.channel);
function previewOf(messages) {
  const last = [...messages].reverse().find((m) => m.type !== "note" && (m.direction === "inbound" || reachedCustomer(m.status)));
  return last ? { text: messageWords(last).slice(0, 110), channel: wireOf(last) } : { text: "", channel: null };
}
function askOf(escalation, lastInbound) {
  if (!escalation) return null;
  if (escalation.reason === "callback") {
    const text = escalation.details?.trim();
    return text ? { kind: "call", label: "From the call", text, quoted: false, channel: "phone" } : null;
  }
  if (!lastInbound) return null;
  const wrote = lastInbound.type === "text";
  return {
    kind: wrote ? "wrote" : "sent",
    label: wrote ? "They wrote" : "They sent",
    text: messageWords(lastInbound),
    quoted: wrote,
    channel: wireOf(lastInbound)
  };
}
function inboxReading(dto) {
  const { unseen, heardAtMs, markAtMs } = readingOf(dto.last_inbound_at, dto);
  return { unread: unseen, heardAtMs, markAtMs };
}
const clocksOf = (dto) => ({ whatsapp: dto.last_wa_inbound_at, instagram: dto.last_ig_inbound_at });
export function toInboxThreadVM(dto, escalation, tz, now = /* @__PURE__ */ new Date()) {
  const who = contactName(dto);
  const { state, takenOver, needsYou, claimedByOther } = threadStanding(dto, escalation, now);
  const draftMsg = heldDraftOf(dto.messages);
  const heldDraft = draftMsg ? { messageId: draftMsg.id, body: messageText(draftMsg), sendsAtMs: draftSendsAtMs(draftMsg) } : null;
  const reasonLabel = escalation ? reasonLabelOf(escalation.reason) : null;
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  const chatChannel = answerWireOf(dto.messages);
  const win = replyWindow(chatChannel, windowClockOf(chatChannel, clocksOf(dto)), now).open;
  const hasCalls = dto.messages.some((m) => m.type === "call_summary");
  const hasChat = !!dto.last_wa_inbound_at || dto.messages.some(isChatMessage);
  const primaryChannel = hasChat || !hasCalls ? chatChannel : "phone";
  const written = [...new Set(dto.messages.filter(isChatMessage).map((m) => writtenChannelOf(m.channel)))];
  const channels = [
    ...hasChat || !hasCalls ? [chatChannel, ...written.filter((c) => c !== chatChannel)] : [],
    ...hasCalls ? ["phone"] : []
  ];
  const subjects = emailSubjectsOf(dto.messages);
  const timeline = dto.messages.map((m) => {
    if (m.type === "note") {
      return {
        type: "event",
        kind: "note",
        at: bubbleTime(messageAt(m), tz, now),
        body: `Note: ${messageText(m)}`
      };
    }
    const onPhone = m.type === "call_summary";
    const media = mediaVM(m);
    const why = messageWhy(m);
    const subject = subjects.changed.get(m.id) ?? null;
    const leftOut = m.channel === "email" ? emailLeftOutOf(m.meta) ?? replyLeftAsOf(m.meta) : null;
    const said = m.channel === "email" ? emailPartsOf(messageText(m), emailFromNameOf(m)) : null;
    return {
      type: "msg",
      messageId: m.id,
      from: m.sender === "customer" ? "client" : "agent",
      channel: onPhone ? "phone" : writtenChannelOf(m.channel),
      // An email's subject line, above its words, where it changes from the thread's.
      ...subject ? { subject } : {},
      ...leftOut ? { leftOut } : {},
      ...bubbleWhen(messageAt(m), tz, now),
      body: said ? said.said : messageText(m),
      ...said?.quoted ? { quoted: said.quoted } : {},
      ...said?.signature ? { signature: { line: emailSignatureLine(said.signature), full: said.signature } } : {},
      ...media ? { media } : {},
      ...why ? { why } : {},
      // Who said it, per BUBBLE. The thread carries one agent identity, and the
      // pane rendered that under every agent row — so a phone call summary was
      // signed "by WhatsApp Receptionist", crediting the wrong assistant with
      // work it did not do. The bubble already knows its own channel.
      ...m.sender !== "customer" ? (() => {
        const a = agentFor(onPhone ? "phone" : writtenChannelOf(m.channel));
        return { agentName: a.name, agentGlyph: a.glyph };
      })() : {},
      ...m.sender === "human" ? { byYou: true } : {},
      // The words Conversations says too (messageAuthor): a person's reply is the team's.
      ...m.sender === "human" && messageAuthor(m) ? { byWords: messageAuthor(m).words } : {},
      ...messageVia(m) ? { via: messageVia(m) } : {},
      // What became of it: the words for its status, why it failed (one sentence for the owner, drawn under "Didn't send"),
      // and whether the words left (the receptionist's failed reply was drawn as a sent bubble, I1). Said in message-words.ts,
      // so this pane and the Conversations pane cannot describe the same message differently.
      ...m.sender !== "customer" && m.status ? { status: m.status, ...sentFactsOf(m) } : {},
      // A held draft is not a sent message and must not read as one.
      ...isHeldDraft(m) ? { pending: true, sendsAtMs: draftSendsAtMs(m) } : {}
    };
  });
  if (escalation) {
    const idx = dto.messages.findIndex((m) => m.created_at > escalation.created_at);
    const entry = {
      type: "event",
      kind: "flag",
      at: shortTime(escalation.created_at, tz, now),
      // Why it was flagged, and the details that say more -- except a call back's, which are the band's own sentence (the
      // to-do): quoted here as well, they were said a third time. Any other reason's details, the cause of a failed send,
      // are said only here.
      body: `Flagged for a human \u2014 ${reasonLabel}${escalation.details && escalation.reason !== "callback" ? ` \xB7 \u201C${clipAtWord(escalation.details, 120)}\u201D` : ""}`
    };
    if (idx === -1) timeline.push(entry);
    else timeline.splice(idx, 0, entry);
  }
  const moments = threadMoments(dto, escalation, state);
  const ask = askOf(escalation, lastInbound);
  const { lastWord, unanswered } = quietWordsOf(dto, state, tz, now);
  const preview = previewOf(dto.messages);
  return {
    id: `th-${dto.id}`,
    real: true,
    conversationId: dto.id,
    clientId: dto.contact.id || null,
    escalationId: escalation?.id ?? null,
    holdAct: openHoldAct(escalation),
    windowOpen: win,
    ...replyFacts(dto, primaryChannel, tz, now),
    who,
    whoMeta: contactMeta(dto, THREAD_CHANNEL_WORDS[primaryChannel]),
    avatar: initialsOf(who),
    state,
    takenOver,
    needsYou,
    claimedByOther,
    assigneeUserId: dto.assignee_user_id ?? null,
    ask,
    archived: dto.state === "archived",
    lastWord,
    unanswered,
    heldDraft,
    ...heldDraft ? {
      veto: {
        window: Math.max(1, Math.round((heldDraft.sendsAtMs - new Date(draftMsg.created_at).getTime()) / 1e3)),
        draft: heldDraft.body,
        endsAtMs: heldDraft.sendsAtMs,
        messageId: heldDraft.messageId,
        ...replyWhy(draftMsg.meta) ? { why: replyWhy(draftMsg.meta) } : {}
      }
    } : {},
    channels,
    primaryChannel,
    replyVia: THREAD_CHANNEL_WORDS[primaryChannel],
    hasChat,
    phone: dto.contact.phone_e164 ?? null,
    phoneDisplay: formatPhoneDisplay(dto.contact.phone_e164),
    proposalUrl: dto.contact.proposal_url?.trim() || null,
    agent: agentFor(primaryChannel),
    // The list's row says each thing once: why a person is needed (this), whose it is (its pill), how long they have
    // waited (beside the name) and what they asked (ask). A thread nobody needs to act on has no reason, and its row is
    // the last thing that happened. The subject said "A teammate is answering this" under a pill naming the teammate,
    // "You're answering this one" under "You have it", and a quiet thread's last words twice when they wrote last.
    subject: reasonLabel ?? "",
    ...subjects.thread ? { emailSubject: subjects.thread } : {},
    preview: preview.text,
    previewChannel: preview.channel,
    // A thread a teammate has is theirs to answer: the reason's sentence ("they're
    // waiting on you") would tell everyone else the opposite of what is true.
    summary: claimedByOther ? HELD_WORDS.theirs.sentence : escalation ? (
      // A call back's to-do is its one sentence: "They phoned and the receptionist couldn't finish it." sat beneath the
      // call it describes, over "From the call: <the to-do>". Without a to-do, the reason's sentence.
      escalation.reason === "callback" && escalation.details?.trim() ? escalation.details.trim() : reasonSummaryOf(escalation.reason)
    ) : takenOver ? HELD_WORDS.yours.sentence : lastWord ? lastWord.text : "The receptionist answered this on its own. Nothing is owed.",
    ...moments,
    ...inboxThreadClock(moments, tz, now.getTime()),
    // The dot is the reader's own (standing.ts isUnseen, 00349; inbox-thread-vm.ts says what it meant before).
    ...inboxReading(dto),
    pinned: false,
    tags: [],
    priority: "P2",
    timeline
  };
}
function threadMoments(dto, escalation, state) {
  const wakeAtMs = state === "snoozed" && dto.snooze_until ? Date.parse(dto.snooze_until) : Number.NaN;
  return {
    lastAtMs: dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    ...escalation ? { escalatedAtMs: new Date(escalation.created_at).getTime() } : {},
    ...Number.isFinite(wakeAtMs) ? { wakeAtMs } : {}
  };
}
function bubbleWhen(iso, tz, now) {
  const at = bubbleTime(iso, tz, now);
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { at, day: "", time: "" };
  return { at, day: clockHistoryDay(ms, tz, now.getTime()), time: clockTime(ms, tz) };
}
function quietWordsOf(dto, state, tz, now) {
  if (state !== "done" || dto.state === "archived") return { lastWord: null, unanswered: null };
  const unanswered = unansweredOf(dto, tz, now);
  return { lastWord: unanswered ? UNANSWERED_WORD : lastWordOf(dto, tz, now), unanswered };
}
export function theyWroteLast(messages) {
  return lastExchanged(messages.filter(isChatMessage))?.direction === "inbound";
}
const UNANSWERED_WORD = {
  text: "They wrote last, and nobody has answered them.",
  tone: "warn",
  short: "Unanswered"
};
const heldAskLine = (details) => {
  const text = details?.trim();
  if (!text) return "They're waiting on an answer.";
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return clipAtWord(first, 100);
};
function unansweredOf(dto, tz, now) {
  const hold = dto.last_hold;
  if (!hold || !theyWroteLast(dto.messages)) return null;
  const last = lastExchanged(dto.messages.filter(isChatMessage));
  if (!last) return null;
  if (!(Date.parse(hold.created_at) >= Date.parse(last.created_at))) return null;
  const sinceMs = Date.parse(messageAt(last));
  const closedMs = hold.resolved_at ? Date.parse(hold.resolved_at) : Number.NaN;
  return {
    line: heldAskLine(hold.details),
    closed: Number.isFinite(closedMs) ? `Closed ${clockDate(closedMs, tz, now.getTime())} without a reply` : "Closed without a reply",
    waited: waitedSince(sinceMs, now.getTime()),
    sinceMs
  };
}
function lastWordOf(dto, tz, now) {
  const chat = dto.messages.filter(isChatMessage);
  const last = lastExchanged(chat);
  const failed = [...chat.slice(last ? chat.indexOf(last) + 1 : 0)].reverse().find((m) => m.status === "failed") ?? null;
  const failedBy = failed ? messageAuthor(failed)?.words ?? "us" : null;
  const at = failed ? shortTime(messageAt(failed), tz, now) : "";
  if (!last) {
    if (failedBy)
      return {
        text: `Nothing has reached them \u2014 the message from ${failedBy} didn't send.`,
        tone: "danger",
        short: "Didn't send",
        at
      };
    return dto.messages.some((m) => m.type === "call_summary") ? { text: "The phone receptionist handled their call \u2014 no one asked for you.", tone: "ok", short: null } : { text: "No messages yet.", tone: "plain", short: null };
  }
  if (last.direction === "inbound") {
    return failedBy ? {
      text: `They wrote last, and the reply from ${failedBy} didn't send \u2014 as far as they know, nobody answered.`,
      tone: "danger",
      short: "Didn't send",
      at
    } : { text: "They wrote last \u2014 no reply yet.", tone: "plain", short: null };
  }
  const said = lastWordLine(false, last, messageAuthor(last));
  return failedBy ? { text: `${said} \u2014 the last message from ${failedBy} didn't send.`, tone: "warn", short: "Didn't send", at } : { text: `${said} \u2014 no one asked for you.`, tone: "ok", short: null };
}

import { isOptedOut, messageAt } from "./thread-dto.js";
import { agentFor, isChatMessage, writtenChannelOf, threadChannelOf } from "./thread-channel.js";
import { contactName, initialsOf, shortName } from "./thread-contact.js";
import { shortTime, bubbleTime } from "./thread-clock.js";
import { mediaVM } from "./message-media.js";
import { sentFactsOf, messageWords, lastExchanged } from "./message-words.js";
import { messageAuthor, messageWhy, lastWordLine } from "./message-author.js";
import { readingOf, standingOfThread } from "./standing.js";
export function toConversationVM(dto, escalation, tz, now = /* @__PURE__ */ new Date()) {
  const who = contactName(dto);
  const whoShort = shortName(who);
  const msgs = dto.messages.map((m) => ({
    from: m.sender === "customer" ? "client" : "agent",
    // The row's own channel, not an assumption. Every bubble on this surface
    // was drawn as WhatsApp -- so a text conversation, live since the SMS
    // channel shipped, has been labelled WhatsApp on the Conversations page
    // this whole time, and an email one would be too. The Inbox has read the
    // column since I1 (toInboxThreadVM); these two view models had drifted.
    channel: m.type === "call_summary" ? "phone" : writtenChannelOf(m.channel),
    at: bubbleTime(messageAt(m), tz, now),
    text: messageWords(m),
    ...mediaVM(m) ? { media: mediaVM(m) } : {},
    ...messageWhy(m) ? { why: messageWhy(m) } : {},
    ...messageAuthor(m) ? { by: messageAuthor(m).words } : {},
    // Only for OUR messages. A customer's inbound message has no send status,
    // and labelling it would be inventing one.
    ...m.sender !== "customer" ? sentFactsOf(m) : {}
  }));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  const chat = dto.messages.filter(isChatMessage);
  const callNotes = dto.messages.filter((m) => m.type === "call_summary").length;
  const last = lastExchanged(chat);
  const lastAuthor = last && last.direction === "outbound" ? messageAuthor(last) : null;
  const v = standingOfThread(dto, escalation, now.getTime());
  const needsHuman = v.flagged;
  const outcome = needsHuman ? "escalated" : last?.direction === "inbound" || dto.state === "snoozed" ? "open" : "handled";
  return {
    id: dto.id,
    who,
    whoShort,
    initials: initialsOf(who),
    stopped: isOptedOut(dto),
    clientId: dto.contact.id || null,
    // The Inbox's id for this conversation (toInboxThreadVM): the door from a transcript to its thread.
    threadId: `th-${dto.id}`,
    answeredBy: lastAuthor ? lastAuthor.kind : null,
    // The wire the conversation's last written words travelled. A thread with
    // nothing but a call note is the phone, which is what it looks like.
    channel: threadChannelOf(dto.messages),
    agent: agentFor(threadChannelOf(dto.messages)),
    // The row's time and its preview must come from the SAME message —
    // last_message_at ignored call notes, so a row read "3:22 AM" beside a
    // preview imported at 2:15 PM.
    at: shortTime(last ? messageAt(last) : dto.last_message_at, tz, now),
    standing: v.standing,
    holderId: v.claimedByOther ? dto.assignee_user_id ?? null : null,
    ...readingOf(dto.last_inbound_at, dto),
    outcome,
    snippet: last ? messageWords(last).slice(0, 110) : "",
    hasChat: chat.length > 0,
    ts: last ? new Date(messageAt(last)).getTime() : dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    summary: {
      headline: lastInbound ? messageWords(lastInbound).slice(0, 110) : "No customer messages yet.",
      bullets: [
        `${chat.length} message${chat.length === 1 ? "" : "s"}${callNotes ? ` \xB7 ${callNotes} call${callNotes === 1 ? "" : "s"}` : ""}${dto.messages[0] ? ` \xB7 started ${shortTime(messageAt(dto.messages[0]), tz, now)}` : ""}`,
        lastWordLine(needsHuman, last, lastAuthor)
      ]
    },
    messages: msgs
  };
}

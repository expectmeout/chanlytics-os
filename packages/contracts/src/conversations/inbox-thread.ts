/**
 * The Inbox's thread: where it stands and who owes it work (`threadStanding`), and the view model the page
 * draws (`toInboxThreadVM`) in the shape inbox-thread-vm.ts declares, with a quiet thread's last word. Its
 * words come from the thread-*, message-* and escalations modules beside it.
 */
import { MIN_MS } from "../shared/time";
import { formatPhoneDisplay } from "../shared/phone";
import { replyWhy, type ReplyWhyVM } from "../config/brain";
import { replyWindow } from "../config/policy";
import { standingOf } from "./standing";
import { messageAt, isOptedOut, type ConversationDto, type MessageDto } from "./thread-dto";
import { agentFor, writtenChannelOf, THREAD_CHANNEL_WORDS } from "./thread-channel";
import { contactName, contactMeta, initialsOf } from "./thread-contact";
import { shortTime, bubbleTime, formatWaited } from "./thread-clock";
import { mediaVM } from "./message-media";
import { emailSubjectOf, emailLeftOutOf, splitQuotedReply } from "./message-email";
import {
  messageStatusLabel,
  reachedCustomer,
  isHeldDraft,
  draftSendsAtMs,
  messageWords,
  messageText,
  clipAtWord,
} from "./message-words";
import { messageVia, messageAuthor, lastWordLine, type MessageAuthor } from "./message-author";
import { ESCALATION_REASON_LABELS, ESCALATION_SUMMARIES, type EscalationDto } from "./escalations";
import type { InboxThreadVM } from "./inbox-thread-vm";

/**
 * Where a thread sits and who owes it work — the single implementation.
 *
 * Exported so the sidebar badge and Today's brief can agree without either one
 * re-deriving it. /metrics' `escalations_open` is NOT this number: it counts
 * open escalations, including ones a teammate has already claimed, so it reads
 * high exactly when someone is doing the work.
 */
export function threadStanding(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  now = new Date(),
): { state: InboxThreadVM["state"]; takenOver: boolean; needsYou: boolean; claimedByOther: boolean } {
  // One rule for the Inbox, People and Today (standing.ts). Snoozed wins over
  // escalated, and that ordering is the whole point.
  //
  // Snoozing used to RESOLVE the open escalation, because otherwise the thread
  // would have stayed in "Needs you" and the snooze would have done nothing.
  // The cost was the customer's request: at wake the thread reappeared as
  // "Handled" under the banner "Answered by the receptionist — no one asked
  // for you", while the person who had asked for a human was still waiting.
  // Snooze now leaves the escalation open and hides the thread by STATE, so
  // "come back to this later" means the request comes back too.
  const v = standingOf(
    {
      state: dto.state,
      paused_until: dto.paused_until,
      assignee_user_id: dto.assignee_user_id,
      assignee_is_me: dto.assignee_is_me,
      open_escalation: !!escalation,
    },
    now.getTime(),
  );
  const state: InboxThreadVM["state"] = v.standing === "snoozed" ? "snoozed" : v.flagged ? "escalated" : "done";
  return { state, takenOver: v.takenOver, needsYou: v.standing === "needs_you", claimedByOther: v.claimedByOther };
}

export function toInboxThreadVM(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  /** The workspace's zone: every time in the thread is said by its clock. */
  tz: string,
  now = new Date(),
): InboxThreadVM {
  const who = contactName(dto);
  // takenOver = a human claimed it (assignee set by take-over/reply) — the pane
  // then shows the owned-thread strip + hand-back instead of the take banner.
  const { state, takenOver, needsYou, claimedByOther } = threadStanding(dto, escalation, now);
  // The LAST held draft, not the first: if two ever coexist the newer one is
  // what the customer would receive, so it is the one to offer controls for.
  // Cancelling withdraws every queued AI row on the thread anyway.
  let draftMsg: MessageDto | null = null;
  for (let i = dto.messages.length - 1; i >= 0; i--) {
    if (isHeldDraft(dto.messages[i])) {
      draftMsg = dto.messages[i];
      break;
    }
  }
  const heldDraft = draftMsg
    ? { messageId: draftMsg.id, body: messageText(draftMsg), sendsAtMs: draftSendsAtMs(draftMsg) }
    : null;
  const reasonLabel = escalation ? (ESCALATION_REASON_LABELS[escalation.reason] ?? escalation.reason) : null;
  const last = [...dto.messages].reverse().find((m) => m.direction === "inbound" || reachedCustomer(m.status));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  // replyWindow(), the rule the reply route enforces, not a copy of it. This
  // decides whether the composer tells the operator they can write freely; with
  // two expressions those answers drift the moment either moves, and the
  // operator is told they can send something the server refuses. A text has no
  // window, so where the customer last wrote by SMS the composer is open.
  const win = replyWindow(lastInbound?.channel, dto.last_wa_inbound_at, now).open;
  // The channels the thread has actually used: a call note is the phone, any
  // other row is WhatsApp. A caller with no thread on WhatsApp gets phone
  // verbs, not a notice about a reply window that never opened.
  const hasCalls = dto.messages.some((m) => m.type === "call_summary");
  const hasChat = !!dto.last_wa_inbound_at || dto.messages.some((m) => m.type !== "call_summary");
  // The wire a reply goes out on, as the reply route picks it: where they last wrote. A text thread said WhatsApp,
  // its window read closed, and its composer offered only templates, which the route refuses on a text (I5).
  const chatChannel = writtenChannelOf(lastInbound?.channel);
  const primaryChannel: InboxThreadVM["primaryChannel"] = hasChat || !hasCalls ? chatChannel : "phone";
  // Every wire the thread's written words travelled, the one a reply goes out on first: with more than one, each
  // bubble says its own (the page names a bubble's channel only when a thread has several).
  const written = [
    ...new Set(dto.messages.filter((m) => m.type !== "call_summary").map((m) => writtenChannelOf(m.channel))),
  ];
  const channels = [
    ...(hasChat || !hasCalls ? [chatChannel, ...written.filter((c) => c !== chatChannel)] : []),
    ...(hasCalls ? ["phone"] : []),
  ];

  const timeline: InboxThreadVM["timeline"] = dto.messages.map((m) => {
    const onPhone = m.type === "call_summary";
    const media = mediaVM(m);
    const why = m.sender === "ai" ? replyWhy(m.meta) : null;
    const subject = m.channel === "email" ? emailSubjectOf(m) : null;
    const leftOut = m.channel === "email" ? emailLeftOutOf(m.meta) : null;
    // Only an email quotes; a WhatsApp message that happens to start a line with ">" is words.
    const said = m.channel === "email" ? splitQuotedReply(messageText(m)) : null;
    return {
      type: "msg" as const,
      messageId: m.id,
      from: m.sender === "customer" ? ("client" as const) : ("agent" as const),
      channel: onPhone ? "phone" : writtenChannelOf(m.channel),
      // An email's subject line, above its words.
      ...(subject ? { subject } : {}),
      ...(leftOut ? { leftOut } : {}),
      at: bubbleTime(messageAt(m), tz, now),
      body: said ? said.text : messageText(m),
      ...(said && said.quoted ? { quoted: said.quoted } : {}),
      ...(media ? { media } : {}),
      ...(why ? { why } : {}),
      // Who said it, per BUBBLE. The thread carries one agent identity, and the
      // pane rendered that under every agent row — so a phone call summary was
      // signed "by WhatsApp Receptionist", crediting the wrong assistant with
      // work it did not do. The bubble already knows its own channel.
      ...(m.sender !== "customer"
        ? (() => {
            const a = agentFor(onPhone ? "phone" : writtenChannelOf(m.channel));
            return { agentName: a.name, agentGlyph: a.glyph };
          })()
        : {}),
      ...(m.sender === "human" ? { byYou: true } : {}),
      // The words Conversations says too (messageAuthor): a person's reply is the team's.
      ...(m.sender === "human" && messageAuthor(m) ? { byWords: (messageAuthor(m) as MessageAuthor).words } : {}),
      ...(messageVia(m) ? { via: messageVia(m)! } : {}),
      ...(m.sender !== "customer" && m.status
        ? {
            status: m.status,
            // The words themselves live in messageStatusLabel, so this pane and
            // the Conversations pane cannot describe the same message
            // differently — which is exactly what they were doing.
            ...(messageStatusLabel(m.status) ? { statusLabel: messageStatusLabel(m.status) } : {}),
            // Whether the words left: the receptionist's failed reply was drawn as a sent bubble (I1).
            reachedCustomer: reachedCustomer(m.status),
          }
        : {}),
      // A held draft is not a sent message and must not read as one.
      ...(isHeldDraft(m) ? { pending: true as const, sendsAtMs: draftSendsAtMs(m) } : {}),
    };
  });
  if (escalation) {
    // insert chronologically — appending would read "reply, then flagged"
    const idx = dto.messages.findIndex((m) => m.created_at > escalation.created_at);
    const entry = {
      type: "event" as const,
      kind: "flag",
      at: shortTime(escalation.created_at, tz, now),
      // Why it was flagged, and the details that say more -- except a call back's, which are the band's own sentence (the
      // to-do): quoted here as well, they were said a third time. Any other reason's details, the cause of a failed send,
      // are said only here.
      body: `Flagged for a human — ${reasonLabel}${escalation.details && escalation.reason !== "callback" ? ` · “${clipAtWord(escalation.details, 120)}”` : ""}`,
    };
    if (idx === -1) timeline.push(entry);
    else timeline.splice(idx, 0, entry);
  }

  const waitingMin = escalation
    ? Math.max(1, Math.round((now.getTime() - new Date(escalation.created_at).getTime()) / MIN_MS))
    : undefined;

  // The customer's own words where the decision is made. The reason's sentence
  // says why a person is needed; this says what they asked: the last thing they
  // wrote, which is what they are waiting on, or for a call back what the call
  // left behind -- the details the call back's sentence promises.
  const ask: InboxThreadVM["ask"] = !escalation
    ? null
    : escalation.reason === "callback"
      ? escalation.details?.trim()
        ? { kind: "call" as const, label: "From the call", text: escalation.details.trim(), quoted: false }
        : null
      : lastInbound
        ? lastInbound.type === "text"
          ? { kind: "wrote" as const, label: "They wrote", text: messageWords(lastInbound), quoted: true }
          : { kind: "sent" as const, label: "They sent", text: messageWords(lastInbound), quoted: false }
        : null;

  // A quiet thread's one line: who had the last word, and whether a reply didn't send (lastWordOf, I1).
  const lastWord = state === "done" && dto.state !== "archived" ? lastWordOf(dto) : null;

  return {
    id: `th-${dto.id}`,
    real: true,
    conversationId: dto.id,
    clientId: dto.contact.id || null,
    escalationId: escalation?.id ?? null,
    windowOpen: win,
    optedOut: isOptedOut(dto),
    offersOk: dto.contact.marketing_consent === "opted_in",
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
    heldDraft,
    ...(heldDraft
      ? {
          veto: {
            window: Math.max(1, Math.round((heldDraft.sendsAtMs - new Date(draftMsg!.created_at).getTime()) / 1000)),
            draft: heldDraft.body,
            endsAtMs: heldDraft.sendsAtMs,
            messageId: heldDraft.messageId,
            ...(replyWhy(draftMsg!.meta) ? { why: replyWhy(draftMsg!.meta) as ReplyWhyVM } : {}),
          },
        }
      : {}),
    channels,
    primaryChannel,
    replyVia: THREAD_CHANNEL_WORDS[primaryChannel],
    hasChat,
    phone: dto.contact.phone_e164 ?? null,
    phoneDisplay: formatPhoneDisplay(dto.contact.phone_e164),
    proposalUrl: dto.contact.proposal_url?.trim() || null,
    ...(waitingMin ? { waited: formatWaited(waitingMin * MIN_MS) } : {}),
    agent: agentFor(primaryChannel),
    // The list's row says each thing once: why a person is needed (this), whose it is (its pill), how long they have
    // waited (beside the name) and what they asked (ask). A thread nobody needs to act on has no reason, and its row is
    // the last thing that happened. The subject said "A teammate is answering this" under a pill naming the teammate,
    // "You're answering this one" under "You have it", and a quiet thread's last words twice when they wrote last.
    subject: reasonLabel ?? "",
    // A contact who has only ever phoned has no message of their own: their call note is the last thing that happened.
    preview: last ? messageWords(last).slice(0, 110) : "",
    // A thread a teammate has is theirs to answer: the reason's sentence ("they're
    // waiting on you") would tell everyone else the opposite of what is true.
    summary: claimedByOther
      ? "A teammate is answering this. The receptionist stays quiet until they hand it back."
      : escalation
        ? // A call back's to-do is its one sentence: "They phoned and the receptionist couldn't finish it." sat beneath the
          // call it describes, over "From the call: <the to-do>". Without a to-do, the reason's sentence.
          escalation.reason === "callback" && escalation.details?.trim()
          ? escalation.details.trim()
          : (ESCALATION_SUMMARIES[escalation.reason] ?? `${reasonLabel}. Needs a human.`)
        : takenOver
          ? "You're answering this one. The receptionist stays quiet until you hand it back."
          : lastWord
            ? lastWord.text
            : "The receptionist answered this on its own. Nothing is owed.",
    lastAt: shortTime(dto.last_message_at, tz, now),
    lastAtFull: shortTime(dto.last_message_at, tz, now),
    lastAtMs: dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    ...(escalation ? { escalatedAtMs: new Date(escalation.created_at).getTime() } : {}),
    // The dot means a person is needed and nobody has it: needsYou, the one rule.
    // "Escalated and not mine" lit it on a thread a teammate is answering too.
    unread: needsYou,
    pinned: false,
    tags: [],
    priority: "P2",
    ...(waitingMin !== undefined ? { waitingMin } : {}),
    ...(state === "snoozed" && dto.snooze_until ? { wake: shortTime(dto.snooze_until, tz, now) } : {}),
    timeline,
  };
}

/**
 * A quiet thread's one line in the Inbox: who had the last word, in Conversations' words (lastWordLine), and
 * whether a later message of ours didn't send. Every quiet thread read "Answered by the receptionist — no one
 * asked for you": over a customer who wrote last, and over a reply that never left (I1). A reply someone
 * canceled is not a failure: the customer is simply waiting.
 */
function lastWordOf(dto: ConversationDto): NonNullable<InboxThreadVM["lastWord"]> {
  const chat = dto.messages.filter((m) => m.type !== "call_summary");
  // Back from the newest: our words that never left, down to the last thing that happened between them.
  let at = chat.length - 1;
  let failed: MessageDto | null = null;
  for (; at >= 0; at--) {
    const m = chat[at];
    if (m.direction === "inbound" || reachedCustomer(m.status)) break;
    if (!failed && m.status === "failed") failed = m;
  }
  const last = at >= 0 ? chat[at] : null;
  const failedBy = failed ? (messageAuthor(failed)?.words ?? "us") : null;
  if (!last) {
    if (failedBy)
      return {
        text: `Nothing has reached them — the message from ${failedBy} didn't send.`,
        tone: "danger",
        short: "Didn't send",
      };
    return dto.messages.some((m) => m.type === "call_summary")
      ? { text: "The phone receptionist handled their call — no one asked for you.", tone: "ok", short: null }
      : { text: "No messages yet.", tone: "plain", short: null };
  }
  if (last.direction === "inbound") {
    return failedBy
      ? {
          text: `They wrote last, and the reply from ${failedBy} didn't send — as far as they know, nobody answered.`,
          tone: "danger",
          short: "Didn't send",
        }
      : { text: "They wrote last — no reply yet.", tone: "plain", short: null };
  }
  const said = lastWordLine(false, last, messageAuthor(last));
  return failedBy
    ? { text: `${said} — the last message from ${failedBy} didn't send.`, tone: "warn", short: "Didn't send" }
    : { text: `${said} — no one asked for you.`, tone: "ok", short: null };
}

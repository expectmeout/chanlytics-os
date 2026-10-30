import {
  CONVERSATION_OPT_IN_PATTERN,
  EMAIL_STOP_PATTERN,
  EMAIL_UNSUBSCRIBE_PATTERN,
  MARKETING_OPT_IN_PATTERN,
  normalizeEmail,
  replyTextOf,
  bookingNoticeOf,
  forwardingConfirmationOf,
  type BookingTool,
  type EmailClaim,
} from "@chanlytics/contracts";
import { logger } from "@chanlytics/channels";
import type { Json } from "@chanlytics/db";

/** The intake's own lines, by name: a yes the sender's proof does not stand behind. */
const emailLog = logger();

/**
 * email_ingest: one received email, taken in (00127).
 *
 * The webhook that announced it was a pointer. This fetches the email, decides
 * what it CLAIMS to be, keeps it, and asks a person to read it. It never
 * answers: until the receptionist drafts email replies, every email from a
 * person is a person's to answer, and the day it does draft, it drafts only
 * for mail whose sender could be verified. A claim decides how LITTLE is done
 * (an automatic reply and a program's mail are kept and never flagged; a
 * delivery report is not a conversation at all), never how much.
 *
 * It resumes. The replay gate is the provider's id for the delivery, so a run
 * that died after the message was stored finds it on the next try and carries
 * on from there; it stops early only when the row says it was handled. (The
 * WhatsApp road skips a message it has seen, on purpose: there a missed reply
 * beats a double text. Here nothing is sent, so nothing can be sent twice, and
 * a lost customer email is the worse outcome.)
 */
/**
 * What an email claims to be, from headers anyone can write (the adapter decides it: channels classifyReceived), one of
 * contracts' EMAIL_CLAIMS.
 */
export type { EmailClaim };

/**
 * One received email as this verb needs it: the provider's shape and the
 * parsing of headers and HTML are the adapter's (packages/jobs, over
 * packages/channels); what arrives here is already words and ids.
 */
export interface IncomingEmail {
  /** The provider's id for this delivery: the replay gate. */
  id: string;
  from: { address: string; name: string | null } | null;
  to: string[];
  cc: string[];
  subject: string | null;
  /** The words, as plain text; null when the email had none. */
  text: string | null;
  /** Its own Message-ID, its parent's, and the chain it carried: written by the sender, used for threading and never as a key. */
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  receivedAt: string | null;
  claim: EmailClaim;
  attachments: Array<{ filename: string | null; contentType: string | null; size: number | null }>;
  /**
   * The receiving side PROVES the sender is who the From line says (channels senderAuthenticated: the provider's own
   * verdict, a DMARC pass or a DKIM pass by the From domain). A From anyone can forge is not one: a yes (YES OFFERS) is
   * taken only from an email that has it, and is refused, and logged, from one that does not. A no (STOP,
   * UNSUBSCRIBE) is always taken, since a no only narrows. Required: no caller may leave a proof out and have a yes taken.
   */
  senderAuthenticated: boolean;
}

export interface EmailIngestPorts {
  /** The mailbox the delivery named, or null when it is gone. */
  mailbox(id: string): Promise<{ id: string; tenant_id: string; address: string } | null>;
  /** The email, by the provider's id; null when the provider no longer has it. Throws when it cannot be asked. */
  fetch(receivedId: string): Promise<IncomingEmail | null>;
  /**
   * A booking tool's notice is read into an appointment, not kept as a conversation (docs/plans/
   * 2026-10-07-bookings-arrive-by-email.md): one booking_read for the delivery, however often this intake runs.
   */
  readBooking(tenantId: string, mailboxId: string, receivedId: string, tool: BookingTool): Promise<void>;
  /**
   * The booking tool the workspace named as its own (config bookings.tool), or null for none: only that tool's notices
   * are read as bookings. A workspace that named none keeps every tool's email as the automated email it is.
   */
  bookingTool(tenantId: string): Promise<BookingTool | null>;
  /**
   * Is this address a member's of the workspace: the second thing a notice forwarded by hand must be, after its
   * sender is proved (00345).
   */
  memberAddress(tenantId: string, address: string): Promise<boolean>;
  /**
   * Gmail's confirmation that it may forward to this mailbox (contracts forwardingConfirmationOf), kept on the mailbox
   * for Settings to show with one press, never as a thread (00345).
   */
  keepForwarding(mailboxId: string, p: { account: string; code: string; link: string | null }): Promise<void>;
  /**
   * Does this email belong to an erasure? True when the address left a digest (00125) AND the email was received
   * before the person asked to be forgotten: taking it in late would make them again from data they asked us to
   * drop. An email received AFTER the request is the person coming back, and is a new conversation (edge erased.ts).
   */
  erasedBefore(tenantId: string, address: string, receivedAtIso: string): Promise<boolean>;
  /** Our own email, coming back: a forward loop, or a copy. */
  ours(tenantId: string, rfcMessageId: string): Promise<boolean>;
  record(p: {
    tenantId: string;
    address: string;
    receivedId: string;
    body: string | null;
    channelTs: string | null;
    meta: Json;
    /** The email's own words are the opt-out (asksToStop): ingest_inbound then records the STOP, as it does for a text. */
    optOut: boolean;
    /**
     * The email's own words are START, from a sender the receiving side proved (asksToStart): ingest_inbound records the
     * yes to hearing from the business again, as it does for a text, and the yes covers email.
     */
    optIn: boolean;
    /** The email's own words are UNSUBSCRIBE (asksToUnsubscribe): offers by email end, through the unsubscribe link's door. */
    unsubscribe: boolean;
    /** The email's own words are YES OFFERS, from a sender the receiving side proved (asksForOffers): the yes to offers by email. */
    optInOffers: boolean;
    /**
     * A person wrote it, from a sender the receiving side proved: the address works, whatever a hard bounce once said of
     * it, so that stop is lifted (a complaint's, and the provider's own, are not this email's to lift).
     */
    fromThemProven: boolean;
    /** What they wrote, as the ledger quotes it: the words of the reply, never the history their client quoted. */
    words: string | null;
  }): Promise<{ message_id: string; conversation_id: string; is_new: boolean; processed: boolean }>;
  /**
   * Flag the thread for a person: a new hold, one that now means something else,
   * a refresh of the same one, or a write that did not land.
   */
  escalate(
    tenantId: string,
    conversationId: string,
    reason: "email_review",
    details: string,
  ): Promise<"opened" | "changed" | "refreshed" | "failed">;
  /** Tell the workspace's people, once per hold: the bell, and the mail their alerts go to. Never throws. */
  tell(
    tenantId: string,
    note: {
      conversationId: string;
      from: string;
      fromName: string | null;
      subject: string | null;
      preview: string | null;
      claim: EmailClaim;
    },
  ): Promise<void>;
  /**
   * Is this kept message a reply to one of the workspace's reach-outs (00222 reach_out_reply_of)? Throws when it cannot
   * be asked: a reply taken for nobody's would never be read, and a no in it would be missed.
   */
  reachOutReply(tenantId: string, messageId: string): Promise<boolean>;
  /** Hand the reply to the reading (a reply_read job), at most once per message however often this runs. */
  readReply(tenantId: string, messageId: string): Promise<void>;
  markProcessed(tenantId: string, messageId: string): Promise<void>;
  received(mailboxId: string, at: string): Promise<void>;
  /**
   * Whether one of these addresses is a mailbox the workspace connected that its sync reads (00423: connected, paused or
   * held): a copy of an email that mailbox holds too, which its sync takes in (Gmail forwarding its mail to the hosted
   * address, or an email to both). A connected mailbox's own intake answers false.
   */
  readByMailbox(tenantId: string, addresses: readonly string[]): Promise<boolean>;
  now(): number;
}

export type EmailIngestOutcome =
  | "kept_for_a_person"
  | "kept_for_the_reading"
  | "kept_quietly"
  | "kept_as_booking"
  | "kept_as_confirmation"
  | "read_by_mailbox"
  | "already_handled"
  | "not_a_conversation"
  | "our_own"
  | "erased_person"
  | "no_sender"
  | "gone";

/** As much of one email's words as a thread keeps. The original stays with the provider; this is what a person reads and, one day, a model. */
export const EMAIL_BODY_MAX = 20_000;

/** What the person who opens the thread is told, by what the email claimed to be. */
export const EMAIL_REVIEW_WORDS: Record<Extract<EmailClaim, "person" | "automated"> | "reach_out", string> = {
  // Nothing sends an email on its own (decision 0073, R15): Need you drafts the reply in the owner's voice (decision
  // 0071), and it leaves from their mailbox on their press.
  person: "An email arrived. Nothing was sent: a reply is drafted for you in Need you, to change or send from here.",
  automated:
    "An automated email arrived (a form, a notification or a list). Nothing answers those: read it, and reply from here if a person is waiting behind it.",
  // A reply to a reach-out (Reach out Part 5): the reading tells the owner what it meant, so this flag says only where.
  reach_out:
    "They wrote back to your sequence. Nothing is sent without you: read it here, with the receptionist's draft when it wrote one.",
};

export async function ingestEmail(
  ports: EmailIngestPorts,
  cmd: { payload: Record<string, unknown> },
): Promise<EmailIngestOutcome> {
  const mailboxId = typeof cmd.payload.mailbox_id === "string" ? cmd.payload.mailbox_id : "";
  const receivedId = typeof cmd.payload.received_id === "string" ? cmd.payload.received_id : "";
  if (!mailboxId || !receivedId)
    throw new Error("email_ingest: payload.mailbox_id and payload.received_id are required");

  const mailbox = await ports.mailbox(mailboxId);
  if (!mailbox) return "gone";
  const email = await ports.fetch(receivedId);
  if (!email) return "gone";

  // Who it says it is from, in the one spelling a person is stored under. An
  // email with no usable sender has nobody to be a conversation with.
  const address = normalizeEmail(email.from?.address);
  if (!address) return "no_sender";
  if (address === mailbox.address || (email.messageId && (await ports.ours(mailbox.tenant_id, email.messageId))))
    return "our_own";
  const at = new Date(ports.now()).toISOString();
  // A copy the workspace's connected mailbox holds too: its sync takes it in (or leaves it, by the same sorting), so
  // this road keeps none and nobody answers one email twice. The address still heard from its forward, so it is stamped.
  if (await ports.readByMailbox(mailbox.tenant_id, [...email.to, ...email.cc])) {
    await ports.received(mailbox.id, at);
    return "read_by_mailbox";
  }
  if (await ports.erasedBefore(mailbox.tenant_id, address, email.receivedAt ?? at)) return "erased_person";

  const { claim } = email;
  // A bounce or a delivery report, by email: not a conversation. What stops
  // sends to an address is the provider's signed receipt, never this.
  if (claim === "report") return "not_a_conversation";
  // What never becomes a thread: a tool's notice, read into an appointment, or Gmail's confirmation of a forward here.
  // One that is claimed but not trusted is taken in as the automated email it looks like, for a person to read:
  // nothing is lost, and nothing is booked on a stranger's word.
  const aside = await keptAside(ports, mailbox, email, { address, at });
  if (aside) return aside;
  const taken: Exclude<EmailClaim, "report" | "booking_notice" | "forwarding_confirmation"> =
    claim === "booking_notice" || claim === "forwarding_confirmation" ? "automated" : claim;

  const said = answersOf(email);
  const kept = await ports.record({
    tenantId: mailbox.tenant_id,
    address,
    receivedId: email.id,
    body: bodyOf(email),
    channelTs: email.receivedAt ?? at,
    meta: metaOf(email),
    optOut: said.optOut,
    optIn: said.optIn,
    unsubscribe: said.unsubscribe,
    optInOffers: said.optInOffers,
    fromThemProven: said.fromThemProven,
    words: replyTextOf(email.text).slice(0, 80) || null,
  });
  if (!kept.is_new && kept.processed) return "already_handled";
  // Said once the email is known to be new work, so a delivery the provider repeats says it once.
  if (said.unproven)
    emailLog.warn("email_yes_unauthenticated", { tenant_id: mailbox.tenant_id, message_id: kept.message_id });

  // A reply to a reach-out is read for what it means (reply_read), whatever it claims: an automatic reply may still
  // say no (B1). The reading tells the owner, so the intake does not tell them twice. Asked before anything is marked,
  // so a failed read or a failed schedule is the job's to try again, and the next try finds the reading scheduled.
  const reachOut = await ports.reachOutReply(mailbox.tenant_id, kept.message_id);

  const flagged = flaggedAs(taken, claim, reachOut);
  if (flagged)
    await flagForAPerson(ports, email, {
      tenantId: mailbox.tenant_id,
      conversationId: kept.conversation_id,
      address,
      claim: flagged,
      reachOut,
    });
  // After the flag: the reading closes what the intake opened (reply-read.ts closeWhatTheIntakeOpened), so it must find
  // the flag there. Scheduled first, a reading could run before a flag that failed and was tried again, close nothing,
  // archive a "no", and leave the retried flag on an archived thread.
  if (reachOut) await ports.readReply(mailbox.tenant_id, kept.message_id);
  // Last, and only once the flag a person acts on is durable: a run that dies
  // above leaves the row unhandled, and the next try finishes it.
  await ports.markProcessed(mailbox.tenant_id, kept.message_id);
  await ports.received(mailbox.id, at);
  if (reachOut) return "kept_for_the_reading";
  return flagged ? "kept_for_a_person" : "kept_quietly";
}

/**
 * Whether a kept email asks a person, and in whose words, or null for one kept quietly. A person's email does; so does
 * a reply to a reach-out, whatever it claims (the reading tells the owner what it meant), and a tool's notice or a
 * forwarding check the intake could not trust, which is about the business's own appointments or settings. An
 * automatic reply and a program's own mail (a notification, a list, a no-reply sender's) are kept for the record, and
 * nobody is asked to answer them, as a connected mailbox leaves them where they are (edge mailbox-sorting.ts).
 */
function flaggedAs(
  taken: Exclude<EmailClaim, "report" | "booking_notice" | "forwarding_confirmation">,
  claim: EmailClaim,
  reachOut: boolean,
): "person" | "automated" | null {
  if (taken === "auto_reply") return null;
  return taken === "person" || reachOut || claim !== "automated" ? taken : null;
}

/**
 * What is taken in but never becomes a thread, or null for an email the intake keeps as usual.
 *
 * A booking tool's notice: the booking it states becomes an appointment row (booking_read), never a thread with the
 * tool's no-reply address. Scheduled once per delivery, so this intake run again schedules nothing twice; the mailbox
 * is stamped as for any email it took in. Trusted first, on three things, each of which a stranger cannot supply:
 *
 *   - the sender is PROVED by the receiving side (senderAuthenticated), whichever way the notice came. A From line
 *     anyone can write proves nothing: a tool's, or a member's address on a forward. An email the provider gave no
 *     verdict on is not read, and is kept for a person as before;
 *   - the tool is the one this workspace named (bookingTool): a workspace that set nothing up reads nothing, and
 *     another tool's mail, which anyone may cause to be sent here, is not this business's bookings;
 *   - a forward by hand comes from a member of the workspace (memberAddress), their own address now proved.
 *
 * Gmail asking whether it may forward here (contracts forwardingConfirmationOf): the code and the link are kept on
 * the mailbox for Settings to show. Trusted only from Google's own proved sender, since a forged one would put a
 * stranger's code in front of the owner.
 */
async function keptAside(
  ports: EmailIngestPorts,
  mailbox: { id: string; tenant_id: string },
  email: IncomingEmail,
  // The sender in the one spelling a person is stored under, and the moment the intake runs.
  { address, at }: { address: string; at: string },
): Promise<Extract<EmailIngestOutcome, "kept_as_booking" | "kept_as_confirmation"> | null> {
  const words = { from: email.from, subject: email.subject, text: email.text };
  const notice = email.claim === "booking_notice" ? bookingNoticeOf(words) : null;
  if (notice) {
    const trusted =
      email.senderAuthenticated &&
      (await ports.bookingTool(mailbox.tenant_id)) === notice.tool &&
      (!notice.forwarded || (await ports.memberAddress(mailbox.tenant_id, address)));
    if (trusted) {
      await ports.readBooking(mailbox.tenant_id, mailbox.id, email.id, notice.tool);
      await ports.received(mailbox.id, at);
      return "kept_as_booking";
    }
  }
  const forwarding =
    email.claim === "forwarding_confirmation" && email.senderAuthenticated ? forwardingConfirmationOf(words) : null;
  if (forwarding) {
    await ports.keepForwarding(mailbox.id, forwarding);
    await ports.received(mailbox.id, at);
    return "kept_as_confirmation";
  }
  return null;
}

/**
 * Flag the thread for a person, and tell them unless the reading will (a reach-out's reply). Which emails are flagged
 * is flaggedAs's.
 */
async function flagForAPerson(
  ports: EmailIngestPorts,
  email: IncomingEmail,
  p: { tenantId: string; conversationId: string; address: string; claim: "person" | "automated"; reachOut: boolean },
): Promise<void> {
  const { tenantId, conversationId, claim, reachOut } = p;
  const flagged = await ports.escalate(
    tenantId,
    conversationId,
    "email_review",
    reachOut ? EMAIL_REVIEW_WORDS.reach_out : EMAIL_REVIEW_WORDS[claim],
  );
  // Kept and not flagged is an email nobody will be shown: the job fails and
  // the next try, finding the row unhandled, flags it.
  if (flagged === "failed")
    throw new Error("email_ingest: the email was kept but the thread could not be flagged for a person");
  // Once per hold, not once per email: a second email on a thread already
  // waiting for the same reason refreshes the flag quietly. But a thread
  // waiting for something ELSE -- the carriers, an opt-out, a failed send --
  // has just had that reason replaced by this one, and an email nobody is
  // told about is an email nobody answers. A hold that now means something
  // different is a different hold.
  if (reachOut || (flagged !== "opened" && flagged !== "changed")) return;
  await ports.tell(tenantId, {
    conversationId,
    from: p.address,
    fromName: email.from?.name ?? null,
    subject: email.subject,
    preview: bodyOf(email)?.slice(0, 280) ?? null,
    claim,
  });
}

/**
 * What the email's own words answer about being written to, one word, one answer: a STOP stops everything and says
 * nothing of offers; an unsubscribe and a yes to offers are about offers; a START is the way back from a STOP, for a
 * person with no other line to say it on. A no only narrows, so it is taken whoever the sender claims to be. A yes
 * (to offers, or a START) widens what may be sent, so it is taken only from a sender the receiving side proved
 * (`senderAuthenticated`): one whose words say yes and whose proof is missing or says no is not recorded, and
 * `unproven` has it said in the log, as either a forgery or an email the provider gave no verdict on.
 */
function answersOf(e: IncomingEmail): {
  optOut: boolean;
  unsubscribe: boolean;
  optInOffers: boolean;
  optIn: boolean;
  unproven: boolean;
  /** A person's own email from a proven sender, whatever it says: proof that their address takes and sends mail. */
  fromThemProven: boolean;
} {
  const optOut = asksToStop(e);
  const yes = !optOut && saysYesToOffers(e);
  const start = !optOut && asksToStart(e);
  const proven = e.senderAuthenticated === true;
  return {
    optOut,
    unsubscribe: !optOut && asksToUnsubscribe(e),
    optInOffers: yes && proven,
    optIn: start && proven,
    unproven: (yes || start) && !proven,
    fromThemProven: e.claim === "person" && proven,
  };
}

/**
 * Is the email's own reply the opt-out? The words a WhatsApp message is read by, except UNSUBSCRIBE (contracts
 * EMAIL_STOP_PATTERN: STOP, BAJA or ALTO and nothing else), over the words the sender wrote, never the history their client
 * quoted under them (replyTextOf): "STOP" above "On Tue ... wrote: > Your appointment is tomorrow" is a STOP, and a quote
 * of an earlier STOP under "Thanks!" is not. The carriers' extra words (CANCEL, END) are a text line's alone: in an email
 * they are a booking. An unsubscribe is not a STOP (the spec's decision 12): it is asksToUnsubscribe's.
 */
function asksToStop(e: IncomingEmail): boolean {
  return EMAIL_STOP_PATTERN.test(replyTextOf(e.text));
}

/**
 * Is the email's own reply an unsubscribe? "Unsubscribe" and nothing else, in the words they wrote
 * (EMAIL_UNSUBSCRIBE_PATTERN): offers by email end, through the same door the link's page writes through, and their visit
 * messages and replies go on. A no only narrows, so whoever the sender claims to be, it is taken.
 */
function asksToUnsubscribe(e: IncomingEmail): boolean {
  return EMAIL_UNSUBSCRIBE_PATTERN.test(replyTextOf(e.text));
}

/**
 * Does the email's own reply SAY yes to offers by email? YES OFFERS or SÍ OFERTAS and nothing else (contracts
 * MARKETING_OPT_IN_PATTERN, the words a WhatsApp message says it by), in the words they wrote, from a person (not a list or a
 * program). Whether the sender is who they say is the caller's to ask next (`senderAuthenticated`): a yes widens what may
 * be sent, so it is the one thing an email header anyone can write cannot give.
 */
function saysYesToOffers(e: IncomingEmail): boolean {
  return e.claim === "person" && MARKETING_OPT_IN_PATTERN.test(replyTextOf(e.text));
}

/**
 * Does the email's own reply say START? START, UNSTOP, RESUME or ALTA and nothing else (contracts
 * CONVERSATION_OPT_IN_PATTERN, the words a text says it by), in the words they wrote, from a person. It undoes a STOP, so
 * it widens what may be sent, and is taken on the same proof a yes to offers is (`senderAuthenticated`): until this was
 * read, a person who only has email and wrote STOP had no way to be heard from again.
 */
function asksToStart(e: IncomingEmail): boolean {
  return e.claim === "person" && CONVERSATION_OPT_IN_PATTERN.test(replyTextOf(e.text));
}

/** The words, bounded. */
function bodyOf(e: IncomingEmail): string | null {
  return e.text?.slice(0, EMAIL_BODY_MAX) ?? null;
}

/** What the row remembers about the email beside its words: enough to thread a reply under it and to show who it was from. */
function metaOf(e: IncomingEmail): Json {
  return {
    email: {
      subject: e.subject,
      message_id: e.messageId,
      in_reply_to: e.inReplyTo,
      references: e.references.slice(-20),
      from: e.from?.address ?? null,
      from_name: e.from?.name ?? null,
      to: e.to,
      cc: e.cc,
      claim: e.claim,
      attachments: e.attachments.slice(0, 5),
      more_attachments: Math.max(0, e.attachments.length - 5),
      truncated: (e.text?.length ?? 0) > EMAIL_BODY_MAX,
    },
  };
}

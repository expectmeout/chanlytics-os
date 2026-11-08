/**
 * A thread's draft, when it is owed (decision 0093). A hold's own events ask, nobody's page: the receptionist's brain in
 * its draft voice writes what the owner may send, and every page reads the one row it is kept in. Three verbs over one set
 * of ports, each safe to run twice:
 *
 *   askReplyDraft    the hold's subscriber and the sweep: whether a draft is owed (contracts replyDraftOwed), the row saying
 *                    it is being written, the job scheduled. The claim is the once-only: a message, a kind and an edition
 *                    of the rules take one, and a second ask finds it and schedules nothing.
 *   writeReplyDraft  the job: asked again (a hold answered meanwhile drafts nothing), the sender judged (a sender read as
 *                    selling to the business, or as a program, is set aside with no words written), the words written and
 *                    kept. A slow run never writes over a newer message's claim: the row says which message it is for.
 *   rewriteReplyDraft  the member waiting (the edge's door): their change to the kept words, or a Try again.
 *
 * What it writes is text: nothing leaves by any of this, and the reply's own door sends it on a press.
 */
import {
  REPLY_DRAFT_RULES,
  replyDraftOwed,
  setAsideSentence,
  setsAside,
  type CallBrief,
  type MailboxSenderVerdict,
  type ReplyDraftKind,
  type ReplyDraftSource,
  type ReplyDraftWhy,
  type SenderReading,
  recordOrEmpty,
} from "@chanlytics/contracts";
import type { ConversationDraftRow, ReplyDraftThread } from "@chanlytics/db/ask";
import type { Json } from "@chanlytics/db/types";

/** What the writer is asked: the thread's facts, and what a member wants changed. */
export interface ReplyDraftAsk {
  conversationId: string;
  contactId: string | null;
  forMessageId: string | null;
  source: ReplyDraftSource;
  /** The wire a reply goes by. */
  wire: NonNullable<ReplyDraftThread["wire"]>;
  theirWords: string | null;
  theirSubject: string | null;
  holdReason: string | null;
  holdDetails: string | null;
  /** A member's change, and the words it changes. */
  instruction: string | null;
  given: string | null;
  /** An answer to a lead who wrote back: steered by what How it reaches out says it offers, in a member's change's place. */
  answersLead?: boolean;
  /** When the writer must have answered by (epoch ms). */
  deadline: number;
  /** Who they are, where the caller knows better than their record does: a reach-out's reading says what it answered. */
  note?: string;
}

/** A reply written: the words, the subject its send would carry, what the model was handed (Why this?). */
export type ReplyWritten = { text: string; subject: string; used: readonly string[] } | { why: ReplyDraftWhy };
/** A brief for a call back written. */
export type BriefWritten = { brief: CallBrief; used: readonly string[] } | { why: ReplyDraftWhy };

/** What a draft's job asks of the world. */
export interface ReplyDraftPorts {
  /** The thread as a draft reads it (packages/db replyDraftThreadOf), or null with no such thread. */
  thread(tenantId: string, conversationId: string): Promise<ReplyDraftThread | null>;
  /** The row says it is being written: true when this call took it (00538 conversation_draft_claim). */
  claim(d: {
    tenantId: string;
    conversationId: string;
    kind: ReplyDraftKind;
    forMessageId: string | null;
    source: ReplyDraftSource;
    again?: boolean;
    staleBefore?: Date;
  }): Promise<boolean>;
  /** The draft kept, or null where its row was claimed for a newer message since (00538 conversation_draft_write). */
  keep(d: {
    tenantId: string;
    conversationId: string;
    kind: ReplyDraftKind;
    forMessageId: string | null;
    state: "ready" | "pitch" | "failed";
    words: Json;
    source: ReplyDraftSource;
    used?: readonly string[];
    whyFailed?: string | null;
    madeBy?: string | null;
  }): Promise<ConversationDraftRow | null>;
  /** A claim let go: nothing is owed any more, and no row says one is being written. */
  letGo(d: { tenantId: string; conversationId: string; kind: ReplyDraftKind }): Promise<void>;
  /** The job scheduled, once a thread, kind, message and edition while one waits. */
  scheduleDraft(
    tenantId: string,
    payload: { conversation_id: string; draft_kind: ReplyDraftKind; rules: string; message_id?: string },
  ): Promise<unknown>;
  /** What the sender of an email is, in the order a word outranks a reading (decision 0080's, PRD J). */
  sender: {
    /** What the workspace said of the address or its domain, or null. */
    said(tenantId: string, address: string): Promise<MailboxSenderVerdict | null>;
    /** Whether the business talks with the address: someone it wrote to, or knows on another wire. */
    talks(tenantId: string, address: string): Promise<boolean>;
    /** What it was read to be, if it was. */
    reading(tenantId: string, address: string): Promise<SenderReading | null>;
    /** Read now, and kept: null where nothing answered, and the thread is drafted as a person's. */
    read(
      tenantId: string,
      email: { from: string; name: string | null; subject: string | null; words: string | null; answers?: boolean },
      until: number,
    ): Promise<SenderReading | null>;
  };
  /** The thread set aside (00539): its hold resolved, nothing counted, nothing warned of. */
  setAside(tenantId: string, conversationId: string, why: "pitch" | "notice"): Promise<boolean>;
  /** The writer, which the edge holds: the brain and the workspace's whole runtime. */
  write: {
    reply(tenantId: string, ask: ReplyDraftAsk): Promise<ReplyWritten>;
    brief(tenantId: string, ask: ReplyDraftAsk): Promise<BriefWritten>;
  };
}

/** A row's words as the table keeps them (contracts ReplyDraftWords). */
const wordsOf = (w: { text?: string; subject?: string; brief?: CallBrief | null; pitch?: string }): Json => ({
  text: w.text ?? "",
  subject: w.subject ?? "",
  brief: w.brief
    ? { opening: w.brief.opening, points: [...w.brief.points], avoid: [...w.brief.avoid], ask: w.brief.ask }
    : null,
  asks: [],
  ...(w.pitch ? { pitch: w.pitch } : {}),
});

/** What is owed of a thread now, as the rows say it. */
const owedOf = (replyDraftThread: ReplyDraftThread, now: Date) =>
  replyDraftOwed({
    holdReason: replyDraftThread.holdReason,
    forMessageId: replyDraftThread.forMessageId,
    wire: replyDraftThread.wire,
    clocks: replyDraftThread.clocks,
    optedOut: replyDraftThread.optedOut,
    setAside: replyDraftThread.setAside,
    queuedReply: replyDraftThread.queuedReply,
    reachOutReply: replyDraftThread.reachOutReply,
    now,
  });

export type AskReplyDraftOutcome = "asked" | "kept" | "not_owed" | "gone";

/**
 * Whether a thread is owed a draft, and if it is, the row says so and the job is asked for. A job that could not be
 * scheduled throws: the delivery tries again, and the sweep's stale claim catches what it cannot.
 */
export async function askReplyDraft(
  ports: Pick<ReplyDraftPorts, "thread" | "claim" | "scheduleDraft">,
  cmd: { tenantId: string; conversationId: string; now: Date; again?: boolean; staleBefore?: Date },
): Promise<AskReplyDraftOutcome> {
  const thread = await ports.thread(cmd.tenantId, cmd.conversationId);
  if (!thread) return "gone";
  const owed = owedOf(thread, cmd.now);
  if (!owed) return "not_owed";
  const took = await ports.claim({
    tenantId: cmd.tenantId,
    conversationId: cmd.conversationId,
    kind: owed.kind,
    forMessageId: owed.forMessageId,
    source: "hold",
    ...(cmd.again ? { again: true } : {}),
    ...(cmd.staleBefore ? { staleBefore: cmd.staleBefore } : {}),
  });
  if (!took) return "kept";
  await ports.scheduleDraft(cmd.tenantId, {
    conversation_id: cmd.conversationId,
    draft_kind: owed.kind,
    // As text: the once-only key reads a payload's strings alone (job_dedupe_key_of, 00526).
    rules: String(REPLY_DRAFT_RULES),
    ...(owed.forMessageId ? { message_id: owed.forMessageId } : {}),
  });
  return "asked";
}

/**
 * Whether an email's sender is one the thread is set aside for: the sentence and why, or null to draft it. The owner's word
 * first, then whether the business talks with them, then what they were read to be, then a reading now. A model that does
 * not answer drafts it as a person's: wrongly writing a draft costs cents, wrongly hiding a customer does not.
 */
async function senderSetAside(
  ports: Pick<ReplyDraftPorts, "sender">,
  tenantId: string,
  replyDraftThread: ReplyDraftThread,
  until: number,
): Promise<{ sentence: string; why: "pitch" | "notice" } | null> {
  const from = replyDraftThread.theirAddress;
  if (!from) return null;
  const sentence = await ports.sender.said(tenantId, from);
  if (sentence === "person") return null;
  if (sentence !== "automated" && (await ports.sender.talks(tenantId, from))) return null;
  const kept = await ports.sender.reading(tenantId, from);
  if (sentence === "automated") return { sentence: setAsideSentence(kept?.about), why: "notice" };
  const reading =
    kept ??
    (await ports.sender.read(
      tenantId,
      {
        from,
        name: replyDraftThread.theirName,
        subject: replyDraftThread.theirSubject,
        words: replyDraftThread.theirWords,
      },
      until,
    ));
  if (!reading || !setsAside(reading.kind)) return null;
  return { sentence: setAsideSentence(reading.about), why: reading.kind };
}

/** The writer's ask for a thread. */
function askOf(
  conversationId: string,
  replyDraftThread: ReplyDraftThread,
  wire: NonNullable<ReplyDraftThread["wire"]>,
  over: { source: ReplyDraftSource; instruction: string | null; given: string | null; deadline: number },
): ReplyDraftAsk {
  return {
    conversationId,
    contactId: replyDraftThread.contactId,
    forMessageId: replyDraftThread.forMessageId,
    wire,
    theirWords: replyDraftThread.theirWords,
    theirSubject: replyDraftThread.theirSubject,
    holdReason: replyDraftThread.holdReason,
    holdDetails: replyDraftThread.holdDetails,
    ...over,
  };
}

/** What the writer answered, as the row keeps it. */
function keptOf(
  kind: ReplyDraftKind,
  written: ReplyWritten | BriefWritten,
): { state: "ready" | "failed"; words: Json; used?: readonly string[]; whyFailed?: string } {
  if ("why" in written) return { state: "failed", words: wordsOf({}), whyFailed: written.why };
  if (kind === "brief" && "brief" in written)
    return { state: "ready", words: wordsOf({ brief: written.brief }), used: written.used };
  const reply = written as Extract<ReplyWritten, { text: string }>;
  return { state: "ready", words: wordsOf({ text: reply.text, subject: reply.subject }), used: reply.used };
}

type WriteReplyDraftOutcome = "kept" | "failed" | "set_aside" | "not_owed" | "older" | "gone";

/**
 * The job's verb. Payload: the thread, the kind and the message its claim was for. A run for a message that is no longer
 * their newest stops: that message's own job has the row. Thrown by the writer, the job is tried again, and its last try
 * settles the row (jobs settle.ts) as failed.
 */
export async function writeReplyDraft(
  ports: ReplyDraftPorts,
  cmd: {
    tenantId: string;
    conversationId: string;
    kind: ReplyDraftKind;
    forMessageId: string | null;
    now: Date;
    deadline: number;
  },
): Promise<WriteReplyDraftOutcome> {
  const { tenantId, conversationId, kind } = cmd;
  const thread = await ports.thread(tenantId, conversationId);
  if (!thread) return "gone";
  const owed = owedOf(thread, cmd.now);
  if (!owed || owed.kind !== kind) {
    await ports.letGo({ tenantId, conversationId, kind });
    return "not_owed";
  }
  if (owed.forMessageId !== cmd.forMessageId) return "older";
  // Run twice (a lease that ran out): what the first run kept for this message and edition is the answer, and no model is asked.
  const kept = thread.kept.find((r) => r.kind === kind);
  if (kept && kept.state !== "writing" && kept.for_message_id === owed.forMessageId && kept.rules === REPLY_DRAFT_RULES)
    return "kept";
  const base = { tenantId, conversationId, kind, forMessageId: owed.forMessageId, source: "hold" as const };
  if (kind === "reply" && thread.wire === "email") {
    const aside = await senderSetAside(ports, tenantId, thread, cmd.deadline);
    if (aside) {
      // Kept first, and the hold resolved after it: a set-aside that failed leaves the row saying what it is, and the
      // job's next try finds the sender's reading kept and arrives here again.
      await ports.keep({ ...base, state: "pitch", words: wordsOf({ pitch: aside.sentence }) });
      await ports.setAside(tenantId, conversationId, aside.why);
      return "set_aside";
    }
  }
  const ask = askOf(conversationId, thread, thread.wire ?? "whatsapp", {
    source: "hold",
    instruction: null,
    given: null,
    deadline: cmd.deadline,
  });
  const written = kind === "brief" ? await ports.write.brief(tenantId, ask) : await ports.write.reply(tenantId, ask);
  const result = keptOf(kind, written);
  const row = await ports.keep({ ...base, ...result });
  if (!row) return "older";
  return result.state === "failed" ? "failed" : "kept";
}

export type RewriteOutcome =
  | { done: true; draft: ConversationDraftRow }
  | { done: false; refused: "gone" | "not_owed" | "nothing_to_answer" | "older" | ReplyDraftWhy };

/** The words a kept row holds, read defensively: the row's own table says little of its JSON's shape. */
function keptTextOf(row: ConversationDraftRow | undefined): string | null {
  const w = row?.words;
  if (!w || typeof w !== "object" || Array.isArray(w)) return null;
  const text = recordOrEmpty(w).text;
  return typeof text === "string" && text.trim() ? text : null;
}

/**
 * A member's change to a thread's draft, or their Try again, with them waiting. A change writes over the kept words, and
 * one that could not be written leaves them where they were: the words stand, and the refusal says why. A Try again takes a
 * row that failed, and a draft already written for this message is the answer.
 */
export async function rewriteReplyDraft(
  ports: ReplyDraftPorts,
  cmd: {
    tenantId: string;
    conversationId: string;
    kind: ReplyDraftKind;
    instruction: string | null;
    by: string | null;
    now: Date;
    deadline: number;
  },
): Promise<RewriteOutcome> {
  const { tenantId, conversationId, kind, instruction } = cmd;
  const thread = await ports.thread(tenantId, conversationId);
  if (!thread) return { done: false, refused: "gone" };
  if (kind === "reply" && !thread.forMessageId) return { done: false, refused: "nothing_to_answer" };
  const owed = owedOf(thread, cmd.now);
  // Try again asks only of what is owed: a thread answered meanwhile is not drafted for nobody. A change is the member's
  // own to ask, of any thread with something to answer.
  if (!instruction && (!owed || owed.kind !== kind)) return { done: false, refused: "not_owed" };
  const mine = thread.kept.find((r) => r.kind === kind);
  const source: ReplyDraftSource = instruction ? "rewrite" : "hold";
  const base = { tenantId, conversationId, kind, forMessageId: thread.forMessageId };
  const took = await ports.claim({ ...base, source, again: true });
  if (
    !instruction &&
    !took &&
    mine &&
    mine.state === "ready" &&
    mine.for_message_id === thread.forMessageId &&
    mine.rules === REPLY_DRAFT_RULES
  ) {
    return { done: true, draft: mine };
  }
  const ask = askOf(conversationId, thread, thread.wire ?? "whatsapp", {
    source,
    instruction,
    given: keptTextOf(mine),
    deadline: cmd.deadline,
  });
  const written = kind === "brief" ? await ports.write.brief(tenantId, ask) : await ports.write.reply(tenantId, ask);
  const kept = keptOf(kind, written);
  if ("why" in written) {
    // The kept words stand under a change the writer refused; only a row this call took says it failed.
    if (took) await ports.keep({ ...base, source, ...kept });
    return { done: false, refused: written.why };
  }
  const row = await ports.keep({ ...base, source, ...kept, madeBy: cmd.by });
  return row ? { done: true, draft: row } : { done: false, refused: "older" };
}

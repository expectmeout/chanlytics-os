/**
 * reply_read: one reply to a reach-out, read for what it means (Reach out Part 5; the plan's G1-G4, G6, G16).
 *
 * The email intake keeps the message and hands a reach-out's reply here, once per message (the ledger's
 * jobs_reply_read_once). This asks the model what the reply means, applies what that reading does through the one
 * door (the plan is contracts' readingPlan: the door executes it and decides nothing), and tells the workspace once.
 *
 *   - One reading per message (G3). A run that finds the reading already kept asks no model and pays nothing: it
 *     carries on from what the row records (a re-read owed, a notice owed).
 *   - What may be spent (G4): a workspace that may read, under the day's reads, taken before the call. A reply that is
 *     not read (no model, a workspace that may not spend, the day's reads spent, a model that threw, ran out of time or
 *     answered nothing usable) is `other`, with `unread` saying why. The chain has stopped for a person's reply
 *     already (outreach_wrote_back), and the reply is read again later, so a missed no still becomes an opt-out.
 *   - A re-read (stage reread-<n>) applies only while the reading is still unread and at the re-read before it, and
 *     tells only what nobody was told (a no, and an automatic reply's first real reading).
 *   - The draft (PR 5, decision 0017): for interested, a question and not now, the receptionist writes an answer (or a
 *     line of thanks) and it is kept on the reading, never as a message: nothing sends it but a person. It is tried
 *     once, after the apply and before the notice, so the notice carries it. A job with too little time left marks it
 *     waiting, hands it to a job of its own (stage "draft"), and tells without it; that job tells nobody.
 *   - The note a step arrives with (decision 0120, D7): a not-now's check-back, written the morning its step is due, and
 *     a first note to the person a wrong person named by address, written at once. The reading's plan says when
 *     (`ahead`), and the applying stage hands it to a job of its own (stage "ahead"), which writes it only while the step
 *     is still open, nothing newer came from them and the lead still stands, and keeps it with the step (a draft of
 *     kind `step` on their thread). It is text: nothing sends it but a person, from the step.
 *   - The notice, in two phases (B2): the claim, then the telling, then the mark only once the owner was told. A
 *     telling that failed throws, so the ledger tries again once the claim has gone stale; told is never marked before.
 *   - What the intake opened, the reading closes (closeWhatTheIntakeOpened): the intake flags every reach-out reply
 *     that is not an automatic one for a person (email_review), since until it is read nobody knows what it means. A
 *     no resolves that flag and archives the thread; a wrong person and a not now resolve the flag; the rest leave it
 *     to a person. An automatic reply was never flagged, so its reading closes nothing. The applying run's, after the
 *     apply and before the notice. Where the second key is on (decision 0084), a close goes only when the second model
 *     read the same intent at the reader's floor: otherwise the thread stays open for a person, the reading and its plan
 *     as they are (a no's opt-out is kept: missing one is the worse mistake).
 *
 * It sends nothing to the business. The pages (PRs 7 and 8) come later.
 */
import {
  AUTOMATIC_NAMING,
  DRAFT_NEEDS_MS,
  leadReplyNote,
  parseReplyReading,
  readingPlan,
  replyNoticeWords,
  replySystemPrompt,
  replyTextOf,
  replyUserContent,
  rereadAt,
  SECOND_KEY_OFF,
  secondKeyLets,
  signerAgrees,
  signerOf,
  UNREAD_READING,
  zoneDayKey,
  type DraftWhy,
  type ReadingPlan,
  type ReplyAhead,
  type LeadNoteKind,
  type ReplyClaim,
  type ReplyIntent,
  type ReplyReading,
  type SecondKey,
  type Unread,
} from "@chanlytics/contracts";
import type { TenantId } from "@chanlytics/contracts";

/** The reply and the reach-out it answers, as the job reads them (packages/db reachOutReplyOf). */
export interface ReplyFacts {
  conversationId: string;
  /** What the intake said of the email: never the owner's word (00429), which is no email and is never read here. */
  claim: Exclude<ReplyClaim, "owner">;
  /** Their words as the thread keeps them; the quoted history is cut here (replyTextOf). */
  text: string | null;
  subject: string | null;
  /** The intake's bare sender address (its from.address), never the From header's display-name form. */
  from: string | null;
  /** When it arrived, epoch ms. */
  receivedAt: number;
  /** The email it answers, its first words. */
  answered: string | null;
  business: string;
  /** The address the reach-out wrote to, and the lead's website. */
  leadAddress: string | null;
  leadWebsite: string | null;
  /** Whether the finder saw that website as its host's root (00237); null when it was not kept. */
  leadWebsiteRoot?: boolean | null;
  /** The chain's signature ({{your name}}), which a draft ends with. */
  signedBy: string | null;
  /** The business's zone. */
  tz: string;
  /** The From line's own words, and the names a signer can never be: the workspace's and its members' (0052). */
  fromName?: string | null;
  notNames?: readonly string[];
}

/** A reading as it is kept. */
export interface KeptReading {
  intent: ReplyIntent;
  summary: string | null;
  unread: Unread | null;
  /** The re-reads already applied. */
  rereads: number;
  /** Whether its plan tells the owner. */
  tell: boolean;
  told: boolean;
  undone: boolean;
  /** What its plan drafts (contracts readingPlan), and how far the draft got: its text once written. */
  draft: "answer" | "thanks" | null;
  draftState: DraftState;
  draftText: string | null;
  /** The reply's signer while their name is offered (0052, "Use this name"); null otherwise. */
  signerOffered: string | null;
  /** The note its step arrives with (the plan's `ahead`, decision 0120); null for none. */
  ahead: ReplyAhead | null;
  /** The step the reading made on the lead's person (the plan's `changed.step`), once it made one. */
  stepId: string | null;
  /** Who a wrong person said to write to, as they wrote it. */
  referTo: string | null;
}

/** reach_out_replies.draft_state. */
export type DraftState = "none" | "waiting" | "written" | "not_written";

/** A draft's mark: waiting for a job of its own, written, or not written and why. */
export type DraftMark =
  { state: "waiting" } | { state: "written"; draft: string } | { state: "not_written"; why: DraftWhy };

/** The reader's answer, unparsed (null when it answered nothing), and what its second key read of the intent (decision 0084). */
export interface ReplyAsked {
  answer: unknown;
  second: SecondKey;
}

/** The notice as the workspace is told it: words only; where it goes and how is the runtime's. */
export interface ReplyNotice {
  conversationId: string;
  subject: string;
  body: string;
  /** What the platform may be told when the workspace cannot be: no business, no words of theirs. */
  redacted: string;
}

export interface ReplyReadPorts {
  /** Whose reply this is, and the reply: null when it answers no reach-out. Throws when it cannot be read. */
  reply(tenantId: TenantId, messageId: string): Promise<ReplyFacts | null>;
  /** The reading kept for this message, if any. Throws when it cannot be read. */
  reading(tenantId: TenantId, messageId: string): Promise<KeptReading | null>;
  /**
   * Whether one read may be spent now, taken when it may: null when it was taken, else why not (no model, a workspace
   * that may not spend, the day's reads spent). Throws when it cannot be asked.
   */
  mayRead(tenantId: TenantId, at: number): Promise<Exclude<Unread, "model_failed"> | null>;
  /** The model's answer to the reader's question, and its second key's read (ReplyAsked). Throws on a failed call. */
  ask(system: string, user: string): Promise<ReplyAsked>;
  /** The reading and its plan, applied once (reach_out_reply_apply). True when this call applied it. */
  apply(
    tenantId: TenantId,
    messageId: string,
    p: { reading: ReplyReading; unread: Unread | null; plan: ReadingPlan; reread: number },
  ): Promise<boolean>;
  /**
   * The notice's first phase: this run's claim (its moment, as the row keeps it), or null when a live claim holds it or
   * it was told. A claim older than `staleBefore` is claimed again.
   */
  claimTell(tenantId: TenantId, messageId: string, staleBefore: number): Promise<string | null>;
  /** Tell the workspace: true only when the owner was told. */
  tell(tenantId: TenantId, notice: ReplyNotice): Promise<boolean>;
  /** The notice's second phase: marked told, only while this run's claim still holds it. */
  told(tenantId: TenantId, messageId: string, claim: string): Promise<void>;
  /**
   * The receptionist's draft of an answer to their reply, over the thread and the lead note: the text, or which gate
   * stopped it (contracts draftRefusal) or that it was not drafted. Throws when it failed; no call runs past `deadline`.
   */
  draft(
    tenantId: TenantId,
    ask: { conversationId: string; text: string; note: string; deadline: number; kind: LeadNoteKind },
  ): Promise<{ text: string; used?: readonly string[] } | { why: DraftWhy }>;
  /**
   * Whether a step's note is still owed (decision 0120): its step open (not done, not gone), nothing newer from them on
   * the thread since this reply, and the lead still there and not closed. Throws when it cannot be read.
   */
  aheadOwed(
    tenantId: TenantId,
    owed: { messageId: string; conversationId: string; stepId: string; receivedAt: number },
  ): Promise<boolean>;
  /** The note kept with its step: a draft of kind `step` on their thread, naming the step and whom it is to. */
  keepAhead(
    tenantId: TenantId,
    note: {
      conversationId: string;
      messageId: string;
      stepId: string;
      text: string;
      subject: string | null;
      to: string | null;
    },
  ): Promise<void>;
  /**
   * The draft kept where every page reads a thread's draft (decision 0093, conversation_drafts). Absent, the reading alone
   * holds it. A failure costs the page its draft, never the reading.
   */
  keepDraft?(
    tenantId: TenantId,
    d: { conversationId: string; messageId: string; text: string; subject: string | null; used: readonly string[] },
  ): Promise<unknown>;
  /** The draft's mark (reach_out_reply_draft): only from none or waiting, so a second stage never writes over the first. */
  markDraft(tenantId: TenantId, messageId: string, mark: DraftMark): Promise<boolean>;
  /** This message's next read, or its draft, at most once per stage. */
  scheduleOnce(at: number, payload: { message_id: string; stage: string }): Promise<"scheduled" | "already_scheduled">;
  /**
   * The thread's open flag of this reason resolved as the platform's own close: no member is named as resolving it and
   * no decision is recorded. True iff a row changed; false when none was open for that reason (a person resolved it
   * first, or it was replaced by another). A write that fails throws.
   */
  resolveEscalation(tenantId: TenantId, conversationId: string, reason: typeof INTAKE_FLAG): Promise<boolean>;
  /** The thread archived (contracts' archive move, whole), unless it is archived already. True iff a row changed. A write that fails throws. */
  archiveConversation(tenantId: TenantId, conversationId: string): Promise<boolean>;
  now(): number;
}

/** The flag the intake raises on a reach-out reply's thread (email-ingest.ts flagForAPerson): what a reading may close. */
const INTAKE_FLAG = "email_review" as const;

export interface ReadReplyCommand {
  tenantId: TenantId;
  messageId: string;
  /** The job's stage: absent or "read" for the first read, "reread-<n>" for the n-th re-read. */
  stage?: unknown;
  /** How long a claim on the notice holds before another run may take it: the job's lease. */
  tellStaleMs: number;
  /** When this job stops starting work (epoch ms): a draft needs DRAFT_NEEDS_MS of it. */
  deadline: number;
}

export type ReadReplyOutcome =
  "not_a_reply" | "already_read" | "read" | "told" | "drafted" | "written" | "not_owed" | "not_written";

/** The stage that drafts a reading's answer once a first job ran out of time for it. */
const DRAFT_STAGE = "draft";

/** The stage that writes the note a step arrives with, on its day (decision 0120). */
const AHEAD_STAGE = "ahead";

/** Which read a stage is: 0 for the first, n for "reread-<n>". */
export function rereadOf(stage: unknown): number {
  if (stage === undefined || stage === null || stage === "read") return 0;
  const m = typeof stage === "string" ? /^reread-([1-3])$/.exec(stage) : null;
  if (!m) throw new Error(`reply_read: no such stage ${JSON.stringify(stage)}`);
  return Number(m[1]);
}

/** Read now, or not: a first read that finds none kept, or the re-read due next on a reading still unread. */
function isDue(kept: KeptReading | null, n: number): boolean {
  if (n === 0) return !kept;
  return !!kept && !kept.undone && kept.unread !== null && kept.rereads === n - 1;
}

async function readNow(
  ports: ReplyReadPorts,
  cmd: ReadReplyCommand,
  facts: ReplyFacts,
): Promise<{ reading: ReplyReading | null; unread: Unread | null; now: number; second: SecondKey }> {
  const now = ports.now();
  const gate = await ports.mayRead(cmd.tenantId, now);
  if (gate) return { reading: null, unread: gate, now, second: SECOND_KEY_OFF };
  let reading: ReplyReading | null;
  let second: SecondKey = SECOND_KEY_OFF;
  try {
    const user = replyUserContent({
      text: replyTextOf(facts.text),
      subject: facts.subject,
      automatic: facts.claim === "auto_reply",
      receivedDay: zoneDayKey(facts.receivedAt, facts.tz),
      answered: facts.answered,
    });
    const request = await ports.ask(replySystemPrompt(), user);
    second = request.second;
    reading = parseReplyReading(request.answer);
    // Who signed it, kept only when it passes the person page's gate (0052): word for word in their own lines, one
    // person's own name, never ours, the business's, the workspace's or a member's, and never from a no.
    if (reading)
      reading = {
        ...reading,
        signer: signerOf({
          name: reading.signer?.name,
          title: reading.signer?.title,
          text: facts.text,
          intent: reading.intent,
          claim: facts.claim,
          business: facts.business,
          from: facts.from,
          notNames: [facts.signedBy, ...(facts.notNames ?? [])],
        }),
      };
  } catch {
    // A call that threw or ran out of time is a reply not read, not a job that failed: the read is spent and the reply
    // is `other` meanwhile. The read runs again on the schedule contracts' rereadAt gives (G4, below).
    reading = null;
  }
  return { reading, unread: reading ? null : "model_failed", now, second };
}

/** Ask the receptionist, and keep what it answered on the reading: a draft, or why there is none. It never throws. */
async function draftNow(
  ports: ReplyReadPorts,
  cmd: ReadReplyCommand,
  facts: ReplyFacts,
  kind: "answer" | "thanks",
): Promise<void> {
  let out: { text: string; used?: readonly string[] } | { why: DraftWhy };
  try {
    out = await ports.draft(cmd.tenantId, {
      conversationId: facts.conversationId,
      text: replyTextOf(facts.text),
      note: leadReplyNote({ business: facts.business, answered: facts.answered, kind }),
      deadline: cmd.deadline,
      kind,
    });
  } catch {
    // A brain that failed or ran out of time drafts nothing: the reading and its notice stand without it.
    out = { why: "not_drafted" };
  }
  const text = "text" in out ? out.text.trim() : "";
  await ports.markDraft(
    cmd.tenantId,
    cmd.messageId,
    text ? { state: "written", draft: text } : { state: "not_written", why: "why" in out ? out.why : "not_drafted" },
  );
  // The thread's one draft (decision 0093): what every page reads and a member changes. A row that could not be kept costs
  // the page its draft, never the reading or its notice, which carries the words.
  if (text && ports.keepDraft) {
    await ports
      .keepDraft(cmd.tenantId, {
        conversationId: facts.conversationId,
        messageId: cmd.messageId,
        text,
        subject: facts.subject,
        used: "used" in out ? (out.used ?? []) : [],
      })
      .catch(() => undefined);
  }
}

/**
 * The draft stage, between the apply and the notice (G16): drafted now when the job has the time, else marked waiting
 * and handed to a job of its own. Answers the draft the notice carries, if one was written.
 */
async function draftStage(
  ports: ReplyReadPorts,
  cmd: ReadReplyCommand,
  facts: ReplyFacts,
  kept: KeptReading,
): Promise<string | null> {
  if (!kept.draft || kept.draftState !== "none") return kept.draftText;
  if (cmd.deadline - ports.now() < DRAFT_NEEDS_MS) {
    await ports.markDraft(cmd.tenantId, cmd.messageId, { state: "waiting" });
    await ports.scheduleOnce(ports.now(), { message_id: cmd.messageId, stage: DRAFT_STAGE });
    return null;
  }
  await draftNow(ports, cmd, facts, kept.draft);
  // Read back: a run that marked it first (a retry, the draft's own job) is the one kept.
  return (await ports.reading(cmd.tenantId, cmd.messageId))?.draftText ?? null;
}

/**
 * What the intake opened, the reading closes. The intake flags every reach-out reply but an automatic one for a person
 * (email_review, "They wrote back to your reach-out..."), since until it is read nobody knows what it means; a reading
 * that leaves a person nothing to do on the thread closes the flag, or the Inbox says "Said no" and "Needs you" of one
 * thread. A no closes the thread too: archived, contracts' archive move, and their next email reopens it as ingest's
 * reopen does any closed thread. A wrong person and a not now resolve the flag alone: the step on Today is what is left
 * to do. An interested, a question, an away and an other leave the flag: a person answers, or reads. An automatic
 * reply's reading closes nothing, since the intake opened nothing for it: a flag on its thread is another email's, a
 * person's, and a robot's "remove us" is not the answer to it. Nor does a reading its second key did not agree with
 * (decision 0084): a misread no would archive an interested reply, so the thread stays for a person to read. The platform's own close, so no decision is recorded
 * and no member is named, as settle.ts flags and 00222 applies. Each write is counted and guarded in the repository,
 * so a thread archived or a flag resolved already changes nothing.
 */
async function closeWhatTheIntakeOpened(
  ports: Pick<ReplyReadPorts, "resolveEscalation" | "archiveConversation">,
  tenantId: TenantId,
  conversationId: string,
  read: { intent: ReplyIntent; claim: ReplyClaim; second: SecondKey },
): Promise<void> {
  const { intent, claim, second } = read;
  if (claim === "auto_reply") return;
  if (intent !== "no" && intent !== "wrong_person" && intent !== "not_now") return;
  if (!secondKeyLets("reply_read", second, intent)) return;
  await ports.resolveEscalation(tenantId, conversationId, INTAKE_FLAG);
  if (intent === "no") await ports.archiveConversation(tenantId, conversationId);
}

/**
 * The note a step arrives with (decision 0120, D7), on its day: written by the receptionist as the owner would send it,
 * and kept with the step, while the step is still open, nothing newer came from them and the lead still stands. A note
 * the receptionist would not write (no receptionist, drafts off, the day's budget) leaves the step as it was: the owner
 * writes it there, as before. Tells nobody: the step is on Today on its day.
 */
async function writeAhead(ports: ReplyReadPorts, cmd: ReadReplyCommand): Promise<ReadReplyOutcome> {
  const facts = await ports.reply(cmd.tenantId, cmd.messageId);
  if (!facts) return "not_a_reply";
  const kept = await ports.reading(cmd.tenantId, cmd.messageId);
  const ahead = kept?.ahead;
  if (!kept || kept.undone || !ahead || !kept.stepId) return "not_owed";
  const owed = await ports.aheadOwed(cmd.tenantId, {
    messageId: cmd.messageId,
    conversationId: facts.conversationId,
    stepId: kept.stepId,
    receivedAt: facts.receivedAt,
  });
  if (!owed) return "not_owed";
  if (cmd.deadline - ports.now() < DRAFT_NEEDS_MS)
    throw new Error("reply_read: no time left to write a step's note; the ledger tries again");
  let out: { text: string; used?: readonly string[] } | { why: DraftWhy };
  try {
    out = await ports.draft(cmd.tenantId, {
      conversationId: facts.conversationId,
      text: replyTextOf(facts.text),
      note: leadReplyNote({
        business: facts.business,
        answered: facts.answered,
        kind: ahead.kind,
        referTo: kept.referTo,
      }),
      deadline: cmd.deadline,
      kind: ahead.kind,
    });
  } catch {
    // A brain that failed or ran out of time writes nothing: the step stands as it always did.
    out = { why: "not_drafted" };
  }
  const text = "text" in out ? out.text.trim() : "";
  if (!text) return "not_written";
  await ports.keepAhead(cmd.tenantId, {
    conversationId: facts.conversationId,
    messageId: cmd.messageId,
    stepId: kept.stepId,
    text,
    subject: facts.subject,
    to: ahead.to,
  });
  return "written";
}

/** The draft's own job: drafts a reading still waiting, and tells nobody (the first job told the owner without it). */
async function draftLater(ports: ReplyReadPorts, cmd: ReadReplyCommand): Promise<ReadReplyOutcome> {
  const facts = await ports.reply(cmd.tenantId, cmd.messageId);
  if (!facts) return "not_a_reply";
  const kept = await ports.reading(cmd.tenantId, cmd.messageId);
  if (!kept || kept.undone || !kept.draft || (kept.draftState !== "none" && kept.draftState !== "waiting"))
    return "already_read";
  if (cmd.deadline - ports.now() < DRAFT_NEEDS_MS)
    throw new Error("reply_read: no time left to draft; the ledger tries again");
  await draftNow(ports, cmd, facts, kept.draft);
  return "drafted";
}

export async function readReply(ports: ReplyReadPorts, cmd: ReadReplyCommand): Promise<ReadReplyOutcome> {
  if (cmd.stage === DRAFT_STAGE) return draftLater(ports, cmd);
  if (cmd.stage === AHEAD_STAGE) return writeAhead(ports, cmd);
  const reread = rereadOf(cmd.stage);
  const { tenantId, messageId } = cmd;
  const facts = await ports.reply(tenantId, messageId);
  if (!facts) return "not_a_reply";
  let kept = await ports.reading(tenantId, messageId);
  // Whether THIS run applied the reading: the close below is that run's and no other's, held by its second key.
  let applied = false;
  let second: SecondKey = SECOND_KEY_OFF;

  if (isDue(kept, reread)) {
    const read = await readNow(ports, cmd, facts);
    const { reading, unread, now } = read;
    second = read.second;
    const planned = readingPlan(reading, {
      claim: facts.claim,
      receivedAt: facts.receivedAt,
      tz: facts.tz,
      business: facts.business,
      leadAddress: facts.leadAddress,
      leadWebsite: facts.leadWebsite,
      leadWebsiteRoot: facts.leadWebsiteRoot ?? null,
      replyFrom: facts.from,
      reread: reread > 0,
      readAt: now,
    });
    // Automatic naming (0052): only while it is on, and only when two independent signals agree.
    const signer = reading?.signer ?? null;
    const plan: ReadingPlan = {
      ...planned,
      adoptSigner: AUTOMATIC_NAMING && !!signer && signerAgrees(signer, { address: facts.from, name: facts.fromName }),
    };
    applied = await ports.apply(tenantId, messageId, {
      reading: reading ?? UNREAD_READING,
      unread,
      plan,
      reread: reread,
    });
    kept = await ports.reading(tenantId, messageId);
    if (!kept) throw new Error("reply_read: the reading was applied and is not there");
  }
  // Only this stage's own reading is carried on from: a later re-read, or an undo, has the row now.
  if (!kept || kept.undone || kept.rereads !== reread) return "already_read";

  // Still unread: read again later, once per stage, while there are tries and days left (G4).
  if (kept.unread) {
    const at = rereadAt(kept.unread, reread, facts.receivedAt, ports.now());
    if (at !== null) await ports.scheduleOnce(at, { message_id: messageId, stage: `reread-${reread + 1}` });
  }

  // The applying run's alone, and before the notice, so the thread the notice brings the owner to is closed already.
  // A later run (the ledger's retry of a notice that failed, a second webhook) finds the reading kept and closes
  // nothing again: by then the business may have written once more, under a flag of its own, and a close that ran
  // on every pass would resolve that one. A run that dies between the apply and here leaves the flag to a person.
  if (applied)
    await closeWhatTheIntakeOpened(ports, tenantId, facts.conversationId, {
      intent: kept.intent,
      claim: facts.claim,
      second,
    });

  // The note its step arrives with (decision 0120), handed to its own job for the moment the plan names: once per
  // message, whichever run of this stage gets here first.
  if (kept.ahead && kept.stepId)
    await ports.scheduleOnce(Math.max(Date.parse(kept.ahead.at), ports.now()), {
      message_id: messageId,
      stage: AHEAD_STAGE,
    });

  // Tried once, before the notice, so the notice carries it (G16). A re-read's plan never drafts.
  const draft = await draftStage(ports, cmd, facts, kept);

  if (!kept.tell || kept.told) return "read";
  // B2: claim, tell, and only then mark told. A claim another run holds is not this run's to finish: it throws, and the
  // ledger tries again once the claim is stale (its waits outlast the lease), when the notice is either told or free.
  // A run that died holding the claim is how that happens, and "done" there would lose the notice for good.
  const claim = await ports.claimTell(tenantId, messageId, ports.now() - cmd.tellStaleMs);
  if (!claim) throw new Error("reply_read: another run holds the notice; tried again once its claim is stale");
  const words = replyNoticeWords({
    intent: kept.intent,
    business: facts.business,
    summary: kept.summary ?? "",
    quote: replyTextOf(facts.text),
    draft,
    unread: kept.unread,
    automatic: facts.claim === "auto_reply",
    reread: reread > 0,
    signer: kept.signerOffered,
  });
  const notice = await ports.tell(tenantId, {
    conversationId: facts.conversationId,
    subject: words.subject,
    body: words.body,
    redacted: words.redacted,
  });
  if (!notice) throw new Error("reply_read: the notice did not reach its owner");
  await ports.told(tenantId, messageId, claim);
  return "told";
}

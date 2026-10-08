import {
  AppError,
  DAY_MS,
  NEW_CONVERSATION_WORDS,
  REPLY_LIMITS,
  writeWaysOf,
  type ChannelsReady,
  type ConsentChannel,
  type TenantId,
  type WriteRow,
  type WriteWay,
} from "@chanlytics/contracts";
import { handBack, type HandBackPorts } from "./hand-back";
import {
  EMAIL_NEEDS_SUBJECT_REFUSAL,
  replyToConversation,
  shapeTemplate,
  type ReplyBody,
  type ReplyPorts,
  type ReplyReceipt,
  type ReplyThread,
} from "./reply";

/**
 * A member begins a conversation with one person (a conversation begins from the Inbox): a message by the wire they
 * chose, to someone who may never have written. The same send as a reply's, through the same verb and the same door,
 * with four things a reply never needs: the wire is the member's choice, judged before anything is written (contracts
 * writeWaysOf, the one rule the sheet drew its choices from); what the reply verb would refuse is asked before the
 * person's thread is opened, so a refusal leaves no empty thread; the thread is opened when they have none; and the
 * member says who answers what comes back, with the plan kept as a note the receptionist reads before it is asked to.
 *
 * It is also how a thread's own reply box writes on a thread nothing has come to (the dashboard's reply route): what
 * is written there answers nobody, so it is judged as the start it is.
 */
export interface BeginPorts {
  /** The reply verb's world: the message is queued, claimed and scheduled exactly as a reply is. */
  reply: ReplyPorts;
  /** The hand-back verb's world, for a message the receptionist answers. */
  handBack: HandBackPorts;
  /** People's own row for this person, or null when they are not this workspace's (gone, erased, merged away). */
  person(tenantId: TenantId, personId: string): Promise<WriteRow | null>;
  /** What the workspace can send on now, asked fresh: a send is about to be committed on it. */
  ready(tenantId: TenantId): Promise<ChannelsReady>;
  /** Their one thread, opened when they have none, as the reply verb reads a thread. */
  open(tenantId: TenantId, personId: string): Promise<ReplyThread>;
  /** Whether a text of ours has ever reached them on this thread: what decides the line a first text carries. */
  textedBefore(tenantId: TenantId, conversationId: string): Promise<boolean>;
  /**
   * A first text as it leaves: with the line that says how to stop, which the first text to a number owes (channels
   * smsBody). Null when the words and that line do not fit one text: a line the carrier's ceiling cut is no line.
   */
  firstText(text: string): string | null;
  /**
   * The plan, kept on the person's page through the notes door (0007), as themselves, for the receptionist to read.
   * Answers the note's id where the door says it.
   */
  keepNote(personId: string, body: string): Promise<string | null>;
}

export interface BeginCommand {
  tenantId: TenantId;
  personId: string;
  userId: string;
  /** The wire the member chose. Required: nothing here guesses where a first message goes. */
  wire: ConsentChannel;
  body: ReplyBody;
  /**
   * Who answers what they write back: the receptionist, with the thread handed back at once, or the member, who
   * keeps the thread as a reply keeps it. Required: a first message must not decide this by default.
   */
  then: "receptionist" | "me";
  /**
   * The plan, as the note the receptionist reads: kept once the message is queued and before the thread is handed
   * back, so the receptionist never answers this person without it. Absent where the member answers, or left it out.
   */
  note?: string;
  /** Their thread, where the caller already holds it (the thread's own reply box): nothing is opened then. */
  conv?: ReplyThread;
  /**
   * The key this send is known by: the client's own for one press of Send. The reply verb claims it before anything is
   * written and keeps its receipt before the job exists, so a retry after a failure further on (the ledger's row, the
   * note, the hand-back, a request that died) is answered with that receipt and queues nothing twice.
   */
  idempotencyKey?: string | null;
}

export interface BeginReceipt extends ReplyReceipt {
  conversation_id: string;
  /** The thread went back to the receptionist once the message was queued. */
  handed_back: boolean;
  /** The note was kept; false when it could not be, with the message still on its way; null when none was asked. */
  note_kept: boolean | null;
  /** The note that was kept, so a send taken back inside its window takes the note that said it with it. */
  note_id: string | null;
}

/**
 * What the reply verb would refuse, asked first, so a message it refuses opens no thread: an approved message found,
 * judged and filled by the verb's own function (reply.ts shapeTemplate: its standing, its purpose against the yes to
 * offers, a slot the Inbox does not fill, the workspace's facts and link); the words and their length on the wire; and
 * a first email's subject. Answers the words as they leave where they are not the words written: a first text with the
 * line that says how to stop.
 */
async function fitsWire(
  ports: BeginPorts,
  cmd: BeginCommand,
  row: WriteRow,
  way: WriteWay,
): Promise<string | undefined> {
  const W = NEW_CONVERSATION_WORDS.refusals;
  const { body } = cmd;
  if (way.carries === "approved") {
    if (!body.template?.name) throw new AppError("window_closed", W.approvedOnly);
    await shapeTemplate(
      ports.reply,
      { tenant_id: cmd.tenantId, marketing_consent: row.marketing_consent ?? null },
      body,
    );
    return undefined;
  }
  const words = body.text?.trim();
  if (!words) throw new AppError("validation", W.noWords);
  if (words.length > REPLY_LIMITS[way.wire].max) throw new AppError("validation", REPLY_LIMITS[way.wire].refusal);
  // An email that answers none of theirs names its subject; a thread they have may hold the business's last to go under.
  if (way.wire === "email" && !body.subject?.trim() && !row.latest_conversation_id)
    throw new AppError("validation", EMAIL_NEEDS_SUBJECT_REFUSAL);
  if (way.wire !== "sms") return undefined;
  // The line that says how to stop is owed by the first text of ours to reach them, start or not: someone who phoned is
  // answered, and has still never had a text from the business. The receptionist's own rule (db textedBefore).
  const thread = cmd.conv?.id ?? row.latest_conversation_id;
  if (thread && (await ports.textedBefore(cmd.tenantId, thread))) return undefined;
  const text = ports.firstText(words);
  if (text === null) throw new AppError("validation", W.noRoomForStop);
  return text === words ? undefined : text;
}

export async function beginConversation(ports: BeginPorts, cmd: BeginCommand): Promise<BeginReceipt> {
  const W = NEW_CONVERSATION_WORDS.refusals;
  const row = await ports.person(cmd.tenantId, cmd.personId);
  if (!row) throw new AppError("not_found", W.notYours, 404);
  const now = new Date(ports.reply.now());
  const way = writeWaysOf(row, await ports.ready(cmd.tenantId), now).find((w) => w.wire === cmd.wire);
  // Refused before a thread is opened or a word is written: a refusal here means nothing happened.
  if (!way || !way.ok) throw new AppError("conflict", way?.why ?? W.notThatWay);
  const leavesAs = await fitsWire(ports, cmd, row, way);
  const conv = cmd.conv ?? (await ports.open(cmd.tenantId, cmd.personId));
  const receipt = await replyToConversation(
    // The wire is the member's choice here, where a reply's is where the person last wrote.
    { ...ports.reply, replyChannel: () => Promise.resolve(way.wire) },
    {
      conv,
      userId: cmd.userId,
      body: cmd.body,
      idempotencyKey: cmd.idempotencyKey ?? null,
      // The key names one press, not the words, so its receipt answers for as long as a key is kept.
      replayMs: DAY_MS,
      starts: way.starts,
      ...(leavesAs === undefined ? {} : { leavesAs }),
    },
  );
  // The plan is kept once the message is queued and before the thread is handed back, so the receptionist never
  // answers without it. A note that could not be kept never makes a queued message read as one that failed.
  const noted = cmd.note
    ? await ports.keepNote(cmd.personId, cmd.note).then(
        (id) => ({ note_kept: true, note_id: id }),
        () => ({ note_kept: false, note_id: null }),
      )
    : { note_kept: null, note_id: null };
  if (cmd.then !== "receptionist") return { ...receipt, conversation_id: conv.id, handed_back: false, ...noted };
  // The message is queued and is the member's own, so the hold a reply takes is let go at once: what the person
  // writes back is the receptionist's to answer, by the workspace's own rules. A hand-back that fails never makes a
  // queued message read as one that failed: the thread stays the member's, and the receipt says so.
  const handed_back = await handBack(ports.handBack, {
    conv: { ...conv, paused_until: null },
    userId: cmd.userId,
  }).then(
    () => true,
    () => false,
  );
  return { ...receipt, conversation_id: conv.id, handed_back, ...noted };
}

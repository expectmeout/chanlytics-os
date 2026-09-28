/**
 * A reach-out's replies, as the dashboard reads and undoes them (Reach out Part 5, PR 6): the readings a page shows,
 * on the member's own client so RLS decides what they see, and "read as no · undo" through its door (00222
 * reach_out_reply_undo), whose own test says whether a reading may be undone and why not.
 */
import {
  AppError,
  DAY_MS,
  isDraftWhy,
  isReplyUndoRefusal,
  isUnread,
  REACH_OUT_REPLY_DAYS,
  REPLIES_PAGE,
  REPLY_UNDO_REFUSALS,
  type ReachOutRepliesQuery,
  type ReachOutReplyDto,
  type ReplyFrom,
  type ReplyUndoRefusal,
} from "@chanlytics/contracts";
import {
  lastInboundEmail,
  reachOutStepsOf,
  repliesFor,
  replyUndoableOf,
  undoReplyReading,
  type Json,
  type ReachOutStepRow,
  type ReplyListRow,
} from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import { replyFromOf, replyIdentityOf } from "../connections/email";
import { sendingDomainsFor } from "../connections/sending-domains";

/** A chain's name and the step's place in it, 1 for its first email, by walking back to the chain's first step. */
function stepOf(
  playbookId: string | null,
  steps: Map<string, ReachOutStepRow>,
): { chain: string | null; step: number | null } {
  let at = playbookId ? steps.get(playbookId) : undefined;
  if (!at) return { chain: null, step: null };
  let n = 1;
  while (at.after_playbook_id && n <= steps.size) {
    const before = steps.get(at.after_playbook_id);
    if (!before) break;
    at = before;
    n += 1;
  }
  return { chain: at.name, step: n };
}

/** Where an answer on each thread goes out from, as the freeze will decide it: once per thread, the domains read once. */
async function replyFromByThread(
  ctx: RouteContext,
  tenantId: string,
  conversations: string[],
): Promise<Map<string, ReplyFrom>> {
  if (conversations.length === 0) return new Map();
  const domains = await sendingDomainsFor(ctx.supabase, tenantId);
  const each = await Promise.all(
    conversations.map(async (id) => {
      const parent = await lastInboundEmail(ctx.supabase, tenantId, id);
      const references = parent ? [...parent.references, ...(parent.rfcMessageId ? [parent.rfcMessageId] : [])] : [];
      const who = await replyIdentityOf(ctx.supabase, { tenantId, conversationId: id, references, domains });
      return [id, replyFromOf(who)] as const;
    }),
  );
  return new Map(each);
}

/**
 * The door's own answer (reach_out_reply_undoable) for each no not undone yet: only a no that stands is ever asked, and
 * what else holds it (its seven days, who asks, what moved since) is the door's to say.
 */
async function undoableByMessage(ctx: RouteContext, rows: ReplyListRow[]): Promise<Set<string>> {
  const candidates = rows.filter((r) => r.intent === "no" && r.undone_at === null);
  const answers = await Promise.all(
    candidates.map(async (r) => [r.message_id, await replyUndoableOf(ctx.supabase, r.message_id)] as const),
  );
  return new Set(answers.filter(([, why]) => why === null).map(([id]) => id));
}

const DRAFT_STATES = new Set(["none", "waiting", "written", "not_written"]);

/**
 * The workspace's readings since `since` (at most the reading's own window back), newest first, one thread's alone
 * when asked: what each was read as and did, its draft, whether this member may undo it, and where an answer goes out
 * from.
 */
export async function listReplies(
  ctx: RouteContext,
  tenantId: string,
  q: ReachOutRepliesQuery,
  now = Date.now(),
): Promise<{ replies: ReachOutReplyDto[] }> {
  const floor = now - REACH_OUT_REPLY_DAYS * DAY_MS;
  const since = q.since && Date.parse(q.since) > floor ? new Date(Date.parse(q.since)) : new Date(floor);
  const rows = await repliesFor(ctx.supabase, {
    tenantId,
    since: since.toISOString(),
    conversationId: q.conversation_id ?? null,
    limit: REPLIES_PAGE,
  });
  const [steps, from, undoable] = await Promise.all([
    rows.length ? reachOutStepsOf(ctx.supabase, tenantId) : Promise.resolve([]),
    replyFromByThread(ctx, tenantId, [...new Set(rows.map((r) => r.conversation_id))]),
    undoableByMessage(ctx, rows),
  ]);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const replies = rows.map((r): ReachOutReplyDto => {
    const { chain, step } = stepOf(r.playbook_id, byId);
    return {
      message_id: r.message_id,
      conversation_id: r.conversation_id,
      read_at: r.read_at,
      intent: r.intent as ReachOutReplyDto["intent"], // the table's check holds it to REPLY_INTENTS
      claim: r.claim as ReachOutReplyDto["claim"], // and this to the three claims
      summary: r.summary,
      named_day: r.named_day,
      refer_to: r.refer_to,
      unread: isUnread(r.unread) ? r.unread : null,
      reread: r.rereads > 0,
      undone: r.undone_at !== null,
      can_undo: undoable.has(r.message_id),
      draft: r.draft,
      draft_state: DRAFT_STATES.has(r.draft_state) ? (r.draft_state as ReachOutReplyDto["draft_state"]) : "none",
      draft_why: isDraftWhy(r.draft_why) ? r.draft_why : null,
      business: r.business,
      chain,
      step,
      reply_from: from.get(r.conversation_id) ?? { from: "mailbox", because: null },
    };
  });
  return { replies };
}

/** A refusal in the undo door's own words, as the status a caller reads it by. */
function undoRefusal(why: ReplyUndoRefusal): AppError {
  if (why === "not_found") return new AppError("not_found", REPLY_UNDO_REFUSALS.not_found, 404);
  if (why === "role") return new AppError("forbidden", REPLY_UNDO_REFUSALS.role, 403);
  return new AppError("conflict", REPLY_UNDO_REFUSALS[why], 409);
}

/**
 * "Read as no · undo": the door puts back exactly what the no wrote. Its own test is asked first, and again when the
 * door refuses, so what the member is told is the reason that held when it refused, in contracts' words.
 */
export async function undoReading(ctx: RouteContext, messageId: string): Promise<{ undone: true; result: Json }> {
  const why = await replyUndoableOf(ctx.supabase, messageId);
  if (why) throw undoRefusal(isReplyUndoRefusal(why) ? why : "not_found");
  try {
    return { undone: true, result: await undoReplyReading(ctx.supabase, messageId) };
  } catch (e) {
    const now = await replyUndoableOf(ctx.supabase, messageId);
    if (now) throw undoRefusal(isReplyUndoRefusal(now) ? now : "not_found");
    throw e;
  }
}

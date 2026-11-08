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
  type ReachOutRepliesDto,
  type ReachOutRepliesQuery,
  type ReachOutReplyDto,
  type ReplyFrom,
  type ReplyUndoRefusal,
} from "@chanlytics/contracts";
import {
  listReachOutSteps,
  listRepliesFor,
  replyUndoableOf,
  undoReplyReading,
  type ReachOutStepRow,
  type ReplyListRow,
} from "@chanlytics/db/campaigns";
import type { Json } from "@chanlytics/db/types";
import type { RouteContext } from "../shared/with-route";
import { findMailboxAddress, replyFromOf, replyIdentitiesOf } from "../connections/email";
import type { TenantId } from "@chanlytics/contracts";

/** A chain's name and the step's place in it, 1 for its first email, by walking back to the chain's first step. */
function stepOf(
  playbookId: string | null,
  steps: Map<string, ReachOutStepRow>,
): { chain: string | null; step: number | null } {
  let at = playbookId ? steps.get(playbookId) : undefined;
  if (!at) return { chain: null, step: null };
  let count = 1;
  while (at.after_playbook_id && count <= steps.size) {
    const before = steps.get(at.after_playbook_id);
    if (!before) break;
    at = before;
    count += 1;
  }
  return { chain: at.name, step: count };
}

/** Where an answer on each thread goes out from, as the freeze will decide it (connections/email.ts replyIdentitiesOf). */
async function replyFromByThread(
  ctx: RouteContext,
  tenantId: TenantId,
  conversations: string[],
): Promise<Map<string, ReplyFrom>> {
  const replyIdentities = await replyIdentitiesOf(ctx, tenantId, conversations);
  return new Map([...replyIdentities].map(([id, w]) => [id, replyFromOf(w)] as const));
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

/** What the reading's plan (contracts ReadingPlan, kept as JSON) says the page needs: what a no stopped, the step's day. */
function planFacts(plan: Json): Pick<ReachOutReplyDto, "said_no" | "step_day"> {
  const p = plan && typeof plan === "object" && !Array.isArray(plan) ? plan : {};
  const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const step = p.step && typeof p.step === "object" && !Array.isArray(p.step) ? p.step : {};
  return {
    said_no: p.saidNo === true ? { address: text(p.suppressFrom), domain: text(p.suppressDomain) } : null,
    step_day: text(step.dueOn),
  };
}

/**
 * The workspace's readings since `since` (at most the reading's own window back), newest first, one thread's alone
 * when asked: what each was read as and did, its draft, whether this member may undo it, and where an answer goes out
 * from.
 */
export async function listReplies(
  ctx: RouteContext,
  tenantId: TenantId,
  repliesQuery: ReachOutRepliesQuery,
  now = Date.now(),
): Promise<ReachOutRepliesDto> {
  const floor = now - REACH_OUT_REPLY_DAYS * DAY_MS;
  const since =
    repliesQuery.since && Date.parse(repliesQuery.since) > floor
      ? new Date(Date.parse(repliesQuery.since))
      : new Date(floor);
  const rows = await listRepliesFor(ctx.supabase, {
    tenantId,
    since: since.toISOString(),
    conversationId: repliesQuery.conversation_id ?? null,
    limit: REPLIES_PAGE,
  });
  const [steps, from, undoable, mailbox] = await Promise.all([
    rows.length ? listReachOutSteps(ctx.supabase, tenantId) : Promise.resolve([]),
    replyFromByThread(ctx, tenantId, [...new Set(rows.map((r) => r.conversation_id))]),
    undoableByMessage(ctx, rows),
    findMailboxAddress(ctx, tenantId),
  ]);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const replies = rows.map((row): ReachOutReplyDto => {
    const { chain, step } = stepOf(row.playbook_id, byId);
    return {
      message_id: row.message_id,
      conversation_id: row.conversation_id,
      read_at: row.read_at,
      intent: row.intent as ReachOutReplyDto["intent"], // the table's check holds it to REPLY_INTENTS
      claim: row.claim as ReachOutReplyDto["claim"], // and this to the three claims
      summary: row.summary,
      named_day: row.named_day,
      refer_to: row.refer_to,
      unread: isUnread(row.unread) ? row.unread : null,
      reread: row.rereads > 0,
      rereads: row.rereads,
      undone: row.undone_at !== null,
      can_undo: undoable.has(row.message_id),
      draft: row.draft,
      draft_state: DRAFT_STATES.has(row.draft_state) ? (row.draft_state as ReachOutReplyDto["draft_state"]) : "none",
      draft_why: isDraftWhy(row.draft_why) ? row.draft_why : null,
      business: row.business,
      chain,
      step,
      reply_from: from.get(row.conversation_id) ?? { from: "mailbox", because: null },
      ...planFacts(row.plan),
      until_at: row.until_at,
    };
  });
  return { replies, mailbox };
}

/** A refusal in the undo door's own words, as the status a caller reads it by. */
function undoRefusal(reason: ReplyUndoRefusal): AppError {
  if (reason === "not_found") return new AppError("not_found", REPLY_UNDO_REFUSALS.not_found, 404);
  if (reason === "role") return new AppError("forbidden", REPLY_UNDO_REFUSALS.role, 403);
  return new AppError("conflict", REPLY_UNDO_REFUSALS[reason], 409);
}

/**
 * "Read as no · undo": the door puts back exactly what the no wrote. Its own test is asked first, and again when the
 * door refuses, so what the member is told is the reason that held when it refused, in contracts' words.
 */
export async function undoReading(ctx: RouteContext, messageId: string): Promise<{ undone: true; result: Json }> {
  const reason = await replyUndoableOf(ctx.supabase, messageId);
  if (reason) throw undoRefusal(isReplyUndoRefusal(reason) ? reason : "not_found");
  try {
    return { undone: true, result: await undoReplyReading(ctx.supabase, messageId) };
  } catch (e) {
    const now = await replyUndoableOf(ctx.supabase, messageId);
    if (now) throw undoRefusal(isReplyUndoRefusal(now) ? now : "not_found");
    throw e;
  }
}

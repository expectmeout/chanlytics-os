import "server-only";
import {
  AppError,
  REPLY_DRAFT_RULES,
  REPLY_DRAFTS_NEWEST_MAX,
  REPLY_DRAFT_STATES,
  draftFailedWords,
  draftUseOf,
  type ReplyDraftDto,
  type ReplyDraftKind,
  type ReplyDraftState,
  type ReplyDraftWords,
} from "@chanlytics/contracts";
import { conversationDraftsOf, conversationsSetAside, type ConversationDraftRow, type Json } from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import type { Member } from "../route";
import type { VerbConversation } from "../verbs";
import { signedByThreadOf } from "../connections/email";
import { draftAtTheEdge } from "./thread-control";

/**
 * A thread's drafts as every page reads them (decision 0093, 00538): written when a hold owes one, by the receptionist's
 * brain on the edge, and kept until the customer writes again. Nothing here writes a first draft: a member's change, or
 * their Try again, goes through the edge's door. A draft is text: nothing is sent by it, and it goes only through the
 * reply's door on a press, which may change every word first.
 */

/** A kept draft's words as the table holds them, read defensively: a field it lacks is empty. */
function wordsFrom(w: Json): ReplyDraftWords {
  const o = w && typeof w === "object" && !Array.isArray(w) ? (w as Record<string, unknown>) : {};
  const brief =
    o.brief && typeof o.brief === "object" && !Array.isArray(o.brief) ? (o.brief as Record<string, unknown>) : null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    text: typeof o.text === "string" ? o.text : "",
    subject: typeof o.subject === "string" ? o.subject : "",
    brief: brief
      ? {
          opening: typeof brief.opening === "string" ? brief.opening : "",
          points: strings(brief.points),
          avoid: strings(brief.avoid),
          ask: typeof brief.ask === "string" ? brief.ask : "",
        }
      : null,
    asks: strings(o.asks),
    ...(typeof o.pitch === "string" && o.pitch.trim() ? { pitch: o.pitch } : {}),
  };
}

/**
 * Whether a kept draft was written under the rules drafts are written by now (REPLY_DRAFT_RULES): one from an earlier edition
 * is no draft, left out of the read, and the sweep writes it again within minutes.
 */
const underTheRules = (r: ConversationDraftRow): boolean => r.rules === REPLY_DRAFT_RULES;

const stateOf = (s: string | null): ReplyDraftState | undefined =>
  (REPLY_DRAFT_STATES as readonly (string | null)[]).includes(s) ? (s as ReplyDraftState) : undefined;

/** A kept row as the routes answer it, with the words its reply is signed with where it leaves from a mailbox (00487). */
function dtoOf(r: ConversationDraftRow, signed: string | null = null): ReplyDraftDto {
  const state = stateOf(r.state);
  return {
    conversation_id: r.conversation_id,
    kind: r.kind === "brief" ? "brief" : "reply",
    for_message_id: r.for_message_id,
    words: wordsFrom(r.words),
    made_at: r.made_at,
    ...(signed && r.kind !== "brief" ? { signed } : {}),
    ...(state ? { state } : {}),
    used: r.used ?? [],
    why_failed: r.why_failed,
  };
}

/**
 * The drafts kept on these threads (GET conversations/drafts): whatever was kept, current or not; the page judges. With no
 * threads named, the workspace's newest (contracts REPLY_DRAFTS_NEWEST_MAX), and whether they are all it keeps
 * (`complete`): Today reads them with its own first reads, before it knows its rows, so each row draws with its words
 * (the Today load review, 27 Oct 2026). Named threads' are always all of theirs. `signed`: what an email reply on each
 * would be signed with, for the member reading (00487, decision 0081): every named thread's, drafted or not, as the
 * Inbox's box says it before Send; else the drafted threads'.
 */
export async function draftsKept(ctx: RouteContext, member: Pick<Member, "tenantId">, ids: string[] | null) {
  const [kept, setAside] = await Promise.all([
    conversationDraftsOf(ctx.supabase, member.tenantId, ids ?? { newest: REPLY_DRAFTS_NEWEST_MAX }),
    // The threads set aside (00539), for Today's one line: only with the read a page opens on.
    ids ? [] : conversationsSetAside(ctx.supabase, member.tenantId),
  ]);
  const read = kept.filter(underTheRules);
  const rows = ids ? read : read.slice(0, REPLY_DRAFTS_NEWEST_MAX);
  const replies = [...new Set(rows.filter((r) => r.kind !== "brief").map((r) => r.conversation_id))];
  const signed = await signedByThreadOf(ctx, member.tenantId, ids ?? replies);
  return {
    drafts: rows.map((r) => dtoOf(r, signed.get(r.conversation_id) ?? null)),
    complete: rows.length === read.length,
    signed: Object.fromEntries(signed),
    set_aside: setAside,
  };
}

/**
 * What a reply's words did with the draft that stood when it went (messages.meta.draft), or nothing with none to have used.
 * A read that fails costs the number, never the reply.
 */
export async function draftUseOfReply(
  ctx: RouteContext,
  tenantId: string,
  conversationId: string,
  sent: string | undefined,
): Promise<Json | undefined> {
  if (!sent?.trim()) return undefined;
  const kept = await conversationDraftsOf(ctx.supabase, tenantId, [conversationId]).catch(() => []);
  const mine = kept.find((r) => r.kind === "reply" && r.state === "ready");
  const text = mine ? wordsFrom(mine.words).text : "";
  if (!mine || !text.trim()) return undefined;
  return { use: draftUseOf(text, sent), rewritten: mine.source === "rewrite", source: mine.source };
}

/** What a refusal of the edge's door says to the member, in the words their page has for why. */
function refusalOf(reason: string, detail: string | null): AppError {
  if (reason === "policy_block_price") return new AppError("validation", draftFailedWords("named_money").words, 422);
  if (reason === "draft_refused") return new AppError("validation", draftFailedWords(detail).words, 422);
  if (reason === "not_found") return new AppError("not_found", "Conversation not found.");
  if (reason === "nothing_to_answer" || reason === "draft_not_owed")
    return new AppError("conflict", "They have written since. Reload to see it.", 409);
  return new AppError("conflict", draftFailedWords("not_drafted").words, 503);
}

/**
 * POST conversations/[id]/draft: a member's change to the kept draft (Rewrite, Change it with Ask), or their Try again. With
 * no change, the one kept where it answers their newest message is the answer, read on their own session; the edge's door
 * asks the rest, and it keeps what it writes on the row every page hears.
 */
export async function draftForThread(
  ctx: RouteContext,
  member: Member,
  conv: VerbConversation & { contact_id: string },
  ask: { kind: ReplyDraftKind; instruction?: string | null },
): Promise<ReplyDraftDto> {
  const { kind, instruction = null } = ask;
  const signed =
    kind === "reply" ? ((await signedByThreadOf(ctx, conv.tenant_id, [conv.id])).get(conv.id) ?? null) : null;
  const done = await draftAtTheEdge(
    { conversationId: conv.id, kind, instruction },
    { workspace: member.tenantId, user: ctx.userId },
  );
  if (done.ok) return dtoOf(done.draft, signed);
  if (done.reason === "preview") {
    // A preview calls no edge: the kept one is what it has.
    const kept = (await conversationDraftsOf(ctx.supabase, conv.tenant_id, [conv.id])).find(
      (r) => r.kind === kind && underTheRules(r),
    );
    if (kept && !instruction) return dtoOf(kept, signed);
  }
  throw refusalOf(done.reason, done.detail);
}

import "server-only";
import {
  AppError,
  REPLY_DRAFTS_NEWEST_MAX,
  draftIsCurrent,
  reasonLabelOf,
  replyDraftAbout,
  type PersonDraftDto,
  type ReplyDraftDto,
  type ReplyDraftKind,
  type ReplyDraftWords,
} from "@chanlytics/contracts";
import { conversationDraftKeep, conversationDraftsOf, threadDraftFacts, type Json } from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import type { Member } from "../route";
import { readerContext } from "../readers";
import { replyChannelOf, type VerbConversation } from "../verbs";
import { replyIdentitiesOf, signedWordsOf } from "../connections/email";
import { PERSON_DRAFT_RULES, draftForPerson } from "../new-conversation/person-draft";

/**
 * Ask's drafts written ahead for the threads waiting on a person (decision 0071, E2; 00475): Today asks for the rows it
 * draws, and each thread is drafted once, by the person draft's own call and rules (new-conversation/person-draft.ts),
 * then kept until the customer writes again. A draft is text: nothing is sent by it, and it goes only through the reply's
 * door on a press, which may change every word first.
 */

/** A kept draft as the table holds it (the repository's row). */
type ConversationDraftRow = Awaited<ReturnType<typeof conversationDraftsOf>>[number];

/** A string array of the questions Ask asked, or none. */
const questionsOf = (asks: PersonDraftDto["asks"]): string[] => asks.map((a) => a.question).filter(Boolean);

/** The person draft's answer as a kept draft's words, in the shape the table keeps (contracts ReplyDraftWords), with the rules' edition. */
function keptWordsOf(d: PersonDraftDto): Json {
  return {
    rules: PERSON_DRAFT_RULES,
    text: d.text,
    subject: d.subject,
    brief: d.brief
      ? { opening: d.brief.opening, points: [...d.brief.points], avoid: [...d.brief.avoid], ask: d.brief.ask }
      : null,
    asks: questionsOf(d.asks),
  };
}

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
  };
}

/**
 * Whether a kept draft was written under the rules the person draft writes by now (PERSON_DRAFT_RULES): one from an earlier
 * edition is no draft, left out of the read and written again when asked for.
 */
function underTheRules(r: ConversationDraftRow): boolean {
  const w = r.words;
  return !!w && typeof w === "object" && !Array.isArray(w) && w.rules === PERSON_DRAFT_RULES;
}

/** A kept row as the routes answer it, with the words its reply is signed with where it leaves from a mailbox (00487). */
function dtoOf(r: ConversationDraftRow, signed: string | null = null): ReplyDraftDto {
  return {
    conversation_id: r.conversation_id,
    kind: r.kind === "brief" ? "brief" : "reply",
    for_message_id: r.for_message_id,
    words: wordsFrom(r.words),
    made_at: r.made_at,
    ...(signed && r.kind !== "brief" ? { signed } : {}),
  };
}

/**
 * What each thread's reply would be signed with, as its freeze decides where it leaves from (00487): the mailbox's
 * signature, read once for the threads. What only says it, so a read that fails says none and drafts nothing less.
 */
async function signedByThread(ctx: RouteContext, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const who = await replyIdentitiesOf(ctx, tenantId, ids).catch(() => null);
  const signed = new Map<string, string>();
  for (const [id, w] of who ?? []) {
    const words = signedWordsOf(w);
    if (words) signed.set(id, words);
  }
  return signed;
}

/**
 * The drafts kept on these threads (GET conversations/drafts): whatever was kept, current or not; the page judges. With no
 * threads named, the workspace's newest (contracts REPLY_DRAFTS_NEWEST_MAX), and whether they are all it keeps
 * (`complete`): Today reads them with its own first reads, before it knows its rows, so each row draws with its words
 * (the Today load review, 27 Oct 2026). Named threads' are always all of theirs.
 */
export async function draftsKept(ctx: RouteContext, member: Pick<Member, "tenantId">, ids: string[] | null) {
  const read = (
    await conversationDraftsOf(ctx.supabase, member.tenantId, ids ?? { newest: REPLY_DRAFTS_NEWEST_MAX })
  ).filter(underTheRules);
  const rows = ids ? read : read.slice(0, REPLY_DRAFTS_NEWEST_MAX);
  const replies = [...new Set(rows.filter((r) => r.kind !== "brief").map((r) => r.conversation_id))];
  const signed = await signedByThread(ctx, member.tenantId, replies);
  return {
    drafts: rows.map((r) => dtoOf(r, signed.get(r.conversation_id) ?? null)),
    complete: rows.length === read.length,
  };
}

/**
 * A thread's draft (POST conversations/[id]/draft): the one kept, where it answers their newest message; else written now
 * by the person draft, from the thread's hold and what they wrote, in the owner's voice, on the wire a reply goes by, and
 * kept. A brief is for a call back. What the person draft refuses (a price the owner never gave) is its refusal.
 */
export async function draftForThread(
  ctx: RouteContext,
  member: Member,
  conv: VerbConversation & { contact_id: string },
  /**
   * Which draft, and the member's change to the kept one (Change it with Ask): with an instruction the draft is written
   * again, never the kept one handed back.
   */
  ask: { kind: ReplyDraftKind; instruction?: string | null },
): Promise<ReplyDraftDto> {
  const { kind, instruction = null } = ask;
  const [facts, kept] = await Promise.all([
    threadDraftFacts(ctx.supabase, conv.tenant_id, conv.id),
    conversationDraftsOf(ctx.supabase, conv.tenant_id, [conv.id]),
  ]);
  const mine = kept.find((r) => r.kind === kind && underTheRules(r));
  const signed =
    kind === "reply" ? ((await signedByThread(ctx, conv.tenant_id, [conv.id])).get(conv.id) ?? null) : null;
  if (mine && draftIsCurrent(mine, facts.forMessageId) && !instruction) return dtoOf(mine, signed);
  const wire = kind === "reply" ? await replyChannelOf(ctx, conv) : undefined;
  const drafted = await draftForPerson(readerContext(ctx, member), conv.contact_id, {
    how: kind === "brief" ? "call" : "message",
    ...(wire ? { wire } : {}),
    about: replyDraftAbout(
      kind,
      { reason: facts.reason ? reasonLabelOf(facts.reason) : null, details: facts.details },
      instruction ? { was: mine ? wordsFrom(mine.words).text || null : null, how: instruction } : null,
    ),
  });
  const r = await conversationDraftKeep(ctx.supabase, {
    tenantId: conv.tenant_id,
    conversationId: conv.id,
    kind,
    forMessageId: facts.forMessageId,
    words: keptWordsOf(drafted),
  });
  if ("refused" in r) {
    if (r.refused === "not_found") throw new AppError("not_found", "Conversation not found.");
    throw new AppError("forbidden", "Only an owner or operator has replies drafted.", 403);
  }
  return dtoOf(r.kept, signed);
}

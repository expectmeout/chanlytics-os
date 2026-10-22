import "server-only";
import {
  AppError,
  ASK_JOURNAL_LIMITS,
  ASK_MEMORY_LIMITS,
  ASK_MEMORY_WORDS,
  ROLE_PERMS,
  memoryText,
  memoryTextProblem,
  type AskMemoryDoorDto,
  type AskMemoryPageDto,
  type AskMemorySource,
} from "@chanlytics/contracts";
import { askJournalDays, askMemoryLines, changeAskMemory, forgetAskMemory, keepAskMemory } from "@chanlytics/db";
import { dbRefusal, type RouteContext } from "../../with-route";
import type { Member } from "../../route";
import { requireUuid } from "../../request-guards";

/**
 * Settings › Memory (decision 0070): what Ask keeps about the business and its journal's newest days, as the member's own
 * session reads them; and the pane's three verbs, each through the memory's one door
 * (ask_memory_write), which checks the caller itself: Add keeps a line (the approve permission), Change words one (the
 * settings permission), Forget takes one out (the settings permission, or the member who kept it). The journal is the
 * owners' (RLS): anyone else reads the lines alone.
 */

/** The pane's read: the live lines, newest first, the journal's newest days, and whether the caller may change a line. */
export async function memoryPage(ctx: RouteContext, member: Member): Promise<AskMemoryPageDto> {
  const [lines, journal] = await Promise.all([
    askMemoryLines(ctx.supabase, member.tenantId, ASK_MEMORY_LIMITS.liveMax),
    askJournalDays(ctx.supabase, member.tenantId, ASK_JOURNAL_LIMITS.shown),
  ]);
  return { lines, journal, may_change: ROLE_PERMS[member.role]?.settings === true };
}

/** A line's words as the pane or a card sent them, held to contracts' rule, or the rule's words as a refusal. */
function lineText(raw: unknown): string {
  const text = memoryText(typeof raw === "string" ? raw : "");
  const problem = memoryTextProblem(text);
  if (problem) throw new AppError("validation", problem);
  return text;
}

/** The door's own refusals, in a person's words. */
const REFUSED: Record<string, string> = {
  empty: "Say the fact in a few words.",
  too_long: `Keep it under ${ASK_MEMORY_LIMITS.textMax} characters: one fact, in a sentence or two.`,
  full: ASK_MEMORY_WORDS.full,
};

function memoryRefusal(word: string): AppError {
  return new AppError(
    word === "full" ? "conflict" : "validation",
    REFUSED[word] ?? "That could not be kept.",
    word === "full" ? 409 : 400,
  );
}

/** A door's refusal with its SQLSTATE, as the route answers it (a line the caller may not touch is not found). */
const asRefusal = (e: unknown): never => {
  throw e && typeof e === "object" && "message" in e ? dbRefusal(e as { code?: string | null; message: string }) : e;
};

/** POST ask/memory: a line kept, from the pane (Add) or a card (a forgotten line kept again). */
export async function keepMemoryLine(
  ctx: RouteContext,
  member: Member,
  body: { text?: unknown; thread_id?: unknown; source?: unknown } | null,
): Promise<AskMemoryDoorDto> {
  const text = lineText(body?.text);
  const threadId = typeof body?.thread_id === "string" && body.thread_id ? requireUuid(body.thread_id, "thread") : null;
  const source: AskMemorySource = body?.source === "ask" ? "ask" : "pane";
  const kept = await keepAskMemory(ctx.supabase, { tenantId: member.tenantId, text, source, threadId }).catch(
    asRefusal,
  );
  if ("refused" in kept) throw memoryRefusal(kept.refused);
  return { memory: { id: kept.id, text: kept.text }, again: kept.again };
}

/** PATCH ask/memory/[id]: a line's words changed. */
export async function changeMemoryLine(
  ctx: RouteContext,
  member: Member,
  id: unknown,
  body: { text?: unknown } | null,
): Promise<AskMemoryDoorDto> {
  const lineId = requireUuid(id, "line");
  const text = lineText(body?.text);
  const changed = await changeAskMemory(ctx.supabase, { tenantId: member.tenantId, id: lineId, text }).catch(asRefusal);
  if ("refused" in changed) throw memoryRefusal(changed.refused);
  return { memory: { id: changed.id, text: changed.text }, again: changed.again };
}

/** DELETE ask/memory/[id]: a line forgotten (kept as forgotten, so the pane's Undo keeps its words again). */
export async function forgetMemoryLine(ctx: RouteContext, member: Member, id: unknown): Promise<AskMemoryDoorDto> {
  const lineId = requireUuid(id, "line");
  const gone = await forgetAskMemory(ctx.supabase, { tenantId: member.tenantId, id: lineId }).catch(asRefusal);
  return { memory: { id: gone.id, text: gone.text }, again: gone.again };
}

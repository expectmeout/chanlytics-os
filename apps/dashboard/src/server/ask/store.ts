import "server-only";
import {
  AppError,
  type AskAnswer,
  type AskMessageVM,
  type AskProposal,
  type AskProposalOutcome,
  type AskScope,
  type AskThreadVM,
  type AskTurnShape,
  citationRoute,
} from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import { answeringOf, askTurnText } from "./prompt";

/**
 * Ask threads on the session client. RLS (migration 00040) keeps every read
 * and write to the caller's own rows; nothing here scopes by hand because
 * the database already does, and a query that returns nothing is the door
 * closing, not an error.
 */

interface ThreadRow {
  id: string;
  title: string;
  scope: Json | null;
  last_at: string;
  created_at: string;
}
interface MessageRow {
  id: string;
  role: string;
  content: Json;
  created_at: string;
}

const THREADS_CAP = 40;
const MESSAGES_CAP = 60;

export function toThreadVM(r: ThreadRow): AskThreadVM {
  return {
    id: r.id,
    title: r.title || "Untitled",
    lastAtMs: Date.parse(r.last_at) || 0,
    scope: (r.scope as AskScope | null) ?? null,
  };
}

/**
 * The stored turn, back into the shape the Line draws: a turn made since the Line carries its answer ({v: 2, answer},
 * spec 7.6); one made before has the v1 fields only, and the Line reads it through answerFromV1.
 */
export function toMessageVM(r: MessageRow): AskMessageVM {
  const c = (r.content ?? {}) as Record<string, unknown>;
  const cites = Array.isArray(c.citations) ? (c.citations as AskMessageVM["citations"]) : [];
  const answer =
    c.v === 2 && c.answer && typeof c.answer === "object" && (c.answer as AskAnswer).v === 2
      ? (c.answer as AskAnswer)
      : null;
  return {
    ...(answer ? { answer } : {}),
    id: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    text: typeof c.text === "string" ? c.text : "",
    at: r.created_at,
    atMs: Date.parse(r.created_at) || 0,
    citations: cites.map((x) => ({ ...x, to: x.to || citationRoute(x) })),
    followups: Array.isArray(c.followups) ? (c.followups as string[]) : [],
    navigate: c.navigate && typeof c.navigate === "object" ? (c.navigate as AskMessageVM["navigate"]) : null,
    proposals: Array.isArray(c.proposals) ? (c.proposals as AskMessageVM["proposals"]) : [],
    language: c.language === "es" || c.language === "en" ? c.language : "other",
    ungrounded: c.ungrounded === true,
    tools: Array.isArray(c.tools) ? (c.tools as string[]) : [],
    latencyMs: typeof c.latency_ms === "number" ? c.latency_ms : null,
    rounds: typeof c.rounds === "number" ? c.rounds : null,
    failed: c.failed === true,
  };
}

export async function listThreads(ctx: RouteContext, tenantId: string): Promise<AskThreadVM[]> {
  const { data, error } = await ctx.supabase
    .from("ask_threads")
    .select("id, title, scope, last_at, created_at")
    .eq("tenant_id", tenantId)
    .order("last_at", { ascending: false })
    .limit(THREADS_CAP);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toThreadVM);
}

/**
 * A stored turn as the model reads it on a later turn: the words, and for a person's answer to a search's question
 * the search it answered (askTurnText), which is stored beside their words and never shown as them.
 */
export function modelTurnOf(r: MessageRow): { role: "user" | "assistant"; text: string } {
  const vm = toMessageVM(r);
  const c = (r.content ?? {}) as Record<string, unknown>;
  return { role: vm.role, text: askTurnText(vm.text, vm.role === "user" ? answeringOf(c.answering) : null) };
}

/** How a stored turn's earlier turns reached the model (AskTurnShape.replay), or null: a question, or a turn from before. */
function replayOf(shape: unknown): AskTurnShape["replay"] | null {
  const kind = shape && typeof shape === "object" ? (shape as { replay?: unknown }).replay : null;
  return kind === "live" || kind === "rebuilt" || kind === "none" ? kind : null;
}

export async function readThread(
  ctx: RouteContext,
  id: string,
): Promise<{
  thread: AskThreadVM;
  messages: AskMessageVM[];
  /** The same turns as the model reads them (modelTurnOf): the history a new turn on this thread is asked with. */
  turns: Array<{ role: "user" | "assistant"; text: string }>;
  /** Each row's history kind (replayOf), beside `messages`: where a live replay's chain begins (memory.ts). */
  replays: Array<AskTurnShape["replay"] | null>;
  /** The thread may have more rows than the read returns (MESSAGES_CAP): the oldest would not be here. */
  truncated: boolean;
  tenantId: string;
} | null> {
  const { data: t, error } = await ctx.supabase
    .from("ask_threads")
    .select("id, tenant_id, title, scope, last_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) return null;
  // The newest MESSAGES_CAP rows, newest first (the id breaks a tie in the clock, so every read agrees), then put back
  // in the order they were written: a thread past thirty turns reopens on its latest, and its history ends at the last.
  // Each row's content is read key by key, by its JSON path: the keys the Line (toMessageVM) and the history
  // (modelTurnOf) read, and never the rest -- an answer's content also holds the turn as the model was sent it
  // (content.raw, the Phase 5 plan, D11), up to sixty of which a whole read would ship on every turn and every reopen.
  // A key a row does not hold reads as null, which both take as absent. The shape, whole (a nested path would read
  // each row again), says how each turn's history went: where a live replay's chain begins, before any raw is read.
  const { data: msgs, error: merr } = await ctx.supabase
    .from("ask_messages")
    .select(
      "id, role, created_at, v:content->v, answer:content->answer, citations:content->citations, text:content->text, followups:content->followups, navigate:content->navigate, proposals:content->proposals, language:content->language, ungrounded:content->ungrounded, tools:content->tools, latency_ms:content->latency_ms, rounds:content->rounds, failed:content->failed, answering:content->answering, shape:content->shape",
    )
    .eq("thread_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGES_CAP);
  if (merr) throw new Error(merr.message);
  const rows = (msgs ?? [])
    .reverse()
    .map(({ id: messageId, role, created_at, ...content }) => ({ id: messageId, role, created_at, content }));
  return {
    thread: toThreadVM(t),
    messages: rows.map(toMessageVM),
    turns: rows.map(modelTurnOf),
    replays: rows.map((r) => replayOf(r.content.shape)),
    truncated: rows.length >= MESSAGES_CAP,
    tenantId: t.tenant_id,
  };
}

/**
 * The turns as the model was sent them (content.raw, the Phase 5 plan, D11) of the answers a live replay follows, by
 * id, and nothing else of their rows: the one read of a raw turn, made only once the thread's rows say it is warm
 * (memory.ts). RLS keeps it to the caller's own; a row it hides, or one gone, is absent.
 */
export async function readRaws(ctx: RouteContext, ids: string[]): Promise<Map<string, unknown>> {
  const { data, error } = await ctx.supabase.from("ask_messages").select("id, raw:content->raw").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.id, r.raw]));
}

/** A scope as the thread's column holds it: its three fields, or none. */
const scopeColumn = (s: AskScope | null): Json => (s ? { kind: s.kind, id: s.id, label: s.label } : null);

export async function createThread(
  ctx: RouteContext,
  tenantId: string,
  title: string,
  scope: AskScope | null,
): Promise<AskThreadVM> {
  const { data, error } = await ctx.supabase
    .from("ask_threads")
    .insert({ tenant_id: tenantId, user_id: ctx.userId, title, scope: scopeColumn(scope) })
    .select("id, title, scope, last_at, created_at")
    .single();
  if (error) throw new Error(`ask thread: ${error.message}`);
  return toThreadVM(data);
}

export async function appendMessage(
  ctx: RouteContext,
  threadId: string,
  tenantId: string,
  role: "user" | "assistant",
  content: Record<string, unknown>,
): Promise<{ id: string; created_at: string }> {
  const { data, error } = await ctx.supabase
    .from("ask_messages")
    .insert({ thread_id: threadId, tenant_id: tenantId, user_id: ctx.userId, role, content: content as Json })
    .select("id, created_at")
    .single();
  if (error) throw new Error(`ask message: ${error.message}`);
  return data;
}

/**
 * A turn saved: its thread moves up the list and keeps the scope the turn ran with (the Phase 5 plan, D9), none
 * included, so the next question sent without one is asked with it. The column grant allows both (00121).
 */
export async function touchThread(ctx: RouteContext, threadId: string, scope: AskScope | null): Promise<void> {
  const { error } = await ctx.supabase
    .from("ask_threads")
    .update({ last_at: new Date().toISOString(), scope: scopeColumn(scope) })
    .eq("id", threadId);
  if (error) console.error("ask_thread_touch_failed", error.message);
}

/**
 * Record what became of a card. Reads the turn's content, sets the outcome on
 * that one proposal, writes the content back; RLS limits it to the caller's
 * own turn, and the column grant (00041) to the content column.
 */
export async function setProposalOutcome(
  ctx: RouteContext,
  messageId: string,
  proposalId: string,
  outcome: AskProposalOutcome,
): Promise<AskProposal> {
  const { data: m, error } = await ctx.supabase
    .from("ask_messages")
    .select("id, content")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!m) throw new AppError("not_found", "That turn is not yours or is already gone.", 404);
  const content = (m.content ?? {}) as Record<string, unknown>;
  const proposals = Array.isArray(content.proposals) ? (content.proposals as AskProposal[]) : [];
  const idx = proposals.findIndex((p) => p.id === proposalId);
  if (idx < 0) throw new AppError("not_found", "No such card on that turn.", 404);
  const current = proposals[idx].outcome;
  if (current && current.state === "done" && outcome.state === "done") {
    throw new AppError("conflict", "That card was already approved.", 409);
  }
  const next = proposals.map((p, i) => (i === idx ? { ...p, outcome } : p));
  // Read whole and written back whole, never by path: the turn as the model was sent it (content.raw) stays beside
  // the card's outcome.
  const { data: upd, error: uerr } = await ctx.supabase
    .from("ask_messages")
    .update({ content: { ...content, proposals: next } as unknown as Json })
    .eq("id", messageId)
    .select("id");
  if (uerr) throw new Error(uerr.message);
  if (!upd?.length) throw new AppError("not_found", "That turn is not yours.", 404);
  return next[idx];
}

export async function deleteThread(ctx: RouteContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from("ask_threads").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new AppError("not_found", "That thread is not yours or is already gone.", 404);
}

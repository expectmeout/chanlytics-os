import "server-only";
import { AppError, type AskMessageVM, type AskProposal, type AskProposalOutcome, type AskScope, type AskThreadVM, citationRoute } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import type { RouteContext } from "../with-route";

/**
 * Ask threads on the session client. RLS (migration 00040) keeps every read
 * and write to the caller's own rows; nothing here scopes by hand because
 * the database already does, and a query that returns nothing is the door
 * closing, not an error.
 */

interface ThreadRow { id: string; title: string; scope: Json | null; last_at: string; created_at: string }
interface MessageRow { id: string; role: string; content: Json; created_at: string }

const THREADS_CAP = 40;
const MESSAGES_CAP = 60;

export function toThreadVM(r: ThreadRow): AskThreadVM {
  return { id: r.id, title: r.title || "Untitled", lastAtMs: Date.parse(r.last_at) || 0, scope: (r.scope as AskScope | null) ?? null };
}

/** The stored assistant turn, back into the shape the palette draws. */
export function toMessageVM(r: MessageRow): AskMessageVM {
  const c = (r.content ?? {}) as Record<string, unknown>;
  const cites = Array.isArray(c.citations) ? (c.citations as AskMessageVM["citations"]) : [];
  return {
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

export async function readThread(ctx: RouteContext, id: string): Promise<{ thread: AskThreadVM; messages: AskMessageVM[]; tenantId: string } | null> {
  const { data: t, error } = await ctx.supabase
    .from("ask_threads")
    .select("id, tenant_id, title, scope, last_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) return null;
  const { data: msgs, error: merr } = await ctx.supabase
    .from("ask_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })
    .limit(MESSAGES_CAP);
  if (merr) throw new Error(merr.message);
  return { thread: toThreadVM(t), messages: (msgs ?? []).map(toMessageVM), tenantId: t.tenant_id };
}

export async function createThread(ctx: RouteContext, tenantId: string, title: string, scope: AskScope | null): Promise<AskThreadVM> {
  const { data, error } = await ctx.supabase
    .from("ask_threads")
    .insert({ tenant_id: tenantId, user_id: ctx.userId, title, scope: (scope as unknown as Json) ?? null })
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

/** A thread's title, once its first answer says what it was about. */
export async function retitleThread(ctx: RouteContext, threadId: string, title: string): Promise<void> {
  const { error } = await ctx.supabase.from("ask_threads").update({ title: title.slice(0, 80), last_at: new Date().toISOString() }).eq("id", threadId);
  if (error) console.error("ask_thread_retitle_failed", error.message);
}

export async function touchThread(ctx: RouteContext, threadId: string): Promise<void> {
  const { error } = await ctx.supabase.from("ask_threads").update({ last_at: new Date().toISOString() }).eq("id", threadId);
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
  const { data: m, error } = await ctx.supabase.from("ask_messages").select("id, content").eq("id", messageId).maybeSingle();
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

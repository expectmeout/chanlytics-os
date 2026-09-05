import { AppError, ASK_MAX_CHARS, detectLanguage, type AskMessageVM, type AskScope } from "@chanlytics/contracts";
import { withRoute, memberContext } from "@/server/with-route";
import { takeRate } from "@/server/rate-limit";
import { requireUuid } from "@/server/request-guards";
import { tenantFacts } from "@/server/tenant";
import { runAskTurn, type TurnEvent } from "@/server/ask/loop";
import { workspaceFacts, resultTitle, titleFromQuestion } from "@/server/ask/prompt";
import { appendMessage, createThread, readThread, retitleThread, touchThread } from "@/server/ask/store";

/**
 * POST /api/v1/ask — one turn of the workspace assistant.
 *
 * Body: { text, thread_id?, scope?, surface?, workspace? }. The response is a
 * stream of JSON lines: {t:"thread", id} first, then {t:"trace"} while a read
 * runs, {t:"delta", text} as the answer's words arrive, and {t:"final",
 * message} last. Everything runs as the signed-in person: the reads see
 * exactly what their pages see, and the thread is theirs alone (RLS).
 *
 * withRoute's envelope is for JSON; a stream is returned as-is, and withRoute
 * still refuses a cross-site POST and still verifies the session first.
 */

export const maxDuration = 60;

const SCOPE_KINDS = new Set(["thread", "conversation", "call", "person", "page"]);
const SURFACES = new Set(["today", "inbox", "people", "conversations", "live", "reports", "settings", "other"]);

function line(ev: TurnEvent | { t: "thread"; id: string; title: string }): string {
  return `${JSON.stringify(ev)}\n`;
}

export const POST = withRoute(async (req, ctx) => {
  takeRate(ctx.userId, "ask");
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as
    | { text?: unknown; thread_id?: unknown; scope?: unknown; surface?: unknown }
    | null;
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) throw new AppError("validation", "Ask something.");
  if (text.length > ASK_MAX_CHARS) throw new AppError("validation", `Keep a question under ${ASK_MAX_CHARS} characters.`);
  const threadId = typeof body?.thread_id === "string" && body.thread_id ? requireUuid(body.thread_id, "thread") : null;
  let scope: AskScope | null = null;
  if (body?.scope && typeof body.scope === "object") {
    const s = body.scope as Partial<AskScope>;
    if (typeof s.kind === "string" && SCOPE_KINDS.has(s.kind) && typeof s.id === "string" && s.id && typeof s.label === "string") {
      scope = { kind: s.kind as AskScope["kind"], id: s.id.slice(0, 120), label: s.label.slice(0, 80) };
    }
  }
  const surface = typeof body?.surface === "string" && SURFACES.has(body.surface) ? body.surface : null;

  const member = await memberContext(ctx, url.searchParams.get("workspace"));
  const tenantId = member.tenantId;

  // The thread, before anything else: a question that could not be saved is
  // not answered, so a person never sees an answer they cannot find again.
  let history: Array<{ role: "user" | "assistant"; text: string }> = [];
  let thread: { id: string; title: string; scope: AskScope | null };
  if (threadId) {
    const found = await readThread(ctx, threadId);
    if (!found || found.tenantId !== tenantId) throw new AppError("not_found", "That thread is not yours.", 404);
    thread = { id: found.thread.id, title: found.thread.title, scope: found.thread.scope };
    history = found.messages.map((m) => ({ role: m.role, text: m.text }));
    if (!scope) scope = found.thread.scope;
  } else {
    const created = await createThread(ctx, tenantId, titleFromQuestion(text), scope);
    thread = { id: created.id, title: created.title, scope };
  }
  await appendMessage(ctx, thread.id, tenantId, "user", { text });

  const [{ name, timezone }, cfg] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (cfg.error) throw new Error(cfg.error.message);
  const facts = workspaceFacts(name, timezone, cfg.data?.config ?? null);
  const language = detectLanguage(text);
  const personLabel = ctx.email ? `${ctx.email} (${member.role})` : member.role;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        try { controller.enqueue(encoder.encode(s)); } catch { /* the reader went away */ }
      };
      send(line({ t: "thread", id: thread.id, title: thread.title }));
      const t0 = Date.now();
      const result = await runAskTurn({
        ctx, tenantId, role: member.role, facts, timezone, personLabel, language, scope, surface, history, text,
        emit: (ev) => send(line(ev)),
      });
      const content = {
        text: result.answer,
        citations: result.citations,
        followups: result.followups,
        navigate: result.navigate,
        proposals: result.proposals,
        language: result.language,
        ungrounded: result.ungrounded,
        tools: result.tools,
        latency_ms: result.latencyMs,
        failed: result.failed,
        ...(result.failure ? { failure: result.failure.slice(0, 200) } : {}),
        model: "claude-opus-5",
        rounds: result.rounds,
      };
      let saved: { id: string; created_at: string } | null = null;
      try {
        saved = await appendMessage(ctx, thread.id, tenantId, "assistant", content);
        // A new thread is titled by what its first answer did.
        if (!threadId && !result.failed) await retitleThread(ctx, thread.id, resultTitle(text, result.proposals, result.navigate));
        else await touchThread(ctx, thread.id);
      } catch (e) {
        console.error("ask_save_failed", JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
      const message: AskMessageVM = {
        id: saved?.id ?? `unsaved-${Date.now()}`,
        role: "assistant",
        text: result.answer,
        at: saved?.created_at ?? new Date().toISOString(),
        atMs: saved ? Date.parse(saved.created_at) : Date.now(),
        citations: result.citations,
        followups: result.followups,
        navigate: result.navigate,
        proposals: result.proposals,
        language: result.language,
        ungrounded: result.ungrounded,
        tools: result.tools,
        latencyMs: result.latencyMs,
        rounds: result.rounds,
        failed: result.failed,
      };
      console.log(JSON.stringify({ level: "info", event: "ask_turn", tenant: tenantId, tools: result.tools, proposals: result.proposals.map((p) => p.kind), rounds: result.rounds, ms: Date.now() - t0, failed: result.failed, failure: result.failure, ungrounded: result.ungrounded, citations: result.citations.length, language: result.language }));
      send(line({ t: "final", message }));
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "private, no-store", "x-accel-buffering": "no" },
  });
});

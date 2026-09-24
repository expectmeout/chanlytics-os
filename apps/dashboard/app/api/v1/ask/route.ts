import {
  AppError,
  ASK_MAX_CHARS,
  dealsAreOn,
  detectLanguage,
  policyClassOffered,
  v1FromAnswer,
  type AskMessageVM,
  type AskScope,
} from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { tenantFacts } from "@/server/tenant";
import { sellsByOf } from "@/server/deals";
import { runAskTurn, ASK_MODEL, type TurnEvent } from "@/server/ask/loop";
import { listPolicies } from "@chanlytics/db";
import { workspaceFacts, titleFromQuestion } from "@/server/ask/prompt";
import { appendMessage, createThread, readThread, touchThread } from "@/server/ask/store";

/**
 * POST /api/v1/ask — one turn of the workspace assistant.
 *
 * Body: { text, thread_id?, scope?, surface?, workspace? }. The response is a
 * stream of JSON lines: {t:"thread", id} first, then {t:"trace"} while a read
 * runs, {t:"say", headline, detail} as the answer's Say is written (a
 * preview), and {t:"final", message} last, with the answer as the Line draws
 * it. Everything runs as the signed-in person: the reads see exactly what
 * their pages see, and the thread is theirs alone (RLS).
 *
 * Every member may ask (the viewer role is the floor), counted as questions;
 * the workspace must be named, since a thread lands in one. The body is the
 * route's own to read: a scope and a surface are accepted only in the shapes
 * the palette sends, and the rest is ignored rather than refused.
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

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "ask",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as {
      text?: unknown;
      thread_id?: unknown;
      scope?: unknown;
      surface?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
    if (!text) throw new AppError("validation", "Ask something.");
    if (text.length > ASK_MAX_CHARS)
      throw new AppError("validation", `Keep a question under ${ASK_MAX_CHARS} characters.`);
    const threadId =
      typeof body?.thread_id === "string" && body.thread_id ? requireUuid(body.thread_id, "thread") : null;
    let scope: AskScope | null = null;
    if (body?.scope && typeof body.scope === "object") {
      const s = body.scope as Partial<AskScope>;
      if (
        typeof s.kind === "string" &&
        SCOPE_KINDS.has(s.kind) &&
        typeof s.id === "string" &&
        s.id &&
        typeof s.label === "string"
      ) {
        scope = { kind: s.kind as AskScope["kind"], id: s.id.slice(0, 120), label: s.label.slice(0, 80) };
      }
    }
    const surface = typeof body?.surface === "string" && SURFACES.has(body.surface) ? body.surface : null;

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

    const [{ name, timezone }, cfg, policies, sellsBy] = await Promise.all([
      tenantFacts(ctx.supabase, tenantId),
      ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
      // The autonomy modes ride in the stable block, so "what can the receptionist do alone" needs no read.
      listPolicies(ctx.supabase, tenantId).catch(() => []),
      sellsByOf(ctx, tenantId),
    ]);
    if (cfg.error) throw new Error(cfg.error.message);
    // The rows the pane draws: the follow-ups' only where deals are on (0006).
    const offered = policies.filter((p) => policyClassOffered(p.class, dealsAreOn(sellsBy)));
    const facts = workspaceFacts(name, timezone, cfg.data?.config ?? null, offered);
    const language = detectLanguage(text);
    const personLabel = ctx.email ? `${ctx.email} (${member.role})` : member.role;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (s: string) => {
          try {
            controller.enqueue(encoder.encode(s));
          } catch {
            /* the reader went away */
          }
        };
        send(line({ t: "thread", id: thread.id, title: thread.title }));
        const t0 = Date.now();
        const result = await runAskTurn({
          ctx,
          tenantId,
          role: member.role,
          facts,
          timezone,
          personLabel,
          language,
          scope,
          surface,
          history,
          text,
          emit: (ev) => send(line(ev)),
        });
        // The answer as the Line draws it, beside the v1 fields it gives (spec 5.8): the history, copy and search
        // read `text`, and the erase hook finds a person by the ids the sources carry.
        const v1 = v1FromAnswer(result.answer);
        const content = {
          v: 2,
          answer: result.answer,
          ...v1,
          proposals: result.proposals,
          language: result.answer.language,
          ungrounded: result.ungrounded,
          tools: result.tools,
          latency_ms: result.latencyMs,
          failed: result.failed,
          ...(result.failure ? { failure: result.failure.slice(0, 200) } : {}),
          model: ASK_MODEL,
          rounds: result.rounds,
        };
        let saved: { id: string; created_at: string } | null = null;
        try {
          saved = await appendMessage(ctx, thread.id, tenantId, "assistant", content);
          // A thread keeps its first question as its title (D9); an answer only moves it up the list.
          await touchThread(ctx, thread.id);
        } catch (e) {
          console.error("ask_save_failed", JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
        const message: AskMessageVM = {
          id: saved?.id ?? `unsaved-${Date.now()}`,
          role: "assistant",
          text: v1.text,
          at: saved?.created_at ?? new Date().toISOString(),
          atMs: saved ? Date.parse(saved.created_at) : Date.now(),
          citations: v1.citations,
          followups: v1.followups,
          navigate: v1.navigate,
          proposals: result.proposals,
          language: result.answer.language,
          ungrounded: result.ungrounded,
          tools: result.tools,
          latencyMs: result.latencyMs,
          rounds: result.rounds,
          failed: result.failed,
          answer: result.answer,
        };
        console.log(
          JSON.stringify({
            level: "info",
            event: "ask_turn",
            tenant: tenantId,
            tools: result.tools,
            proposals: result.proposals.map((p) => p.kind),
            rounds: result.rounds,
            ms: Date.now() - t0,
            failed: result.failed,
            failure: result.failure,
            ungrounded: result.ungrounded,
            citations: v1.citations.length,
            form: result.answer.form,
            language: result.answer.language,
          }),
        );
        send(line({ t: "final", message }));
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "private, no-store",
        "x-accel-buffering": "no",
      },
    });
  },
});

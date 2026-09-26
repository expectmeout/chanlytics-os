import {
  AppError,
  ASK_MAX_CHARS,
  ASK_SCOPE_KINDS,
  ASK_SURFACES,
  dealsAreOn,
  PageContextSchema,
  detectLanguage,
  policyClassOffered,
  v1FromAnswer,
  type AskMessageVM,
  type AskProposal,
  type AskScope,
  type LeadSearchPlan,
  type PageContext,
} from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import * as readers from "@/server/readers/facts";
import { runAskTurn, type TurnEvent } from "@/server/ask/loop";
import {
  askTurnText,
  titleFromQuestion,
  titleFromSearch,
  workspaceFacts,
  type SearchAnswering,
} from "@/server/ask/prompt";
import { searchRow } from "@/server/leads";
import { appendMessage, createThread, readThread, touchThread } from "@/server/ask/store";

/**
 * POST /api/v1/ask — one turn of the workspace assistant.
 *
 * Body: { text, thread_id?, scope?, surface?, answering?, workspace? }. The response is a
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
 * `answering: { search_id }` is the Leads answer row's: the text is the
 * owner's answer to that search's question, and it is what the thread keeps
 * and shows. The search is read here (under RLS, in this workspace), and what
 * it asked rides beside the words on the stored turn, so the model reads the
 * whole of it on this turn and every later one (askTurnText) while the thread
 * says only what the owner said. The row sends the thread the search was
 * planned in; a thread that is not the caller's -- a teammate planned it, or
 * it is gone -- is not an error for an answer: it starts one of the caller's
 * own, titled by the search's name (titleFromSearch).
 *
 * withRoute's envelope is for JSON; a stream is returned as-is, and withRoute
 * still refuses a cross-site POST and still verifies the session first.
 */

export const maxDuration = 60;

// The lists are contracts' own: a surface the palette sent that a hand-written list here had not caught up with was
// dropped in silence, and the prompt never learnt the page.
const SCOPE_KINDS = new Set<string>(ASK_SCOPE_KINDS);
const SURFACES = new Set<string>(ASK_SURFACES);

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
      answering?: unknown;
      opened_ms?: unknown;
      context?: unknown;
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
    // The page the question was asked on (contracts PageContext): identities and words, read by its one schema. One the
    // schema refuses is no context, said once in the log, and never a refused question: an older tab sends none, and a
    // context is a help to the answer, not a condition of it. The turn reads the page again from these identities.
    let context: PageContext | null = null;
    if (body?.context !== undefined && body.context !== null) {
      const read = PageContextSchema.safeParse(body.context);
      if (read.success) context = read.data;
      else {
        const issue = read.error.issues[0];
        console.error(
          "ask_context_refused",
          JSON.stringify({
            tenant: member.tenantId,
            path: issue?.path.join(".") ?? "",
            issue: issue?.message ?? "unreadable",
          }),
        );
      }
    }
    // The surface the palette names; a context says the same, and fills it when the palette named none.
    const surface =
      typeof body?.surface === "string" && SURFACES.has(body.surface) ? body.surface : (context?.surface ?? null);
    // How long the palette was open before the question was sent, as the tab
    // measured it (AskTurnShape.opened_ms): milliseconds within an hour, else
    // nothing. Never refused: a script or an older tab sends none.
    const openedMs =
      typeof body?.opened_ms === "number" &&
      Number.isFinite(body.opened_ms) &&
      body.opened_ms >= 0 &&
      body.opened_ms <= 3_600_000
        ? Math.round(body.opened_ms)
        : null;

    const tenantId = member.tenantId;

    // The search an answer answers, read before anything is saved: one that is not this workspace's is a 404.
    const answeringId =
      body?.answering && typeof body.answering === "object"
        ? (body.answering as { search_id?: unknown }).search_id
        : undefined;
    let answering: SearchAnswering | null = null;
    if (answeringId !== undefined) {
      const row = await searchRow(ctx, tenantId, requireUuid(answeringId, "search"));
      const q = row.question as { sentence?: unknown } | null;
      answering = {
        search_id: row.id,
        name: row.name,
        question: q && typeof q === "object" && typeof q.sentence === "string" ? q.sentence : "",
        asked: row.asked,
        leaving_out: ((row.plan as LeadSearchPlan | null)?.exclusions ?? []).map((x) => x.text),
      };
    }

    // The thread, before anything else: a question that could not be saved is
    // not answered, so a person never sees an answer they cannot find again.
    let history: Array<{ role: "user" | "assistant"; text: string }> = [];
    let sinceLastMs: number | null = null;
    let thread: { id: string; title: string; scope: AskScope | null } | null = null;
    if (threadId) {
      const found = await readThread(ctx, threadId);
      if (found && found.tenantId === tenantId) {
        thread = { id: found.thread.id, title: found.thread.title, scope: found.thread.scope };
        history = found.turns;
        // The thread's previous turn, before this question is appended: how long the person waited to ask again. A
        // read that came back full holds the oldest turns, not the newest, so its last is not the previous turn.
        const lastAt = found.messages.at(-1)?.atMs;
        sinceLastMs = !found.truncated && lastAt ? Math.max(0, Date.now() - lastAt) : null;
        if (!scope) scope = found.thread.scope;
      } else if (!answering) throw new AppError("not_found", "That thread is not yours.", 404);
    }
    if (!thread) {
      // A thread keeps its first question as its title (D9); an answer's is the search's name, never the sentence
      // the model is given.
      const title = answering ? titleFromSearch(answering.name) : titleFromQuestion(text);
      const created = await createThread(ctx, tenantId, title, scope);
      thread = { id: created.id, title: created.title, scope };
    }
    const turn = thread;
    await appendMessage(ctx, turn.id, tenantId, "user", { text, ...(answering ? { answering } : {}) });

    // A turn keeps what may be kept across turns (the workspace's name and zone, five minutes): the next question of
    // the same person does not read them again. The GET routes keep nothing.
    const rc = readerContext(ctx, member, undefined, { keep: true });
    const [{ name, timezone }, cfg, policies, sellsBy] = await Promise.all([
      load(rc, readers.facts, undefined).then((r) => r.data),
      load(rc, readers.config, undefined).then((r) => r.data),
      // The autonomy modes ride in the stable block, so "what can the receptionist do alone" needs no read.
      load(rc, readers.policies, undefined).then(
        (r) => r.data,
        () => [],
      ),
      load(rc, readers.sellsBy, undefined).then((r) => r.data),
    ]);
    // The rows the pane draws: the follow-ups' only where deals are on (0006).
    const offered = policies.filter((p) => policyClassOffered(p.class, dealsAreOn(sellsBy)));
    const facts = workspaceFacts(name, timezone, cfg?.config ?? null, offered);
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
        send(line({ t: "thread", id: turn.id, title: turn.title }));
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
          text: askTurnText(text, answering),
          openedMs,
          sinceLastMs,
          context,
          emit: (ev) => send(line(ev)),
          // One clock for the turn: the tools' today is the readers' today.
          now: rc.now,
          rc,
        });
        // The answer as the Line draws it, beside the v1 fields it gives (spec 5.8): the history, copy and search
        // read `text`, and the erase hook finds a person by the ids the sources carry.
        const v1 = v1FromAnswer(result.answer);
        // A new search's card carries the thread it was planned in, so the search keeps it (00172) and the answer
        // to its question lands back here. An answer's card needs none: its search already has one or never will.
        const proposals: AskProposal[] = result.proposals.map((p) =>
          p.kind === "lead_search" && !p.payload.amends ? { ...p, payload: { ...p.payload, thread_id: turn.id } } : p,
        );
        const content = {
          v: 2,
          answer: result.answer,
          ...v1,
          proposals,
          language: result.answer.language,
          ungrounded: result.ungrounded,
          tools: result.tools,
          latency_ms: result.latencyMs,
          failed: result.failed,
          ...(result.failure ? { failure: result.failure.slice(0, 200) } : {}),
          model: result.model,
          rounds: result.rounds,
          shape: result.shape,
        };
        let saved: { id: string; created_at: string } | null = null;
        try {
          saved = await appendMessage(ctx, turn.id, tenantId, "assistant", content);
          // A thread keeps its first question as its title (D9); an answer only moves it up the list.
          await touchThread(ctx, turn.id);
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
          proposals,
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
            first_say_ms: result.shape.first_say_ms,
            cache_hit: result.shape.cache_hit,
            follow_up: result.shape.follow_up,
            opened_ms: openedMs,
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

import {
  AppError,
  ASK_MAX_CHARS,
  ASK_SCOPE_KINDS,
  ASK_SURFACES,
  PageContextSchema,
  type AskScope,
  type LeadSearchPlan,
  type PageContext,
  HOUR_MS,
} from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { log } from "@/server/log";
import { requireUuid } from "@/server/request-guards";
import type { SearchAnswering } from "@/server/ask/prompt";
import { finishAskTurn, prepareAskTurn, type AskTurnLine } from "@/server/ask/turn";
import { searchRow } from "@/server/leads/leads";

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
 * the palette sends, and the rest is ignored rather than refused. A scope is
 * the turn's, and the thread keeps the one its latest turn ran with: `null`
 * clears it, and a question sent with none is asked with the thread's.
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
 * The answer's row also keeps the turn as the model was sent it, at
 * `content.raw` (server/ask/memory.ts, storedRaw; the Phase 5 plan, D11), for
 * a later turn to replay: the final line is built from the turn, never from
 * the row, so it never carries it, and the thread's reads never select it.
 *
 * withRoute's envelope is for JSON; a stream is returned as-is, and withRoute
 * still refuses a cross-site POST and still verifies the session first.
 */

// A typed turn's budget (contracts ASK_TURN_BUDGET_MS, two minutes since the operator, 15 Oct 2026) and the time to
// store its answer after it.
export const maxDuration = 150;

// The lists are contracts' own: a surface the palette sent that a hand-written list here had not caught up with was
// dropped in silence, and the prompt never learnt the page.
const SCOPE_KINDS = new Set<string>(ASK_SCOPE_KINDS);
const SURFACES = new Set<string>(ASK_SURFACES);

function line(ev: AskTurnLine): string {
  return `${JSON.stringify(ev)}\n`;
}

/**
 * The scope the question is asked with (the Phase 5 plan, D9), three ways: one in the palette's shape is this turn's;
 * `null` is none, and clears the thread's; absent is no opinion (undefined), and the thread keeps its own. Anything
 * else is absent: ignored rather than refused.
 */
function scopeAsked(raw: unknown): AskScope | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Partial<AskScope>;
  if (
    typeof s.kind !== "string" ||
    !SCOPE_KINDS.has(s.kind) ||
    typeof s.id !== "string" ||
    !s.id ||
    typeof s.label !== "string"
  )
    return undefined;
  return { kind: s.kind, id: s.id.slice(0, 120), label: s.label.slice(0, 80) };
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
    const askedScope = scopeAsked(body?.scope);
    // The page the question was asked on (contracts PageContext): identities and words, read by its one schema. One the
    // schema refuses is no context, said once in the log, and never a refused question: an older tab sends none, and a
    // context is a help to the answer, not a condition of it. The turn reads the page again from these identities.
    let context: PageContext | null = null;
    if (body?.context !== undefined && body.context !== null) {
      const read = PageContextSchema.safeParse(body.context);
      if (read.success) context = read.data;
      else {
        const issue = read.error.issues[0];
        log.error("ask_context_refused", {
          tenant_id: member.tenantId,
          path: issue?.path.join(".") ?? "",
          issue: issue?.message ?? "unreadable",
        });
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
      body.opened_ms <= HOUR_MS
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

    // The thread kept, the question saved and the workspace's facts read, before the stream opens: a question that
    // could not be saved is refused here, as JSON, and never answered (server/ask/turn.ts, the turn's first half).
    const prepared = await prepareAskTurn(ctx, member, {
      text,
      threadId,
      scope: askedScope,
      surface,
      context,
      openedMs,
      answering,
    });

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
        // The turn run and stored, each line as it comes: the thread first, the reads, the Say, then the answer
        // (the turn's second half). The voice door runs the same two halves and speaks the Say instead.
        await finishAskTurn(prepared, (ev) => send(line(ev)));
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

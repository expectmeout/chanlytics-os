import { AppError, ASK_MAX_CHARS, askColumnOf, HOUR_MS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { attachedIdsOf } from "@/server/files/attached";
import { prepareAskTurn } from "@/server/ask/turn";
import {
  answeringOf,
  cameBackTo,
  contextAsked,
  languageAsked,
  questionOf,
  scopeAsked,
  SURFACES,
  turnStream,
} from "@/server/ask/doors/turn-request";

/**
 * POST /api/v1/ask — one turn of the workspace assistant.
 *
 * Body: { text, thread_id?, scope?, surface?, answering?, following?, column?, files?, language?, workspace? }. The response is a
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
 * `following: { id }` is Ask's home's row for a follow-up of the caller's that came due: the text is what Ask said it
 * would ask itself then, and once the question is kept the follow-up is cleared from the caller's views
 * (clearFollowUp), before the turn reads anything, so Ask never offers a card to clear what they came back to. One they
 * no longer hold (another tab came back to it) clears nothing, and a clear that fails is logged, never a refused question.
 *
 * `column: { px, phone }` is the width the Line draws the answer in, as the tab measured it (contracts AskColumn): the
 * model is told it with the question; one not in that shape is none.
 *
 * `files: [id]` is what the question came with: the files' ids, ten at most, and the turn sees each picture ahead of the words.
 * With them a question may have no words of its own, and `language` then says what to answer in, as the words would have. A
 * thread keeps the ids alone (server/files/attached.ts). An id in no shape, or of a file not there for the caller, is left out.
 *
 * The answer's row also keeps the turn as the model was sent it, at
 * `content.raw` (server/ask/memory.ts, storedRaw; the Phase 5 plan, D11), for
 * a later turn to replay: the final line is built from the turn, never from
 * the row, so it never carries it, and the thread's reads never select it.
 *
 * withRoute's envelope is for JSON; a stream is returned as-is, and withRoute
 * still refuses a cross-site POST and still verifies the session first.
 *
 * A stream the reader lets go of (the Line's Stop) stops the turn: the model
 * is asked no further, and the thread keeps the turn as stopped, with what its
 * Say had written (server/ask/turn.ts), never the answer nobody read.
 */

// A typed turn's budget (contracts ASK_TURN_BUDGET_MS, two minutes since the operator, 15 Oct 2026) and the time to
// store its answer after it.
export const maxDuration = 150;

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
      following?: unknown;
      column?: unknown;
      opened_ms?: unknown;
      context?: unknown;
      files?: unknown;
      language?: unknown;
    } | null;
    const text = questionOf(body?.text);
    const files = attachedIdsOf(body?.files);
    if (!text && files.length === 0) throw new AppError("validation", "Ask something.");
    if (text.length > ASK_MAX_CHARS)
      throw new AppError("validation", `Keep a question under ${ASK_MAX_CHARS} characters.`);
    const threadId =
      typeof body?.thread_id === "string" && body.thread_id ? requireUuid(body.thread_id, "thread") : null;
    const askedScope = scopeAsked(body?.scope);
    const context = contextAsked(body?.context, member.tenantId);
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
    const answering = await answeringOf(ctx, tenantId, body?.answering);

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
      column: askColumnOf(body?.column),
      files,
      ...languageAsked(text, body?.language),
    });

    await cameBackTo(ctx, member, body?.following);

    return new Response(turnStream(prepared, req.signal), {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "private, no-store",
        "x-accel-buffering": "no",
      },
    });
  },
});

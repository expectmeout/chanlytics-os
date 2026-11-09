import "server-only";
/**
 * A card acted on from the server (D15 of the answers canvas, the keystone): the card as the turn keeps it, read again and
 * judged, its spec's calls made through each verb's own route under the member's own session, and what became of it kept on the
 * turn and in its record (ask_actions, D16). The specs and the routes are the same ones a press in a browser walked: every check
 * a door makes it still makes, the ledger still writes `via: ask`, and a step's key still means a plan pressed twice makes
 * nothing twice. What moves is who walks them, so a press no longer needs a tab with the right surfaces drawn, and a yes, a lock
 * screen or a row can do what a finger does.
 *
 * Each call goes out as a request of its own to this app, carrying the member's cookies, so `route()` sees exactly what it
 * would see from the browser. A failure is one sentence and one way forward (D37): what stopped it, that nothing went out, and
 * where to fix it.
 */
import {
  AppError,
  PROPOSAL_SPECS,
  askCardLapsed,
  cardWithSteps,
  errorMessageOf,
  failureDoorOf,
  isOneOf,
  planMadeOf,
  recordOrEmpty,
  type AskActAnswer,
  type AskProposal,
  type AskProposalOutcome,
  type ProposalCall,
  type ProposalRefusal,
  type ProposalSpec,
  type ProposalTab,
  type ProposalThen,
  type TenantId,
} from "@chanlytics/contracts";
import { findAskTurnContent, finishAskAction, markAskActionUndone, startAskAction } from "@chanlytics/db/ask";
import { logAndGoOn } from "@chanlytics/log";
import { log } from "@/server/shared/log";
import { setProposalOutcome } from "@/server/ask/store";
import { load } from "@/server/shared/reader";
import { readerContext } from "@/server/shared/reader";
import { config as configReader } from "@/server/readers/facts";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { cardMoved } from "./recheck";

/** How a card came to be acted on: a finger, a spoken or typed yes, a row that allowed it, the lock screen, a mail link. */
export const ACT_BY = ["press", "yes", "row", "lock_screen", "mail"] as const;
export type ActBy = (typeof ACT_BY)[number];

/** How long a verb's own route may take, inside this route's own limit. */
const CALL_TIMEOUT_MS = 50_000;

interface Answered {
  ok: boolean;
  status: number;
  data: unknown;
  code: string;
  message: string;
}

/** One of a spec's calls, as a request of its own to this app, under the member's own session. */
async function callRoute(
  req: Request,
  call: ProposalCall,
  extra: { key: string | null; undoOf?: string | null },
): Promise<Answered> {
  const space = call.route.indexOf(" ");
  const method = call.route.slice(0, space);
  let path = call.route.slice(space + 1);
  for (const [k, v] of Object.entries(call.params ?? {})) path = path.replace(`[${k}]`, encodeURIComponent(v));
  const at = new URL(req.url);
  const url = new URL(`/api/v1/${path}`, at.origin);
  const workspace = at.searchParams.get("workspace");
  if (workspace) url.searchParams.set("workspace", workspace);
  const headers: Record<string, string> = { origin: at.origin, "x-via": "ask" };
  const cookie = req.headers.get("cookie");
  if (cookie) headers.cookie = cookie;
  const bearer = req.headers.get("authorization");
  if (bearer) headers.authorization = bearer;
  const key = call.idempotencyKey ?? extra.key;
  if (key) headers["idempotency-key"] = key;
  if (extra.undoOf) headers["x-undo-of"] = extra.undoOf;
  const hasBody = call.body !== undefined && method !== "GET";
  if (hasBody) headers["content-type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    ...(hasBody ? { body: JSON.stringify(call.body) } : {}),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const body = recordOrEmpty(await res.json().catch(() => null));
  if (res.ok && body.ok !== false) return { ok: true, status: res.status, data: body.data, code: "", message: "" };
  const error = recordOrEmpty(body.error);
  return {
    ok: false,
    status: res.status,
    data: null,
    code: typeof error.code === "string" ? error.code : "unknown",
    message: errorMessageOf(error, res.status),
  };
}

/** A spec's several calls, in order, stopping at the first refused; a call's row gone is done, where its spec says so. */
async function sendAll(
  req: Request,
  calls: readonly ProposalCall[],
  key: string | null,
  undoOf?: string | null,
): Promise<{ ok: true; answers: unknown[] } | { ok: false; refused: Answered; landed: number }> {
  const answers: unknown[] = [];
  for (const [i, call] of calls.entries()) {
    const r = await callRoute(req, call, { key: key && i > 0 ? `${key}:${i + 1}` : key, undoOf });
    if (!r.ok) {
      if (call.goneIsDone && r.status === 404) continue;
      return { ok: false, refused: r, landed: i };
    }
    answers.push(r.data);
  }
  return { ok: true, answers };
}

/** What a spec reads of the tab, read here: the workspace's settings, which a settings card writes over and an undo checks. */
async function tabHere(ctx: RouteContext, member: Member, kind: string): Promise<ProposalTab> {
  if (kind !== "settings") return { settings: null };
  const read = await load(readerContext(ctx, member), configReader, undefined).catch(logAndGoOn("act settings", null));
  const row = read?.data as { config?: Record<string, unknown> | null; version?: number } | null | undefined;
  return { settings: row ? { config: row.config ?? null, version: row.version } : null };
}

const isRefusal = (c: object): c is ProposalRefusal => "refused" in c;
const asCalls = (c: ProposalCall | readonly ProposalCall[]): readonly ProposalCall[] =>
  Array.isArray(c) ? c : [c as ProposalCall];

/** The card as the turn keeps it, or a door's no in the person's words. */
async function cardOnTurn(ctx: RouteContext, messageId: string, proposalId: string) {
  const { data: m, error } = await findAskTurnContent(ctx.supabase, messageId);
  if (error || !m) throw new AppError("not_found", "That card is not yours or is already gone.", 404);
  const content = recordOrEmpty(m.content);
  const proposals = Array.isArray(content.proposals) ? (content.proposals as AskProposal[]) : [];
  const card = proposals.find((p) => p.id === proposalId);
  if (!card) throw new AppError("not_found", "No such card on that turn.", 404);
  return { card, proposals };
}

/** The refresh the browser owes each call it did not send itself. */
const told = (calls: readonly ProposalCall[]): AskActAnswer["calls"] =>
  calls.map((c) => ({ route: c.route, events: c.events ?? [] }));

/** Stopped, in one sentence, with one way forward, kept on the turn and in the record. */
async function failed(
  ctx: RouteContext,
  sides: { messageId: string; proposalId: string; actionId: string | null },
  words: { message: string; code: string; moved: boolean; redraft?: boolean; card: AskProposal },
): Promise<AskActAnswer> {
  const outcome: AskProposalOutcome = {
    state: "failed",
    receipt: words.message.slice(0, 280),
    atMs: Date.now(),
    undo: null,
    ...(words.moved ? { moved: true } : {}),
  };
  await setProposalOutcome(ctx, sides.messageId, sides.proposalId, outcome).catch(logAndGoOn("act outcome", null));
  if (sides.actionId)
    await finishAskAction(ctx.supabase, sides.actionId, { state: "failed", code: words.code }).catch(
      logAndGoOn("act record", null),
    );
  return {
    ok: false,
    message: words.message,
    outcome,
    calls: [],
    forward: failureDoorOf(words.code, words.message),
    ...(words.redraft ? { redraft: true } : {}),
  };
}

/**
 * Act on a card (POST ask/act). The member's session reads the turn, so RLS is the door to whose turn it is; each verb's own
 * route then judges the role and the state as it always has.
 */
export async function runAct(
  ctx: RouteContext,
  req: Request,
  member: Member,
  input: { messageId: string; proposalId: string; by: ActBy; why?: string | null },
): Promise<AskActAnswer> {
  const tenantId = member.tenantId as TenantId;
  const { card, proposals } = await cardOnTurn(ctx, input.messageId, input.proposalId);
  // A press sent twice, or a second tab: what the first did, once more.
  if (card.outcome?.state === "done") return { ok: true, message: "", outcome: card.outcome, calls: [], forward: null };
  const spec = PROPOSAL_SPECS[card.kind] as ProposalSpec | undefined;
  if (!spec) throw new AppError("validation", "This card cannot be pressed from here.");
  const sides = { messageId: input.messageId, proposalId: input.proposalId, actionId: null as string | null };
  // Too old to be anything but a guess, by the week a plan may wait.
  if (askCardLapsed({ ...card, plan: card.plan ?? { id: "", step: 0, of: 0, silent: false, after: [] } }, Date.now()))
    return failed(ctx, sides, {
      message: "This is over a week old. Ask again and it is made from how things stand now.",
      code: "lapsed",
      moved: true,
      card,
    });
  // Is it still true? Who else is talking?
  const moved = await cardMoved(ctx, tenantId, ctx.userId, card).catch(logAndGoOn("act recheck", null));
  if (moved)
    return failed(ctx, sides, { message: moved.says, code: "moved", moved: true, redraft: moved.redraft, card });
  // A plan's step: what its earlier steps made, in place of their tokens.
  const filled = cardWithSteps(card, card.plan ? planMadeOf(card.plan.id, proposals) : {});
  if (isRefusal(filled)) return failed(ctx, sides, { message: filled.refused, code: "waits", moved: false, card });
  const started = await startAskAction(ctx.supabase, {
    tenantId,
    userId: ctx.userId,
    messageId: input.messageId,
    proposalId: input.proposalId,
    kind: card.kind,
    by: input.by,
    originBy: card.origin?.by ?? null,
    strangers: card.origin?.strangers ?? false,
    reason: input.why ?? null,
  }).catch(logAndGoOn("act record", { id: null, again: false }));
  sides.actionId = started.id;
  const key = card.plan ? `plan:${card.plan.id}:${card.plan.step}` : card.id;
  const tab = await tabHere(ctx, member, card.kind);
  const made = spec.commit(filled, tab);
  if (!Array.isArray(made) && isRefusal(made as object))
    return failed(ctx, sides, { message: (made as ProposalRefusal).refused, code: "refused", moved: false, card });
  const calls = asCalls(made as ProposalCall | readonly ProposalCall[]);
  const sent = await sendAll(req, calls, key);
  if (!sent.ok)
    return failed(ctx, sides, {
      message: sent.refused.message,
      code: sent.refused.code,
      moved: sent.refused.status === 404 || sent.refused.status === 409,
      card,
    });
  const data =
    sent.answers.length === 1 ? sent.answers[0] : spec.gather ? spec.gather(sent.answers) : sent.answers.at(-1);
  // A deal's next step and its like: the second call stands or falls on its own, and the receipt says which.
  const next = spec.then?.(filled, data) ?? null;
  let then: ProposalThen | undefined;
  if (next) {
    if (isRefusal(next)) then = { ok: false, message: next.refused };
    else {
      const r = await callRoute(req, next, { key: `${key}:then` });
      then = r.ok ? { ok: true, data: r.data } : { ok: false, message: r.message };
    }
  }
  const madeId = spec.made?.(filled, data) ?? null;
  const outcome: AskProposalOutcome = {
    state: "done",
    receipt: spec.receipt(filled, data, then),
    atMs: Date.now(),
    undo: spec.undo?.record(filled, data, tab) ?? null,
    made: madeId ? { kind: card.kind, id: madeId } : null,
  };
  await setProposalOutcome(ctx, input.messageId, input.proposalId, outcome).catch((e: unknown) =>
    log.error("ask_act_outcome_unsaved", { tenant_id: tenantId, error: e }),
  );
  if (started.id)
    await finishAskAction(ctx.supabase, started.id, {
      state: "done",
      madeKind: madeId ? card.kind : null,
      madeId,
    }).catch(logAndGoOn("act record", null));
  return { ok: true, message: "", outcome, calls: told(calls), forward: null };
}

/** Undo a card (POST ask/act/undo): what its commit kept, through its spec's own way back, its row marked. */
export async function undoAct(
  ctx: RouteContext,
  req: Request,
  member: Member,
  input: { messageId: string; proposalId: string },
): Promise<AskActAnswer> {
  const tenantId = member.tenantId as TenantId;
  const { card } = await cardOnTurn(ctx, input.messageId, input.proposalId);
  const spec = PROPOSAL_SPECS[card.kind] as ProposalSpec | undefined;
  const record = card.outcome?.undo ?? null;
  if (!spec?.undo || !record) throw new AppError("validation", "This one has no undo.");
  const tab = await tabHere(ctx, member, card.kind);
  const made = spec.undo.call(record, tab);
  if (!Array.isArray(made) && isRefusal(made as object))
    return {
      ok: false,
      message: (made as ProposalRefusal).refused,
      outcome: card.outcome ?? null,
      calls: [],
      forward: null,
    };
  const calls = asCalls(made as ProposalCall | readonly ProposalCall[]);
  const undoOf = typeof record.decision_id === "string" && record.decision_id ? record.decision_id : null;
  const sent = await sendAll(req, calls, `undo:${card.id}`, undoOf);
  if (!sent.ok) {
    const message = spec.undo.partial?.(record, sent.landed, sent.refused.message) ?? sent.refused.message;
    return { ok: false, message, outcome: card.outcome ?? null, calls: [], forward: null };
  }
  const outcome: AskProposalOutcome = {
    state: "undone",
    receipt: spec.undo.receipt(sent.answers.at(-1), record),
    atMs: Date.now(),
    undo: null,
  };
  await setProposalOutcome(ctx, input.messageId, input.proposalId, outcome).catch((e: unknown) =>
    log.error("ask_act_outcome_unsaved", { tenant_id: tenantId, error: e }),
  );
  await markAskActionUndone(ctx.supabase, tenantId, input.messageId, input.proposalId).catch(
    logAndGoOn("act record", null),
  );
  return { ok: true, message: "", outcome, calls: told(calls), forward: null };
}

/** The body the two doors read: which card, and how. */
export function actBody(json: unknown): { messageId: string; proposalId: string; by: ActBy } {
  const body = recordOrEmpty(json);
  const messageId = typeof body.message_id === "string" ? body.message_id : "";
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.slice(0, 40) : "";
  if (!messageId || !/^p-[a-z0-9-]+$/.test(proposalId)) throw new AppError("validation", "Which card?");
  return { messageId, proposalId, by: isOneOf(ACT_BY, body.by) ? body.by : "press" };
}

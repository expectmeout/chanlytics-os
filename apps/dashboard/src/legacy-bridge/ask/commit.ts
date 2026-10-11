/**
 * A card's commit and its undo, through the verb's own route: the walk over its spec.
 *
 * Every proposal the assistant makes lands here when the person approves it. What each kind does -- the route, what
 * to send, the second call a deal's next step makes, the window events, the receipt, and what undo keeps and sends --
 * is its spec's (contracts ask-proposals/); this module only walks it: it takes what the tab holds, makes each call
 * through the typed client, tells the window what landed, and hands the receipt and the undo's record back. The route
 * re-checks the role and the state. After a call lands, the refresh map re-reads the surfaces it touched, the same as
 * when the page's own button is pressed, so this module drags none of the Next-only imports behind them and can be
 * executed in a test.
 *
 * Two marks ride with every call. `via: "ask"` tells the ledger a card was tapped, not a button. And an undo names the
 * decision it reverses: the commit keeps the ledger row's id the route answered with, and the inverse call sends it as
 * `undoOf`, which the ledger writes into `undo_of` -- so "this row undid that one" is on the record, not inferred from
 * timestamps. Policy and settings changes live in the events ledger, which has no row ids to hand back, so their undo
 * is a change like any other there.
 *
 * A plan's cards (AskProposal.plan) are ordinary cards with three differences: a step's calls go under the step's key
 * (`plan:<id>:<n>`), so the plan pressed twice, or once as a group and once card by card, makes nothing twice; a send
 * waits for the steps its stamp names (`after`), refused before its spec is read until each is committed; and a token
 * in a step's payload (`@step:n`) is filled with what step n made before the spec reads it. commitPlan approves one
 * plan's silent steps together, in step order, stopping at the first refused; commitCard is a card pressed on the Line,
 * judged by what the turn's other cards of its plan became.
 *
 * The client is a parameter with the tab's own as the default, so a test hands in one bound to a fake fetch and runs
 * every branch for real.
 */
import {
  PROPOSAL_WORDS,
  askCardLapsed,
  planMadeOf,
  planWaits,
  proposalSpec,
  resolveSteps,
  type AskPlanStamp,
  type AskProposal,
  type AskProposalOutcome,
  type PlanMade,
  type ProposalCall,
  type ProposalRefusal,
  type ProposalTab,
  type ProposalThen,
} from "@chanlytics/contracts";
import type { Api, ApiOptions, RouteKey } from "../../client/api";
import { apiFor } from "../api";
import { goToRoute } from "../workspace";
import { viaAsk } from "./api";

/** What a commit did: its receipt, what its undo keeps, and the id it made that a later step of a plan names, or null. */
export type CommitResult =
  | { ok: true; receipt: string; undo: Record<string, unknown> | null; made: { kind: string; id: string } | null }
  | { ok: false; message: string };

/** What an undo did: its receipt, and nothing further to undo or to name. */
export type UndoResult = { ok: true; receipt: string; undo: null } | { ok: false; message: string };

/** What a commit is judged by beside the card: the clock it is fresh by, and what its plan's earlier steps made. */
interface CommitAt {
  nowMs?: number;
  made?: PlanMade;
}

interface Loaded {
  __SETTINGS?: { config?: Record<string, unknown> | null; version?: number } | null;
}

/** What the tab holds now, as a spec reads it: taken once, so a re-read after the call cannot change what was kept. */
function tabOf(win: Window): ProposalTab {
  const st = (win as unknown as Loaded).__SETTINGS;
  return { settings: st ? { config: st.config, version: st.version } : null };
}

const isRefusal = (c: object): c is ProposalRefusal => "refused" in c;
/** An undo of several rows answers its calls as a list (contracts ProposalUndo.call). */
const isCalls = (c: ProposalCall | readonly ProposalCall[] | ProposalRefusal): c is readonly ProposalCall[] =>
  Array.isArray(c);

/**
 * One of a spec's calls, through the typed client, marked as a card's, under a key that is the card's own (its
 * proposal id, or its plan's step's key, and a suffix for its second call or its undo): a card approved in two tabs, or
 * pressed twice, is one change, since the write routes keep a card's answer under its key (server/route.ts, onceForKey).
 */
function send(client: Api, c: ProposalCall, cardKey: string, undoOf?: string) {
  // Every key a spec may name is one the client knows: contracts' keys and the client's are one generated list
  // (route-types.test.mjs), and this assignment is the compiler's side of that. What each route takes is the
  // dashboard's (Input<K>), so the options are cast, as a key held in a variable must be.
  const key: RouteKey = c.route;
  const opts = { params: c.params, body: c.body, idempotencyKey: c.idempotencyKey ?? cardKey, refresh: c.refresh };
  return viaAsk(client, key, opts as ApiOptions<typeof key>, undoOf);
}

/** The window events a call carries, once it has landed. */
function tell(win: Window, c: ProposalCall): void {
  for (const e of c.events ?? [])
    win.dispatchEvent(e.detail ? new CustomEvent(e.type, { detail: e.detail }) : new CustomEvent(e.type));
}

/** A plan's step's key: one per step of one plan, whichever way the step is pressed (Review Focus 3). */
const stepKey = (plan: AskPlanStamp): string => `plan:${plan.id}:${plan.step}`;

/**
 * Why a step a card waits for or names by its token gives it nothing, in the person's words: the step undone, done with
 * nothing to name, or not done yet. The one spelling of a step's state as a refusal.
 */
function unnamed(made: PlanMade, n: number): string {
  const step = made[n];
  if (!step) return PROPOSAL_WORDS.waitsForStep(n);
  return "undone" in step ? PROPOSAL_WORDS.planUndone : PROPOSAL_WORDS.stepMadeNothing(n);
}

/**
 * A plan's card with what its earlier steps made in place of their tokens (`@step:n`, contracts resolveSteps); or the
 * refusal, and nothing is sent: where a step it waits for (its stamp's `after`, contracts planWaits: every step of its
 * plan that sends nothing, not only those its tokens name) was undone or is not committed yet, and where a step it names
 * was undone (what it made is gone), made nothing a token names (waiting would never help), or is not committed yet (it
 * is approved first). A card of no plan is as it was.
 */
function withSteps(p: AskProposal, made: PlanMade): AskProposal | ProposalRefusal {
  if (!p.plan) return p;
  const wait = planWaits(p.plan, made);
  if (wait) return { refused: unnamed(made, "undone" in wait ? wait.undone : wait.waits) };
  const filled = resolveSteps(p.payload, made);
  return "unresolved" in filled ? { refused: unnamed(made, Number(filled.unresolved)) } : { ...p, payload: filled };
}

/**
 * Approve a card: its spec's call under the card's key (a plan's step's, where it is one), the window told, the second
 * call where its spec makes one, and the receipt, what undo keeps and the id it made. `at.made` is what its plan's
 * earlier steps made, which fills its tokens; `at.nowMs` the clock it is judged fresh by.
 */
export async function commitProposal(
  win: Window,
  p: AskProposal,
  client: Api = apiFor(win),
  at: CommitAt = {},
): Promise<CommitResult> {
  const spec = proposalSpec(p.kind);
  if (!spec) return { ok: false, message: PROPOSAL_WORDS.cannotApprove };
  // A card is approved while it is fresh: past a day (a plan's, a week) nothing is sent, and it is asked for again.
  if (askCardLapsed(p, at.nowMs ?? Date.now()))
    return { ok: false, message: p.plan ? PROPOSAL_WORDS.planLapsed : PROPOSAL_WORDS.lapsed };
  const card = withSteps(p, at.made ?? {});
  if (isRefusal(card)) return { ok: false, message: card.refused };
  const key = card.plan ? stepKey(card.plan) : card.id;
  const tab = tabOf(win);
  const call = spec.commit(card, tab);
  if (isRefusal(call)) return { ok: false, message: call.refused };
  const r = await send(client, call, key);
  if (!r.ok) return r;
  tell(win, call);
  // The second call (a deal's next step), on the first one's answer. The first stands either way, and the receipt
  // says how the second went: refused by its route, or by its spec before anything was sent.
  const next = spec.then?.(card, r.data) ?? null;
  let then: ProposalThen | undefined;
  if (next && isRefusal(next)) then = { ok: false, message: next.refused };
  else if (next) {
    const n = await send(client, next, `${key}:then`);
    if (n.ok) tell(win, next);
    then = n.ok ? { ok: true } : { ok: false, message: n.message };
  }
  const id = spec.made?.(card, r.data) ?? null;
  return {
    ok: true,
    receipt: spec.receipt(card, r.data, then),
    undo: spec.undo?.record(card, r.data, tab) ?? null,
    made: id ? { kind: card.kind, id } : null,
  };
}

/** A press's client and clock: the tab's own and now, unless a test hands its own. */
interface PressWith {
  client?: Api;
  nowMs?: number;
}

/**
 * A card pressed on the Line (AskApi.commit): commitProposal, judged by what the other cards of its plan, as the turn
 * holds them (`cards`, their outcomes as they stand), became (contracts planMadeOf). So a send whose steps were approved,
 * on the group's press, one by one or before a reload, fills its tokens from what they made; one whose steps are not
 * approved yet waits for them; and a card of another plan in the same turn is never read as one of its steps. A card of
 * no plan is pressed as it always was.
 */
export function commitCard(
  win: Window,
  p: AskProposal,
  cards: readonly AskProposal[],
  use: PressWith = {},
): Promise<CommitResult> {
  return commitProposal(win, p, use.client ?? apiFor(win), {
    nowMs: use.nowMs,
    made: p.plan ? planMadeOf(p.plan.id, cards) : undefined,
  });
}

/**
 * What a press of a plan's silent steps did: each step it sent, with its result and the id it made, in step order; the
 * steps it did not send because they were committed before (`done`) or undone by the owner (`undone`); every step
 * committed so far, as the plan's made (`made`); and the step it stopped at, if any.
 */
export interface PlanRun {
  results: { step: number; result: CommitResult; id: string | null }[];
  done: number[];
  undone: number[];
  made: PlanMade;
  stoppedAt: number | null;
}

/**
 * A plan's silent steps, approved together (the marketing manager's spec §5.4): the cards of one plan stamped silent,
 * in step order, each through commitProposal under its step's key. A step `made` holds is never sent again: one
 * committed before is done, and one the owner undid stays undone, skipped, since an undo is the owner's word on that
 * step and any later step that names it is refused on its own (planUndone); the rest of the plan still goes. So a
 * second press, however long after, files nothing twice; and two presses that each know nothing was made (two tabs at
 * once) are answered by each route under the step's key with what the first made (server/route.ts, onceForKey, a key
 * kept a day). A step's tokens are filled from `made` and what the press makes as it goes, and every step it commits
 * joins the made it hands back, with no id where it made nothing a token names. The first step refused or failed ends
 * the press: its result says the plan stopped there (PROPOSAL_WORDS.planStopped), and no later step is sent. A send is
 * not among them: each is its own press.
 *
 * One plan a press: the plan the first stamped card is a step of, and only its cards, so a turn's two plans never share a
 * step's number (another plan's step 1 is never skipped as this one's, nor fills a token from this one's made[1]). Handed
 * no `made` (the Line's press, AskApi.commitPlan), it reads what the plan's cards became (contracts planMadeOf), so a
 * step approved on its own, or before a reload, is done.
 */
export async function commitPlan(
  win: Window,
  cards: readonly AskProposal[],
  made?: PlanMade,
  use: PressWith = {},
): Promise<PlanRun> {
  const client = use.client ?? apiFor(win);
  const nowMs = use.nowMs ?? Date.now();
  const planId = cards.find((p) => p.plan)?.plan?.id;
  const mine = cards.filter((p) => planId !== undefined && p.plan?.id === planId);
  const silent = mine
    .flatMap((p) => (p.plan?.silent ? [{ p, step: p.plan.step }] : []))
    .sort((a, b) => a.step - b.step);
  const known = made ?? (planId === undefined ? {} : planMadeOf(planId, mine));
  const run: PlanRun = { results: [], done: [], undone: [], made: { ...known }, stoppedAt: null };
  for (const { p, step } of silent) {
    const was = run.made[step];
    if (was) {
      ("undone" in was ? run.undone : run.done).push(step);
      continue;
    }
    const result = await commitProposal(win, p, client, { nowMs, made: run.made });
    if (!result.ok) {
      const stopped = { ...result, message: PROPOSAL_WORDS.planStopped(step, result.message) };
      run.results.push({ step, result: stopped, id: null });
      return { ...run, stoppedAt: step };
    }
    const id = result.made?.id ?? null;
    run.made[step] = { kind: p.kind, id };
    run.results.push({ step, result, id });
  }
  return run;
}

export async function undoProposal(
  win: Window,
  p: AskProposal,
  outcome: AskProposalOutcome,
  client: Api = apiFor(win),
): Promise<UndoResult> {
  const record = (outcome.undo ?? null) as Record<string, unknown> | null;
  const undo = proposalSpec(p.kind)?.undo;
  if (!record || !undo) return { ok: false, message: PROPOSAL_WORDS.noUndo };
  // The row this undo reverses, when the commit's route answered with one.
  const undoOf = typeof record.decision_id === "string" && record.decision_id ? record.decision_id : undefined;
  const made = undo.call(record, tabOf(win));
  if (!isCalls(made) && isRefusal(made)) return { ok: false, message: made.refused };
  // Several rows, each through its own door (a message's versions): one call each, in order, each under a key of its own,
  // stopping at the first refused, and saying what landed before it. Pressed again, a call whose row an earlier press
  // took answers 404 before its key is read (a row-scoped write reads its row first, server/route.ts), which a call that
  // says so (`goneIsDone`) counts as done; a refused call let its key go, so it runs again.
  const calls = isCalls(made) ? made : [made];
  if (calls.length === 0) return { ok: false, message: PROPOSAL_WORDS.noUndo };
  let data: unknown = null;
  for (const [i, call] of calls.entries()) {
    const r = await send(client, call, i === 0 ? `${p.id}:undo` : `${p.id}:undo:${i + 1}`, undoOf);
    // Its row gone already (an earlier press took it): what it undoes is not there, so it is done; on to the next.
    if (!r.ok && call.goneIsDone && r.status === 404) continue;
    // Refused after some landed: what they did, then the refusal (the spec's words), never the refusal alone.
    if (!r.ok) return i > 0 && undo.partial ? { ok: false, message: undo.partial(record, i, r.message) } : r;
    tell(win, call);
    data = r.data;
  }
  return { ok: true, receipt: undo.receipt(data, record), undo: null };
}

/** "Edit in the composer": open the thread with the words ready to change. */
export function editReply(win: Window, p: AskProposal): void {
  const pl = p.payload;
  const text = (v: unknown): string => (v == null ? "" : String(v));
  goToRoute(`inbox/th-${text(pl.conversation_id)}`, {}, win);
  win.setTimeout(
    () => win.dispatchEvent(new CustomEvent("inbox:focus-composer", { detail: { text: text(pl.text) } })),
    400,
  );
}

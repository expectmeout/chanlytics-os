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
 * (`plan:<id>:<n>`), so the plan pressed twice the same day, or once as a group and once card by card, makes nothing
 * twice (server/route.ts onceForKey keeps a key a day, 00340, and a plan's card is fresh a week); a send waits for the
 * steps its stamp names (`after`), refused before its spec is read until each is committed; and a token in a step's
 * payload (`@step:n`) is filled with what step n made before the spec reads it. commitPlan approves one plan's silent
 * steps together, in step order, stopping at the first refused; commitCard is a card pressed on the Line, judged by what
 * the turn's other cards of its plan became. A press after its key's day is held by what the turn recorded of each
 * card (planMadeOf), and where that record was lost, by each door's own rule: a message by its name (409), a campaign
 * by its running twin (POST playbooks, campaigns/playbook-row.ts twinRefusal), a send by the week's breath, which leaves
 * out whoever the first reached.
 *
 * The client is a parameter with the tab's own as the default, so a test hands in one bound to a fake fetch and runs
 * every branch for real.
 */
import {
  PROPOSAL_WORDS,
  askCardLapsed,
  planMadeOf,
  planWaits,
  resolveSteps,
  type AskPlanStamp,
  type AskProposal,
  type AskProposalOutcome,
  type PlanMade,
  type ProposalRefusal,
} from "@chanlytics/contracts";
import type { Api } from "../../client/api";
import { apiFor } from "../api";
import { isRefusal, saidHere, specOf, undoVerb, walkVerb } from "../verbs/commit";
import { goToRoute } from "../workspace";

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
 * Approve a card: its spec's call under the card's key (a plan's step's, where it is one), marked as a card's, through
 * the verb walk every press goes through (legacy-bridge/verbs walkVerb): the window told, the second call where its
 * spec makes one, and the receipt, what undo keeps and the id it made. `at.made` is what its plan's earlier steps made,
 * which fills its tokens; `at.nowMs` the clock it is judged fresh by.
 */
export async function commitProposal(
  win: Window,
  p: AskProposal,
  client: Api = apiFor(win),
  at: CommitAt = {},
): Promise<CommitResult> {
  if (!(await specOf(p.kind)).spec) return { ok: false, message: PROPOSAL_WORDS.cannotApprove };
  // A card is approved while it is fresh: past a day (a plan's, a week) nothing is sent, and it is asked for again.
  if (askCardLapsed(p, at.nowMs ?? Date.now()))
    return { ok: false, message: p.plan ? PROPOSAL_WORDS.planLapsed : PROPOSAL_WORDS.lapsed };
  const card = withSteps(p, at.made ?? {});
  if (isRefusal(card)) return { ok: false, message: card.refused };
  const key = card.plan ? stepKey(card.plan) : card.id;
  const r = await walkVerb(card, { win, client, key, via: "ask" });
  // A door's refusal is the card's answer whole: the kind of no beside the server's own sentence (refusals-in-our-words);
  // the walk's own (nothing sent) is its words.
  if (!r.ok) return saidHere(r) ? { ok: false, message: r.message } : r;
  return { ok: true, receipt: r.receipt, undo: r.undo, made: r.made ? { kind: card.kind, id: r.made } : null };
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
 * in step order, each through commitProposal under its step's key. What the plan's cards became (contracts planMadeOf,
 * their outcomes as the turn holds them) says which steps were made: one committed before, on its own or before a
 * reload, is done, and one the owner undid stays undone, skipped, since an undo is the owner's word on that step and any
 * later step that names it is refused on its own (planUndone); the rest of the plan still goes. So a second press with
 * those outcomes recorded files nothing twice; two presses that each know nothing was made (two tabs at once) are
 * answered by each route under the step's key with what the first made (server/route.ts, onceForKey, a key kept a day);
 * and a press after that day whose record was lost is held by each door's own rule, as this module's head says. A
 * step's tokens are filled from what was made and what the press makes as it goes, and every step it commits joins the
 * made it hands back, with no id where it made nothing a token names. The first step refused or failed ends the press:
 * its result says the plan stopped there (PROPOSAL_WORDS.planStopped), and no later step is sent. A send is not among
 * them: each is its own press.
 *
 * One plan a press: the plan the first stamped card is a step of, and only its cards, so a turn's two plans never share a
 * step's number (another plan's step 1 is never skipped as this one's, nor fills a token from this one's made[1]).
 */
export async function commitPlan(win: Window, cards: readonly AskProposal[], use: PressWith = {}): Promise<PlanRun> {
  const client = use.client ?? apiFor(win);
  const nowMs = use.nowMs ?? Date.now();
  const planId = cards.find((p) => p.plan)?.plan?.id;
  const mine = cards.filter((p) => planId !== undefined && p.plan?.id === planId);
  const silent = mine
    .flatMap((p) => (p.plan?.silent ? [{ p, step: p.plan.step }] : []))
    .sort((a, b) => a.step - b.step);
  const known = planId === undefined ? {} : planMadeOf(planId, mine);
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
  if (!record || !(await specOf(p.kind)).spec?.undo) return { ok: false, message: PROPOSAL_WORDS.noUndo };
  // The verb walk's undo, marked as a card's, under the card's own key: the row it reverses is named by the commit's
  // ledger row (`decision_id`), and a call whose row an earlier press took counts as done (verbs/commit.ts).
  const r = await undoVerb(p.kind, record, { win, client, key: p.id, via: "ask" });
  if (r.ok) return { ok: true, receipt: r.receipt, undo: null };
  return saidHere(r) ? { ok: false, message: r.message } : r;
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

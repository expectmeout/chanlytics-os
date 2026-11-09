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
 * twice (server/shared/route.ts onceForKey keeps a key a day, 00340, and a plan's card is fresh a week); a send waits for the
 * steps its stamp names (`after`), refused before its spec is read until each is committed; and a token in a step's
 * payload (`@step:n`) is filled with what step n made before the spec reads it. commitPlan approves one plan's silent
 * steps together, in step order, stopping at the first refused; commitCard is a card pressed on the Line, judged by what
 * the turn's other cards of its plan became. A press after its key's day is held by what the turn recorded of each
 * card (planMadeOf), and where that record was lost, by each door's own rule: a message by its name (409), a campaign
 * by its running twin (POST playbooks, campaigns/playbook-row.ts findTwinRefusal), a send by the week's breath, which leaves
 * out whoever the first reached.
 *
 * The client is a parameter with the tab's own as the default, so a test hands in one bound to a fake fetch and runs
 * every branch for real.
 */
import {
  PROPOSAL_WORDS,
  askCardLapsed,
  planMadeOf,
  planPressOf,
  planWaits,
  resolveSteps,
  type AskPlanStamp,
  type AskProposal,
  type AskProposalOutcome,
  type PlanMade,
  type ProposalRefusal,
  textOrEmpty,
} from "@chanlytics/contracts";
import type { Api } from "../../client/api";
import { apiFor } from "../api";
import { isRefusal, saidHere, specOf, tabOf, undoVerb, walkVerb } from "../verbs/commit";

/** What a commit did: its receipt, what its undo keeps, and the id it made that a later step of a plan names, or null. */
export type CommitResult =
  | { ok: true; receipt: string; undo: Record<string, unknown> | null; made: { kind: string; id: string } | null }
  | { ok: false; message: string; moved?: boolean };

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
 * The settings a card writes over, read where this tab has not opened Settings: a press on Ask reads them itself, so a note
 * for the receptionist never stops at "open Settings once" (the plan's one press took it there). `again` reads them afresh
 * for an undo, which is true only while nobody has saved since. A read that fails leaves the spec to say so.
 */
async function settingsInHand(win: Window, client: Api, kind: string, again: boolean): Promise<void> {
  if (kind !== "settings" || (!again && tabOf(win).settings)) return;
  // A read that fails goes on: the spec then refuses in its own words, which is what the person should hear.
  const read = await client("GET settings", {} as never).catch(() => null);
  const data = read && read.ok ? (read.data as { config?: Record<string, unknown> | null; version?: number }) : null;
  if (data && typeof data.version === "number" && data.config)
    Reflect.set(win, "__SETTINGS", {
      ...(Reflect.get(win, "__SETTINGS") as object | undefined),
      config: data.config,
      version: data.version,
    });
}

/**
 * Approve a card: its spec's call under the card's key (a plan's step's, where it is one), marked as a card's, through
 * the verb walk every press goes through (bridge/verbs walkVerb): the window told, the second call where its
 * spec makes one, and the receipt, what undo keeps and the id it made. `at.made` is what its plan's earlier steps made,
 * which fills its tokens; `at.nowMs` the clock it is judged fresh by.
 */
export async function commitProposal(
  win: Window,
  p: AskProposal,
  client: Api = apiFor(win),
  at: CommitAt = {},
): Promise<CommitResult> {
  const { spec, unreached } = await specOf(p.kind);
  if (unreached) return unreached;
  if (!spec) return { ok: false, message: PROPOSAL_WORDS.cannotApprove };
  // A card is approved while it is fresh: past a day (a plan's, a week) nothing is sent, and it is asked for again.
  if (askCardLapsed(p, at.nowMs ?? Date.now()))
    return { ok: false, message: p.plan ? PROPOSAL_WORDS.planLapsed : PROPOSAL_WORDS.lapsed };
  const card = withSteps(p, at.made ?? {});
  if (isRefusal(card)) return { ok: false, message: card.refused };
  const key = card.plan ? stepKey(card.plan) : card.id;
  await settingsInHand(win, client, card.kind, false);
  const r = await walkVerb(card, { win, client, key, via: "ask" });
  // A door's refusal is the card's answer whole: the kind of no beside the server's own sentence (refusals-in-our-words);
  // the walk's own (nothing sent) is its words. A 404 or a 409 says what the card is about has moved on.
  if (!r.ok) {
    if (saidHere(r)) return { ok: false, message: r.message };
    return r.status === 404 || r.status === 409 ? { ...r, moved: true } : r;
  }
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
 * A plan's one press (D2 of the answers canvas; contracts planPressOf says which steps it takes): the keeping steps and the
 * first send, in step order, each through commitProposal under its step's key. What the plan's cards became (contracts
 * planMadeOf, their outcomes as the turn holds them) says which steps were made: one committed before, on its own or before a
 * reload, is done, and one the owner undid stays undone, skipped, since an undo is the owner's word on that step and any
 * later step that names it is refused on its own (planUndone); the rest of the plan still goes. So a second press with
 * those outcomes recorded files nothing twice; two presses that each know nothing was made (two tabs at once) are
 * answered by each route under the step's key with what the first made (server/shared/route.ts, onceForKey, a key kept a day);
 * and a press after that day whose record was lost is held by each door's own rule, as this module's head says. A
 * step's tokens are filled from what was made and what the press makes as it goes, and every step it commits joins the
 * made it hands back, with no id where it made nothing a token names. The first step refused or failed ends the press:
 * its result says so (PROPOSAL_WORDS.planStopped), no later step is sent, and a second press carries on from there.
 *
 * One plan a press: the plan the first stamped card is a step of, and only its cards, so a turn's two plans never share a
 * step's number (another plan's step 1 is never skipped as this one's, nor fills a token from this one's made[1]).
 */
export async function commitPlan(win: Window, cards: readonly AskProposal[], use: PressWith = {}): Promise<PlanRun> {
  const client = use.client ?? apiFor(win);
  const nowMs = use.nowMs ?? Date.now();
  const planId = cards.find((p) => p.plan)?.plan?.id;
  const mine = cards.filter((p) => planId !== undefined && p.plan?.id === planId);
  const press = new Set(planPressOf(mine).steps);
  const inOrder = mine
    .flatMap((p) => (p.plan && (press.has(p.plan.step) || p.plan.silent) ? [{ p, step: p.plan.step }] : []))
    .sort((a, b) => a.step - b.step);
  const known = planId === undefined ? {} : planMadeOf(planId, mine);
  const run: PlanRun = { results: [], done: [], undone: [], made: { ...known }, stoppedAt: null };
  for (const { p, step } of inOrder) {
    const was = run.made[step];
    if (was) {
      ("undone" in was ? run.undone : run.done).push(step);
      continue;
    }
    const result = await commitProposal(win, p, client, { nowMs, made: run.made });
    if (!result.ok) {
      const stopped = { ...result, message: PROPOSAL_WORDS.planStopped(result.message) };
      run.results.push({ step, result: stopped, id: null });
      return { ...run, stoppedAt: step };
    }
    const id = result.made?.id ?? null;
    run.made[step] = { kind: p.kind, id };
    run.results.push({ step, result, id });
  }
  return run;
}

/** What a plan's one Undo did: each step it took back, last first, and the step it stopped at, if any. */
export interface PlanUndo {
  results: { step: number; result: UndoResult }[];
  stoppedAt: number | null;
}

/**
 * One Undo for a plan (D24 of the answers canvas): every step made that its spec can still take back, last first, so the
 * send goes before the words it went on. A send that will not take back stops it there and leaves the rest as they are: an
 * offer still running keeps its note and its words. A step past its own window (`open` false: a setting somebody saved over,
 * ten minutes gone) is left, and said by the card; the rest still go.
 */
export async function undoPlan(
  win: Window,
  cards: readonly AskProposal[],
  open: (p: AskProposal, o: AskProposalOutcome) => boolean,
  client: Api = apiFor(win),
): Promise<PlanUndo> {
  const made = cards
    .flatMap((p) =>
      p.plan && p.outcome?.state === "done" && p.outcome.undo ? [{ p, o: p.outcome, step: p.plan.step }] : [],
    )
    .sort((a, b) => b.step - a.step);
  const run: PlanUndo = { results: [], stoppedAt: null };
  for (const { p, o, step } of made) {
    if (!open(p, o)) continue;
    const result = await undoProposal(win, p, o, client);
    run.results.push({ step, result });
    if (!result.ok && !p.plan?.silent) return { ...run, stoppedAt: step };
  }
  return run;
}

/**
 * A running send paused or resumed from its receipt (the plan card's Pause, the canvas's board for many people): the
 * campaign's own change, by the id its start kept. Its key is new each press, so a pause, a resume and a second pause each go.
 */
export async function pauseSend(
  win: Window,
  p: AskProposal,
  paused: boolean,
  client: Api = apiFor(win),
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = textOrEmpty(p.outcome?.undo?.playbook_id);
  if (!id) return { ok: false, message: PROPOSAL_WORDS.cannotApprove };
  const card = {
    id: `${p.id}:${paused ? "pause" : "resume"}`,
    kind: "playbook_change",
    summary: "",
    payload: { playbook_id: id, state: paused ? "paused" : "running" },
  };
  const r = await walkVerb(card, { win, client, key: `${card.id}:${Date.now()}`, via: "ask" });
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

export async function undoProposal(
  win: Window,
  p: AskProposal,
  outcome: AskProposalOutcome,
  client: Api = apiFor(win),
): Promise<UndoResult> {
  const record = outcome.undo ?? null;
  if (!record) return { ok: false, message: PROPOSAL_WORDS.noUndo };
  const { spec, unreached } = await specOf(p.kind);
  if (unreached) return unreached;
  if (!spec?.undo) return { ok: false, message: PROPOSAL_WORDS.noUndo };
  await settingsInHand(win, client, p.kind, true);
  // The verb walk's undo, marked as a card's, under the card's own key: the row it reverses is named by the commit's
  // ledger row (`decision_id`), and a call whose row an earlier press took counts as done (verbs/commit.ts).
  const r = await undoVerb(p.kind, record, { win, client, key: p.id, via: "ask" });
  if (r.ok) return { ok: true, receipt: r.receipt, undo: null };
  return saidHere(r) ? { ok: false, message: r.message } : r;
}

/**
 * "Edit in the composer": the card's press opens the thread (its Open), and the words wait for it as the member's draft
 * of the thread's reply, which its box opens with (tab-memory.ts); a box already open on that thread takes them now.
 * Sent by event 400 ms after a second navigation, they were lost to an Inbox that mounted later.
 */
export function editReply(win: Window, p: AskProposal): void {
  const pl = p.payload;
  const text = textOrEmpty;
  const threadId = `th-${text(pl.conversation_id)}`;
  win.__tabMemory?.keepDraft("reply", text(pl.text), threadId);
  win.dispatchEvent(new CustomEvent("inbox:focus-composer", { detail: { text: text(pl.text), threadId } }));
}

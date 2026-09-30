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
 * The client is a parameter with the tab's own as the default, so a test hands in one bound to a fake fetch and runs
 * every branch for real.
 */
import {
  PROPOSAL_WORDS,
  proposalSpec,
  type AskProposal,
  type AskProposalOutcome,
  type ProposalCall,
  type ProposalRefusal,
  type ProposalTab,
  type ProposalThen,
} from "@chanlytics/contracts";
import type { Api, ApiOptions, RouteKey } from "../../client/api";
import { apiFor } from "../api";
import { goToRoute } from "../workspace";
import { viaAsk } from "./api";

export type CommitResult =
  { ok: true; receipt: string; undo: Record<string, unknown> | null } | { ok: false; message: string };

interface Loaded {
  __SETTINGS?: { config?: Record<string, unknown> | null; version?: number } | null;
}

/** What the tab holds now, as a spec reads it: taken once, so a re-read after the call cannot change what was kept. */
function tabOf(win: Window): ProposalTab {
  const st = (win as unknown as Loaded).__SETTINGS;
  return { settings: st ? { config: st.config, version: st.version } : null };
}

const isRefusal = (c: ProposalCall | ProposalRefusal): c is ProposalRefusal => "refused" in c;

/**
 * One of a spec's calls, through the typed client, marked as a card's, under a key that is the card's own (its
 * proposal id, and a suffix for its second call or its undo): a card approved in two tabs, or pressed twice, is one
 * change, since the write routes keep a card's answer under its key (server/route.ts, onceForCard).
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

export async function commitProposal(win: Window, p: AskProposal, client: Api = apiFor(win)): Promise<CommitResult> {
  const spec = proposalSpec(p.kind);
  if (!spec) return { ok: false, message: PROPOSAL_WORDS.cannotApprove };
  const tab = tabOf(win);
  const call = spec.commit(p, tab);
  if (isRefusal(call)) return { ok: false, message: call.refused };
  const r = await send(client, call, p.id);
  if (!r.ok) return r;
  tell(win, call);
  // The second call (a deal's next step), on the first one's answer. The first stands either way, and the receipt
  // says how the second went: refused by its route, or by its spec before anything was sent.
  const next = spec.then?.(p, r.data) ?? null;
  let then: ProposalThen | undefined;
  if (next && isRefusal(next)) then = { ok: false, message: next.refused };
  else if (next) {
    const n = await send(client, next, `${p.id}:then`);
    if (n.ok) tell(win, next);
    then = n.ok ? { ok: true } : { ok: false, message: n.message };
  }
  return { ok: true, receipt: spec.receipt(p, r.data, then), undo: spec.undo?.record(p, r.data, tab) ?? null };
}

export async function undoProposal(
  win: Window,
  p: AskProposal,
  outcome: AskProposalOutcome,
  client: Api = apiFor(win),
): Promise<CommitResult> {
  const record = (outcome.undo ?? null) as Record<string, unknown> | null;
  const undo = proposalSpec(p.kind)?.undo;
  if (!record || !undo) return { ok: false, message: PROPOSAL_WORDS.noUndo };
  // The row this undo reverses, when the commit's route answered with one.
  const undoOf = typeof record.decision_id === "string" && record.decision_id ? record.decision_id : undefined;
  const call = undo.call(record, tabOf(win));
  if (isRefusal(call)) return { ok: false, message: call.refused };
  const r = await send(client, call, `${p.id}:undo`, undoOf);
  if (!r.ok) return r;
  tell(win, call);
  return { ok: true, receipt: undo.receipt(r.data), undo: null };
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

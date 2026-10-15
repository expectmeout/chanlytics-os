/**
 * One act, committed through its verb's spec, whichever hand pressed it: a sheet's Save, a bulk bar's press, or Ask's
 * card (legacy-bridge/ask/commit.ts walks a card through the same `sendCall`). What each verb does -- its door, the body
 * it sends, a second call (a deal's next step), the window events, the receipt and what its undo keeps and sends -- is
 * its spec's (contracts PROPOSAL_SPECS); this module only walks it (the sheets as verbs, 14 Oct 2026). A page's bundle
 * carries the specs of the verbs a page presses; the cards only Ask proposes come by their own entry, loaded once, when
 * Ask is installed or the first of them is walked (`moreSpecs`).
 *
 * Every call goes through the typed client as one intent (decision 0035: `once`, a press again before it lands is the
 * same request, which the server answers once), unless a card's own key names it; the moment the door takes it, what
 * the tab shows at once is moved (effects.ts: a deal's row); then the surfaces the refresh map names are read again, as
 * after any button. A spec's own refusal (a card that does not say which question it answers) is never sent: it comes
 * back as the client's would, a `client` refusal in the spec's words, so a sheet says it as it says any other; the
 * body itself is the door's to judge, in its schema's words.
 *
 * Ask's cards tell the window what landed (their spec's events, `surface:clients`), so the person's page repaints
 * before People's read, which follows, has landed; a page's own press does not (`commitVerb`): the refresh after it
 * reads People, which the page hears, and a word of its own was a second read of the person.
 *
 * The client is a parameter with the tab's own as the default, so a test hands in one bound to a fake fetch and runs
 * every branch for real.
 */
import {
  PROPOSAL_WORDS,
  addProposalSpecs,
  refusalOf,
  verbSpec,
  type ProposalCall,
  type ProposalSpec,
  type ProposalRefusal,
  type ProposalTab,
  type ProposalThen,
  type VerbCard,
  type VerbKind,
} from "@chanlytics/contracts";
import type { Api, ApiOptions, ApiRefusal, ApiResult, RouteKey } from "../../client/api";
import { apiFor } from "../api";
import { acceptedFor } from "./effects";

/** What a press hands the walk besides the act: its tab, its client, its key and whose press it was. */
export interface VerbUse {
  win?: Window;
  client?: Api;
  /** A key of the press's own (a card's id, a plan's step): the server keeps its answer under it a day. */
  key?: string;
  /** A card tapped on Ask's Line, not a button: the ledger keeps which (client/api.ts `via`). */
  via?: "ask";
  /** The decision an undo reverses, which the ledger links to its row. */
  undoOf?: string;
  /** A deal's next step, beside its payload (contracts AskProposal.step). */
  step?: VerbCard["step"];
  /** How the surfaces are read again after it: a selection's turns ask once, at the end (`false`). */
  refresh?: boolean | "behind";
  /** Whether the window is told what landed (the spec's events): Ask's cards are; a page's press is not (`commitVerb`). */
  tell?: boolean;
}

/** What a commit did: the door's answer, the receipt, what its undo keeps and the id it made. */
export type VerbDone = {
  ok: true;
  data: unknown;
  receipt: string;
  undo: Record<string, unknown> | null;
  made: string | null;
};
export type VerbResult = VerbDone | ApiRefusal;

/** What an undo did. */
export type UndoDone = { ok: true; data: unknown; receipt: string };

/** The settings the tab loaded (window.__SETTINGS), as a spec reads them. */
interface Loaded {
  config?: Record<string, unknown> | null;
  version?: number;
}

/** What the tab holds now, as a spec reads it: taken once, so a re-read after the call cannot change what was kept. */
export function tabOf(win: Window): ProposalTab {
  const st: unknown = Reflect.get(win, "__SETTINGS");
  if (!st || typeof st !== "object") return { settings: null };
  const { config, version } = st as Loaded;
  return { settings: { config, version } };
}

export const isRefusal = (c: object): c is ProposalRefusal => "refused" in c;
/** An undo of several rows answers its calls as a list (contracts ProposalUndo.call). */
const isCalls = (c: ProposalCall | readonly ProposalCall[] | ProposalRefusal): c is readonly ProposalCall[] =>
  Array.isArray(c);

/** The refusals the walk says itself (nothing sent, or what landed before one): Ask says them as words alone. */
const SAID_HERE = new WeakSet<object>();

/** Whether a refusal is the walk's own words, not a door's answer. */
export function saidHere(r: object): boolean {
  return SAID_HERE.has(r);
}

/** A spec's refusal, as the client hands back one of its own: nothing was sent, said in the spec's words. */
export function refusedHere(words: string): ApiRefusal {
  const r: ApiRefusal = { ok: false, ...refusalOf({ code: "client", status: 0, message: words, write: true }) };
  SAID_HERE.add(r);
  return r;
}

/**
 * One of a spec's calls, through the typed client: as one intent where the press names no key, under the press's key
 * where it does, marked as a card's where Ask's Line pressed it; what the tab shows moved the moment the door takes it.
 */
export function sendCall(client: Api, c: ProposalCall, use: VerbUse = {}): Promise<ApiResult<unknown>> {
  // Every key a spec may name is one the client knows: contracts' keys and the client's are one generated list
  // (route-types.test.mjs), and this assignment is the compiler's side of that. What each route takes is the
  // dashboard's (Input<K>), so the options are cast, as a key held in a variable must be.
  const key: RouteKey = c.route;
  const idempotencyKey = c.idempotencyKey ?? use.key;
  const accepted = acceptedFor(c.route, c.params);
  const opts = {
    params: c.params,
    body: c.body,
    ...(idempotencyKey ? { idempotencyKey } : { once: true }),
    ...(c.refresh !== undefined ? { refresh: c.refresh } : use.refresh !== undefined ? { refresh: use.refresh } : {}),
    ...(accepted ? { onAccepted: accepted } : {}),
    ...(use.via ? { via: use.via } : {}),
    ...(use.undoOf ? { undoOf: use.undoOf } : {}),
  };
  return client(key, opts as ApiOptions<typeof key>);
}

/** The window events a call carries, once it has landed. */
export function tellCall(win: Window, c: ProposalCall): void {
  for (const e of c.events ?? [])
    win.dispatchEvent(e.detail ? new CustomEvent(e.type, { detail: e.detail }) : new CustomEvent(e.type));
}

/**
 * An act's requests in order, each under the press's key and its place, stopping at the first refused: one, or, where
 * the act is bigger than its door takes at once (a selection of hundreds, fifty a request), its parts. What went stands;
 * a refusal after a part went says how many went before it (PROPOSAL_WORDS.batchStopped).
 */
async function sendInOrder(
  calls: readonly ProposalCall[],
  client: Api,
  win: Window,
  use: VerbUse,
): Promise<{ ok: true; answers: unknown[] } | ApiRefusal> {
  const answers: unknown[] = [];
  for (const [i, call] of calls.entries()) {
    const key = use.key ? (i === 0 ? use.key : `${use.key}:${i + 1}`) : undefined;
    const r = await sendCall(client, call, { ...use, key });
    if (!r.ok && i > 0) {
      const partly: ApiRefusal = { ...r, message: PROPOSAL_WORDS.batchStopped(i, calls.length, r.message) };
      SAID_HERE.add(partly);
      return partly;
    }
    if (!r.ok) return r;
    if (use.tell !== false) tellCall(win, call);
    answers.push(r.data);
  }
  return { ok: true, answers };
}

/**
 * The second call (a deal's next step), on the first one's answer. The first stands either way, and the receipt says
 * how the second went: refused by its route, or by its spec before anything was sent.
 */
async function sendThen(
  next: ProposalCall | ProposalRefusal | null,
  client: Api,
  win: Window,
  use: VerbUse,
): Promise<ProposalThen | undefined> {
  if (!next) return undefined;
  if (isRefusal(next)) return { ok: false, message: next.refused };
  const n = await sendCall(client, next, { ...use, key: use.key ? `${use.key}:then` : undefined });
  if (n.ok && use.tell !== false) tellCall(win, next);
  return n.ok ? { ok: true } : { ok: false, message: n.message };
}

/** The load of Ask's own cards (contracts ask-only.ts), once: again after one that failed. */
let moreLoad: Promise<void> | null = null;

/** Ask's own cards into the specs (contracts addProposalSpecs), by their own entry: a page's bundle carries none. */
export function moreSpecs(): Promise<void> {
  moreLoad ??= import("@chanlytics/contracts/ask-only").then(
    (m) => addProposalSpecs(m.ASK_ONLY_SPECS),
    (e: unknown) => {
      moreLoad = null;
      throw e;
    },
  );
  return moreLoad;
}

/**
 * A verb's spec, Ask's own cards loaded first where it is none of the pages'; null for a kind no card has. Its spec
 * comes back in a box: a spec has a `then` (a deal's next step), which an awaited value would be taken for.
 */
export async function specOf(kind: string): Promise<{ spec: ProposalSpec | null }> {
  if (!verbSpec(kind)) await moreSpecs().catch(() => undefined);
  return { spec: verbSpec(kind) };
}

/**
 * Walk one act: its spec's calls (refused here, unsent, where its body is not its door's), the window told, the second
 * call where its spec makes one, and the receipt, what its undo keeps and the id it made. Ask's commit hands a card
 * here after its own checks (fresh, its plan's steps).
 */
export async function walkVerb(card: VerbCard, use: VerbUse = {}): Promise<VerbResult> {
  const { spec } = await specOf(card.kind);
  if (!spec) return refusedHere(PROPOSAL_WORDS.cannotApprove);
  const win = use.win ?? window;
  const client = use.client ?? apiFor(win);
  const tab = tabOf(win);
  const made = spec.commit(card, tab);
  if (!isCalls(made) && isRefusal(made)) return refusedHere(made.refused);
  const calls = isCalls(made) ? made : [made];
  if (calls.length === 0) return refusedHere(PROPOSAL_WORDS.cannotApprove);
  const sent = await sendInOrder(calls, client, win, use);
  if (!sent.ok) return sent;
  const { answers } = sent;
  const data = answers.length === 1 ? answers[0] : spec.gather ? spec.gather(answers) : answers[answers.length - 1];
  const then = await sendThen(spec.then?.(card, data) ?? null, client, win, use);
  return {
    ok: true,
    data,
    receipt: spec.receipt(card, data, then),
    undo: spec.undo?.record(card, data, tab) ?? null,
    made: spec.made?.(card, data) ?? null,
  };
}

/**
 * A press of a verb from a page: its payload as the spec reads it, walked through the verb's door. The page hears what
 * landed through the refresh that follows it, so the window is told nothing of its own unless the press asks.
 */
export function commitVerb(kind: VerbKind, payload: Record<string, unknown>, use: VerbUse = {}): Promise<VerbResult> {
  return walkVerb({ id: use.key ?? "", kind, payload, step: use.step ?? null, summary: "" }, { tell: false, ...use });
}

/**
 * Undo what a commit did, from what it kept: the spec's call (or its calls, in order, stopping at the first refused,
 * where what it made is several rows), and the undo's receipt.
 */
export async function undoVerb(
  kind: string,
  record: Record<string, unknown>,
  use: VerbUse = {},
): Promise<UndoDone | ApiRefusal> {
  const undo = (await specOf(kind)).spec?.undo;
  if (!undo) return refusedHere(PROPOSAL_WORDS.noUndo);
  const win = use.win ?? window;
  const client = use.client ?? apiFor(win);
  const undoOf = typeof record.decision_id === "string" && record.decision_id ? record.decision_id : use.undoOf;
  const made = undo.call(record, tabOf(win));
  if (!isCalls(made) && isRefusal(made)) return refusedHere(made.refused);
  const calls = isCalls(made) ? made : [made];
  if (calls.length === 0) return refusedHere(PROPOSAL_WORDS.noUndo);
  let data: unknown = null;
  for (const [i, call] of calls.entries()) {
    const key = use.key ? (i === 0 ? `${use.key}:undo` : `${use.key}:undo:${i + 1}`) : undefined;
    const r = await sendCall(client, call, { ...use, key, undoOf });
    // Its row gone already (an earlier press took it): what it undoes is not there, so it is done; on to the next.
    if (!r.ok && call.goneIsDone && r.status === 404) continue;
    // Refused after some landed: what they did, then the refusal (the spec's words), never the refusal alone.
    if (!r.ok && i > 0 && undo.partial) {
      const partly: ApiRefusal = { ...r, message: undo.partial(record, i, r.message) };
      SAID_HERE.add(partly);
      return partly;
    }
    if (!r.ok) return r;
    if (use.tell !== false) tellCall(win, call);
    data = r.data;
  }
  return { ok: true, data, receipt: undo.receipt(data, record) };
}

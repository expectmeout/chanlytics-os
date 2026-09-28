import "server-only";

/**
 * What a turn keeps of its thread: the thread it continues and the history it is asked with, before the model is asked
 * (threadForTurn, the ask route's), and the turn as the model was sent it (rawTurn), which the turn's end keeps
 * (turn-end.ts finishTurn, runAskTurn's).
 */

import { createHash } from "node:crypto";
import {
  AppError,
  MIN_MS,
  type AskAnswer,
  type AskMessageVM,
  type AskModelId,
  type AskScope,
  type AskTurnShape,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { answerLine, titleFromQuestion, titleFromSearch, type CardOutcome, type SearchAnswering } from "./prompt";
import { createThread, readRaws, readThread } from "./store";
import { replayBlocks, resultBlocks, type CallOutcome, type RoundBlock } from "./round";
import type { Msg, TurnInput } from "./loop";

/**
 * The earlier turns a cold question is asked with: counted as turns -- a person's message and what follows it until the
 * next -- never as messages (the Phase 5 plan, D3), each cut at HISTORY_CHARS, and at most HISTORY_BASE_CHARS in all as
 * sent (D4: some four thousand tokens), the oldest turns going whole past it (rebuiltHistory).
 */
const HISTORY_TURNS = 12;
const HISTORY_CHARS = 1200;
const HISTORY_BASE_CHARS = 16_000;

/** A warm thread (the Phase 5 plan, D1): the previous turn's last round began under 4½ minutes ago, in the cache's five. */
const LIVE_WINDOW_MS = 4.5 * MIN_MS;
/**
 * A replay's bound (D3): its turns, the base's included; its messages, under the edge's sixty with this turn's rounds;
 * and round one's request, in characters as sent. A later round only appends, so round one must leave room under the
 * edge's 700,000 (its body cap, a 413 past it) for the turn's own rounds: the heaviest measured is PR 5.3's caps
 * turn, two rounds of four reads each at its tool's cap, whose rounds are 333,141 characters (ask-turn.test.mjs, "the
 * raw at the caps"). 700,000 - 333,141 = 366,859, less the POST's envelope around the request and a margin: 360,000.
 * Nothing caps a round's parallel calls, so the edge's 700,000 stays the hard stop for any turn, live or cold.
 */
const LIVE_TURNS = 12;
const LIVE_MESSAGES = 48;
const LIVE_REQUEST_CHARS = 360_000;

/**
 * A warm thread's earlier turns as the model was sent them, from the nearest base on (the Phase 5 plan, D1–D3): what
 * this turn replays verbatim when it runs on the same model and prefix (replayFor). Read before the question is saved.
 */
export interface Chain {
  /** The base's words history, then each turn's question, its rounds and its final, oldest first; no marker. */
  messages: Msg[];
  /** Where bpR goes (D10): the replay's last question's last block, where the previous turn's last request ended. */
  anchor: unknown;
  /** The previous turn's unanswered acts' results: the next question opens with them. */
  results: unknown[];
  /** The model and the prefix (prefixOf) the previous turn's last request ran on. */
  model: string;
  prefix: string;
  /** The answer row the replay ends on: the next turn's `after`. */
  after: string;
  /**
   * What happened since (D8): each outcome recorded on the chain's cards that no turn of it told, oldest first -- told
   * by what each live turn kept (`told`), never by the tab's clock, so one recorded while a turn ran is told next.
   */
  since: CardOutcome[];
}

/**
 * An outcome as a live turn keeps what it told: the card, what became of it, and when that was recorded -- `atMs` as
 * the record's identity only, never compared as a clock, so a card approved again after its undo is told again. A
 * record of the same state written twice is told twice, which is harmless.
 */
const toldOf = (o: { id: string; state: string; atMs: number }): string => `${o.id}:${o.state}:${o.atMs}`;
/** What a live turn keeps of the chain it replayed (RawTurn): where it ended, and what the turn told. */
export const chainEnd = (chain: Chain) => ({ after: chain.after, told: chain.since.map(toldOf) });
/**
 * What a rebuilt history's lines already said of the thread's cards (the Phase 5 plan, PR 5.5): every outcome on a card
 * of the rows the turn read, as a live turn keeps what it told. Every row read, not only those the lines kept: a card
 * older than the lines, its outcome recorded before this turn, is no news to a turn after it.
 */
const toldIn = (rows: AskMessageVM[]): string[] =>
  rows.flatMap((r) =>
    r.proposals.flatMap((p) => (p.outcome ? [toldOf({ id: p.id, state: p.outcome.state, atMs: p.outcome.atMs })] : [])),
  );

/**
 * The thread's prior turns, folded so no two neighbours share a role, starting with the person: the last HISTORY_TURNS
 * turns, from the question that starts the first of them, so an answer whose question the read cut off (readThread keeps
 * the newest sixty rows) is left out. The history is words; the question may be blocks (the page's data, then the
 * words): two neighbours of one role are joined as words, or, where either is blocks, as one list of blocks with the
 * words first. A cold turn's history (a live one replays its chain instead: replayFor).
 */
export function foldHistory(history: TurnInput["history"], last: string | unknown[]): Msg[] {
  const questions = questionsOf(history);
  const from = questions[Math.max(0, questions.length - HISTORY_TURNS)] ?? history.length;
  const messages: Msg[] = [
    ...history.slice(from).map((h) => ({ role: h.role, content: h.text.slice(0, HISTORY_CHARS) })),
    { role: "user", content: last },
  ];
  const asBlocks = (c: unknown): unknown[] => (Array.isArray(c) ? c : [{ type: "text", text: String(c) }]);
  for (let i = messages.length - 2; i >= 0; i--) {
    if (messages[i].role === messages[i + 1].role) {
      const [a, b] = [messages[i].content, messages[i + 1].content];
      messages[i] = {
        role: messages[i].role,
        content: typeof a === "string" && typeof b === "string" ? `${a}\n${b}` : [...asBlocks(a), ...asBlocks(b)],
      };
      messages.splice(i + 1, 1);
    }
  }
  return messages;
}

/** Where each turn of a history starts: a person's message, and what follows it until the next. */
const questionsOf = (history: TurnInput["history"]): number[] =>
  history.flatMap((h, i) => (h.role === "user" ? [i] : []));

/**
 * The thread's earlier turns as a cold turn is asked with them (the Phase 5 plan, D4): each question in the person's
 * words as the model has always read them (readThread's `turns`, askTurnText), each answer one line (answerLine: its
 * headline, its cards and what became of them, the rows it named) -- the last HISTORY_TURNS turns from a question, as
 * foldHistory keeps them, at most HISTORY_BASE_CHARS as it sends them: the oldest turns go whole, the newest stays. The
 * turn keeps what it sent as its base (rawTurn), and a live turn after it replays that base as it was sent, so a line
 * is frozen on the turn that made it.
 */
function rebuiltHistory(messages: AskMessageVM[], turns: TurnInput["history"]): TurnInput["history"] {
  const history = messages.map((m, i) =>
    m.role === "assistant" ? { role: "assistant" as const, text: answerLine(m, HISTORY_CHARS) } : turns[i],
  );
  const questions = questionsOf(history);
  const sent = (from: number) => history.slice(from).reduce((n, h) => n + Math.min(h.text.length, HISTORY_CHARS), 0);
  let k = Math.max(0, questions.length - HISTORY_TURNS);
  while (k < questions.length - 1 && sent(questions[k]) > HISTORY_BASE_CHARS) k++;
  return history.slice(questions[k] ?? history.length);
}

/** The question as the route read it, and the search it answers, if any. */
interface Asked {
  tenantId: string;
  threadId: string | null;
  text: string;
  /** The question's scope: a scope, none (`null`, which clears the thread's), or no opinion (undefined: the thread's). */
  scope: AskScope | null | undefined;
  answering: SearchAnswering | null;
}

/**
 * The thread a turn lands in: the caller's own when the question names one, else a new one, titled once. A thread
 * that is not the caller's is a 404, except for an answer to a search's question, which starts one of the caller's
 * own. The scope is the question's, none when it said none, else the thread's (the Phase 5 plan, D9).
 */
export async function threadForTurn(
  ctx: RouteContext,
  asked: Asked,
): Promise<{
  thread: { id: string; title: string; scope: AskScope | null };
  /** The thread's earlier turns as a cold turn is asked with them (rebuiltHistory), oldest first. */
  history: Array<{ role: "user" | "assistant"; text: string }>;
  sinceLastMs: number | null;
  scope: AskScope | null;
  /** The thread's warm turns as the model was sent them, for a live replay (the Phase 5 plan, D1–D3); null, cold. */
  chain: Chain | null;
  /**
   * What the history's lines already said of the thread's cards (toldIn): a cold turn keeps it beside its base, so a
   * live turn after it tells only what is newer (Chain.since). Null with no history.
   */
  told: string[] | null;
}> {
  const { tenantId, threadId, text, answering } = asked;
  let { scope } = asked;
  let history: Array<{ role: "user" | "assistant"; text: string }> = [];
  let sinceLastMs: number | null = null;
  let thread: { id: string; title: string; scope: AskScope | null } | null = null;
  let chain: Chain | null = null;
  let told: string[] | null = null;
  if (threadId) {
    const found = await readThread(ctx, threadId);
    if (found && found.tenantId === tenantId) {
      thread = { id: found.thread.id, title: found.thread.title, scope: found.thread.scope };
      history = rebuiltHistory(found.messages, found.turns);
      told = history.length ? toldIn(found.messages) : null;
      // The thread's previous turn, before this question is appended: how long the person waited to ask again. The
      // read holds the newest rows (readThread), so its last is the previous turn however long the thread is.
      const lastAt = found.messages.at(-1)?.atMs;
      sinceLastMs = lastAt ? Math.max(0, Date.now() - lastAt) : null;
      if (scope === undefined) scope = found.thread.scope;
      chain = await chainFor(ctx, tenantId, found.messages, found.replays);
    } else if (!answering) throw new AppError("not_found", "That thread is not yours.", 404);
  }
  if (!thread) {
    // A thread keeps its first question as its title (the Line's spec, D9); an answer's is the search's name, never
    // the sentence the model is given.
    const title = answering ? titleFromSearch(answering.name) : titleFromQuestion(text);
    const created = await createThread(ctx, tenantId, title, scope ?? null);
    thread = { id: created.id, title: created.title, scope: scope ?? null };
  }
  return { thread, history, sinceLastMs, scope: scope ?? null, chain, told };
}

/**
 * The thread's chain when it is warm (the Phase 5 plan, D1–D3), read cheaply: which answers it follows is decided from
 * the thread's rows first (chainIds) -- no raw is read for a thread gone cold, a previous turn that failed, or a
 * question left last -- and only then their raw turns, by id; then every raw's own word (chainFrom). Any doubt is cold.
 * A read that fails, and a raw that is there but does not read (a data fault, where a turn that kept none is not one),
 * are said once each, with the tenant.
 */
async function chainFor(
  ctx: RouteContext,
  tenant: string,
  rows: AskMessageVM[],
  replays: Array<AskTurnShape["replay"] | null>,
): Promise<Chain | null> {
  const now = Date.now();
  const ids = chainIds(rows, replays, now);
  if (!ids) return null;
  const raws = await readRaws(ctx, ids).catch((e: unknown) => {
    console.error("ask_replay_unread", JSON.stringify({ error: e instanceof Error ? e.message : String(e), tenant }));
    return null;
  });
  if (!raws) return null;
  const kept = ids.map((id) => {
    const raw = raws.get(id);
    const turn = keptOf(raw);
    if (raw != null && !turn) console.error("ask_replay_malformed", JSON.stringify({ tenant, row: id }));
    return turn;
  });
  return chainFrom(kept, ids, now, rows);
}

/**
 * The answers a live replay would follow, newest first, as the thread's rows say (D1, D2): the last row an answer that
 * did not fail, saved under 4½ minutes ago, the row before it its question; then each answer before it while the one
 * after went live, down to the nearest base -- a turn whose history went as words, none, or one stored before this
 * kept the kind -- twelve at most, the base's included (D3). Null, the turn cold, when any of it does not hold.
 */
function chainIds(rows: AskMessageVM[], replays: Array<AskTurnShape["replay"] | null>, now: number): string[] | null {
  const last = rows.at(-1);
  if (!last || last.role !== "assistant" || last.failed || rows.at(-2)?.role !== "user") return null;
  if (now - last.atMs >= LIVE_WINDOW_MS) return null;
  const ids: string[] = [];
  for (let i = rows.length - 1; i >= 0 && ids.length < LIVE_TURNS; i--) {
    if (rows[i].role !== "assistant") continue;
    ids.push(rows[i].id);
    if (replays[i] !== "live") return ids;
  }
  return null;
}

/**
 * A stored raw turn read back as storedRaw keeps it: a live turn's has no base, and names the answer it followed; what
 * it told is null where it kept none (a base from before PR 5.5).
 */
interface Kept {
  at: number;
  model: string;
  prefix: string;
  after: string | null;
  told: string[] | null;
  base: Msg[] | null;
  question: unknown[];
  rounds: Msg[];
  final: unknown[];
  results: unknown[];
}
const isMsg = (m: unknown): m is Msg =>
  !!m && typeof m === "object" && "content" in m && "role" in m && (m.role === "user" || m.role === "assistant");
const messagesOf = (v: unknown): Msg[] | null => (Array.isArray(v) && v.every(isMsg) ? v : null);

/** A raw turn as the row keeps it (storedRaw), read back whole, or null for anything else: a replay takes no doubt. */
function keptOf(v: unknown): Kept | null {
  const raw = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const { at, model, prefix, blocks, after } = raw;
  if (typeof at !== "number" || typeof model !== "string" || typeof prefix !== "string" || typeof blocks !== "string")
    return null;
  const told = raw.told ?? null;
  if (told !== null && (!Array.isArray(told) || !told.every((t) => typeof t === "string"))) return null;
  let b: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(blocks);
    b = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  } catch {
    return null;
  }
  const base = b.base === undefined ? null : messagesOf(b.base);
  const rounds = messagesOf(b.rounds);
  const { question, final, results } = b;
  if ((b.base !== undefined && !base) || !rounds || !Array.isArray(question) || !Array.isArray(final)) return null;
  if (!Array.isArray(results)) return null;
  const link = typeof after === "string" ? after : null;
  return { at, model, prefix, after: link, told, base, question, rounds, final, results };
}

/**
 * The chain as the model was sent it (D1–D3), from the raws of `ids`, newest first, as read: each one whole, the newest
 * begun under 4½ minutes ago, each live one naming the answer before it (`after`: two tabs interleaving, or a row
 * scrubbed mid-chain, break it), the oldest a base, which keeps the words history it was asked with. Put back together
 * oldest first -- the base's history, then each turn's question, rounds and final -- with every marker a request carried
 * taken off, and held to LIVE_MESSAGES. What happened since is read off the cards on `rows`: every row's when the base
 * is a rebuild that kept what its lines said of them (`told`, PR 5.5), else the chain's own -- a words base from before
 * kept nothing, and every old outcome would be news.
 */
function chainFrom(kept: Array<Kept | null>, ids: string[], now: number, rows: AskMessageVM[]): Chain | null {
  const turns = kept.filter((k): k is Kept => !!k);
  const [newest] = turns;
  const oldest = turns.at(-1);
  const base = oldest?.base;
  if (turns.length !== ids.length || !newest || !base || now - newest.at >= LIVE_WINDOW_MS) return null;
  if (turns.slice(0, -1).some((t, i) => t.base || t.after !== ids[i + 1])) return null;
  const sent = [...base];
  for (const t of [...turns].reverse())
    sent.push({ role: "user", content: t.question }, ...t.rounds, { role: "assistant", content: t.final });
  if (sent.length > LIVE_MESSAGES) return null;
  const messages = sent.map(unmarked);
  const asked = [...messages].reverse().find((m) => m.role === "user")?.content;
  const anchor = Array.isArray(asked) ? asked.at(-1) : undefined;
  const told = new Set(turns.flatMap((t) => t.told ?? []));
  const own = [...ids].reverse().flatMap((id) => rows.filter((r) => r.id === id));
  const cards = (oldest?.told ? rows : own).flatMap((r) => r.proposals);
  const since = cards
    .flatMap(({ id, title, outcome }) =>
      outcome ? [{ id, title, state: outcome.state, receipt: outcome.receipt, atMs: outcome.atMs }] : [],
    )
    .filter((o) => !told.has(toldOf(o)));
  const { results, model, prefix } = newest;
  return { messages, anchor, results, model, prefix, after: ids[0], since };
}

/**
 * This turn's opening when it goes on live (the Phase 5 plan, D1–D3): the chain's replay, then one new question that
 * opens with the previous turn's unanswered results (a tool_result must open the message after its tool_use) and goes
 * on as a cold turn's does, the anchor bpR. Live only when round one's request -- `round1`, over these messages marked
 * at the anchor -- names the chain's model, hashes to its prefix and stays within LIVE_REQUEST_CHARS; else null: cold.
 */
export function replayFor<W>(
  chain: Chain | null | undefined,
  asked: { data: unknown[]; words: W; question: unknown },
  round1: (messages: Msg[], anchor: unknown) => LastRound["request"],
): { messages: Msg[]; anchor: unknown; words: W } | null {
  if (!chain) return null;
  const { data, words, question } = asked;
  const messages: Msg[] = [...chain.messages, { role: "user", content: [...chain.results, ...data, words, question] }];
  const request = round1(messages, chain.anchor);
  const fits = JSON.stringify(request).length <= LIVE_REQUEST_CHARS;
  return request.model === chain.model && prefixOf(request) === chain.prefix && fits
    ? { messages, anchor: chain.anchor, words }
    : null;
}

/** The round a turn ended on: the request as it went out, what the model wrote, what its calls answered, when it began. */
interface LastRound {
  request: {
    model: AskModelId;
    system: unknown[];
    messages: Msg[];
    tools: unknown[];
    tool_choice: unknown;
    output_config: unknown;
  };
  blocks: RoundBlock[];
  outcomes: CallOutcome[];
  /** Epoch ms, as the request went out. */
  roundAt: number;
  /** The stream broke after it began: the blocks are what came before the break, perhaps not all the model wrote. */
  streamError: string | null;
}

/** How a turn ended, as each of runAskTurn's ends says it. */
export interface TurnEnd {
  answer: AskAnswer;
  failed: boolean;
  failure: string | null;
  rounds: number;
  ungrounded?: boolean;
  /** The round an answer or its cards ended the turn on; a turn that failed has none. */
  lastRound?: LastRound;
}

/**
 * A turn as the model was sent it (the Phase 5 plan, D2 and D11), for a later turn to replay verbatim: the answer's row
 * keeps it at content.raw (storedRaw), the Line's reads never select it (store.ts, readThread), and the browser never
 * gets it. It is the last request's own messages and bytes, never derived again. A turn that failed keeps none, nor
 * one whose last stream broke: what came before the break is the answer, never a turn to replay.
 */
export interface RawTurn {
  /**
   * Every message before the question in the last request: the thread's earlier turns as the turn was asked with them
   * (foldHistory), none on a thread's first. The thinking blocks that follow are bound to exactly these. A live turn
   * keeps none: its history is the chain it replayed, whose base is the chain's first turn's, and `after` names its end.
   */
  base?: Msg[];
  /**
   * The person's message as the last request carried it: the page's data, the reads made before the model was asked,
   * the turn's words and the question -- without the page's data when a refusal dropped it, and after a question the
   * thread left unanswered, when the fold joined one in (foldHistory).
   */
  question: unknown;
  /** Every message after the question in the last request, in order: each earlier round, and what was sent back. */
  rounds: Msg[];
  /** The last round as a request would carry it back (replayBlocks): its thinking and signatures, its text, its calls. */
  final: unknown[];
  /** What the last round's calls answered, as the next request would carry it: its cards', alone or beside an answer. */
  results: unknown[];
  /** When the last round began, epoch ms: the cache's five minutes run from a request's start, not from the saved row. */
  at: number;
  /** The model the requests named. */
  model: AskModelId;
  /** What the last request sent besides its messages, hashed (prefixOf): a replay on another is cold. */
  prefix: string;
  /** A live turn's: the answer row whose turn it replayed last (Chain.after), the link the next replay follows. */
  after?: string;
  /**
   * What the turn told of the thread's cards (`<card id>:<state>:<atMs>`), which no later turn of its chain tells again:
   * a live turn's, the outcomes it said happened since (Chain.since); a rebuilt turn's, every outcome its history's
   * lines said (threadForTurn's `told`). A thread's first turn keeps none.
   */
  told?: string[];
}

/**
 * The sha256, in hex, of what a request sends besides its messages that a live replay needs unchanged: system and
 * tools as they were sent, the tool choice, and the output config -- the effort and the answer's format. A setting, a
 * note, the hours, an autonomy mode, the workspace's shape, the role, a refusal of the examples or the format, another
 * effort or format, or a last round that could call no tool gives another: any of them makes a replay miss the cache
 * and write it all again, where a cold turn's words cost less.
 */
function prefixOf(request: LastRound["request"]): string {
  const { system, tools, tool_choice, output_config } = request;
  return createHash("sha256").update(JSON.stringify({ system, tools, tool_choice, output_config })).digest("hex");
}

/** A block that carries the cache's marker (D10); anything that is no block is left as it is. */
const marked = (b: unknown): unknown =>
  b && typeof b === "object" ? { ...b, cache_control: { type: "ephemeral" } } : b;

/**
 * The messages as one request carries them (the Phase 5 plan, D10): a copy, with the cache's markers on copies of the
 * blocks they mark -- the turn's own messages never carry one, so the turn as it keeps itself (RawTurn) carries none.
 * Two here, beside system's two: `anchor`, the block where what an earlier request wrote to the cache ends (the page's
 * last block on a cold turn, bp3), and the request's last block, which moves with each round (bp4), so each request
 * writes only what it appended. An anchor the request no longer carries marks nothing.
 */
export function withMarkers(messages: Msg[], anchor: unknown): Msg[] {
  const last = messages.length - 1;
  return messages.map((m, i) => {
    if (!Array.isArray(m.content)) return m;
    const blocks: unknown[] = m.content;
    const at = anchor === undefined ? -1 : blocks.indexOf(anchor);
    if (at < 0 && i !== last) return m;
    return {
      ...m,
      content: blocks.map((b, j) => (j === at || (i === last && j === blocks.length - 1) ? marked(b) : b)),
    };
  });
}

/** A block less the cache's marker a request carried on it, its other keys in their order. */
function unmarkedBlock(b: unknown): unknown {
  if (!b || typeof b !== "object" || !("cache_control" in b)) return b;
  const { cache_control: _marker, ...rest } = b;
  return rest;
}
/** A message less the cache's markers a request carried on it (D10): the turn as it was sent, whoever marked it. */
const unmarked = (m: Msg): Msg => (Array.isArray(m.content) ? { ...m, content: m.content.map(unmarkedBlock) } : m);

/**
 * The turn as it was sent, from the round it ended on and where the question sits in that round's request, and what it
 * keeps beside: a live turn's link and what it told (`after`, chainEnd), which keeps no base; a rebuilt turn's `told`.
 */
export function rawTurn(
  { request, blocks, outcomes, roundAt }: LastRound,
  questionAt: number,
  kept: { after?: string; told?: string[] },
): RawTurn {
  const { model } = request;
  const messages = request.messages.map(unmarked);
  return {
    ...(kept.after ? {} : { base: messages.slice(0, questionAt) }),
    question: messages[questionAt].content,
    rounds: messages.slice(questionAt + 1),
    final: replayBlocks(blocks),
    results: resultBlocks(outcomes),
    at: roundAt,
    model,
    prefix: prefixOf(request),
    ...kept,
  };
}

/**
 * The raw turn as the answer's row keeps it, at content.raw: its messages and blocks as ONE JSON string, beside its
 * scalars. jsonb does not keep an object's keys in their order -- it writes them back shortest first, then by their
 * bytes -- so a turn kept as objects would come back reordered (a call's input `{action, words}` as `{words, action}`),
 * and a replay must be the bytes that were sent: the cache is a prefix match, and a thinking block is bound to the
 * conversation as it was sent. A string comes back as it went, and JSON.parse keeps its keys' order.
 */
export function storedRaw(
  raw: RawTurn | null,
): { at: number; model: AskModelId; prefix: string; blocks: string; after?: string; told?: string[] } | null {
  if (!raw) return null;
  const { base, question, rounds, final, results, at, model, prefix, after, told } = raw;
  const blocks = JSON.stringify(
    base ? { base, question, rounds, final, results } : { question, rounds, final, results },
  );
  return { at, model, prefix, blocks, ...(after ? { after } : {}), ...(told ? { told } : {}) };
}

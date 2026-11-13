import "server-only";
import {
  answerStyleOf,
  AppError,
  MIN_MS,
  SECOND_MS,
  answerText,
  detectLanguage,
  fileSaidOf,
  nextNotAsked,
  policyClassOffered,
  replacedOutcome,
  searchCardsReplaced,
  stoppedAnswer,
  v1FromAnswer,
  withIdeaCarried,
  type AskColumn,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type AskScope,
  type PageContext,
} from "@chanlytics/contracts";
import { filesLineOf } from "@/server/files/line";
import type { RouteContext } from "../shared/with-route";
import type { Member } from "../shared/route";
import { log } from "@/server/shared/log";
import { load, readerContext, type ReaderContext } from "../shared/reader";
import * as readers from "../readers/facts";
import { filesTallied } from "../readers/files";
import { memberViews } from "../readers/notifications";
import { getAttached, noWordsIn, type AttachedFile } from "../files/attached";
import { runAskTurn } from "./loop/loop";
import type { TurnEvent, TurnInput, TurnResult } from "./loop/turn-head";
import { storedRaw, findThreadForTurn, toldWithArrived } from "./memory";
import { askTurnText, type SearchAnswering } from "./prompt/prompt";
import { workspaceFacts, type WorkspaceFacts } from "./prompt/stable-system";
import { appendMessage, setProposalOutcome, touchThread } from "./store";
import { keepRememberCards } from "./companion/remembered";
import { runAlone } from "./act/world";
import { logAndGoOn } from "@chanlytics/log";
import type { TenantId } from "@chanlytics/contracts";

/**
 * One turn of the assistant, kept in one place for its two doors: POST /api/v1/ask (the typed Line) and the voice
 * door ElevenLabs calls (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.4). Moved verbatim from the
 * route, in two halves, because the route refuses a thread that cannot be kept BEFORE its stream opens (a thrown
 * AppError is a JSON refusal there) and only then streams the turn: `prepareAskTurn` is the first half (the thread
 * kept, the question saved, the workspace's facts read), `finishAskTurn` the second (the turn run and stored, the
 * answer as the Line draws it). `askTurn` runs both for a caller with no stream of its own to open first.
 */

/** What a turn is asked with: the route's body as it reads it, or the voice door's transcript. */
interface AskTurnAsk {
  text: string;
  threadId: string | null;
  /** This turn's scope: one, `null` to clear the thread's, `undefined` to keep it (the Phase 5 plan, D9). */
  scope: AskScope | null | undefined;
  surface: string | null;
  context: PageContext | null;
  openedMs: number | null;
  answering: SearchAnswering | null;
  /** A question that comes from a follow-up of the member's that came due (D33 of the answers canvas). */
  following?: boolean;
  /** The request, whose session a press from the server goes under (D10, D18). Absent, nothing runs from here. */
  request?: Request;
  /** The person is listening, not reading (the spoken register, spec §3.4). */
  spoken?: boolean;
  /** The column the Line draws the answer in, as the tab measured it (contracts AskColumn); none from an older tab. */
  column?: AskColumn | null;
  /**
   * The language to answer in, where the words are not the member's own (the morning's fixed question, decision 0070:
   * the page's language); otherwise the question's own (detectLanguage).
   */
  language?: AskLanguage;
  /** What the mornings offered lately (decision 0087, contracts latelySaid): a morning's alone, said in the turn's words. */
  lately?: string;
  /** The ids of the files the question came with: the Line's. One that is not there for the person is left out. */
  files?: readonly string[];
}

/** A line the turn's door sends: the thread first, then the turn's own events. */
export type AskTurnLine = TurnEvent | { t: "thread"; id: string; title: string };

interface AskTurnDone {
  thread: { id: string; title: string };
  result: TurnResult;
  /** The answer as the Line draws it, beside the v1 fields it gives (spec 5.8). */
  message: AskMessageVM;
}

/** The first half's yield: everything the turn is run with, once the thread is kept and the facts are read. */
interface PreparedTurn {
  ctx: RouteContext;
  member: Member;
  tenantId: TenantId;
  ask: AskTurnAsk;
  thread: { id: string; title: string; scope: AskScope | null };
  scope: AskScope | null;
  attached: AttachedFile[];
  earlier: Pick<TurnInput, "history" | "sinceLastMs" | "chain" | "told" | "cited" | "waiting">;
  /** The thread's turns' cards before this one (memory.ts findThreadForTurn): what a new search card sets aside. */
  cards: Array<Pick<AskMessageVM, "id" | "proposals">>;
  /** The thread's questions and the next questions it offered, this question among them (nextNotAsked). */
  offered: string[];
  rc: ReaderContext;
  facts: WorkspaceFacts;
  timezone: string;
  language: AskLanguage;
  personLabel: string;
  /** When the request began (epoch ms): what is acted on alone after the answer is saved must end inside its limit. */
  begunAt: number;
}

/**
 * How long the request a turn runs in may take: the Ask route's and the morning's own `maxDuration` (150 s, the turn's two
 * minutes and the time to store its answer). Past it the platform ends the request, whatever is still running.
 */
const ASK_ROUTE_MS = 150 * SECOND_MS;

/**
 * The workspace's facts as a turn's stable block says them, and its zone: read once here for a turn and for its warm
 * (warm.ts), so the two write the same block. Kept across turns by the reader's own cache (five minutes).
 */
export async function getTurnFacts(rc: ReaderContext): Promise<{ facts: WorkspaceFacts; timezone: string }> {
  const [{ name, timezone }, cfg, policies, library] = await Promise.all([
    load(rc, readers.facts, undefined).then((r) => r.data),
    load(rc, readers.config, undefined).then((r) => r.data),
    // The autonomy modes ride in the stable block, so "what can the receptionist do alone" needs no read.
    load(rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
    // What the business's files are, in a line. A read that fails says nothing, and the files read still answers.
    load(rc, filesTallied, undefined).then(
      (r) => r.data.files,
      () => null,
    ),
  ]);
  // The rows the pane draws (contracts policyClassOffered).
  const offered = policies.filter((p) => policyClassOffered(p.class));
  // At the turn's clock (rc.now), so the notes Ask is told are the ones the receptionist is told today.
  const facts = workspaceFacts(name, timezone, cfg?.config ?? null, rc.now, offered);
  return { facts: { ...facts, filesLine: library ? filesLineOf(library, timezone) : null }, timezone };
}

/** How long a question waits for the thread's last question to be answered, and how often it looks again. */
const TURN_WAIT_MS = 3_000;
const TURN_WAIT_STEP_MS = 250;

/**
 * Whether the thread's last row is a question still being answered: asked within the route's minute (a turn's own
 * ceiling) with no answer after it. An older one never had an answer coming.
 */
const stillAnswering = (kept: { history: Array<{ role: string }>; sinceLastMs: number | null }): boolean =>
  kept.history.at(-1)?.role === "user" && kept.sinceLastMs !== null && kept.sinceLastMs < MIN_MS;

const BUSY_WORDS = {
  en: "Ask is still answering your last question here. Ask again in a moment.",
  es: "Ask todavía está respondiendo tu última pregunta aquí. Pregunta de nuevo en un momento.",
};

/** The files a question names that are there for the person, in the order they were attached. */
async function filesAsked(ctx: RouteContext, tenantId: TenantId, ids: readonly string[]): Promise<AttachedFile[]> {
  if (ids.length === 0) return [];
  const found = await getAttached(ctx, tenantId, ids);
  return ids.flatMap((id) => found.get(id) ?? []);
}

export async function prepareAskTurn(ctx: RouteContext, member: Member, ask: AskTurnAsk): Promise<PreparedTurn> {
  const begunAt = Date.now();
  const { text, threadId, answering } = ask;
  const tenantId = member.tenantId;

  // What it came with, as those files are now, before anything is kept: a question of no words needs one that is there.
  const attached = await filesAsked(ctx, tenantId, ask.files ?? []);
  if (!text && attached.length === 0) throw new AppError("validation", "Ask something.");

  // The thread, before anything else: a question that could not be saved is
  // not answered, so a person never sees an answer they cannot find again. One of no words is titled by what it came with.
  const fields = {
    tenantId,
    threadId,
    text: text || fileSaidOf(attached[0]?.name ?? ""),
    scope: ask.scope,
    answering,
  };
  let kept = await findThreadForTurn(ctx, fields);
  // A question asked while the thread's last one is still being answered (another tab, or a question sent the moment
  // after a Stop, before the stopped turn is saved) waits for that answer, so the thread is stored question, answer,
  // question, answer, and this turn's history holds it. Still unanswered, it is refused in our words and nothing is
  // saved. A spoken turn is the voice door's to order.
  for (let waited = 0; !ask.spoken && stillAnswering(kept); waited += TURN_WAIT_STEP_MS) {
    if (waited >= TURN_WAIT_MS)
      throw new AppError("conflict", BUSY_WORDS[detectLanguage(text) === "es" ? "es" : "en"], 409);
    await new Promise((resolve) => setTimeout(resolve, TURN_WAIT_STEP_MS));
    kept = await findThreadForTurn(ctx, fields);
  }
  // The thread's earlier turns: their lines, what they told and cited, the time since, and the chain while warm.
  const { thread, scope, offered, cards, ...earlier } = kept;
  await appendMessage(ctx, thread.id, tenantId, "user", {
    text,
    ...(attached.length ? { files: attached.map((f) => f.id) } : {}),
    ...(answering ? { answering } : {}),
  });

  // A turn keeps what may be kept across turns (the workspace's name and zone, five minutes): the next question of
  // the same person does not read them again. The GET routes keep nothing.
  const rc = readerContext(ctx, member, undefined, { keep: true });
  const { facts, timezone } = await getTurnFacts(rc);
  const language = ask.language ?? detectLanguage(text);
  const personLabel = ctx.email ? `${ctx.email} (${member.role})` : member.role;
  return {
    ctx,
    member,
    tenantId,
    ask,
    thread,
    scope,
    attached,
    earlier,
    cards,
    offered: text ? [...offered, text] : offered,
    rc,
    facts,
    timezone,
    language,
    personLabel,
    begunAt,
  };
}

/**
 * What the rows let run with no press (D10 of the answers canvas), off until an owner turns it on: the saved turn's cards, each
 * started only with time to end inside the request's own limit. Outside a request (the morning's own turn), none.
 */
const runCardsAlone = (turn: PreparedTurn, savedId: string, proposals: AskProposal[]): Promise<AskProposal[]> =>
  turn.ask.request
    ? runAlone(
        turn.ctx,
        turn.ask.request,
        turn.member,
        savedId,
        proposals,
        new Date(),
        turn.begunAt + ASK_ROUTE_MS,
      ).catch(logAndGoOn("run alone", proposals))
    : Promise.resolve(proposals);

/**
 * A turn the person stopped (the route's `stop`), however far it got: kept as stopped, with what its Say had written as
 * the person read it (contracts stoppedAnswer), and none of what it made after (its cards, the turn as the model was
 * sent it), so the thread opened again shows what they saw and the next question's history says it was stopped.
 */
function stoppedTurn(
  result: TurnResult,
  spoken: { headline: string; detail: string } | null,
  language: AskLanguage,
): TurnResult {
  const answer = stoppedAnswer(spoken, language);
  return {
    ...result,
    answer,
    text: answerText(answer),
    ungrounded: false,
    proposals: [],
    failed: true,
    failure: "stopped",
    shape: { ...result.shape, failed: true },
    raw: null,
  };
}

/** The thread's waiting search cards a new one replaced (contracts searchCardsReplaced), kept as set aside; a failure is logged. */
async function setAsideReplaced(
  ctx: RouteContext,
  cards: Array<Pick<AskMessageVM, "id" | "proposals">>,
  created: AskProposal[],
  tenantId: TenantId,
): Promise<void> {
  const at = Date.now();
  for (const r of searchCardsReplaced(cards, created)) {
    try {
      await setProposalOutcome(ctx, r.messageId, r.proposalId, replacedOutcome(at));
    } catch (e) {
      log.error("ask_save_failed", { error: e, tenant_id: tenantId });
    }
  }
}

/** The answer as its row keeps it: what the Line draws again and the history reads, and the turn as the model was sent it. */
function answerRowOf(result: TurnResult, v1: ReturnType<typeof v1FromAnswer>, proposals: AskProposal[]) {
  return {
    v: 2,
    answer: result.answer,
    ...v1,
    proposals,
    language: result.answer.language,
    ungrounded: result.ungrounded,
    tools: result.tools,
    ...(result.opened.length ? { opened: result.opened } : {}),
    latency_ms: result.latencyMs,
    failed: result.failed,
    ...(result.failure ? { failure: result.failure.slice(0, 200) } : {}),
    model: result.model,
    rounds: result.rounds,
    shape: result.shape,
    raw: storedRaw(toldWithArrived(result.raw, proposals)),
  };
}

export async function finishAskTurn(
  preparedTurn: PreparedTurn,
  emit: (ev: AskTurnLine) => void,
  stop?: AbortSignal,
): Promise<AskTurnDone> {
  const {
    ctx,
    member,
    tenantId,
    ask,
    thread: turn,
    scope,
    earlier,
    cards,
    offered,
    rc,
    facts,
    timezone,
    language,
    personLabel,
  } = preparedTurn;
  const { text, surface, context, openedMs, answering, following } = ask;
  // Cards of earlier turns this one pressed on a yes (D18 of the answers canvas).
  const pressed: NonNullable<AskMessageVM["pressed"]> extends ReadonlyArray<infer R> ? R[] : never = [];
  emit({ t: "thread", id: turn.id, title: turn.title });
  const t0 = Date.now();
  // The Say as the person last read it: an empty one took the answer back (loop.ts unsay).
  let spoken: { headline: string; detail: string } | null = null;
  // How they like answers, their own note (the answer canvas, D): a read that fails costs the note, never the turn.
  const style = await load(rc, memberViews, undefined)
    .then((r) => answerStyleOf(r.data))
    .catch(() => "");
  const ran = await runAskTurn({
    ctx,
    tenantId,
    role: member.role,
    facts,
    timezone,
    personLabel,
    language,
    scope,
    surface,
    ...earlier,
    text: askTurnText(text, answering) || noWordsIn(language),
    ...(following ? { following } : {}),
    ...(ask.request
      ? { request: ask.request, member, waitingOn: waitingOnThread(cards), onPressed: (r) => pressed.push(r) }
      : {}),
    attached: preparedTurn.attached,
    openedMs,
    context,
    spoken: ask.spoken ?? false,
    column: ask.column ?? null,
    style,
    lately: ask.lately ?? "",
    emit: (ev) => {
      if (ev.t === "say")
        spoken = ev.headline || ev.detail ? { headline: ev.headline ?? "", detail: ev.detail ?? "" } : null;
      emit(ev);
    },
    // One clock for the turn: the tools' today is the readers' today.
    now: rc.now,
    rc,
    signal: stop,
  });
  // Stopped, even past its last round: what the person saw is what the thread keeps.
  const ended = stop?.aborted ? stoppedTurn(ran, spoken, language) : ran;
  // A next question the thread already asked or offered goes (the answer canvas, item 15): the chips offer what is new.
  const next = nextNotAsked(ended.answer.do.next, offered);
  const result = { ...ended, answer: { ...ended.answer, do: { ...ended.answer.do, next } } };
  // The answer as the Line draws it, beside the v1 fields it gives (spec 5.8): the history, copy and search
  // read `text`, and the erase hook finds a person by the ids the sources carry.
  const v1 = v1FromAnswer(result.answer);
  // A new search's card carries the thread it was planned in, so the search keeps it (00172) and the answer
  // to its question lands back here. An answer's card needs none: its search already has one or never will.
  // A line Ask remembers is kept as the turn is saved, as the member it answers (decision 0070): its card arrives kept,
  // with its Undo.
  const proposals: AskProposal[] = await keepRememberCards(
    ctx,
    tenantId,
    turn.id,
    // A card that replaces an idea's keeps the idea's mark (contracts withIdeaCarried).
    withIdeaCarried(cards, result.proposals).map((p) =>
      (p.kind === "lead_search" || p.kind === "people_search") && !p.payload.amends
        ? { ...p, payload: { ...p.payload, thread_id: turn.id } }
        : p,
    ),
  );
  let saved: { id: string; created_at: string } | null = null;
  try {
    saved = await appendMessage(ctx, turn.id, tenantId, "assistant", answerRowOf(result, v1, proposals));
    // A thread keeps its first question as its title; an answer moves it up the list, and it keeps the scope
    // this turn ran with (the Phase 5 plan, D9), so the next question sent with none is asked about the same.
    await touchThread(ctx, turn.id, scope);
  } catch (e) {
    log.error("ask_save_failed", { error: e });
  }
  // A new search card sets aside the one still waiting above it (a change said to Ask): one search card in a thread
  // can be pressed, the newest. The Line sets the same cards aside as the answer lands (contracts withAnswerLanded).
  if (saved) await setAsideReplaced(ctx, cards, proposals, tenantId);
  const acted = saved ? await runCardsAlone(preparedTurn, saved.id, proposals) : proposals;
  const message: AskMessageVM = {
    id: saved?.id ?? `unsaved-${Date.now()}`,
    role: "assistant",
    text: v1.text,
    at: saved?.created_at ?? new Date().toISOString(),
    atMs: saved ? Date.parse(saved.created_at) : Date.now(),
    citations: v1.citations,
    followups: v1.followups,
    navigate: v1.navigate,
    proposals: acted,
    ...(pressed.length ? { pressed } : {}),
    language: result.answer.language,
    ungrounded: result.ungrounded,
    tools: result.tools,
    latencyMs: result.latencyMs,
    rounds: result.rounds,
    failed: result.failed,
    answer: result.answer,
  };
  log.info("ask_turn", {
    tenant_id: tenantId,
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
    speed: result.shape.speed,
    cache_hit: result.shape.cache_hit,
    follow_up: result.shape.follow_up,
    opened_ms: openedMs,
  });
  emit({ t: "final", message });
  return { thread: { id: turn.id, title: turn.title }, result, message };
}

/** The cards waiting on this thread, by id, each with the turn it is on and the cards of that turn: what a yes may press. */
function waitingOnThread(cards: ReadonlyArray<Pick<AskMessageVM, "id" | "proposals">>) {
  return new Map(
    cards.flatMap((m) =>
      (m.proposals ?? [])
        .filter((p) => !p.outcome)
        .map((p): [string, { card: AskProposal; messageId: string; cards: readonly AskProposal[] }] => [
          p.id,
          { card: p, messageId: m.id, cards: m.proposals ?? [] },
        ]),
    ),
  );
}

/** Both halves in a row, for a door with no stream to open between them (the voice door). */
export async function askTurn(
  ctx: RouteContext,
  member: Member,
  ask: AskTurnAsk,
  emit: (ev: AskTurnLine) => void,
): Promise<AskTurnDone> {
  return finishAskTurn(await prepareAskTurn(ctx, member, ask), emit);
}

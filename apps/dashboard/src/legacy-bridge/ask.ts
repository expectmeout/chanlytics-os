/**
 * Ask, wired to the workspace: window.__ask.
 *
 * Six small modules, composed here: what the palette shows before a model
 * is asked (ask/palette.ts), the Ask routes and the streamed turn
 * (ask/api.ts), a card's commit and undo through the verbs' own routes
 * (ask/commit.ts), reading aloud in Ask's voice (ask/speech.ts: the brief, an
 * answer's say, through the speech route), a held question's answer read
 * aloud with the one line said while Ask works (ask/aloud.ts), and the voice
 * agent's session with its spoken turn (ask/voice.ts, ask/spoken.ts), which
 * no hold asks for since 5 Oct 2026, and the follow-ups that came due
 * (ask/follow-ups.ts). The mockup's palette
 * reaches all of it through this one object and nothing else, so what a
 * palette may do is the list below.
 */
import {
  answerBlocks,
  answerCopy,
  answerRuns,
  answerSpoken,
  answerText,
  cardsInPlans,
  planGroupOf,
  type AskAnswer,
  type AskProposal,
  type AskProposalOutcome,
  type PageContext,
  ASK_VOICE_TOKEN_MIN_MS,
} from "@chanlytics/contracts";
import { askApi, type AskApiCalls, type SendEvent } from "./ask/api";
import { apiFor } from "./api";
import { browserClient } from "../lib/supabase/browser-client";
import { aheadWhenIdle, hearAddress, routeOnScreen } from "./workspace";
import {
  commitCard,
  commitPlan,
  editReply,
  undoProposal,
  type CommitResult,
  type PlanRun,
  type UndoResult,
} from "./ask/commit";
import { askPalette, quickAnswer } from "./ask/palette";
import { moreSpecs, pageSpecs, type PageSpecs } from "./verbs/commit";
import { askSpeech, type SpeechPurpose } from "./ask/speech";
import { askAloud } from "./ask/aloud";
import { installVoice } from "./ask/voice";
import { spokenTurns } from "./ask/spoken";
import { pageContext, type ThreadMessage } from "./ask/context";
import { askFollowUps } from "./ask/follow-ups";
import { askColumn } from "./ask/column";

export type { SendEvent, CommitResult };
export { jumpIndexFrom, surfaceFor, waitingFrom, quickAnswer } from "./ask/palette";
export { readLines } from "./ask/api";

export type AskApi = ReturnType<typeof askPalette> &
  AskApiCalls &
  ReturnType<typeof askSpeech> &
  ReturnType<typeof askAloud> &
  ReturnType<typeof installVoice> &
  ReturnType<typeof spokenTurns> &
  ReturnType<typeof askFollowUps> & {
    /**
     * Approve a card: the verb's own route, then the surfaces refresh. A plan's card is judged by what the turn's other
     * cards of its plan became (`cards`, as the Line holds them: commit.ts commitCard), so a send fills its tokens.
     */
    commit(p: AskProposal, cards?: readonly AskProposal[]): Promise<CommitResult>;
    /** Approve a plan's steps that send nothing together (commit.ts commitPlan), what each became read from its cards. */
    commitPlan(cards: readonly AskProposal[]): Promise<PlanRun>;
    /** A turn's cards with each plan's together, and a plan's group as the Line draws it: contracts'. */
    cardsInPlans: typeof cardsInPlans;
    planGroupOf: typeof planGroupOf;
    /** Undo a committed card, where the verb has one. */
    undo(p: AskProposal, outcome: AskProposalOutcome): Promise<UndoResult>;
    /** "Edit in the composer": open the thread with the words ready to change. */
    editReply(p: AskProposal): void;
    /** Whether a committed card's undo is still true to offer: contracts' askUndoOpen; false before the specs are in. */
    undoOpen: PageSpecs["askUndoOpen"];
    /** A quick question's answer, without a model: Today's queue, today's calls or the openings route; null for the rest. */
    quick(question: string): Promise<AskAnswer> | null;
    /** An answer's words, for a folded turn: its list a line an entry, each with its mark. */
    answerText: typeof answerText;
    /** An answer's words as the Line draws them: paragraphs, headings, nested lists and tables, never markup. */
    answerBlocks: typeof answerBlocks;
    /** One line of an answer's words as runs: bold, italic or plain (a list's entry). */
    answerRuns: typeof answerRuns;
    /** An answer as Copy takes it: its words, then its parts, figures and rows, a line each. */
    answerCopy: typeof answerCopy;
    /** An answer's words as Read aloud and a spoken question's answer say them: its list an entry a sentence. */
    answerSpoken: typeof answerSpoken;
    /** Where a card's Open goes, or null (contracts' cardOpenRoute; null before the specs are in). */
    cardOpenRoute: PageSpecs["cardOpenRoute"];
    /**
     * The page, as Ask is sent it: the rows on screen and the row open or named (ask/context.ts) -- asked in an open
     * thread (its messages as the Line holds them), a row by its place is the last answer's item first.
     */
    context(
      route: { page: string; param: string | null },
      words?: string,
      thread?: ReadonlyArray<ThreadMessage> | null,
    ): PageContext;
  };

/**
 * The member's session made fresh before a voice conversation: the brain door opens the member with the access token
 * the voice route seals, for as long as the session runs (ten minutes at most), so a token with less life
 * than that is refreshed first, by the browser's own client with its own refresh token (never the server's: a refresh
 * there would race the browser's and sign the member out).
 */
async function freshSession(): Promise<void> {
  const client = await browserClient();
  const { data } = await client.auth.getSession();
  const exp = data.session?.expires_at;
  if (typeof exp === "number" && exp * 1000 - Date.now() < ASK_VOICE_TOKEN_MIN_MS) await client.auth.refreshSession();
}

/**
 * One voice at a time, held where the clip and the agent's session are composed. A clip takes the agent's place only
 * while the agent has the floor (an answer on its way, or being spoken): a session up and quiet, or still connecting,
 * is in no clip's way and is left for the next hold, so the clip that reads a typed-way answer does not end the session
 * the press asked for. The clip starts inside the press, the hang-up beside it and never before it: a phone plays
 * audio only from a gesture, and the hang-up is a round trip. A session asked for ends the clip, and is a question on
 * its way: the model's cache is warmed (`warm`, ask/api.ts warmModel), so the words spoken a few seconds later find it
 * written. No hold asks for a session since 5 Oct 2026: the Line's press stops the clip and warms the cache itself.
 */
export function oneVoice(
  clip: ReturnType<typeof askSpeech>,
  conversation: ReturnType<typeof installVoice>,
  warm: () => void = () => {},
) {
  return {
    speech: {
      ...clip,
      speak: (text: string, purpose: SpeechPurpose): Promise<void> => {
        if (conversation.voiceBusy()) void conversation.stopVoice("superseded");
        return clip.speak(text, purpose);
      },
    },
    voice: {
      ...conversation,
      ensureVoice: (...args: Parameters<typeof conversation.ensureVoice>) => {
        clip.stopSpeaking();
        warm();
        return conversation.ensureVoice(...args);
      },
    },
  };
}

/** How long an idle frame may wait before the cards' specs are fetched: after the page's own reads and code. */
const SPECS_IDLE_MS = 2000;

export function installAsk(win: Window = window, storage: Storage | null = safeStorage()): AskApi {
  // The specs every card reads (contracts' page-specs entry, and the kinds only Ask's cards commit, ask-only.ts) come by
  // their own entries, fetched once the frame is idle, or at once when a turn or a thread asks first; a turn and a thread
  // are handed over once they are in, so every card draws its gate, its undo and its Open (a load that fails leaves the
  // pages' kinds alone, and a card of the others commits after the walk has tried again).
  const specsIn = (): Promise<void> => moreSpecs().catch(() => undefined);
  aheadWhenIdle(() => void specsIn(), SPECS_IDLE_MS);
  const palette = askPalette(win, storage);
  const api = askApi(apiFor(win));
  // Reading aloud in Ask's voice (ask/speech.ts: the clip from the speech route, played by one element of the module's)
  // and the agent's session the hold speaks to (ask/voice.ts: the vendor's client is loaded on the first press, not
  // here). One voice at a time, held here where the two are composed: a clip ends the session it would talk over, and
  // a hold ends the clip.
  const { speech, voice } = oneVoice(
    askSpeech(win, { api }),
    installVoice(win, { api, freshen: freshSession }),
    api.warmModel,
  );
  // The page under a running conversation follows the member: the next spoken turn reads the page they moved to
  // (a window that cannot be listened to, a test's stand-in, has no page to follow). The address is read as the
  // Line reads its own (ask-real.jsx arRoute): the page, then the rest as its param.
  if (typeof win.addEventListener === "function") {
    hearAddress(() => {
      if (!voice.voiceUp()) return;
      const [page, ...rest] = routeOnScreen(win).split("/");
      voice.pageMoved(pageContext(win, { page: page || "today", param: rest.length ? rest.join("/") : null }));
    }, win);
  }
  // The follow-ups that came due (ask/follow-ups.ts): read after the boot and as their pages move; a question that comes
  // back to one takes it off the home at once and reads them again once the route has cleared it, and so does a card
  // that keeps or clears one, once committed or undone.
  const followUps = askFollowUps(win, api);
  // A question carries the column the Line draws its answer in (ask/column.ts), measured as it is sent.
  const send: AskApiCalls["send"] = (input, on) => {
    palette.rememberLanguage(palette.language(input.text));
    const asked = { ...input, column: input.column ?? askColumn(win) };
    if (!input.following) return specsIn().then(() => api.send(asked, on));
    followUps.cameBackTo(input.following.id);
    return specsIn()
      .then(() => api.send(asked, on))
      .finally(() => void followUps.readFollowUps());
  };
  const keptOrCleared = <T>(kinds: readonly AskProposal[], done: Promise<T>): Promise<T> =>
    kinds.some((p) => p.kind === "follow_up") ? done.finally(() => void followUps.readFollowUps()) : done;
  const thread: AskApiCalls["thread"] = (...args) => specsIn().then(() => api.thread(...args));
  // A question spoken to the agent is a turn like a typed one (ask/spoken.ts): the same events, and its language kept.
  const spoken = spokenTurns(voice, api);
  const sendSpoken: typeof spoken.sendSpoken = (input, words, on) => {
    palette.rememberLanguage(palette.language(words));
    return specsIn().then(() => spoken.sendSpoken(input, words, on));
  };
  const ask: AskApi = {
    ...palette,
    ...api,
    ...speech,
    ...askAloud(speech),
    ...voice,
    send,
    thread,
    sendSpoken,
    ...followUps,
    commit: (p, cards = []) => keptOrCleared([p], commitCard(win, p, cards)),
    commitPlan: (cards) => keptOrCleared(cards, commitPlan(win, cards)),
    cardsInPlans,
    planGroupOf,
    undo: (p, o) => keptOrCleared([p], undoProposal(win, p, o)),
    editReply: (p) => editReply(win, p),
    undoOpen: (...a) => pageSpecs.now()?.askUndoOpen(...a) ?? false,
    quick: quickAnswer(palette, api.openings),
    answerText,
    answerBlocks,
    answerRuns,
    answerCopy,
    answerSpoken,
    cardOpenRoute: (p) => pageSpecs.now()?.cardOpenRoute(p) ?? null,
    context: (route, words, thread) => pageContext(win, route, words, thread),
  };
  (win as unknown as { __ask?: AskApi }).__ask = ask;
  return ask;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

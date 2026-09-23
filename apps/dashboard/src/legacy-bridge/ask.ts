/**
 * Ask, wired to the workspace: window.__ask.
 *
 * Four small modules, composed here: what the palette shows before a model
 * is asked (ask/palette.ts), the Ask routes and the streamed turn
 * (ask/api.ts), a card's commit and undo through the verbs' own routes
 * (ask/commit.ts), and reading aloud (ask/speech.ts). The mockup's palette
 * reaches all of it through this one object and nothing else, so what a
 * palette may do is the list below.
 */
import {
  PROPOSAL_GATE,
  answerText,
  askUndoOpen,
  callsAnswer,
  cardOpenRoute,
  needsAnswer,
  openingsAnswer,
  type AskAnswer,
  type AskProposal,
  type AskProposalOutcome,
} from "@chanlytics/contracts";
import { askApi, type AskApiCalls, type SendEvent } from "./ask/api";
import { apiFor } from "./api";
import { commitProposal, editReply, undoProposal, type CommitResult } from "./ask/commit";
import { askPalette } from "./ask/palette";
import { askSpeech } from "./ask/speech";

export type { SendEvent, CommitResult };
export { jumpIndexFrom, surfaceFor, waitingFrom } from "./ask/palette";
export { readLines } from "./ask/api";

export type AskApi = ReturnType<typeof askPalette> &
  AskApiCalls &
  ReturnType<typeof askSpeech> & {
    /** Approve a card: the verb's own route, then the surfaces refresh. */
    commit(p: AskProposal): Promise<CommitResult>;
    /** Undo a committed card, where the verb has one. */
    undo(p: AskProposal, outcome: AskProposalOutcome): Promise<CommitResult>;
    /** "Edit in the composer": open the thread with the words ready to change. */
    editReply(p: AskProposal): void;
    /** Whether a committed card's undo is still true to offer: contracts' askUndoOpen. */
    undoOpen: typeof askUndoOpen;
    /** A quick question's answer, without a model: Today's queue, today's calls or the openings route; null for the rest. */
    quick(question: string): Promise<AskAnswer> | null;
    /** An answer's words, for copy, reading aloud and a folded turn. */
    answerText: typeof answerText;
    /** Where a card's Open goes, or null. */
    cardOpenRoute: typeof cardOpenRoute;
  };

export function installAsk(win: Window = window, storage: Storage | null = safeStorage()): AskApi {
  const palette = askPalette(win, storage);
  const api = askApi(apiFor(win));
  const speech = askSpeech(win);
  const send: AskApiCalls["send"] = (input, on) => {
    palette.rememberLanguage(palette.language(input.text));
    return api.send(input, on);
  };
  const ask: AskApi = {
    ...palette,
    ...api,
    ...speech,
    send,
    commit: (p) => commitProposal(win, p),
    undo: (p, o) => undoProposal(win, p, o),
    editReply: (p) => editReply(win, p),
    undoOpen: askUndoOpen,
    quick: (question) => {
      const intent = palette.intent(question);
      if (!intent) return null;
      const lang = palette.language(question);
      if (intent.kind === "needs") return Promise.resolve(needsAnswer(palette.waiting(), lang));
      if (intent.kind === "calls") {
        const c = palette.callsToday();
        return Promise.resolve(callsAnswer(c.missed, c.live, lang));
      }
      return api
        .openings(intent.day, intent.service)
        .then((o) => openingsAnswer({ state: okState(o.state), days: o.days ?? [] }, lang))
        .catch(() => openingsAnswer({ state: "unavailable", days: [] }, lang));
    },
    answerText,
    cardOpenRoute,
  };
  (win as unknown as { __ask?: AskApi; PROPOSAL_GATE?: typeof PROPOSAL_GATE }).__ask = ask;
  (win as unknown as { PROPOSAL_GATE?: typeof PROPOSAL_GATE }).PROPOSAL_GATE = PROPOSAL_GATE;
  return ask;
}

/** The openings route's state, as the answer knows it; anything else is a calendar that could not be read. */
const okState = (s: string): "ok" | "no_calendar" | "unavailable" =>
  s === "ok" || s === "no_calendar" ? s : "unavailable";

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

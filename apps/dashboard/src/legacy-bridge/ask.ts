/**
 * Ask, wired to the workspace: window.__ask.
 *
 * Five small modules, composed here: what the palette shows before a model
 * is asked (ask/palette.ts), the Ask routes and the streamed turn
 * (ask/api.ts), a card's commit and undo through the verbs' own routes
 * (ask/commit.ts), reading aloud in Ask's voice (ask/speech.ts: the brief, an
 * answer's say, through the speech route), and a voice conversation with Ask
 * on the agent (ask/voice.ts). The mockup's palette
 * reaches all of it through this one object and nothing else, so what a
 * palette may do is the list below.
 */
import {
  PROPOSAL_GATE,
  answerText,
  askUndoOpen,
  cardOpenRoute,
  type AskAnswer,
  type AskProposal,
  type AskProposalOutcome,
  type PageContext,
  ASK_VOICE_TOKEN_MIN_MS,
} from "@chanlytics/contracts";
import { askApi, type AskApiCalls, type SendEvent } from "./ask/api";
import { apiFor } from "./api";
import { createClient } from "../lib/supabase/client";
import { hearAddress, routeOnScreen } from "./workspace";
import { commitProposal, editReply, undoProposal, type CommitResult } from "./ask/commit";
import { askPalette, quickAnswer } from "./ask/palette";
import { askSpeech, type SpeechPurpose } from "./ask/speech";
import { installVoice } from "./ask/voice";
import { pageContext, type ThreadMessage } from "./ask/context";

export type { SendEvent, CommitResult };
export { jumpIndexFrom, surfaceFor, waitingFrom, quickAnswer } from "./ask/palette";
export { readLines } from "./ask/api";

export type AskApi = ReturnType<typeof askPalette> &
  AskApiCalls &
  ReturnType<typeof askSpeech> &
  ReturnType<typeof installVoice> & {
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
 * the voice route seals, for as long as the conversation runs (the agent's thirty minutes), so a token with less life
 * than that is refreshed first, by the browser's own client with its own refresh token (never the server's: a refresh
 * there would race the browser's and sign the member out).
 */
async function freshSession(): Promise<void> {
  const client = createClient();
  const { data } = await client.auth.getSession();
  const exp = data.session?.expires_at;
  if (typeof exp === "number" && exp * 1000 - Date.now() < ASK_VOICE_TOKEN_MIN_MS) await client.auth.refreshSession();
}

export function installAsk(win: Window = window, storage: Storage | null = safeStorage()): AskApi {
  const palette = askPalette(win, storage);
  const api = askApi(apiFor(win));
  // Reading aloud in Ask's voice (ask/speech.ts: the clip from the speech route, played by one element of the module's)
  // and the agent's session the hold speaks to (ask/voice.ts: the vendor's client is loaded on the first press, not
  // here). One voice at a time, held here where the two are composed: a clip ends the session it would talk over, and
  // a hold ends the clip.
  const clip = askSpeech(win, { api });
  const conversation = installVoice(win, { api, freshen: freshSession });
  const speech = {
    ...clip,
    speak: async (text: string, purpose: SpeechPurpose): Promise<void> => {
      if (conversation.voiceUp() || conversation.voiceConnecting()) await conversation.stopVoice("superseded");
      return clip.speak(text, purpose);
    },
  };
  const voice = {
    ...conversation,
    ensureVoice: (...args: Parameters<typeof conversation.ensureVoice>) => {
      clip.stopSpeaking();
      return conversation.ensureVoice(...args);
    },
  };
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
  const send: AskApiCalls["send"] = (input, on) => {
    palette.rememberLanguage(palette.language(input.text));
    return api.send(input, on);
  };
  const ask: AskApi = {
    ...palette,
    ...api,
    ...speech,
    ...voice,
    send,
    commit: (p) => commitProposal(win, p),
    undo: (p, o) => undoProposal(win, p, o),
    editReply: (p) => editReply(win, p),
    undoOpen: askUndoOpen,
    quick: quickAnswer(palette, api.openings),
    answerText,
    cardOpenRoute,
    context: (route, words, thread) => pageContext(win, route, words, thread),
  };
  (win as unknown as { __ask?: AskApi; PROPOSAL_GATE?: typeof PROPOSAL_GATE }).__ask = ask;
  (win as unknown as { PROPOSAL_GATE?: typeof PROPOSAL_GATE }).PROPOSAL_GATE = PROPOSAL_GATE;
  return ask;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

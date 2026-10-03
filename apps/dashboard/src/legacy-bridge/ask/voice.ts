/**
 * The Line's voice conversation, over the agent's client (docs/superpowers/specs/2026-10-03-ask-spoken-design.md,
 * §3.5). One conversation at a time: the voice route mints it as the member (POST ask/voice: the thread, the agent's
 * token, the session the browser hands the agent), the vendor's client is loaded then and not before (an on-demand
 * chunk; the workspace route carries none of it), and every callback it fires becomes one of the Line's actions
 * through the pure reducer beside this (voice-events.ts). The agent speaks; the chat draws the Say as the reducer
 * grows it and reads the stored turn off the thread once it lands, as a typed turn's final line is read. Ending it,
 * or the agent going, ends the session's row too (POST ask/voice/end), so the brain door opens it no more.
 *
 * Each start is a generation: an end that comes while a start is still connecting (the review's case: End pressed,
 * or Listen tapped twice, inside the connect) is honoured once the connect lands, by closing what it opened, the
 * microphone and the row, and a callback from a conversation that is over changes nothing of the one running.
 */
import type { AskLanguage, AskScope, AskSurface, PageContext } from "@chanlytics/contracts";
import type { Callbacks } from "@elevenlabs/client";
import type { AskApiCalls } from "./api";
import {
  reduceVoiceEvent,
  VOICE_TURN_START,
  type VoiceAction,
  type VoiceEvent,
  type VoiceTurnState,
} from "./voice-events";

type Client = typeof import("@elevenlabs/client");
type Conversation = Awaited<ReturnType<Client["Conversation"]["startSession"]>>;

export interface VoiceStart {
  threadId: string | null;
  scope: AskScope | null;
  surface: AskSurface | null;
  context: PageContext | null;
  language: AskLanguage;
  /** Read aloud: the answer's words as the agent's first message. */
  first?: string;
  /** Today's Listen: a question asked as typed once connected ("Brief me on today"). */
  ask?: string;
}

export interface VoiceDeps {
  api: Pick<AskApiCalls, "voiceStart" | "voicePage" | "voiceEnd">;
  /** The vendor's client, loaded on the first tap; a test hands in a stand-in. */
  load?: () => Promise<Client>;
  /**
   * The member's session made fresh before a conversation starts (ask.ts: a token with less than
   * ASK_VOICE_TOKEN_MIN_MS of life is refreshed first), so the sealed token the brain door opens outlives the
   * conversation. A refresh that fails is not a reason not to start: the door says to reconnect if it must.
   */
  freshen?: () => Promise<void>;
}

export type { VoiceAction };

const agentLanguage = (language: AskLanguage): "en" | "es" => (language === "es" ? "es" : "en");

export function installVoice(win: Window, deps: VoiceDeps) {
  const load = deps.load ?? (() => import("@elevenlabs/client"));
  let conv: Conversation | null = null;
  let session: string | null = null;
  let state: VoiceTurnState = VOICE_TURN_START;
  let listener: ((a: VoiceAction) => void) | null = null;
  /** Which start is the current one; an end moves it on, and a start that finds itself behind closes what it opened. */
  let generation = 0;

  const hear = (ev: VoiceEvent) => {
    if (!listener) return;
    const r = reduceVoiceEvent(state, ev);
    state = r.state;
    for (const a of r.actions) listener(a);
  };
  const forget = () => {
    conv = null;
    session = null;
    listener = null;
    state = VOICE_TURN_START;
  };
  /** The row ended once the conversation is, however it ended; never waited on. */
  const endRow = (ended: string | null, reason: string) => {
    if (ended) void deps.api.voiceEnd(ended, reason);
  };

  async function stopVoice(reason = "stopped"): Promise<void> {
    generation++;
    const c = conv;
    const ended = session;
    const on = listener;
    forget();
    if (c) {
      try {
        await c.endSession();
      } catch {
        /* already gone */
      }
    }
    if (ended) await deps.api.voiceEnd(ended, reason);
    // The Line hears the end it asked for too, so a turn cut short is let go of and the thread read.
    if (on) on({ t: "gone", reason });
  }

  return {
    /** The device can talk with Ask: a microphone, on a secure page. */
    canVoice: (): boolean => !!(win.isSecureContext && win.navigator?.mediaDevices?.getUserMedia),
    /** Whether a conversation runs now. */
    voiceOn: (): boolean => !!conv,
    /**
     * A conversation begun: the row, the vendor's client, the connection. Null when it was ended before it was up
     * (nothing of it is left running), else the thread it is on.
     */
    async startVoice(
      input: VoiceStart,
      on: (a: VoiceAction) => void,
    ): Promise<{ threadId: string; title: string } | null> {
      if (conv) await stopVoice();
      const mine = ++generation;
      if (deps.freshen) {
        try {
          await deps.freshen();
        } catch {
          /* the door says to reconnect if the token runs out */
        }
      }
      if (mine !== generation) return null;
      const language = agentLanguage(input.language);
      const started = await deps.api.voiceStart({
        threadId: input.threadId,
        scope: input.scope,
        surface: input.surface,
        context: input.context,
        language,
      });
      const { Conversation } = await load();
      if (mine !== generation) {
        endRow(started.session, "stopped");
        return null;
      }
      listener = on;
      state = VOICE_TURN_START;
      session = started.session;
      const callbacks: Callbacks = {
        onMessage: (m) => mine === generation && hear({ kind: "message", payload: m }),
        onAgentChatResponsePart: (p) => mine === generation && hear({ kind: "part", payload: p }),
        onAgentResponseCorrection: (p) => mine === generation && hear({ kind: "correction", payload: p }),
        onInterruption: (p) => mine === generation && hear({ kind: "interruption", payload: p }),
        onVadScore: (p) => mine === generation && hear({ kind: "vad", payload: p }),
        onModeChange: (p) => mine === generation && hear({ kind: "mode", payload: p }),
        onIncomingEvent: (e: { type?: string }) => mine === generation && hear({ kind: "event", payload: e }),
        onDisconnect: (d) => {
          if (mine !== generation) return;
          hear({ kind: "disconnect", payload: d });
          const ended = session;
          forget();
          endRow(ended, d.reason ?? "disconnect");
        },
      };
      let c: Conversation;
      try {
        c = await Conversation.startSession({
          conversationToken: started.token,
          connectionType: "webrtc",
          customLlmExtraBody: { chanlytics_session: started.session },
          userId: started.session,
          overrides: { agent: { language, ...(input.first ? { firstMessage: input.first } : {}) } },
          ...callbacks,
        });
      } catch (e) {
        // An end that came while connecting ended the row already (the session was on the shelf for it to see).
        if (mine === generation) {
          forget();
          endRow(started.session, "start");
          on({ t: "gone", reason: "start" });
        }
        throw e;
      }
      if (mine !== generation) {
        // Ended while connecting: the end saw the session and ended the row; the microphone the vendor just opened
        // is closed again here, where it was opened.
        try {
          await c.endSession();
        } catch {
          /* already gone */
        }
        return null;
      }
      conv = c;
      if (input.ask) c.sendUserMessage(input.ask);
      return { threadId: started.thread_id, title: started.title };
    },
    stopVoice: () => stopVoice(),
    /** The page under the Line changed: the next spoken turn reads this one. */
    pageMoved(context: PageContext): void {
      if (session) void deps.api.voicePage(session, context);
    },
    /** How loud the agent is right now, 0 to 1: the three move to it while it speaks. */
    level(): number {
      try {
        return conv ? conv.getOutputVolume() : 0;
      } catch {
        return 0;
      }
    },
  };
}

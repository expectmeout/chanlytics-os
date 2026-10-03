/**
 * The Line's voice conversation, over the agent's client (docs/superpowers/specs/2026-10-03-ask-spoken-design.md,
 * §3.5). One conversation at a time: the voice route mints it as the member (POST ask/voice: the thread, the agent's
 * token, the session the browser hands the agent), the vendor's client is loaded then and not before (an on-demand
 * chunk; the workspace route carries none of it), and every callback it fires becomes one of the Line's actions
 * through the pure reducer beside this (voice-events.ts). The agent speaks; the chat draws the Say as the reducer
 * grows it and reads the stored turn off the thread once it lands, as a typed turn's final line is read. Ending it,
 * or the agent going, ends the session's row too (POST ask/voice/end), so the brain door opens it no more.
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
}

export type { VoiceAction };

const agentLanguage = (language: AskLanguage): "en" | "es" => (language === "es" ? "es" : "en");

export function installVoice(win: Window, deps: VoiceDeps) {
  const load = deps.load ?? (() => import("@elevenlabs/client"));
  let conv: Conversation | null = null;
  let session: string | null = null;
  let state: VoiceTurnState = VOICE_TURN_START;
  let listener: ((a: VoiceAction) => void) | null = null;

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
  const endRow = (ended: string | null) => {
    if (ended) void deps.api.voiceEnd(ended);
  };
  const callbacks: Callbacks = {
    onMessage: (m) => hear({ kind: "message", payload: m }),
    onAgentChatResponsePart: (p) => hear({ kind: "part", payload: p }),
    onAgentResponseCorrection: (p) => hear({ kind: "correction", payload: p }),
    onInterruption: (p) => hear({ kind: "interruption", payload: p }),
    onVadScore: (p) => hear({ kind: "vad", payload: p }),
    onModeChange: (p) => hear({ kind: "mode", payload: p }),
    onIncomingEvent: (e: { type?: string }) => hear({ kind: "event", payload: e }),
    onDisconnect: (d) => {
      hear({ kind: "disconnect", payload: d });
      const ended = session;
      forget();
      endRow(ended);
    },
  };

  async function stopVoice(): Promise<void> {
    const c = conv;
    const ended = session;
    forget();
    if (c) {
      try {
        await c.endSession();
      } catch {
        /* already gone */
      }
    }
    if (ended) await deps.api.voiceEnd(ended);
  }

  return {
    /** The device can talk with Ask: a microphone, on a secure page. */
    canVoice: (): boolean => !!(win.isSecureContext && win.navigator?.mediaDevices?.getUserMedia),
    /** Whether a conversation runs now. */
    voiceOn: (): boolean => !!conv,
    async startVoice(input: VoiceStart, on: (a: VoiceAction) => void): Promise<{ threadId: string; title: string }> {
      if (conv) await stopVoice();
      const language = agentLanguage(input.language);
      const started = await deps.api.voiceStart({
        threadId: input.threadId,
        scope: input.scope,
        surface: input.surface,
        context: input.context,
        language,
      });
      const { Conversation } = await load();
      listener = on;
      state = VOICE_TURN_START;
      session = started.session;
      try {
        conv = await Conversation.startSession({
          conversationToken: started.token,
          connectionType: "webrtc",
          customLlmExtraBody: { chanlytics_session: started.session },
          userId: started.session,
          overrides: { agent: { language, ...(input.first ? { firstMessage: input.first } : {}) } },
          ...callbacks,
        });
      } catch (e) {
        const ended = session;
        forget();
        endRow(ended);
        on({ t: "gone", reason: "start" });
        throw e;
      }
      if (input.ask) conv.sendUserMessage(input.ask);
      return { threadId: started.thread_id, title: started.title };
    },
    stopVoice,
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

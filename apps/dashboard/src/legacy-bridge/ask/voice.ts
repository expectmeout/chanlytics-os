/**
 * The Line's voice conversation, over the agent's client (docs/superpowers/specs/2026-10-03-ask-spoken-design.md,
 * §3.5 as amended 4 Oct 2026). One conversation at a time, the Ask line's alone: the voice route mints it as the
 * member (POST ask/voice: the thread, the agent's token, the session the browser hands the agent), the vendor's client
 * is loaded then and not before (an on-demand chunk; the workspace route carries none of it), and every callback it
 * fires becomes one of the Line's actions through the pure reducer beside this (voice-events.ts). The agent speaks
 * its own first words ("I'm listening."), so the audio path proves itself before the person says a thing; the chat
 * draws the Say as the reducer grows it and reads the stored turn off the thread once it lands.
 *
 * Today's Listen and an answer's Read aloud are no longer conversations: they are the one-way speech (ask/api.ts
 * `speech`, the brief or the answer's say read in the same voice, nobody speaking back), so this module takes no
 * first message and no opening question. The agent's language is the agent's own.
 *
 * Ending it, however it ends, ends the session's row too (POST ask/voice/end), with the browser's word for why, one
 * of a closed set (contracts VOICE_END_REASONS), and what the browser measured from the tap: to the connection, and to
 * the first audio heard. The vendor erases its own record after the call, so the row is the one record of how a
 * conversation went; "stopped" said nothing (23 conversations on 4 Oct, 19 of them ended inside nine seconds, every
 * one logged alike).
 *
 * Each start is a generation: an end that comes while a start is still connecting (End pressed, or the mic tapped
 * twice, inside the connect) is honoured once the connect lands, by closing what it opened, the microphone and the
 * row, with the reason the end gave, and a callback from a conversation that is over changes nothing of the one
 * running.
 */
import type { AskScope, AskSurface, PageContext, VoiceEndReason } from "@chanlytics/contracts";
import type { Callbacks } from "@elevenlabs/client";
import type { AskApiCalls, VoiceEndTiming } from "./api";
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
}

/**
 * How a conversation is being ended from this side: the person's End, their typing, the Line closing, or another use
 * of the voice taking its place (a brief read aloud: one voice at a time).
 */
export type VoiceStopReason = Extract<VoiceEndReason, "button" | "typed" | "navigated" | "superseded">;

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
  /** The clock the timings are read from; a test hands in its own. */
  now?: () => number;
}

export type { VoiceAction, VoiceEndReason };

/**
 * The client's audio worklets, served from this origin (apps/dashboard/public/voice, written by
 * tooling/scripts/voice/vendor-worklets.mjs from the installed client): without these paths the client loads them from
 * a blob: URL, which the dashboard's script-src refuses, its audio setup fails and the connection goes down a second
 * after it is up (Chrome, 3 Oct 2026). The vendored files are held equal to the client's by voice-worklets.test.mjs.
 */
const WORKLET_PATHS = {
  rawAudioProcessor: "/voice/raw-audio-processor.js",
  audioConcatProcessor: "/voice/audio-concat-processor.js",
};

/** What one conversation measured from its tap: when it connected, when the agent first spoke. */
interface Clock {
  tappedAt: number;
  connectedAt: number | null;
  firstAudioAt: number | null;
}
const timingOf = (c: Clock | null): VoiceEndTiming => ({
  connectMs: c?.connectedAt == null ? null : Math.max(0, c.connectedAt - c.tappedAt),
  firstAudioMs: c?.firstAudioAt == null ? null : Math.max(0, c.firstAudioAt - c.tappedAt),
});

/** The one conversation's state, shared by the module's verbs: what runs, whose it is, how far it has got. */
interface Line {
  conv: Conversation | null;
  session: string | null;
  clock: Clock | null;
  state: VoiceTurnState;
  listener: ((a: VoiceAction) => void) | null;
  /** Who else follows the conversation: the three (the mascot), a pane drawn while it runs. */
  watchers: Set<(a: VoiceAction) => void>;
  /** Which start is the current one; an end moves it on, and a start that finds itself behind closes what it opened. */
  generation: number;
  /** Why the last end came, for a start that lands after it and must end the row it opened with the same word. */
  stopped: VoiceEndReason | null;
}

/** What the verbs are given: the line, the deps, and the two clocks and loaders resolved once. */
interface World {
  line: Line;
  deps: VoiceDeps;
  load: () => Promise<Client>;
  now: () => number;
}

/** An event of the vendor's heard: reduced to the Line's actions, each told to the starter and to every watcher. */
const hear = (line: Line, ev: VoiceEvent) => {
  if (!line.listener && line.watchers.size === 0) return;
  const r = reduceVoiceEvent(line.state, ev);
  line.state = r.state;
  for (const a of r.actions) {
    if (line.listener) line.listener(a);
    for (const w of line.watchers) w(a);
  }
};

const forget = (line: Line) => {
  line.conv = null;
  line.session = null;
  line.clock = null;
  line.listener = null;
  line.state = VOICE_TURN_START;
};

/** The row ended once the conversation is, however it ended, with how it went; never waited on. */
const endRow = (w: World, ended: string | null, reason: VoiceEndReason, c: Clock | null) => {
  if (ended) void w.deps.api.voiceEnd(ended, reason, timingOf(c));
};

async function stopVoice(w: World, reason: VoiceEndReason): Promise<void> {
  const { line } = w;
  line.generation++;
  line.stopped = reason;
  const c = line.conv;
  const ended = line.session;
  const measured = line.clock;
  const on = line.listener;
  forget(line);
  if (c) {
    try {
      await c.endSession();
    } catch {
      /* already gone */
    }
  }
  if (ended) await w.deps.api.voiceEnd(ended, reason, timingOf(measured));
  // The Line hears the end it asked for too, so a turn cut short is let go of and the thread read.
  if (on) on({ t: "gone", reason });
  for (const watcher of line.watchers) watcher({ t: "gone", reason });
}

/** The vendor's callbacks for one start (`mine`), each ignored once another start has taken the line. */
function callbacksFor(w: World, mine: number, measured: Clock): Callbacks {
  const { line, now } = w;
  const live = () => mine === line.generation;
  return {
    onConnect: () => {
      if (live() && measured.connectedAt == null) measured.connectedAt = now();
    },
    onMessage: (m) => live() && hear(line, { kind: "message", payload: m }),
    onAgentChatResponsePart: (p) => live() && hear(line, { kind: "part", payload: p }),
    onAgentResponseCorrection: (p) => live() && hear(line, { kind: "correction", payload: p }),
    onInterruption: (p) => live() && hear(line, { kind: "interruption", payload: p }),
    onVadScore: (p) => live() && hear(line, { kind: "vad", payload: p }),
    onModeChange: (p) => {
      if (!live()) return;
      // The agent's first turn to speaking is the first audio the person hears (WebRTC plays it straight through).
      if (p.mode === "speaking" && measured.firstAudioAt == null) measured.firstAudioAt = now();
      hear(line, { kind: "mode", payload: p });
    },
    onIncomingEvent: (e: { type?: string }) => live() && hear(line, { kind: "event", payload: e }),
    onDisconnect: (d) => {
      if (!live()) return;
      hear(line, { kind: "disconnect", payload: d });
      const ended = line.session;
      forget(line);
      // The far side ended it (the vendor's limit, its silence timeout, a dropped connection): the row says so.
      endRow(w, ended, "vendor", measured);
    },
  };
}

/**
 * A conversation begun: the row, the vendor's client, the connection. Null when it was ended before it was up
 * (nothing of it is left running), else the thread it is on.
 */
async function startVoice(
  w: World,
  input: VoiceStart,
  on: (a: VoiceAction) => void,
): Promise<{ threadId: string; title: string } | null> {
  const { line, deps, now } = w;
  if (line.conv || line.clock) await stopVoice(w, "superseded");
  const mine = ++line.generation;
  const measured: Clock = { tappedAt: now(), connectedAt: null, firstAudioAt: null };
  line.clock = measured;
  if (deps.freshen) {
    try {
      await deps.freshen();
    } catch {
      /* the door says to reconnect if the token runs out */
    }
  }
  if (mine !== line.generation) return null;
  let started: Awaited<ReturnType<AskApiCalls["voiceStart"]>>;
  try {
    started = await deps.api.voiceStart({
      threadId: input.threadId,
      scope: input.scope,
      surface: input.surface,
      context: input.context,
    });
  } catch (e) {
    if (mine === line.generation) {
      forget(line);
      on({ t: "gone", reason: "start" });
    }
    throw e;
  }
  const { Conversation } = await w.load();
  if (mine !== line.generation) {
    // Ended between the mint and the client's load: the end found no session yet, so the row is ended here, with the
    // end's own word (End pressed is `button`, not a second start).
    endRow(w, started.session, line.stopped ?? "superseded", measured);
    return null;
  }
  line.listener = on;
  line.state = VOICE_TURN_START;
  line.session = started.session;
  let c: Conversation;
  try {
    c = await Conversation.startSession({
      conversationToken: started.token,
      connectionType: "webrtc",
      customLlmExtraBody: { chanlytics_session: started.session },
      userId: started.session,
      workletPaths: WORKLET_PATHS,
      ...callbacksFor(w, mine, measured),
    });
  } catch (e) {
    // An end that came while connecting ended the row already (the session was on the shelf for it to see).
    if (mine === line.generation) {
      forget(line);
      endRow(w, started.session, "start", measured);
      on({ t: "gone", reason: "start" });
    }
    throw e;
  }
  if (mine !== line.generation) {
    // Ended while connecting: the end saw the session and ended the row; the microphone the vendor just opened is
    // closed again here, where it was opened.
    try {
      await c.endSession();
    } catch {
      /* already gone */
    }
    return null;
  }
  if (measured.connectedAt == null) measured.connectedAt = now();
  line.conv = c;
  return { threadId: started.thread_id, title: started.title };
}

export function installVoice(win: Window, deps: VoiceDeps) {
  const line: Line = {
    conv: null,
    session: null,
    clock: null,
    state: VOICE_TURN_START,
    listener: null,
    watchers: new Set(),
    generation: 0,
    stopped: null,
  };
  const w: World = {
    line,
    deps,
    load: deps.load ?? (() => import("@elevenlabs/client")),
    now: deps.now ?? (() => Date.now()),
  };
  return {
    /** The device can talk with Ask: a microphone, on a secure page. */
    canVoice: (): boolean => !!(win.isSecureContext && win.navigator?.mediaDevices?.getUserMedia),
    /** Whether a conversation runs now (connected), as against one connecting or none. */
    voiceOn: (): boolean => !!line.conv,
    /** Whether a start is in flight: the tap has landed and the connection is not up yet. */
    voiceConnecting: (): boolean => !line.conv && line.clock !== null,
    startVoice: (input: VoiceStart, on: (a: VoiceAction) => void) => startVoice(w, input, on),
    /** The person ends it (End pressed, typing, the Line closing), or another use of the voice takes its place. */
    stopVoice: (reason: VoiceStopReason = "button") => stopVoice(w, reason),
    /**
     * Follow the conversation that runs, from outside the start that began it: the three, a pane drawn while the
     * agent speaks, hear the end as the starter does. Answers the stop. A watcher never ends the conversation: it is
     * the member's, not the pane's (seen on production, 4 Oct 2026, when a pane's unmount hung up every call).
     */
    watchVoice(on: (a: VoiceAction) => void): () => void {
      line.watchers.add(on);
      return () => {
        line.watchers.delete(on);
      };
    },
    /** The page under the Line changed: the next spoken turn reads this one. */
    pageMoved(context: PageContext): void {
      if (line.session) void deps.api.voicePage(line.session, context);
    },
    /** How loud the agent is right now, 0 to 1: the three move to it while it speaks. */
    level(): number {
      try {
        return line.conv ? line.conv.getOutputVolume() : 0;
      } catch {
        return 0;
      }
    },
  };
}

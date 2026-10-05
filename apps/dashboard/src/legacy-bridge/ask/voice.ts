/**
 * The Line's voice session, over the agent's client (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as
 * amended 4 Oct 2026, evening: the hold is the one mic). The person holds the mic and the browser's own recogniser
 * hears them, as it always did; what changes is the mouth. On the press the Line asks for a session (`ensureVoice`):
 * the voice route mints it as the member (POST ask/voice: the thread, the agent's token, the session the browser hands
 * the agent), the vendor's client is loaded then and not before (an on-demand chunk), and once the connection is up
 * its microphone is MUTED, so the agent hears nothing of the room. On the lift the words heard go to the agent as a
 * text turn (`sayVoice`: the client's `sendUserMessage`), and the agent, whose brain is Ask's own door, answers aloud
 * at once, its words streaming into the Line as it speaks (voice-events.ts), the stored turn read off the thread when
 * it lands. A hold while it speaks holds its voice down (`hushVoice`), and the next words cut it off: the vendor takes a
 * new text turn as an interruption (measured 4 Oct). A session that is not up by the lift (`soonVoice`, a bounded
 * wait) is left to come up for the next hold, and the words go the typed way.
 *
 * Between questions the session waits silently. The vendor's own after-last-message clock is reset by its own
 * re-engage ("..." at its turn timeout, which the brain door answers with nothing), so the browser is the one that
 * ends an idle session: a minute after the last question or the end of the last answer's speech (contracts
 * ASK_VOICE_IDLE_MS), as `idle`. That re-engage completes a turn like any other, so only the answer to a question
 * the person asked winds the minute again (`asked`); and the minute never ends a session in use: not under a hold,
 * not while an answer is on its way, not while the agent speaks.
 *
 * Ending it, however it ends, ends the session's row too (POST ask/voice/end), with the browser's word for why, one
 * of a closed set (contracts VOICE_END_REASONS), and what the browser measured from the press: to the connection, and
 * to the first audio heard. The vendor erases its own record after the call, so the row is the one record.
 *
 * Each start is a generation: an end that comes while a start is still connecting is honoured once the connect lands,
 * by closing what it opened, the microphone and the row, with the reason the end gave; a callback from a conversation
 * that is over changes nothing of the one running.
 */
import {
  ASK_VOICE_IDLE_MS,
  ASK_VOICE_UP_WAIT_MS,
  type AskScope,
  type AskSurface,
  type PageContext,
  type VoiceEndReason,
} from "@chanlytics/contracts";
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

/** The thread a session runs on, as the mint answered: the Line's own when it had one, else a new one, titled. */
export interface VoiceUp {
  threadId: string;
  title: string;
}

/**
 * How a session is being ended from this side: Clear pressed, typing (a typed question is answered in text alone), the
 * Line closing, another use of the voice taking its place (a brief read aloud: one voice at a time), or a minute idle.
 */
export type VoiceStopReason = Extract<VoiceEndReason, "button" | "typed" | "navigated" | "superseded" | "idle">;

/** A timer the module sets and clears; a test hands in one it moves by hand. */
export interface VoiceTimer {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
}

export interface VoiceDeps {
  api: Pick<AskApiCalls, "voiceStart" | "voicePage" | "voiceEnd">;
  /** The vendor's client, loaded on the first press; a test hands in a stand-in. */
  load?: () => Promise<Client>;
  /**
   * The member's session made fresh before a conversation starts (ask.ts: a token with less than
   * ASK_VOICE_TOKEN_MIN_MS of life is refreshed first), so the sealed token the brain door opens outlives the
   * conversation. A refresh that fails is not a reason not to start: the door says to reconnect if it must.
   */
  freshen?: () => Promise<void>;
  /** The clock the timings are read from; a test hands in its own. */
  now?: () => number;
  timer?: VoiceTimer;
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

/** What one session measured from its press: when it connected, when the agent first spoke. */
interface Clock {
  tappedAt: number;
  connectedAt: number | null;
  firstAudioAt: number | null;
}
const timingOf = (c: Clock | null): VoiceEndTiming => ({
  connectMs: c?.connectedAt == null ? null : Math.max(0, c.connectedAt - c.tappedAt),
  firstAudioMs: c?.firstAudioAt == null ? null : Math.max(0, c.firstAudioAt - c.tappedAt),
});

/** The one session's state, shared by the module's verbs: what runs, whose it is, how far it has got. */
interface Line {
  conv: Conversation | null;
  session: string | null;
  /** The thread the session runs on, once up: a hold on another thread replaces the session. */
  threadId: string | null;
  clock: Clock | null;
  state: VoiceTurnState;
  listener: ((a: VoiceAction) => void) | null;
  /** Who else follows the conversation: the three (the mascot), a pane drawn while it runs. */
  watchers: Set<(a: VoiceAction) => void>;
  /** Which start is the current one; an end moves it on, and a start that finds itself behind closes what it opened. */
  generation: number;
  /** Why the last end came, for a start that lands after it and must end the row it opened with the same word. */
  stopped: VoiceEndReason | null;
  /** A start in flight, so a second press while connecting waits on the first and opens nothing of its own. */
  pending: Promise<VoiceUp | null> | null;
  /** The idle clock: a minute from the last question or answer to the end. */
  idle: unknown;
  /** The agent's voice held down while the person holds the mic; applied to a connection that lands meanwhile. */
  hushed: boolean;
  /** A question sent whose answer has not landed: the vendor's own silent turns, which nobody asked, are told apart by it. */
  asked: boolean;
  /** The agent is speaking now (its mode), which outlasts the answer's landing by as long as the speech is. */
  speaking: boolean;
}

/** What the verbs are given: the line, the deps, and the two clocks and loaders resolved once. */
interface World {
  line: Line;
  deps: VoiceDeps;
  load: () => Promise<Client>;
  now: () => number;
  timer: VoiceTimer;
}

/** An event of the vendor's heard: reduced to the Line's actions, each told to the starter and to every watcher. */
const hear = (line: Line, ev: VoiceEvent) => {
  if (!line.listener && line.watchers.size === 0) return;
  const r = reduceVoiceEvent(line.state, ev);
  line.state = r.state;
  toldToAll(line, r.actions);
};
const toldToAll = (line: Line, actions: VoiceAction[]) => {
  for (const a of actions) {
    if (line.listener) line.listener(a);
    for (const w of line.watchers) w(a);
  }
};

const forget = (w: World) => {
  const { line } = w;
  if (line.idle != null) w.timer.clear(line.idle);
  line.idle = null;
  line.conv = null;
  line.session = null;
  line.threadId = null;
  line.clock = null;
  line.listener = null;
  line.hushed = false;
  line.asked = false;
  line.speaking = false;
  line.state = VOICE_TURN_START;
};

/** In use: the person holds the mic, an answer is on its way, or the agent speaks. */
const inUse = (line: Line): boolean => line.hushed || line.asked || line.speaking;

/**
 * The idle clock wound again: from a connection, a question, or the end of an answer's speech, a minute to the end.
 * A minute that runs out on a session in use runs again instead.
 */
const armIdle = (w: World) => {
  const { line } = w;
  if (line.idle != null) w.timer.clear(line.idle);
  line.idle = w.timer.set(() => {
    line.idle = null;
    if (!line.conv) return;
    if (inUse(line)) armIdle(w);
    else void stopVoice(w, "idle");
  }, ASK_VOICE_IDLE_MS);
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
  forget(w);
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
      const was = line.speaking;
      line.speaking = p.mode === "speaking";
      // The speech is over: the idle clock runs from here.
      if (was && !line.speaking && !line.asked) armIdle(w);
      hear(line, { kind: "mode", payload: p });
    },
    onIncomingEvent: (e: { type?: string }) => {
      if (!live()) return;
      if (e.type === "agent_response_complete") {
        // A turn nobody asked for is the vendor's own re-engage, answered with nothing: not an answer, so the Line
        // hears nothing of it and the minute keeps running.
        if (!line.asked) return;
        line.asked = false;
        armIdle(w);
      }
      hear(line, { kind: "event", payload: e });
    },
    onDisconnect: (d) => {
      if (!live()) return;
      hear(line, { kind: "disconnect", payload: d });
      const ended = line.session;
      forget(w);
      // The far side ended it (the vendor's limit, a dropped connection): the row says so.
      endRow(w, ended, "vendor", measured);
    },
  };
}

/** The connection up: the microphone muted (the hold is the one mic), the voice held down if the person still holds, the idle clock wound. */
function settle(w: World, c: Conversation) {
  const { line } = w;
  try {
    c.setMicMuted(true);
  } catch {
    /* a client without a microphone to mute */
  }
  if (line.hushed) hush(c, true);
  armIdle(w);
}

const hush = (c: Conversation, on: boolean) => {
  try {
    c.setVolume({ volume: on ? 0 : 1 });
  } catch {
    /* a client without an output to hold */
  }
};

/**
 * A session begun: the row, the vendor's client, the connection. Null when it was ended before it was up (nothing of
 * it is left running), else the thread it is on.
 */
async function startVoice(w: World, input: VoiceStart, on: (a: VoiceAction) => void): Promise<VoiceUp | null> {
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
      forget(w);
      on({ t: "gone", reason: "start" });
    }
    throw e;
  }
  const { Conversation } = await w.load();
  if (mine !== line.generation) {
    // Ended between the mint and the client's load: the end found no session yet, so the row is ended here, with the
    // end's own word.
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
      forget(w);
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
  line.threadId = started.thread_id;
  settle(w, c);
  return { threadId: started.thread_id, title: started.title };
}

/** The session running, when it is the one this hold is for (its thread, or the Line has none yet): now this hold's to hear. */
function running(line: Line, input: VoiceStart, on: (a: VoiceAction) => void): VoiceUp | null {
  if (!line.conv || !line.threadId) return null;
  if (input.threadId != null && input.threadId !== line.threadId) return null;
  line.listener = on;
  return { threadId: line.threadId, title: "" };
}

/**
 * The session a hold needs: the one running when it is on this thread (or the Line has none yet), else a new one in
 * its place; a start already in flight is waited on, never doubled. Null when it could not come up (the mint refused,
 * the microphone denied, ended meanwhile): the Line said why if it was told, and the words go the typed way.
 */
function ensureVoice(w: World, input: VoiceStart, on: (a: VoiceAction) => void): Promise<VoiceUp | null> {
  const { line } = w;
  const up = running(line, input, on);
  if (up) return Promise.resolve(up);
  if (line.pending) return line.pending;
  const p = startVoice(w, input, on)
    .catch(() => null)
    .finally(() => {
      if (line.pending === p) line.pending = null;
    });
  line.pending = p;
  return p;
}

export function installVoice(win: Window, deps: VoiceDeps) {
  const line: Line = {
    conv: null,
    session: null,
    threadId: null,
    clock: null,
    state: VOICE_TURN_START,
    listener: null,
    watchers: new Set(),
    generation: 0,
    stopped: null,
    pending: null,
    idle: null,
    hushed: false,
    asked: false,
    speaking: false,
  };
  const w: World = {
    line,
    deps,
    load: deps.load ?? (() => import("@elevenlabs/client")),
    now: deps.now ?? (() => Date.now()),
    timer: deps.timer ?? {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    },
  };
  return {
    /** The device can talk with Ask: a microphone, on a secure page. */
    canVoice: (): boolean => !!(win.isSecureContext && win.navigator?.mediaDevices?.getUserMedia),
    /** Whether a session runs now (connected), as against one connecting or none. */
    voiceUp: (): boolean => !!line.conv,
    /** Whether a start is in flight: the press has landed and the connection is not up yet. */
    voiceConnecting: (): boolean => !line.conv && line.clock !== null,
    /** The thread the running session is on, for the Line to open as the words go. */
    voiceThread: (): string | null => line.threadId,
    ensureVoice: (input: VoiceStart, on: (a: VoiceAction) => void) => ensureVoice(w, input, on),
    /**
     * The session, if it is up within the lift's patience (ASK_VOICE_UP_WAIT_MS): the one running, or the one still
     * connecting from the press. Null past the wait, and the start goes on for the next hold. The lift opens nothing
     * of its own: a press that was refused is not asked for again (one hold, one mint), and the words go the typed way.
     */
    soonVoice: (input: VoiceStart, on: (a: VoiceAction) => void): Promise<VoiceUp | null> => {
      const up = running(line, input, on);
      if (up) return Promise.resolve(up);
      const coming = line.pending;
      if (!coming) return Promise.resolve(null);
      return new Promise((resolve) => {
        const late = w.timer.set(() => resolve(null), ASK_VOICE_UP_WAIT_MS);
        void coming.then((landed) => {
          w.timer.clear(late);
          resolve(landed);
        });
      });
    },
    /**
     * The words heard, as the person's turn: the Line hears the question at once (the vendor sends no transcript of a
     * text turn), the agent answers aloud, and the idle clock is wound. False with no session up, or when the
     * connection would not take the words (gone, and not yet said so): they go the typed way, and nothing is drawn.
     */
    sayVoice: (text: string): boolean => {
      const words = text.trim();
      if (!line.conv || !words) return false;
      try {
        line.conv.sendUserMessage(words);
      } catch {
        return false;
      }
      line.asked = true;
      line.state = VOICE_TURN_START;
      toldToAll(line, [{ t: "question", text: words }]);
      armIdle(w);
      return true;
    },
    /**
     * Whether the agent has the floor: an answer on its way, or being spoken. A clip read aloud meanwhile takes its
     * place (ask.ts: one voice at a time); a session up and quiet is in no clip's way and is left running.
     */
    voiceBusy: (): boolean => !!line.conv && (line.asked || line.speaking),
    /** While the person holds the mic the agent's voice is held down; let go, it is back. Kept for a connection still landing. */
    hushVoice: (on: boolean): void => {
      line.hushed = on;
      if (line.conv) hush(line.conv, on);
    },
    /** The person ends it (Clear, typing, the Line closing), it idles out, or another use of the voice takes its place. */
    stopVoice: (reason: VoiceStopReason = "button") => stopVoice(w, reason),
    /**
     * Follow the session that runs, from outside the hold that began it: the three, a pane drawn while the agent
     * speaks, hear the end as the Line does. Answers the stop. A watcher never ends the session: it is the member's,
     * not the pane's (seen on production, 4 Oct 2026, when a pane's unmount hung up every call).
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

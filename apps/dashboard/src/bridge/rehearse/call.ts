/**
 * A rehearsal's call in the browser (decision 0069, R2): the vendor's web client (retell-client-js-sdk 3.0.3), loaded on
 * the press as a chunk of its own, joined to a call our edge made. This is the one module that imports it.
 *
 * The client asks for its call with one request (POST /v3/create-web-call), which is routed here to our own route
 * instead (POST receptionist/rehearsals, through `start`): the edge holds the provider's key, makes the call with the
 * receptionist as it stands, counts its free minutes, and answers the token the client joins with. So no key reaches
 * the browser, and the client's own transcript stream (which would need one) is never opened: the page reads the
 * rehearsal's words from our webhook's writes instead. Every other request the client could make (a call stopped while
 * its start was in flight) answers nothing: a call nobody joins lapses at the provider, and is never counted.
 *
 * What the page hears: the call connecting, live and ended; why it ended; whether the agent is speaking; and a failure,
 * told apart as the microphone refused (the person can allow it, or type) or the call not made (the route's own words
 * where it gave some).
 *
 * A call only listened to (startListen; decision 0079, a lead's preview hearing its greeting) is the same client joined
 * receive-only: the browser is asked for no microphone, the greeting plays, and the page leaves once the voice has gone
 * quiet. The client tells a page nothing of when the agent stops speaking on this transport (proven on two calls, 18
 * November 2026), so the voice's own level is what is read.
 */
type Client = typeof import("retell-client-js-sdk");
type Session = ReturnType<InstanceType<Client["RetellClient"]>["createWebCall"]>;

/** What our route answers a start with: the call the client joins, and the rehearsal it is. */
export interface CallStarted {
  rehearsal_id: string;
  call: {
    call_id: string;
    access_token: string;
    transport: string | null;
    ice_servers: unknown[];
    expires_at: number | null;
  };
}

export type CallStatus = "connecting" | "live" | "ended";

export interface CallHooks {
  /** The rehearsal the call is, as soon as our route said it. */
  onStarted(started: CallStarted): void;
  onStatus(status: CallStatus): void;
  /** Why it ended, in the provider's word, when it said. */
  onEnd(reason: string | null): void;
  /** `mic`: the browser refused the microphone. `refused`: our route said no, in `words`. `failed`: anything else. */
  onError(kind: "mic" | "refused" | "failed", words: string | null): void;
  /** The agent started or stopped speaking, where a page shows whose turn it is. */
  onTalking?(talking: boolean): void;
  /**
   * How loud the receptionist's voice is as it speaks, from 0 to 1, many times a second. The call's audio is asked for
   * only by a page that takes this, since reading it costs the browser work.
   */
  onLevel?(level: number): void;
}

/** What a speaking voice's loudness is multiplied by, so it stands near the top of 0 to 1 and a pause near the foot. */
const VOICE_GAIN = 4;

/** A stretch of the voice as how loud it is, from 0 to 1: the root mean square of its samples, lifted. */
export function voiceLevelOf(samples: Float32Array): number {
  if (!samples.length) return 0;
  let squares = 0;
  for (const sample of samples) squares += sample * sample;
  return Math.min(1, Math.sqrt(squares / samples.length) * VOICE_GAIN);
}

/** A call under way: muted or not, and ended by the person. */
export interface CallSession {
  mute(on: boolean): void;
  end(): void;
}

/** The start our route makes: the call, or its refusal's words. */
export type StartCall = () => Promise<{ ok: true; started: CallStarted } | { ok: false; message: string }>;

/** The client's module, loaded once on the first press. A test hands in its own. */
let load: () => Promise<Client> = () => import("retell-client-js-sdk");

/** For tests: the client module the next call loads (null puts the real one back). */
export function setCallClient(f: (() => Promise<Client>) | null): void {
  load = f ?? (() => import("retell-client-js-sdk"));
}

/** Whether a failure is the microphone refused: the browser's own name for it, or the client's words. */
const micRefused = (e: unknown): boolean => {
  const name = (e as { name?: unknown } | null)?.name;
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return name === "NotAllowedError" || name === "SecurityError" || /permission|microphone|notallowed/i.test(msg);
};

/** The one request the client makes, answered by our route: its answer in the provider's shape, or its refusal. */
function proxyFetch(
  start: StartCall,
  hooks: Pick<CallHooks, "onStarted">,
  refused: { words: string | null },
): typeof fetch {
  return async (input) => {
    const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
    if (!url.endsWith("/v3/create-web-call")) return new Response(null, { status: 204 });
    const r = await start();
    if (!r.ok) {
      refused.words = r.message;
      return new Response(JSON.stringify({ message: r.message }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }
    hooks.onStarted(r.started);
    return new Response(JSON.stringify(r.started.call), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
}

/**
 * Start a call: from a press, since the microphone's prompt happens here. Null when the client could not be loaded
 * (told as `failed`). The session's hooks fire in the order the call goes: started, connecting, live, then its end.
 */
export async function startCall(start: StartCall, hooks: CallHooks): Promise<CallSession | null> {
  let client: Client;
  try {
    client = await load();
  } catch {
    hooks.onError("failed", null);
    return null;
  }
  const refused: { words: string | null } = { words: null };
  // The key is never used: every request the client makes is answered by proxyFetch.
  const rc = new client.RetellClient({ key: "rehearsal", fetch: proxyFetch(start, hooks, refused) });
  let session: Session;
  try {
    session = rc.createWebCall({
      // The agent is the workspace's, chosen by the edge: the client's own field is required, and not read by our route.
      agent_id: "rehearsal",
      // The voice's audio, asked for only where a page draws how loud it is.
      ...(hooks.onLevel ? { audio: { emitRawAudioSamples: true } } : {}),
      hooks: {
        ...(hooks.onLevel ? { onAudio: (samples: Float32Array) => hooks.onLevel?.(voiceLevelOf(samples)) } : {}),
        onStatus: (s) => hooks.onStatus(s === "live" ? "live" : s === "ended" ? "ended" : "connecting"),
        onEnd: (e) => hooks.onEnd((e as { disconnection_reason?: string } | undefined)?.disconnection_reason ?? null),
        onAgentStartTalking: () => hooks.onTalking?.(true),
        onAgentStopTalking: () => hooks.onTalking?.(false),
        onError: (e) => {
          if (refused.words) hooks.onError("refused", refused.words);
          else hooks.onError(micRefused(e) ? "mic" : "failed", null);
        },
      },
    });
  } catch (e) {
    hooks.onError(micRefused(e) ? "mic" : "failed", null);
    return null;
  }
  return {
    mute: (on) => (on ? session.mute() : session.unmute()),
    end: () => {
      void session.end();
    },
  };
}

/* ------------------------------------------------------------------------------ a call only listened to -- */

/** A level over this (the client's own measure of the voice, 0 to 1) is the voice: a quiet line reads under it. */
const VOICE_HEARD = 0.01;
/** How often the voice is read while a listen plays: on a timer, since a page nobody is looking at is given no frames. */
const LISTEN_READ_MS = 50;
/** The greeting is over once the voice has been quiet this long: the longest pause inside one was half a second. */
const LISTEN_QUIET_MS = 1_200;
/**
 * How long a listen plays where its voice cannot be read at all (a browser that gives the client no level): about a
 * greeting's length, and short of the line asking whether anyone is there.
 */
const LISTEN_UNREAD_MS = 9_000;
/** The longest any listen plays. */
const LISTEN_MOST_MS = 20_000;

/**
 * Whether a listen is over, `at` ms into the call, its voice last read at `lastAt` (null: never): once the voice has
 * been quiet a little over a second; by the clock where no voice was ever read; and at its longest whatever is heard.
 */
function listenOver(at: number, lastAt: number | null): boolean {
  if (at > LISTEN_MOST_MS) return true;
  return lastAt === null ? at > LISTEN_UNREAD_MS : at - lastAt > LISTEN_QUIET_MS;
}

/** A listen under way: left by the person, or by the page going. */
export interface ListenSession {
  end(): void;
}

/**
 * A call only listened to: joined receive-only, so the browser asks for no microphone, and left by itself once the
 * greeting has been said (listenOver). `onDone` is told once, with whether it was played: false where the call was not
 * made, could not be joined, or the browser refused to play it, which a page answers with the voice's sample instead.
 * Null when the client could not be loaded or the join failed at once (told as not played).
 */
export async function startListen(start: StartCall, onDone: (played: boolean) => void): Promise<ListenSession | null> {
  let client: Client;
  try {
    client = await load();
  } catch {
    onDone(false);
    return null;
  }
  const rc = new client.RetellClient({
    key: "rehearsal",
    fetch: proxyFetch(start, { onStarted() {} }, { words: null }),
  });
  let session: Session | null = null;
  let reading: ReturnType<typeof setInterval> | null = null;
  let done = false;
  const finish = (played: boolean) => {
    if (done) return;
    done = true;
    if (reading) clearInterval(reading);
    void session?.end();
    onDone(played);
  };
  const live = () => {
    if (reading || done) return;
    const since = Date.now();
    let lastAt: number | null = null;
    // A browser that refuses to play it leaves a greeting nobody hears: said at once, so the page plays the sample.
    session?.startAudioPlayback().catch(() => finish(false));
    reading = setInterval(() => {
      const at = Date.now() - since;
      if ((session?.analyzerComponent?.calculateVolume() ?? 0) > VOICE_HEARD) lastAt = at;
      if (listenOver(at, lastAt)) finish(true);
    }, LISTEN_READ_MS);
  };
  // The client's receive-only switch (its transport's `listener`) is not among the options it lists for a caller's own
  // join, and reaches the transport with them all the same. Held in a value of its own, so the join stays typed as the
  // client types it; tests/previews/preview-listen.test.mjs holds that it is asked for.
  const audio = { emitRawAudioSamples: true, listener: true };
  try {
    session = rc.createWebCall({
      agent_id: "rehearsal",
      audio,
      hooks: {
        onStatus: (s) => {
          if (s === "live") live();
        },
        // An end before the call was live is a call nobody heard; one after it is the greeting's own.
        onEnd: () => finish(reading !== null),
        onError: () => finish(false),
      },
    });
  } catch {
    finish(false);
    return null;
  }
  return { end: () => finish(reading !== null) };
}

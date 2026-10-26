/**
 * A rehearsal's call in the browser (decision 0069, R2): the vendor's web client (retell-client-js-sdk 3.0.2), loaded on
 * the press as a chunk of its own, joined to a call our edge made. This is the one module that imports it.
 *
 * The client asks for its call with one request (POST /v3/create-web-call), which is routed here to our own route
 * instead (POST receptionist/rehearsals, through `start`): the edge holds the provider's key, makes the call with the
 * receptionist as it stands, counts its free minutes, and answers the token the client joins with. So no key reaches
 * the browser, and the client's own transcript stream (which would need one) is never opened: the page reads the
 * rehearsal's words from our webhook's writes instead. Every other request the client could make (a call stopped while
 * its start was in flight) answers nothing: a call nobody joins lapses at the provider, and is never counted.
 *
 * What the page hears: the call connecting, live and ended; why it ended; and a failure, told apart as the microphone
 * refused (the person can allow it, or type) or the call not made (the route's own words where it gave some).
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
function proxyFetch(start: StartCall, hooks: CallHooks, refused: { words: string | null }): typeof fetch {
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
      hooks: {
        onStatus: (s) => hooks.onStatus(s === "live" ? "live" : s === "ended" ? "ended" : "connecting"),
        onEnd: (e) => hooks.onEnd((e as { disconnection_reason?: string } | undefined)?.disconnection_reason ?? null),
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

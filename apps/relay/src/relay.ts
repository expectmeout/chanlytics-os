/**
 * The relay (footage sources, plan v4, "Taking a file in"): one clip of a business's Google Drive, answered to whoever holds
 * its ticket, so Cloudflare Stream fetches a video by its address and the bytes never pass through the app. Stream needs an
 * address that answers HEAD and range GET requests; Drive needs a key in a header. This stands between the two and holds
 * nothing: for each request it reads the ticket, trades it at the app's key door for an hour's key to that one file, asks
 * Drive, and passes Drive's bytes and Drive's refusals straight through.
 *
 *   GET|HEAD /clip/<item>?ticket=<ticket>            (and /clip/<item>/clip.<ext>, for a fetcher that reads a type off a name)
 *
 * It writes nothing to a log: an address carries a ticket, and a key must never be written anywhere. Drive's own words for
 * a refusal can name the file, so only its status and its one-word reason are passed on.
 */
import { readTicket } from "./ticket";
import { isJsonObject } from "./wire";

/** What the Worker is set up with: the two secrets, and where the app's key door is. */
export interface RelayEnv {
  /** The ticket's key: what the app signs a ticket with. A secret. */
  TICKET_KEY: string;
  /** The app's key: what the relay knocks on the key door with. A secret. */
  KEY_DOOR_SECRET: string;
  /** The app's key door: where a ticket is traded for an hour's Drive key. */
  KEY_DOOR_URL: string;
  /** Drive's API; Google's own where unset. Named only by a rehearsal against a stand-in. */
  DRIVE_API?: string;
}

export type RelayFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** What the relay reaches the world by: a test hands it a fetch that answers from memory, and a clock. */
interface RelayDeps {
  fetch: RelayFetch;
  nowMs: () => number;
}

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
/** How long the key door has to begin its answer: it reads one row and, at most, asks Google for a key. */
const KEY_DOOR_TRY_MS = 10_000;
/** How long Drive has to begin its answer. Once it has begun, the bytes have no bound: a large clip takes what it takes. */
const DRIVE_TRY_MS = 30_000;
/** How much of a refusal is read for its reason: Drive's are a few hundred bytes. */
const REFUSAL_CHARS_MAX = 4_096;
const CLIP_PATH = /^\/clip\/([A-Za-z0-9_-]{1,128})(?:\/clip\.[a-z0-9]{1,5})?$/;
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** One range, as Stream and every player ask it; a list of ranges is refused. */
const ONE_RANGE = /^bytes=(?:\d+-\d*|-\d+)$/;
const REASON = /^[A-Za-z_]{1,64}$/;

// Called through a wrapper: in a Worker the global fetch refuses to be called as another object's method.
const DEPS: RelayDeps = { fetch: (input, init) => fetch(input, init), nowMs: () => Date.now() };

/**
 * An answer begun within `ms`, or null. The bound ends when the answer's first line comes: a signal that outlived it would
 * cut a download's bytes off mid-way, since stopping a fetch stops its body too.
 */
async function askWithin(deps: RelayDeps, url: string, init: RequestInit, ms: number): Promise<Response | null> {
  const stop = new AbortController();
  const bound = setTimeout(() => stop.abort(), ms);
  try {
    return await deps.fetch(url, { ...init, signal: stop.signal });
  } catch {
    // No answer in time, or none at all: the caller says whose silence it was.
    return null;
  } finally {
    clearTimeout(bound);
  }
}

/** A refusal: its status, whose it is and why in one word, and no body where the question was a HEAD. */
function relayRefusal(
  head: boolean,
  status: number,
  refusal: { error: "request" | "ticket" | "key_door" | "drive"; reason: string },
  headers: Record<string, string> = {},
): Response {
  return new Response(head ? null : JSON.stringify(refusal), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/** Drive's own reason for a refusal (`userRateLimitExceeded`, `notFound`), one word; never its sentence, which can name a file. */
async function driveReasonOf(reply: Response): Promise<string> {
  // A refusal with no body, or one cut short, still has its status: the reason is then unknown.
  const text = (await reply.text().catch(() => "")).slice(0, REFUSAL_CHARS_MAX);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON (a proxy's page, an empty body): the status alone is passed on.
    return "unknown";
  }
  const error = isJsonObject(parsed) && isJsonObject(parsed.error) ? parsed.error : null;
  const listed: unknown = Array.isArray(error?.errors) ? error.errors[0] : null;
  const reason = isJsonObject(listed) ? listed.reason : error?.status;
  return typeof reason === "string" && REASON.test(reason) ? reason : "unknown";
}

/** Drive said no: its status as it is, its reason in one word, and how long to rest where it says. */
async function refuseAsDrive(head: boolean, reply: Response): Promise<Response> {
  const rest = reply.headers.get("retry-after");
  return relayRefusal(
    head,
    reply.status,
    { error: "drive", reason: await driveReasonOf(reply) },
    rest ? { "retry-after": rest } : {},
  );
}

type Key = { ok: true; accessToken: string; fileId: string } | { ok: false; refusal: Response };

/**
 * The ticket traded for an hour's key to its one file. The door is told what is being asked (the method and the range), so
 * the app can count each download against the day's units where they are spent.
 */
async function askKeyDoor(
  env: RelayEnv,
  ask: { ticket: string; method: string; range: string | null; head: boolean },
  deps: RelayDeps,
): Promise<Key> {
  const no = (status: number, reason: string, headers?: Record<string, string>): Key => ({
    ok: false,
    refusal: relayRefusal(ask.head, status, { error: "key_door", reason }, headers),
  });
  const reply = await askWithin(
    deps,
    env.KEY_DOOR_URL,
    {
      method: "POST",
      headers: { authorization: `Bearer ${env.KEY_DOOR_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ ticket: ask.ticket, method: ask.method, range: ask.range }),
    },
    KEY_DOOR_TRY_MS,
  );
  if (!reply) return no(502, "unreachable");
  if (reply.status === 429 || reply.status === 503) {
    const rest = reply.headers.get("retry-after");
    return no(reply.status, "rest", rest ? { "retry-after": rest } : undefined);
  }
  if (reply.status === 403 || reply.status === 404) return no(403, "refused");
  if (!reply.ok) return no(502, "failed");
  // An answer that is not JSON names no key.
  const parsed: unknown = await reply.json().catch(() => null);
  if (!isJsonObject(parsed) || typeof parsed.access_token !== "string" || !parsed.access_token)
    return no(502, "no_key");
  if (typeof parsed.file_id !== "string" || !DRIVE_FILE_ID.test(parsed.file_id)) return no(502, "no_file");
  return { ok: true, accessToken: parsed.access_token, fileId: parsed.file_id };
}

type DriveKey = { accessToken: string; fileId: string };

/** Drive asked for one file, under the hour's key: its record, or its bytes for a range. Null where it did not answer. */
function askDrive(
  env: RelayEnv,
  key: DriveKey,
  ask: { query: string; range: string | null },
  deps: RelayDeps,
): Promise<Response | null> {
  const api = (env.DRIVE_API || GOOGLE_DRIVE_API).replace(/\/+$/, "");
  return askWithin(
    deps,
    `${api}/files/${encodeURIComponent(key.fileId)}?${ask.query}&supportsAllDrives=true`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${key.accessToken}`, ...(ask.range ? { range: ask.range } : {}) },
    },
    DRIVE_TRY_MS,
  );
}

/** A HEAD: the file's size and type, from its record (5 of Google's units, where a download is 200). */
async function answerHead(env: RelayEnv, key: DriveKey, deps: RelayDeps): Promise<Response> {
  const reply = await askDrive(env, key, { query: "fields=size,mimeType", range: null }, deps);
  if (!reply) return relayRefusal(true, 502, { error: "drive", reason: "unreachable" });
  if (!reply.ok) return refuseAsDrive(true, reply);
  const record: unknown = await reply.json().catch(() => null);
  const size =
    isJsonObject(record) && typeof record.size === "string" && /^\d+$/.test(record.size) ? record.size : null;
  // A record with no size is a Google document, not a file with bytes: nothing here can be fetched.
  if (!size) return relayRefusal(true, 502, { error: "drive", reason: "no_size" });
  const type =
    isJsonObject(record) && typeof record.mimeType === "string" ? record.mimeType : "application/octet-stream";
  return new Response(null, {
    status: 200,
    headers: { "content-type": type, "content-length": size, "accept-ranges": "bytes", "cache-control": "no-store" },
  });
}

/** A GET: Drive's bytes for the range asked, its status and its lengths as Drive gave them, the body never held. */
async function answerGet(env: RelayEnv, key: DriveKey, range: string | null, deps: RelayDeps): Promise<Response> {
  const reply = await askDrive(env, key, { query: "alt=media", range }, deps);
  if (!reply) return relayRefusal(false, 502, { error: "drive", reason: "unreachable" });
  if (reply.status !== 200 && reply.status !== 206) return refuseAsDrive(false, reply);
  const headers = new Headers({ "accept-ranges": "bytes", "cache-control": "no-store" });
  for (const name of ["content-type", "content-length", "content-range"]) {
    const value = reply.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(reply.body, { status: reply.status, headers });
}

/** One request answered: the ticket read, the key asked for, Drive asked, and Drive's answer passed on. */
export async function answerRelay(request: Request, env: RelayEnv, deps: RelayDeps = DEPS): Promise<Response> {
  const head = request.method === "HEAD";
  if (request.method !== "GET" && !head)
    return relayRefusal(false, 405, { error: "request", reason: "method" }, { allow: "GET, HEAD" });
  const url = new URL(request.url);
  const item = CLIP_PATH.exec(url.pathname)?.[1];
  if (!item) return relayRefusal(head, 404, { error: "request", reason: "path" });
  const ticket = url.searchParams.get("ticket");
  const read = await readTicket(env.TICKET_KEY, ticket, deps.nowMs());
  if (!read.ok || !ticket)
    return relayRefusal(head, 403, { error: "ticket", reason: read.ok ? "malformed" : read.reason });
  if (read.item !== item) return relayRefusal(head, 403, { error: "ticket", reason: "other_file" });
  const range = head ? null : request.headers.get("range");
  if (range !== null && !ONE_RANGE.test(range)) return relayRefusal(false, 416, { error: "request", reason: "range" });
  const key = await askKeyDoor(env, { ticket, method: request.method, range, head }, deps);
  if (!key.ok) return key.refusal;
  return head ? answerHead(env, key, deps) : answerGet(env, key, range, deps);
}

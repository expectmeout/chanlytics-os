/**
 * The shelf (the archive plan's B2): a private bucket where a video Chanlytics made keeps a copy of its own, so its
 * copy at the video platform can be let go and fetched again from here. The relay stands in front of it as it stands in
 * front of a business's Drive: the bucket has no public address, and its bytes leave only under a ticket the app signed.
 *
 *   HEAD   /shelf/<file>/video?ticket=<read>     what the shelf holds of the file: its size and its SHA-256
 *   GET    the same (and /video.<ext>)           its bytes, whole or one range of them: what the video platform fetches
 *   POST   /shelf/<file>/video                   pull the file in from `{ "from": "<address>" }`, held to the ticket's bytes
 *   DELETE /shelf/<file>/video                   take it off the shelf
 *   GET    /shelf/list[?cursor=<from the last>]  the files one workspace's shelf holds, a page at a time
 *
 * A read's ticket rides the address, since the video platform is handed one; a put's, a delete's and a list's ride the
 * `authorization` header and never an address. A list's ticket names a workspace and no file, and the list is of that
 * workspace's keys alone: the app compares it with its own rows, so nothing sits on the shelf that no row names. The ticket is the shelf's own (./ticket.ts `readShelfTicket`): it names
 * the workspace and the file, and the object's key is built from those two and from nothing a request says, so a
 * ticket for one workspace's file reaches no other's. A put's ticket names the very bytes: their size, and the SHA-256
 * the bucket itself holds the upload to, so only that file's own bytes can ever sit under its key.
 *
 * A file is pulled, never pushed: a Worker's incoming body is bounded by the zone's plan, and the app would hold the
 * bytes twice. The address pulled from must begin as one of the Worker's allowed addresses does, whole. A pull's pipe is
 * cut a minute after it began, so a put has ended by then, stored whole or not at all, and nothing can arrive later.
 *
 * Like the clip's road beside it, this holds nothing between requests and writes nothing to a log.
 */
import { askWithin, relayRefusal, type RelayFetch } from "./relay";
import { readShelfTicket, type ShelfClaim, type ShelfUse } from "./ticket";
import { isJsonObject } from "./wire";

/** What the shelf holds of one file, as the bucket says it. */
interface ShelfObject {
  size: number;
  httpEtag: string;
  checksums: { sha256?: ArrayBuffer };
}

/** The few things the relay asks of an R2 bucket, declared here since a Worker of ours installs nothing. */
export interface ShelfBucket {
  head(key: string): Promise<ShelfObject | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length?: number } },
  ): Promise<(ShelfObject & { body: ReadableStream }) | null>;
  put(
    key: string,
    value: ReadableStream,
    options: { sha256: string; httpMetadata: { contentType: string } },
  ): Promise<ShelfObject>;
  delete(key: string): Promise<void>;
  /** The keys that begin with `prefix`, in order, a page at a time: `cursor` is there only where `truncated` is. */
  list(options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

/** What the Worker is set up with for the shelf: the ticket's key, its bucket, and where a file may be pulled from. */
export interface ShelfEnv {
  /** The ticket's key, the same one a clip's ticket is signed with. A secret. */
  TICKET_KEY: string;
  /** The bucket, bound by name in wrangler.toml. A Worker bound to none has no shelf. */
  SHELF?: ShelfBucket;
  /** The addresses a pull may begin with, comma-separated: each https, a host with no port, and the path's start. */
  SHELF_FROM?: string;
}

/** What the shelf reaches the world by: a test hands it a fetch, a clock, and the two things below from memory. */
interface ShelfDeps {
  fetch: RelayFetch;
  nowMs: () => number;
  /** A stream that lets exactly this many bytes through and breaks on any other count: what a put's length is known by. */
  fixedLength: (bytes: number) => TransformStream<Uint8Array, Uint8Array>;
  /** `run` called once `ms` on, unless what this answers is called first. */
  after: (ms: number, run: () => void) => () => void;
}

/** Workers' own stream of a known length; R2 takes a stream only where its length is known. */
declare const FixedLengthStream: new (length: number) => TransformStream<Uint8Array, Uint8Array>;

// Each called through a wrapper: in a Worker a global refuses to be called as another object's method.
const DEPS: ShelfDeps = {
  fetch: (input, init) => fetch(input, init),
  nowMs: () => Date.now(),
  fixedLength: (bytes) => new FixedLengthStream(bytes),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

const SHELF_PATH = /^\/shelf\/([A-Za-z0-9_-]{1,128})\/video(?:\.[a-z0-9]{1,5})?$/;
/** Where a workspace's shelf is listed: no file's path, since every file's ends in `/video`. */
const LIST_PATH = "/shelf/list";
/** What each method needs its ticket to say. */
const USE_OF: Record<string, ShelfUse> = { GET: "read", HEAD: "read", POST: "put", DELETE: "delete" };
const METHODS = "GET, HEAD, POST, DELETE";
/** A file's key, past its workspace's prefix: what a list names. Any other key under the prefix is only counted. */
const KEY_IN_A_WORKSPACE = /^([A-Za-z0-9_-]{1,128})\/video$/;
/** How many keys one page of a list names: the most the bucket gives at once. */
const LIST_PAGE = 1_000;
/** The longest cursor a list is handed back: the bucket's own token, passed on as it came. */
const CURSOR_CHARS_MAX = 2_048;
/** Everything the shelf holds is a video as Chanlytics plays one. */
const VIDEO_TYPE = "video/mp4";
/** The most one video weighs: the app's own number (contracts FILE_VIDEO_BYTES_MAX), written here since nothing of ours is imported. */
const VIDEO_BYTES_MAX = 500_000_000;
/** How much of a pull's request is read: an address, and nothing else. */
const PULL_BODY_CHARS_MAX = 4_096;
/** A second, in ms: the relay imports nothing of ours, so contracts' SECOND_MS is not reached from here. */
const SECOND_MS = 1_000;
/** How long the place a file is pulled from has to begin its answer. */
const SOURCE_TRY_MS = 30_000;
/** How long a pull may run in all: its pipe is cut then, so no put ends later than this after it began. */
const PULL_MOST_MS = 60 * SECOND_MS;
/** An allowed start for a pull: https, a whole host, and at least the path's first "/". */
const HOST_AND_PATH = /^https:\/\/[^/?#\s]+\//;
/** R2's own code for bytes that are not the ones their checksum names, at the end of its error's message. */
const R2_BAD_DIGEST = /\(10037\)$/;

const NEVER_STORED = { "cache-control": "no-store" };

function sumHexOf(bytes: ArrayBuffer | undefined): string | null {
  if (!bytes) return null;
  let hex = "";
  for (const byte of new Uint8Array(bytes)) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** The bytes a `Range` header asks for of a file this long: where they begin and how many; null where it names none. */
function bytesAskedOf(range: string, size: number): { from: number; length: number } | null {
  const tail = /^bytes=-(\d+)$/.exec(range);
  if (tail) {
    const wanted = Number(tail[1]);
    const from = Math.max(size - wanted, 0);
    return wanted > 0 && size > 0 ? { from, length: size - from } : null;
  }
  const span = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!span) return null;
  const from = Number(span[1]);
  const to = span[2] ? Math.min(Number(span[2]), size - 1) : size - 1;
  return from < size && to >= from ? { from, length: to - from + 1 } : null;
}

/** What every answer about a held file says of it. */
function heldHeaders(held: ShelfObject): Record<string, string> {
  const sha256 = sumHexOf(held.checksums.sha256);
  return {
    "content-type": VIDEO_TYPE,
    "accept-ranges": "bytes",
    etag: held.httpEtag,
    ...(sha256 ? { "x-shelf-sha256": sha256 } : {}),
    ...NEVER_STORED,
  };
}

/**
 * The shelf holds nothing of the file. Said in a header too, since a HEAD's answer has no body: whoever asks can tell
 * "nothing is there" from a 404 of any other making (a path this Worker does not know, a relay older than the shelf).
 */
const holdsNone = (head: boolean): Response =>
  relayRefusal(head, 404, { error: "shelf", reason: "not_found" }, { "x-shelf": "none" });

/** A HEAD or a GET: what the shelf holds of the file, and for a GET its bytes, whole or the one range asked. */
async function answerRead(bucket: ShelfBucket, key: string, request: Request, head: boolean): Promise<Response> {
  const held = await bucket.head(key);
  if (!held) return holdsNone(head);
  const headers = heldHeaders(held);
  if (head) return new Response(null, { status: 200, headers: { ...headers, "content-length": String(held.size) } });
  const range = request.headers.get("range");
  if (range === null) {
    const whole = await bucket.get(key);
    if (!whole) return holdsNone(false);
    return new Response(whole.body, { status: 200, headers: { ...headers, "content-length": String(whole.size) } });
  }
  const span = bytesAskedOf(range, held.size);
  if (!span)
    return relayRefusal(false, 416, { error: "request", reason: "range" }, { "content-range": `bytes */${held.size}` });
  const part = await bucket.get(key, { range: { offset: span.from, length: span.length } });
  if (!part) return holdsNone(false);
  return new Response(part.body, {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(span.length),
      "content-range": `bytes ${span.from}-${span.from + span.length - 1}/${held.size}`,
    },
  });
}

/** The address a pull's request names, or null where its body is not `{ "from": "<address>" }`, short. */
async function fromOf(request: Request): Promise<string | null> {
  // A body that cannot be read names nothing.
  const text = await request.text().catch(() => "");
  if (!text || text.length > PULL_BODY_CHARS_MAX) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON: no address.
    return null;
  }
  return isJsonObject(parsed) && typeof parsed.from === "string" && parsed.from ? parsed.from : null;
}

/**
 * Whether a file may be pulled from this address: https, no name or password, no port, and beginning, once written
 * as an address is written (so a path that climbs out is judged by where it lands), as one of the allowed ones does.
 * An allowed start that ends before its host does (no "/" after it) allows nothing: another host could begin the same.
 */
function mayPullFrom(from: string, allowed: string | undefined): boolean {
  let address: URL;
  try {
    address = new URL(from);
  } catch {
    // Not an address at all.
    return false;
  }
  if (address.protocol !== "https:" || address.username || address.password || address.port) return false;
  return (allowed ?? "")
    .split(",")
    .map((start) => start.trim())
    .some((start) => HOST_AND_PATH.test(start) && address.href.startsWith(start));
}

/**
 * A POST: the file pulled in from where the app says, held to the bytes the ticket names. The bucket itself checks the
 * SHA-256 as it stores, so what ends under the key is those bytes or nothing.
 */
async function answerPull(
  request: Request,
  shelf: { bucket: ShelfBucket; key: string; allowed: string | undefined },
  claim: ShelfClaim,
  deps: ShelfDeps,
): Promise<Response> {
  const { bytes, sha256 } = claim;
  // A put's ticket names its bytes: the reader refused one that did not.
  if (bytes === undefined || sha256 === undefined) return relayRefusal(false, 403, { error: "ticket", reason: "use" });
  if (bytes > VIDEO_BYTES_MAX) return relayRefusal(false, 400, { error: "request", reason: "too_large" });
  const from = await fromOf(request);
  if (!from) return relayRefusal(false, 400, { error: "request", reason: "body" });
  if (!mayPullFrom(from, shelf.allowed)) return relayRefusal(false, 422, { error: "source", reason: "not_allowed" });
  const reply = await askWithin(deps, from, { method: "GET", redirect: "manual" }, SOURCE_TRY_MS);
  if (!reply) return relayRefusal(false, 502, { error: "source", reason: "unreachable" });
  const refuseSource = async (status: number, reason: string) => {
    // What is not wanted is let go, so the connection is.
    await reply.body?.cancel().catch(() => undefined);
    return relayRefusal(false, status, { error: "source", reason });
  };
  if (reply.status !== 200 || !reply.body) return refuseSource(502, "status");
  if (reply.headers.get("content-length") !== String(bytes)) return refuseSource(409, "size");
  // Exactly the ticket's bytes pass, or the stream breaks; and the pipe is cut a minute on, whatever the source does.
  const length = deps.fixedLength(bytes);
  const cut = new AbortController();
  const letGo = deps.after(PULL_MOST_MS, () => cut.abort());
  // A pipe that breaks breaks the put below, which is where it is answered.
  const piped = reply.body.pipeTo(length.writable, { signal: cut.signal }).catch(() => undefined);
  try {
    const stored = await shelf.bucket.put(shelf.key, length.readable, {
      sha256,
      httpMetadata: { contentType: VIDEO_TYPE },
    });
    return new Response(JSON.stringify({ bytes: stored.size, sha256: sumHexOf(stored.checksums.sha256) }), {
      status: 201,
      headers: { "content-type": "application/json", ...NEVER_STORED },
    });
  } catch (failure) {
    // Other bytes than the checksum names are said so; anything else is a put that did not happen, tried again.
    const mismatch = failure instanceof Error && R2_BAD_DIGEST.test(failure.message);
    return mismatch
      ? relayRefusal(false, 409, { error: "shelf", reason: "mismatch" })
      : relayRefusal(false, 502, { error: "shelf", reason: "put_failed" });
  } finally {
    letGo();
    await piped;
  }
}

/**
 * A GET of the list: the files one workspace's shelf holds, by the ids in their keys, a page at a time. `more` says
 * whether another page follows, and only then is there a cursor: the bucket may hand over fewer keys than a page
 * holds, so a short page is never read as the end. A key under the workspace's prefix that is no file's is counted
 * and not named: what is not understood is never listed as something to act on.
 */
async function answerList(bucket: ShelfBucket, tenant: string, url: URL): Promise<Response> {
  const cursor = url.searchParams.get("cursor");
  if (cursor !== null && (cursor.length === 0 || cursor.length > CURSOR_CHARS_MAX))
    return relayRefusal(false, 400, { error: "request", reason: "cursor" });
  const prefix = `${tenant}/`;
  const listed = await bucket.list({ prefix, limit: LIST_PAGE, ...(cursor === null ? {} : { cursor }) });
  const files: string[] = [];
  let other = 0;
  for (const { key } of listed.objects) {
    const file = KEY_IN_A_WORKSPACE.exec(key.slice(prefix.length))?.[1];
    if (file && key.startsWith(prefix)) files.push(file);
    else other += 1;
  }
  const next = listed.truncated ? (listed.cursor ?? null) : null;
  return new Response(JSON.stringify({ files, other, more: listed.truncated, cursor: next }), {
    status: 200,
    headers: { "content-type": "application/json", ...NEVER_STORED },
  });
}

/** The ticket a request shows: a read's in its address, a write's in its header, and neither from the other place. */
function ticketOf(request: Request, url: URL, use: ShelfUse): string | null {
  if (use === "read") return url.searchParams.get("ticket");
  const bearer = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "");
  return bearer?.[1] ?? null;
}

/** One request of the shelf answered: its ticket read, and what the ticket allows done. */
export async function answerShelf(request: Request, env: ShelfEnv, deps: ShelfDeps = DEPS): Promise<Response> {
  const head = request.method === "HEAD";
  const url = new URL(request.url);
  // The list is one path, asked one way; every other path is a file's, and its method says what is asked of it.
  const listing = url.pathname === LIST_PATH;
  const use = listing ? (request.method === "GET" ? "list" : undefined) : USE_OF[request.method];
  if (!use)
    return relayRefusal(false, 405, { error: "request", reason: "method" }, { allow: listing ? "GET" : METHODS });
  const file = listing ? null : (SHELF_PATH.exec(url.pathname)?.[1] ?? "");
  if (file === "") return relayRefusal(head, 404, { error: "request", reason: "path" });
  const read = await readShelfTicket(env.TICKET_KEY, ticketOf(request, url, use), deps.nowMs());
  if (!read.ok) return relayRefusal(head, 403, { error: "ticket", reason: read.reason });
  if (read.use !== use) return relayRefusal(head, 403, { error: "ticket", reason: "use" });
  if (read.file !== file) return relayRefusal(head, 403, { error: "ticket", reason: "other_file" });
  const bucket = env.SHELF;
  if (!bucket) return relayRefusal(head, 503, { error: "shelf", reason: "off" });
  try {
    // A list is of the ticket's own workspace, and of nothing a request names.
    if (use === "list") return await answerList(bucket, read.tenant, url);
    // The key is the ticket's own workspace and file: nothing a request says is in it.
    const key = `${read.tenant}/${read.file}/video`;
    if (use === "read") return await answerRead(bucket, key, request, head);
    if (use === "put") return await answerPull(request, { bucket, key, allowed: env.SHELF_FROM }, read, deps);
    await bucket.delete(key);
    return new Response(null, { status: 204, headers: NEVER_STORED });
  } catch {
    // The bucket gave no answer: the app asks again, and nothing of the failure is said.
    return relayRefusal(head, 502, { error: "shelf", reason: "unreachable" });
  }
}

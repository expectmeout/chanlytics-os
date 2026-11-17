/**
 * The key door, FOR THE PROOF ONLY (footage sources, plan v4, P1). In production the app is the key door: it holds a
 * business's Google grant in Vault and answers the relay with an hour's key to one file. That needs P0's tables and the
 * sign-in, which are not live, so the proof stands a door of its own beside the relay: a second small Worker that is
 * deployed for the proof and deleted after it, and is never a route of the app.
 *
 * It holds no Google grant. The proof's runner (tooling/scripts/ops/files/footage-proof.mjs) signs in on Ruben's PC, keeps
 * the grant there, and leaves here one run at a time: the file, and a key Google ends within the hour. The door answers the
 * relay from that, writes down each question the relay brings (a method, a range, a time: that is how many requests a clip
 * costs), and can tell the relay to break one download off part-way (the proof's forced break).
 *
 *   POST   /key           the relay's knock: {ticket, method, range} answered {access_token, file_id}
 *   PUT    /runs/<item>   the runner leaves a run: {file_id, access_token, key_expires_at, size, break_after_ms?}
 *   GET    /runs/<item>   the runner reads what the relay asked, in order; never the key
 *   DELETE /runs/<item>   the run and its key are forgotten
 *
 * Every call carries the app's key. Its memory is one Durable Object, so two questions at once are answered one after the
 * other and a count is never lost.
 */
import { readTicket } from "../src/ticket";
import { isJsonObject } from "../src/wire";

/** The part of a Durable Object's storage the door uses; a test hands it a Map behind the same four calls. */
export interface RunStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(keys: string[]): Promise<number>;
  list(options: { prefix: string }): Promise<Map<string, unknown>>;
}

interface DoorSecrets {
  /** The ticket's key, the same the relay holds. */
  TICKET_KEY: string;
  /** The app's key, the same the relay knocks with. */
  KEY_DOOR_SECRET: string;
}

/** One run as the door keeps it. */
interface ProofRun {
  fileId: string;
  accessToken: string;
  /** When Google ends the key, in ms: the door stops handing it out a minute before. */
  keyExpiresAt: number;
  size: number;
  /** How long into a download the relay is told to break it off; null for a run with no break. */
  breakAfterMs: number | null;
  /** Whether the break is still to be handed out: once, to the first download large enough to break. */
  breakLeft: boolean;
  asked: number;
}

const ITEM = /^[A-Za-z0-9_-]{1,128}$/;
const RUN_PATH = /^\/runs\/([A-Za-z0-9_-]{1,128})$/;
/** A key this close to its end is not handed out: a download begun with it could outlive it. */
const KEY_MARGIN_MS = 60_000;
/** A download smaller than this is a fetcher's probe, and is not the one to break. */
const BREAK_BYTES_MIN = 1_048_576;
/** How many keys a Durable Object deletes in one call. */
const DELETE_AT_ONCE = 128;
const COUNT_DIGITS = 6;

const jsonAnswer = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const runKey = (item: string): string => `run:${item}`;
const askedPrefix = (item: string): string => `asked:${item}:`;

function keptRunOf(kept: unknown): ProofRun | null {
  if (!isJsonObject(kept)) return null;
  const { fileId, accessToken, keyExpiresAt, size, breakAfterMs, breakLeft, asked } = kept;
  if (typeof fileId !== "string" || typeof accessToken !== "string" || typeof keyExpiresAt !== "number") return null;
  if (typeof size !== "number" || typeof asked !== "number" || typeof breakLeft !== "boolean") return null;
  return {
    fileId,
    accessToken,
    keyExpiresAt,
    size,
    breakAfterMs: typeof breakAfterMs === "number" ? breakAfterMs : null,
    breakLeft,
    asked,
  };
}

/** How many bytes a download would carry: the whole clip, the rest from a byte, a stretch, or its last bytes. */
function bytesAskedFor(range: string | null, size: number): number {
  if (range === null) return size;
  const stretch = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!stretch) return 0;
  const [, from = "", to = ""] = stretch;
  if (from === "") return Math.min(Number(to), size);
  const last = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return Math.max(0, last - Number(from) + 1);
}

/** The relay's knock: the ticket read, the run found, the question written down, and the key answered. */
async function answerKnock(request: Request, secrets: DoorSecrets, store: RunStore, nowMs: number): Promise<Response> {
  // A body that is not JSON carries no ticket.
  const body: unknown = await request.json().catch(() => null);
  const ticket = isJsonObject(body) && typeof body.ticket === "string" ? body.ticket : null;
  const read = await readTicket(secrets.TICKET_KEY, ticket, nowMs);
  if (!read.ok) return jsonAnswer(403, { error: "ticket", reason: read.reason });
  const run = keptRunOf(await store.get(runKey(read.item)));
  if (!run) return jsonAnswer(404, { error: "no_run" });
  if (nowMs >= run.keyExpiresAt - KEY_MARGIN_MS) return jsonAnswer(503, { error: "key_ended" }, { "retry-after": "5" });

  const method = isJsonObject(body) && body.method === "HEAD" ? "HEAD" : "GET";
  const range = isJsonObject(body) && typeof body.range === "string" ? body.range : null;
  const broken =
    method === "GET" &&
    run.breakLeft &&
    run.breakAfterMs !== null &&
    bytesAskedFor(range, run.size) >= Math.min(BREAK_BYTES_MIN, run.size);
  const count = run.asked + 1;
  await store.put(`${askedPrefix(read.item)}${String(count).padStart(COUNT_DIGITS, "0")}`, {
    at: nowMs,
    method,
    range,
    break_after_ms: broken ? run.breakAfterMs : null,
  });
  await store.put(runKey(read.item), { ...run, asked: count, breakLeft: run.breakLeft && !broken });
  return jsonAnswer(200, {
    access_token: run.accessToken,
    file_id: run.fileId,
    ...(broken ? { break_after_ms: run.breakAfterMs } : {}),
  });
}

/** The runner leaves a run, or a fresh key for the one in hand: what the relay asked so far is kept. */
async function keepRun(request: Request, item: string, store: RunStore): Promise<Response> {
  // A body that is not JSON names no run.
  const body: unknown = await request.json().catch(() => null);
  if (!isJsonObject(body)) return jsonAnswer(400, { error: "bad_run" });
  const {
    file_id: fileId,
    access_token: accessToken,
    key_expires_at: keyExpiresAt,
    size,
    break_after_ms: breakAfterMs,
  } = body;
  if (typeof fileId !== "string" || !ITEM.test(fileId) || typeof accessToken !== "string" || !accessToken)
    return jsonAnswer(400, { error: "bad_run" });
  if (typeof keyExpiresAt !== "number" || typeof size !== "number" || !Number.isInteger(size) || size < 0)
    return jsonAnswer(400, { error: "bad_run" });
  if (breakAfterMs !== undefined && (typeof breakAfterMs !== "number" || !(breakAfterMs > 0)))
    return jsonAnswer(400, { error: "bad_run" });
  const before = keptRunOf(await store.get(runKey(item)));
  const breaking = typeof breakAfterMs === "number" ? breakAfterMs : null;
  const run: ProofRun = {
    fileId,
    accessToken,
    keyExpiresAt,
    size,
    breakAfterMs: breaking,
    // A fresh key for a run in hand does not hand the break out a second time.
    breakLeft: before ? before.breakLeft && breaking !== null : breaking !== null,
    asked: before?.asked ?? 0,
  };
  await store.put(runKey(item), run);
  return jsonAnswer(200, { ok: true, asked: run.asked });
}

/** What the relay asked for one run, in order. The key is never read back. */
async function readRun(item: string, store: RunStore): Promise<Response> {
  const run = keptRunOf(await store.get(runKey(item)));
  if (!run) return jsonAnswer(404, { error: "no_run" });
  const questions = [...(await store.list({ prefix: askedPrefix(item) })).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, note]) => note);
  return jsonAnswer(200, { file_id: run.fileId, size: run.size, break_left: run.breakLeft, asked: questions });
}

async function forgetRun(item: string, store: RunStore): Promise<Response> {
  const keys = [runKey(item), ...(await store.list({ prefix: askedPrefix(item) })).keys()];
  for (let at = 0; at < keys.length; at += DELETE_AT_ONCE) await store.delete(keys.slice(at, at + DELETE_AT_ONCE));
  return jsonAnswer(200, { ok: true });
}

/** Whether two secrets are one, in the same time for any two: both are hashed, and every byte is compared. */
async function isSameSecret(given: string, held: string): Promise<boolean> {
  const [a, b] = await Promise.all(
    [given, held].map(
      async (secret) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))),
    ),
  );
  if (!a || !b || !held) return false;
  let differing = 0;
  for (const [i, byte] of a.entries()) differing |= byte ^ (b[i] ?? 0);
  return differing === 0;
}

/** One call answered, once it carries the app's key. */
export async function answerKeyDoor(
  request: Request,
  secrets: DoorSecrets,
  store: RunStore,
  nowMs: number,
): Promise<Response> {
  const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!(await isSameSecret(given, secrets.KEY_DOOR_SECRET))) return jsonAnswer(401, { error: "unauthorized" });
  const path = new URL(request.url).pathname;
  if (path === "/key" && request.method === "POST") return answerKnock(request, secrets, store, nowMs);
  const item = RUN_PATH.exec(path)?.[1];
  if (!item) return jsonAnswer(404, { error: "not_found" });
  if (request.method === "PUT") return keepRun(request, item, store);
  if (request.method === "GET") return readRun(item, store);
  if (request.method === "DELETE") return forgetRun(item, store);
  return jsonAnswer(405, { error: "method" }, { allow: "GET, PUT, DELETE" });
}

/* ---------------------------------------------------------------------------------------------- as Cloudflare runs it -- */

interface DoorMemory {
  fetch(request: Request): Promise<Response>;
}
interface DoorEnv extends DoorSecrets {
  /** The door's memory: one Durable Object, found by name. */
  RUNS: { idFromName(name: string): unknown; get(id: unknown): DoorMemory };
}

/** The door's memory: every call is answered here, one at a time, over this object's own storage. */
export class ProofRuns {
  readonly #store: RunStore;
  readonly #secrets: DoorSecrets;

  constructor(state: { storage: RunStore }, env: DoorSecrets) {
    this.#store = state.storage;
    this.#secrets = env;
  }

  fetch(request: Request): Promise<Response> {
    return answerKeyDoor(request, this.#secrets, this.#store, Date.now());
  }
}

export default {
  fetch: (request: Request, env: DoorEnv): Promise<Response> =>
    env.RUNS.get(env.RUNS.idFromName("proof")).fetch(request),
};

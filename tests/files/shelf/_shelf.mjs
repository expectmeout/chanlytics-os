/**
 * The shelf, for the tests that lean on it (the archive plan's B2): R2 from memory, held to what the relay asks of a
 * bucket (apps/relay/src/shelf.ts `ShelfBucket`), and the relay's own handler behind one fetch, so the app's side is
 * tested against the Worker that will answer it and never a stand-in of it. Pure of the app: it imports the relay and
 * nothing else.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { createHash } from "node:crypto";
import { at } from "../../_cron-doors-world.mjs";

const { answerShelf } = await import(at("apps/relay/src/shelf.ts"));

export const shaOf = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function bytesOfStream(stream) {
  const parts = [];
  for await (const part of stream) parts.push(part);
  return Buffer.concat(parts);
}

/**
 * R2, from memory: a put is held to the SHA-256 it names and stored whole or not at all, a read gives the bytes or
 * the range asked, and every call is kept (`calls`). `held` is what it holds, by key.
 */
export function shelfBucket() {
  const held = new Map();
  const calls = [];
  const objectOf = (stored) => ({
    size: stored.bytes.length,
    httpEtag: `"${stored.sha256.slice(0, 32)}"`,
    checksums: { sha256: Uint8Array.from(Buffer.from(stored.sha256, "hex")).buffer },
  });
  return {
    held,
    calls,
    async head(key) {
      calls.push(["head", key]);
      const stored = held.get(key);
      return stored ? objectOf(stored) : null;
    },
    async get(key, options = {}) {
      calls.push(["get", key, options.range ?? null]);
      const stored = held.get(key);
      if (!stored) return null;
      const size = stored.bytes.length;
      const from = options.range?.offset ?? 0;
      if (from >= size) throw new Error("get: The requested range is not satisfiable. (10039)");
      const length = Math.min(options.range?.length ?? size, size - from);
      return { ...objectOf(stored), body: new Blob([stored.bytes.subarray(from, from + length)]).stream() };
    },
    async put(key, value, options) {
      calls.push(["put", key, options]);
      // A stream that breaks throws here, and nothing is stored: a put is whole or it is not.
      const bytes = await bytesOfStream(value);
      const sha256 = shaOf(bytes);
      if (sha256 !== options.sha256)
        throw new Error("put: Provided checksum does not match the uploaded content. (10037)");
      const stored = { bytes, sha256, contentType: options.httpMetadata.contentType };
      held.set(key, stored);
      return objectOf(stored);
    },
    async delete(key) {
      calls.push(["delete", key]);
      held.delete(key);
    },
  };
}

/** Workers' FixedLengthStream, as the relay leans on it: exactly this many bytes pass, or the stream breaks. */
export function fixedLength(bytes) {
  let passed = 0;
  return new TransformStream({
    transform(chunk, controller) {
      passed += chunk.byteLength;
      if (passed > bytes) return controller.error(new Error("more bytes than the length given"));
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (passed !== bytes) controller.error(new Error("fewer bytes than the length given"));
    },
  });
}

/**
 * The relay with its shelf, as the app reaches it: what `fetch` answers for an address under `relayUrl` is the
 * Worker's own answer, and every such ask is kept (`asked`). `source(url, init)` plays the place a pull reads from;
 * `shelf: null` is a Worker bound to no bucket, and `down: true` a relay that gives no answer at all.
 */
export function shelfRelay({ relayUrl, ticketKey, from, source, shelf = shelfBucket(), nowMs = () => Date.now() }) {
  const asked = [];
  const pulled = [];
  const state = { down: false };
  const deps = {
    fetch: async (url, init = {}) => {
      pulled.push({ url: String(url), init });
      return source(String(url), init);
    },
    nowMs,
    fixedLength,
    after: (ms, run) => {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
  };
  const env = { TICKET_KEY: ticketKey, ...(shelf ? { SHELF: shelf } : {}), ...(from ? { SHELF_FROM: from } : {}) };
  const isRelays = (url) => String(url).startsWith(relayUrl);
  const answer = async (url, init = {}) => {
    asked.push({
      url: String(url),
      method: init.method ?? "GET",
      headers: { ...init.headers },
      body: init.body ?? null,
    });
    if (state.down) throw new Error("no route to the relay");
    return answerShelf(new Request(String(url), init), env, deps);
  };
  return { shelf, asked, pulled, state, isRelays, answer };
}

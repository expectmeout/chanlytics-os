/**
 * The service client's requests to the database have a bound (createServiceClient, beside 00283's statement_timeout):
 * a request that never answers is given up on, and the caller gets an error rather than waiting until its function is
 * killed. Run through the real client with a transport that never answers; nothing leaves this process.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServiceClient } from "../../../../packages/db/src/service-client.ts";

/** A transport that answers nothing until its request is aborted, and says what it was handed. */
function silent() {
  const seen = [];
  const fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    seen.push({ url, signal: init.signal ?? null });
    // A file's request is answered at once: only the database's hang here.
    if (url.includes("/storage/v1/")) return Promise.resolve(new Response("{}", { status: 200 }));
    if (init.signal?.aborted) return Promise.reject(init.signal.reason);
    // The bound's timer does not hold the process open (AbortSignal.timeout is unref'd), so the hung request does,
    // as a server's other work would, until it is aborted.
    const hold = setTimeout(() => {}, 10_000);
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        clearTimeout(hold);
        reject(init.signal.reason);
      });
    });
  };
  return { seen, fetch };
}

test("a database request that never answers is given up on at the bound, as an error the caller reads", async () => {
  const t = silent();
  const db = createServiceClient({
    url: "http://127.0.0.1:1",
    serviceRoleKey: "test-only",
    fetchTimeoutMs: 50,
    fetch: t.fetch,
  });
  const started = Date.now();
  const { data, error } = await db.from("jobs").select("id").limit(1);
  assert.equal(data, null);
  assert.ok(error, "an error, not a hang");
  assert.match(`${error.message} ${error.details ?? ""}`, /timeout|abort/i);
  assert.ok(Date.now() - started < 900, "given up on at the bound, not at the function's end");
  assert.equal(t.seen.length, 1, "and not asked again: three more waits of the bound would outlast the function");
  assert.match(t.seen[0].url, /\/rest\/v1\/jobs/);
});

test("a caller's own signal still stops a request first, and storage's requests are the caller's to bound", async () => {
  const t = silent();
  const db = createServiceClient({ url: "http://127.0.0.1:1", serviceRoleKey: "test-only", fetch: t.fetch });
  const mine = new AbortController();
  const pending = db.from("jobs").select("id").abortSignal(mine.signal);
  mine.abort();
  const { error } = await pending;
  assert.ok(error, "the caller's abort ends it");

  // A file's upload takes as long as the file: no bound is added to it here.
  await db.storage.from("media").upload("a.txt", new Blob(["x"]));
  const storage = t.seen.find((s) => s.url.includes("/storage/v1/"));
  assert.ok(storage, "the upload reached the transport");
  assert.equal(storage.signal, null, "storage carries no bound of ours");
});

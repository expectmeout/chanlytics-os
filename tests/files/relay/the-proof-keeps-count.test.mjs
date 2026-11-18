/**
 * The proof's own two parts beside the relay (footage sources, plan v4, P1; apps/relay/proof): the key door that stands in
 * for the app until its tables are live, and the forced break. The door's real handler runs over a storage in memory, and
 * the relay's real handler runs against it, so what the proof will count (each question the relay brings) and what it will
 * break (one download, once) are held here before any account is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";

const { answerRelay } = await import(at("apps/relay/src/relay.ts"));
const { signTicket } = await import(at("apps/relay/src/ticket.ts"));
const door = await import(at("apps/relay/proof/key-door.ts"));
const { fetchWithBreaks } = await import(at("apps/relay/proof/breaks.ts"));

const NOW = Date.parse("2026-11-17T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const MIB = 1_048_576;
const SECRETS = { TICKET_KEY: "ticket-key-for-this-file", KEY_DOOR_SECRET: "app-key-for-this-file" };
const DOOR = "https://door.example.com";
const ITEM = "item-1";
const FILE_ID = "drive-file-1";
const DRIVE_KEY = "ya29.a-drive-key-for-this-file";
const SIZE = 40 * MIB;

/** A Durable Object's storage, in memory: the four calls the door makes. */
function memory() {
  const kept = new Map();
  return {
    kept,
    get: async (key) => structuredClone(kept.get(key)),
    put: async (key, value) => void kept.set(key, structuredClone(value)),
    delete: async (keys) => keys.filter((key) => kept.delete(key)).length,
    list: async ({ prefix }) => new Map([...kept].filter(([key]) => key.startsWith(prefix))),
  };
}

const world = () => {
  const store = memory();
  let now = NOW;
  const call = (method, path, body, key = SECRETS.KEY_DOOR_SECRET) =>
    door.answerKeyDoor(
      new Request(`${DOOR}${path}`, {
        method,
        headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      SECRETS,
      store,
      now,
    );
  return { store, call, later: (ms) => (now += ms), nowMs: () => now };
};
const ticketFor = (item = ITEM, expiresAt = NOW / 1000 + 7200) => signTicket(SECRETS.TICKET_KEY, { item, expiresAt });
const run = (more = {}) => ({
  file_id: FILE_ID,
  access_token: DRIVE_KEY,
  key_expires_at: NOW + HOUR_MS,
  size: SIZE,
  ...more,
});

test("the door answers the relay's knock with the run's key and file, and writes down each question in order", async () => {
  const w = world();
  assert.deepEqual(await (await w.call("PUT", `/runs/${ITEM}`, run())).json(), { ok: true, asked: 0 });
  const ticket = await ticketFor();

  const head = await w.call("POST", "/key", { ticket, method: "HEAD", range: null });
  assert.equal(head.status, 200);
  assert.deepEqual(await head.json(), { access_token: DRIVE_KEY, file_id: FILE_ID });
  w.later(1500);
  await w.call("POST", "/key", { ticket, method: "GET", range: "bytes=0-1048575" });
  w.later(250);
  await w.call("POST", "/key", { ticket, method: "GET", range: "bytes=1048576-" });

  const read = await w.call("GET", `/runs/${ITEM}`);
  assert.equal(read.status, 200);
  const said = await read.json();
  assert.deepEqual(said, {
    file_id: FILE_ID,
    size: SIZE,
    break_left: false,
    asked: [
      { at: NOW, method: "HEAD", range: null, break_after_ms: null },
      { at: NOW + 1500, method: "GET", range: "bytes=0-1048575", break_after_ms: null },
      { at: NOW + 1750, method: "GET", range: "bytes=1048576-", break_after_ms: null },
    ],
  });
  assert.ok(!JSON.stringify(said).includes(DRIVE_KEY), "the key is never read back");
});

test("the door opens only to the app's key, a ticket the app signed, and a run it was left", async () => {
  const w = world();
  await w.call("PUT", `/runs/${ITEM}`, run());
  const ticket = await ticketFor();
  for (const key of [null, "another-key", `${SECRETS.KEY_DOOR_SECRET}x`, ""]) {
    for (const [method, path, body] of [
      ["POST", "/key", { ticket, method: "GET", range: null }],
      ["GET", `/runs/${ITEM}`],
      ["PUT", `/runs/${ITEM}`, run()],
      ["DELETE", `/runs/${ITEM}`],
    ]) {
      const answer = await w.call(method, path, body, key);
      assert.equal(answer.status, 401, `${method} ${path} with ${key}`);
      assert.ok(!(await answer.text()).includes(DRIVE_KEY));
    }
  }
  const forged = await signTicket("another-key", { item: ITEM, expiresAt: NOW / 1000 + 60 });
  assert.equal((await w.call("POST", "/key", { ticket: forged, method: "GET", range: null })).status, 403);
  assert.equal((await w.call("POST", "/key", { ticket: await ticketFor(ITEM, NOW / 1000 - 1) })).status, 403);
  assert.equal((await w.call("POST", "/key", {})).status, 403);
  // A ticket the app signed for an item no run was left for: nothing to hand out.
  assert.equal((await w.call("POST", "/key", { ticket: await ticketFor("item-2"), method: "GET" })).status, 404);
  assert.equal((await w.call("GET", "/runs/item-2")).status, 404);
  assert.equal((await w.call("GET", "/elsewhere")).status, 404);
  assert.equal((await w.call("POST", `/runs/${ITEM}`, run())).status, 405);
  // None of it was written down as a question of the relay's.
  assert.equal((await (await w.call("GET", `/runs/${ITEM}`)).json()).asked.length, 0);
});

test("a run that is not one is refused, and a key near its end is not handed out", async () => {
  const w = world();
  for (const bad of [
    run({ file_id: "a name/with a slash" }),
    run({ access_token: "" }),
    run({ key_expires_at: "soon" }),
    run({ size: -1 }),
    run({ size: 1.5 }),
    run({ break_after_ms: 0 }),
    "not a run",
  ])
    assert.equal((await w.call("PUT", `/runs/${ITEM}`, bad)).status, 400, JSON.stringify(bad));

  await w.call("PUT", `/runs/${ITEM}`, run());
  const ticket = await ticketFor();
  w.later(HOUR_MS - 61_000);
  assert.equal((await w.call("POST", "/key", { ticket, method: "GET", range: null })).status, 200);
  w.later(2000);
  const ended = await w.call("POST", "/key", { ticket, method: "GET", range: null });
  assert.equal(ended.status, 503);
  assert.equal(ended.headers.get("retry-after"), "5");

  // A fresh key for the run in hand: the door answers again, and what was asked so far is kept.
  assert.deepEqual(
    await (
      await w.call("PUT", `/runs/${ITEM}`, run({ access_token: "ya29.fresh", key_expires_at: w.nowMs() + HOUR_MS }))
    ).json(),
    { ok: true, asked: 1 },
  );
  const again = await w.call("POST", "/key", { ticket, method: "GET", range: null });
  assert.equal((await again.json()).access_token, "ya29.fresh");
  assert.equal((await (await w.call("GET", `/runs/${ITEM}`)).json()).asked.length, 2);
});

test("the break is handed out once, to the first download large enough to break, and never to a probe or a HEAD", async () => {
  const w = world();
  await w.call("PUT", `/runs/${ITEM}`, run({ break_after_ms: 4000 }));
  const ticket = await ticketFor();
  const knock = async (method, range) => (await w.call("POST", "/key", { ticket, method, range })).json();

  assert.equal((await knock("HEAD", null)).break_after_ms, undefined);
  assert.equal((await knock("GET", "bytes=0-1023")).break_after_ms, undefined, "a probe of a few bytes");
  assert.equal((await knock("GET", "bytes=-4096")).break_after_ms, undefined, "a clip's last bytes");
  assert.equal((await knock("GET", "bytes=0-")).break_after_ms, 4000);
  assert.equal((await knock("GET", "bytes=0-")).break_after_ms, undefined, "the next try is left alone");
  // A fresh key mid-run does not hand the break out again.
  await w.call("PUT", `/runs/${ITEM}`, run({ break_after_ms: 4000 }));
  assert.equal((await knock("GET", null)).break_after_ms, undefined);

  const { asked, break_left: breakLeft } = await (await w.call("GET", `/runs/${ITEM}`)).json();
  assert.deepEqual(
    asked.map((a) => a.break_after_ms),
    [null, null, null, 4000, null, null],
  );
  assert.equal(breakLeft, false);

  // A run with no break never breaks.
  await w.call("DELETE", `/runs/${ITEM}`);
  await w.call("PUT", `/runs/${ITEM}`, run());
  assert.equal((await knock("GET", null)).break_after_ms, undefined);
});

test("a run forgotten leaves nothing behind: no key, no file, no question", async () => {
  const w = world();
  await w.call("PUT", `/runs/${ITEM}`, run());
  await w.call("PUT", "/runs/item-2", run({ file_id: "drive-file-2" }));
  const ticket = await ticketFor();
  for (let i = 0; i < 300; i += 1) await w.call("POST", "/key", { ticket, method: "GET", range: `bytes=${i}-${i}` });
  assert.equal((await (await w.call("GET", `/runs/${ITEM}`)).json()).asked.length, 300);

  assert.equal((await w.call("DELETE", `/runs/${ITEM}`)).status, 200);
  assert.deepEqual([...w.store.kept.keys()], ["run:item-2"], "the other run is untouched");
  assert.equal((await w.call("POST", "/key", { ticket, method: "GET", range: null })).status, 404);
});

test("as Cloudflare runs it: every call goes to the one memory, which answers over its own storage", async () => {
  const store = memory();
  const runs = new door.ProofRuns({ storage: store }, SECRETS);
  const names = [];
  const env = {
    ...SECRETS,
    RUNS: {
      idFromName: (name) => (names.push(name), `id-of-${name}`),
      get: (id) => (assert.equal(id, "id-of-proof"), runs),
    },
  };
  const call = (method, path, body) =>
    door.default.fetch(
      new Request(`${DOOR}${path}`, {
        method,
        headers: { authorization: `Bearer ${SECRETS.KEY_DOOR_SECRET}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  assert.equal((await call("PUT", `/runs/${ITEM}`, run({ key_expires_at: Date.now() + HOUR_MS }))).status, 200);
  const ticket = await signTicket(SECRETS.TICKET_KEY, { item: ITEM, expiresAt: Date.now() / 1000 + 60 });
  const answer = await call("POST", "/key", { ticket, method: "HEAD", range: null });
  assert.deepEqual(await answer.json(), { access_token: DRIVE_KEY, file_id: FILE_ID });
  assert.deepEqual(names, ["proof", "proof"]);
  assert.ok(store.kept.has(`run:${ITEM}`));
});

/* ----------------------------------------------------------------------------------------- the relay, the door, a break -- */

/** A Drive whose download never ends by itself: it gives one part, then waits to be stopped or closed. */
function hangingDrive() {
  const downloads = [];
  const files = (url, init) => {
    if (!url.includes("alt=media"))
      return new Response(JSON.stringify({ size: String(SIZE), mimeType: "video/mp4" }), { status: 200 });
    const download = { range: init.headers.range ?? null, stopped: false, close: null };
    downloads.push(download);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1000).fill(downloads.length));
        download.close = () => controller.close();
      },
      // The reader let go before the end: the download was cut.
      cancel() {
        download.stopped = true;
      },
    });
    return new Response(body, { status: init.headers.range ? 206 : 200, headers: { "content-type": "video/mp4" } });
  };
  return { downloads, files };
}

/** The relay as the proof deploys it, against the proof's door and a Drive in memory. */
function proofWorld(drive) {
  const w = world();
  const env = { ...SECRETS, KEY_DOOR_URL: `${DOOR}/key` };
  const web = (url, init) =>
    url === env.KEY_DOOR_URL
      ? door.answerKeyDoor(new Request(url, init), SECRETS, w.store, w.nowMs())
      : Promise.resolve(drive.files(url, init));
  const ask = async (method, range) =>
    answerRelay(
      new Request(`https://relay.example.com/clip/${ITEM}?ticket=${await ticketFor()}`, {
        method,
        headers: range ? { range } : {},
      }),
      env,
      // A fetch of its own for each request, as the Worker's entry makes one.
      { fetch: fetchWithBreaks(web, env.KEY_DOOR_URL), nowMs: w.nowMs },
    );
  return { ...w, ask };
}

test("a forced break stops one download part-way, as a dead connection; the fetcher's next try runs whole, and each is counted", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const drive = hangingDrive();
  const w = proofWorld(drive);
  await w.call("PUT", `/runs/${ITEM}`, run({ break_after_ms: 4000 }));

  assert.equal((await w.ask("HEAD")).headers.get("content-length"), String(SIZE));

  // The first download begins as any other: its status and its first bytes arrive.
  const broken = await w.ask("GET");
  assert.equal(broken.status, 200);
  const reader = broken.body.getReader();
  assert.equal((await reader.read()).value.length, 1000);
  t.mock.timers.tick(3999);
  assert.equal(drive.downloads[0].stopped, false, "not before its time");
  t.mock.timers.tick(1);
  await assert.rejects(() => reader.read(), "the rest never comes: the body ends in an error, not an end");
  assert.equal(drive.downloads[0].stopped, true, "and Drive's download is let go");

  // The fetcher asks again from where it stood: this one is left alone, however long it takes.
  const next = await w.ask("GET", "bytes=1000-");
  assert.equal(next.status, 206);
  t.mock.timers.tick(10 * 60_000);
  assert.equal(drive.downloads[1].stopped, false);
  drive.downloads[1].close();
  assert.equal((await next.arrayBuffer()).byteLength, 1000);

  const { asked } = await (await w.call("GET", `/runs/${ITEM}`)).json();
  assert.deepEqual(
    asked.map((a) => [a.method, a.range, a.break_after_ms]),
    [
      ["HEAD", null, null],
      ["GET", null, 4000],
      ["GET", "bytes=1000-", null],
    ],
  );
});

test("with no break asked for, the proof's relay passes a clip exactly as production's does", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const drive = hangingDrive();
  const w = proofWorld(drive);
  await w.call("PUT", `/runs/${ITEM}`, run());
  const answer = await w.ask("GET", "bytes=0-");
  t.mock.timers.tick(10 * 60_000);
  assert.equal(drive.downloads[0].stopped, false);
  drive.downloads[0].close();
  assert.equal((await answer.arrayBuffer()).byteLength, 1000);
});

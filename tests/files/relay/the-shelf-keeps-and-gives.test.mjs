/**
 * The relay's shelf (the archive plan's B2; apps/relay/src/shelf.ts): a private bucket where a video Chanlytics made
 * keeps a copy of its own, behind the Worker that already answers a Drive's clip. The Worker's own handler runs here,
 * over a bucket in memory that holds a put to its SHA-256 as R2 does, and a fetch that plays the place a file is
 * pulled from: a pull that stores the very bytes or nothing, what it holds said back, its bytes by range, a removal,
 * and every ticket that opens none of it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";
import { importSrc } from "../../_source.mjs";
import { until } from "../../shared/_until.mjs";
import { fixedLength, shaOf, shelfBucket } from "../shelf/_shelf.mjs";

const { answerShelf } = await import(at("apps/relay/src/shelf.ts"));
const entry = (await import(at("apps/relay/src/index.ts"))).default;
const { signTicket } = await import(at("apps/relay/src/ticket.ts"));
const { signShelfTicket } = await importSrc("packages/channels/src/files/relay-ticket.ts");
const { FILE_VIDEO_BYTES_MAX } = await importSrc("packages/contracts/src/files/kinds.ts");

const NOW = Date.parse("2026-11-23T03:00:00Z");
const NOW_S = NOW / 1000;
const TICKET_KEY = "ticket-key-for-this-file";
const TENANT = "5d0c2b7e-0e55-4a53-9b4e-6f1c2a3b4c5d";
const OTHER_TENANT = "7a1e9f30-2c44-4d1b-8f6a-90b1c2d3e4f5";
const FILE = "0b0e6c1e-6f0a-4b6e-9d3e-2a1f5c7d9e11";
const OTHER_FILE = "3c2d1e0f-9a8b-4c7d-8e6f-5a4b3c2d1e0f";
const KEY_OF = (tenant = TENANT, file = FILE) => `${tenant}/${file}/video`;
const FROM_START = "https://files.example.com/storage/v1/object/sign/files/";
const FROM = `${FROM_START}${TENANT}/${FILE}/made.mp4?token=a-signed-address-for-this-file`;
/** What must never be in an answer: the key a ticket is signed with, and where a file was pulled from. */
const NEVER_SAID = [TICKET_KEY, "a-signed-address-for-this-file", "files.example.com"];

/** A video of 3 MiB whose every byte says where it is, so a range read is told from another. */
const VIDEO = Uint8Array.from({ length: 3 * 1024 * 1024 }, (_, i) => (i * 31 + (i >> 8)) & 0xff);
const VIDEO_SHA = shaOf(VIDEO);

/** The place a file is pulled from: the bytes whole, with their length, unless a test says otherwise. */
const wholeFile =
  (bytes = VIDEO) =>
  () =>
    new Response(bytes, {
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": String(bytes.length) },
    });

/** The shelf's world: its bucket, the place a pull reads, a clock, and the timer a pull is cut by, held by the test. */
function world({ source = wholeFile(), shelf = shelfBucket(), from = FROM_START } = {}) {
  const fetched = [];
  const timers = [];
  const deps = {
    fetch: async (url, init = {}) => {
      fetched.push({ url: String(url), init });
      return source(String(url), init);
    },
    nowMs: () => NOW,
    fixedLength,
    after: (ms, run) => {
      const timer = { ms, run, cleared: false };
      timers.push(timer);
      return () => {
        timer.cleared = true;
      };
    },
  };
  const env = { TICKET_KEY, ...(shelf ? { SHELF: shelf } : {}), ...(from ? { SHELF_FROM: from } : {}) };
  return { env, deps, shelf, fetched, timers };
}

const ticketFor = (use, more = {}) =>
  signShelfTicket(TICKET_KEY, { tenant: TENANT, file: FILE, use, expiresAt: NOW_S + 300, ...more });
const putTicket = (more = {}) => ticketFor("put", { bytes: VIDEO.length, sha256: VIDEO_SHA, ...more });
const addressOf = (file = FILE, tail = "") => `https://relay.example.com/shelf/${file}/video${tail}`;

/** One ask of the shelf: a read's ticket rides the address, a write's the header, as the app sends them. */
function ask(w, { method = "GET", file, tail, ticket, bearer, range, body } = {}) {
  const url = new URL(addressOf(file, tail));
  if (ticket) url.searchParams.set("ticket", ticket);
  const headers = { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(range ? { range } : {}) };
  const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
  return answerShelf(new Request(url, init), w.env, w.deps);
}
const pull = (w, { bearer = putTicket(), from = FROM, ...more } = {}) =>
  ask(w, { method: "POST", bearer, body: { from }, ...more });
const bytesOf = async (response) => new Uint8Array(await response.arrayBuffer());
const said = async (response) => [response.status, await response.json()];

test("a pull stores the very bytes under the workspace's and the file's key, and says what it stored", async () => {
  const w = world();
  const answer = await pull(w);
  assert.deepEqual(await said(answer), [201, { bytes: VIDEO.length, sha256: VIDEO_SHA }]);
  assert.deepEqual([...w.shelf.held.keys()], [KEY_OF()]);
  assert.deepEqual(new Uint8Array(w.shelf.held.get(KEY_OF()).bytes), VIDEO);
  assert.equal(w.shelf.held.get(KEY_OF()).contentType, "video/mp4");
  // Asked once, as it was given, following nothing: and the put named the checksum the ticket did.
  assert.equal(w.fetched.length, 1);
  assert.equal(w.fetched[0].url, FROM);
  assert.equal(w.fetched[0].init.redirect, "manual");
  assert.equal(w.shelf.calls.find(([what]) => what === "put")[2].sha256, VIDEO_SHA);
  // The cut that bounds a pull was set at a minute, and let go once the pull ended.
  assert.deepEqual(
    w.timers.map((t) => [t.ms, t.cleared]),
    [[60_000, true]],
  );
});

test("a HEAD says what the shelf holds, its size and its SHA-256, and sends no bytes", async () => {
  const w = world();
  await pull(w);
  const answer = await ask(w, { method: "HEAD", ticket: ticketFor("read"), tail: ".mp4" });
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get("content-length"), String(VIDEO.length));
  assert.equal(answer.headers.get("content-type"), "video/mp4");
  assert.equal(answer.headers.get("accept-ranges"), "bytes");
  assert.equal(answer.headers.get("x-shelf-sha256"), VIDEO_SHA);
  assert.equal(answer.headers.get("cache-control"), "no-store");
  assert.ok(answer.headers.get("etag"));
  assert.equal((await bytesOf(answer)).length, 0);
  // Nothing there: a 404, by HEAD and by GET alike.
  const empty = world();
  const none = await ask(empty, { method: "HEAD", ticket: ticketFor("read") });
  assert.equal(none.status, 404);
  assert.equal(none.headers.get("x-shelf"), "none", "a HEAD has no body: the header says nothing is there");
  // A 404 of another making (a path that is no file's) says no such thing.
  const elsewhere = await answerShelf(
    new Request("https://relay.example.com/shelf/x?ticket=t", { method: "HEAD" }),
    empty.env,
    empty.deps,
  );
  assert.equal(elsewhere.status, 404);
  assert.equal(elsewhere.headers.get("x-shelf"), null);
  assert.deepEqual(await said(await ask(empty, { ticket: ticketFor("read") })), [
    404,
    { error: "shelf", reason: "not_found" },
  ]);
});

test("a GET gives the bytes whole, a range of them, or their end, as the video platform asks", async () => {
  const w = world();
  await pull(w);
  const ticket = ticketFor("read");
  const whole = await ask(w, { ticket });
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get("content-length"), String(VIDEO.length));
  assert.equal(whole.headers.get("accept-ranges"), "bytes");
  assert.deepEqual(await bytesOf(whole), VIDEO);

  const part = await ask(w, { ticket, range: "bytes=1048576-1572863" });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), `bytes 1048576-1572863/${VIDEO.length}`);
  assert.equal(part.headers.get("content-length"), "524288");
  assert.deepEqual(await bytesOf(part), VIDEO.subarray(1048576, 1572864));

  const open = await ask(w, { ticket, range: "bytes=3145000-" });
  assert.equal(open.status, 206);
  assert.equal(open.headers.get("content-range"), `bytes 3145000-${VIDEO.length - 1}/${VIDEO.length}`);
  assert.deepEqual(await bytesOf(open), VIDEO.subarray(3145000));

  // A range that runs past the end is cut at the end, as a file's is.
  const long = await ask(w, { ticket, range: `bytes=3145000-${VIDEO.length + 5000}` });
  assert.equal(long.headers.get("content-range"), `bytes 3145000-${VIDEO.length - 1}/${VIDEO.length}`);

  const tail = await ask(w, { ticket, range: "bytes=-1024" });
  assert.equal(tail.status, 206);
  assert.equal(tail.headers.get("content-range"), `bytes ${VIDEO.length - 1024}-${VIDEO.length - 1}/${VIDEO.length}`);
  assert.deepEqual(await bytesOf(tail), VIDEO.subarray(VIDEO.length - 1024));
});

test("a range that begins past the end, and a list of ranges, are refused as not satisfiable", async () => {
  const w = world();
  await pull(w);
  const ticket = ticketFor("read");
  const past = await ask(w, { ticket, range: `bytes=${VIDEO.length}-` });
  assert.equal(past.status, 416);
  assert.equal(past.headers.get("content-range"), `bytes */${VIDEO.length}`);
  assert.equal((await ask(w, { ticket, range: "bytes=0-9,20-29" })).status, 416);
  assert.equal((await ask(w, { ticket, range: "lines=1-2" })).status, 416);
  // Neither read a byte of the file.
  assert.ok(w.shelf.calls.every(([what]) => what !== "get"));
});

test("a source of other bytes, of another length, cut short or still running at a minute stores nothing", async () => {
  // Other bytes of the same length: R2 itself refuses them, and the relay says mismatch.
  const other = Uint8Array.from(VIDEO, (byte) => byte ^ 0xff);
  const wrong = world({ source: wholeFile(other) });
  assert.deepEqual(await said(await pull(wrong)), [409, { error: "shelf", reason: "mismatch" }]);
  assert.equal(wrong.shelf.held.size, 0);

  // Another length than the ticket names: never begun.
  const short = world({ source: wholeFile(VIDEO.subarray(0, 1000)) });
  assert.deepEqual(await said(await pull(short)), [409, { error: "source", reason: "size" }]);
  assert.equal(short.shelf.calls.length, 0);

  // No length said at all: the same.
  const unsaid = world({ source: () => new Response(new Blob([VIDEO]).stream(), { status: 200 }) });
  assert.deepEqual(await said(await pull(unsaid)), [409, { error: "source", reason: "size" }]);

  // The right length said, and the bytes cut short on the way.
  const cut = world({
    source: () =>
      new Response(new Blob([VIDEO.subarray(0, 1024 * 1024)]).stream(), {
        status: 200,
        headers: { "content-length": String(VIDEO.length) },
      }),
  });
  assert.deepEqual(await said(await pull(cut)), [502, { error: "shelf", reason: "put_failed" }]);
  assert.equal(cut.shelf.held.size, 0);

  // Still running at a minute: the pipe is cut, the put breaks, nothing is stored.
  let slowly;
  const slow = world({
    source: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(VIDEO.subarray(0, 4096));
            slowly = controller;
          },
        }),
        { status: 200, headers: { "content-length": String(VIDEO.length) } },
      ),
  });
  const pulling = pull(slow);
  // The pull has begun once its cut is set; a minute on, the cut runs.
  await until(() => slow.timers.length > 0, "the pull set its cut");
  slow.timers[0].run();
  assert.deepEqual(await said(await pulling), [502, { error: "shelf", reason: "put_failed" }]);
  assert.equal(slow.shelf.held.size, 0);
  assert.ok(slowly, "the source was being read when it was cut");
});

test("a pull reads only an address that begins as an allowed one does, and follows nothing", async () => {
  const refused = [
    ["another host", `https://elsewhere.example.com/storage/v1/object/sign/files/x.mp4`],
    ["the host, another path", "https://files.example.com/storage/v1/object/public/files/x.mp4"],
    ["the host, a path that climbs out", `${FROM_START}../../../admin/keys`],
    ["the host on a port", "https://files.example.com:8443/storage/v1/object/sign/files/x.mp4"],
    ["over http", "http://files.example.com/storage/v1/object/sign/files/x.mp4"],
    ["with a name and a password", "https://user:pass@files.example.com/storage/v1/object/sign/files/x.mp4"],
    ["a host that only begins the same", "https://files.example.com.evil.example/storage/v1/object/sign/files/x.mp4"],
    ["no address", "not an address"],
  ];
  for (const [what, from] of refused) {
    const w = world();
    assert.deepEqual(await said(await pull(w, { from })), [422, { error: "source", reason: "not_allowed" }], what);
    assert.equal(w.fetched.length, 0, `${what}: nothing was fetched`);
  }
  // No allowed address set on the Worker: nothing may be pulled.
  const closed = world({ from: "" });
  assert.equal((await pull(closed)).status, 422);
  assert.equal(closed.fetched.length, 0);
  // Two allowed, with spaces between: either serves.
  const two = world({ from: `https://one.example.com/a/ , ${FROM_START}` });
  assert.equal((await pull(two)).status, 201);
  // An allowed start that names a host alone allows nothing: another host could begin the same.
  for (const start of ["https://files.example.com", "https://files", "files.example.com/"]) {
    const loose = world({ from: start });
    assert.equal((await pull(loose)).status, 422, start);
    assert.equal(loose.fetched.length, 0, `${start}: nothing was fetched`);
  }

  // The source sends the relay elsewhere, refuses, or gives no answer.
  const moved = world({
    source: () => new Response(null, { status: 302, headers: { location: "https://x.example" } }),
  });
  assert.deepEqual(await said(await pull(moved)), [502, { error: "source", reason: "status" }]);
  assert.equal(moved.fetched.length, 1, "a redirect is not followed");
  const gone = world({ source: () => new Response("no such object", { status: 400 }) });
  assert.deepEqual(await said(await pull(gone)), [502, { error: "source", reason: "status" }]);
  const silent = world({
    source: () => {
      throw new Error("no route to host");
    },
  });
  assert.deepEqual(await said(await pull(silent)), [502, { error: "source", reason: "unreachable" }]);
  for (const w of [moved, gone, silent]) assert.equal(w.shelf.calls.length, 0);
});

test("a pull's body names where from and nothing else decides: the bytes and the checksum are the ticket's", async () => {
  // A body that claims other bytes is not believed: the ticket's are put, and the body's are never read.
  const w = world();
  const answer = await ask(w, {
    method: "POST",
    bearer: putTicket(),
    body: { from: FROM, bytes: 5, sha256: "0".repeat(64) },
  });
  assert.equal(answer.status, 201);
  assert.equal(w.shelf.calls.find(([what]) => what === "put")[2].sha256, VIDEO_SHA);
  for (const body of [{}, { from: 5 }, "a string", null]) {
    const refused = await ask(world(), { method: "POST", bearer: putTicket(), body });
    assert.deepEqual(await said(refused), [400, { error: "request", reason: "body" }], JSON.stringify(body));
  }
  const long = await ask(world(), { method: "POST", bearer: putTicket(), body: { from: FROM + "x".repeat(5000) } });
  assert.deepEqual(await said(long), [400, { error: "request", reason: "body" }]);
  // More than a video ever weighs: refused before anything is fetched, at the very number the app holds.
  const heavy = world();
  const most = await pull(heavy, { bearer: putTicket({ bytes: FILE_VIDEO_BYTES_MAX + 1 }) });
  assert.deepEqual(await said(most), [400, { error: "request", reason: "too_large" }]);
  assert.equal(heavy.fetched.length, 0);
  const atMost = world({ source: () => new Response(null, { status: 404 }) });
  assert.equal((await pull(atMost, { bearer: putTicket({ bytes: FILE_VIDEO_BYTES_MAX }) })).status, 502);
  assert.equal(atMost.fetched.length, 1, "a video of the most the app takes is pulled");
});

test("a DELETE takes the file off the shelf, and one that was never there is gone already", async () => {
  const w = world();
  await pull(w);
  const first = await ask(w, { method: "DELETE", bearer: ticketFor("delete") });
  assert.equal(first.status, 204);
  assert.equal(w.shelf.held.size, 0);
  assert.equal((await ask(w, { method: "HEAD", ticket: ticketFor("read") })).status, 404);
  assert.equal((await ask(w, { method: "DELETE", bearer: ticketFor("delete") })).status, 204);
});

test("a ticket does one thing: a read neither puts nor deletes, and a write's ticket reads nothing", async () => {
  const w = world();
  await pull(w);
  const before = w.shelf.calls.length;
  const cases = [
    ["a read's ticket on a pull", { method: "POST", bearer: ticketFor("read"), body: { from: FROM } }],
    ["a delete's ticket on a pull", { method: "POST", bearer: ticketFor("delete"), body: { from: FROM } }],
    ["a read's ticket on a delete", { method: "DELETE", bearer: ticketFor("read") }],
    ["a put's ticket on a delete", { method: "DELETE", bearer: putTicket() }],
    ["a put's ticket on a GET", { ticket: putTicket() }],
    ["a delete's ticket on a HEAD", { method: "HEAD", ticket: ticketFor("delete") }],
  ];
  for (const [what, asked] of cases) {
    const answer = await ask(w, asked);
    assert.equal(answer.status, 403, what);
    if (asked.method !== "HEAD") assert.deepEqual(await answer.json(), { error: "ticket", reason: "use" }, what);
  }
  // A write's ticket rides the header and a read's the address: neither is taken from the other place.
  assert.equal((await ask(w, { method: "POST", ticket: putTicket(), body: { from: FROM } })).status, 403);
  assert.equal((await ask(w, { method: "DELETE", ticket: ticketFor("delete") })).status, 403);
  assert.equal((await ask(w, { bearer: ticketFor("read") })).status, 403);
  assert.equal(w.shelf.calls.length, before, "the bucket was asked nothing");
  assert.equal(w.shelf.held.size, 1);
});

test("a ticket for another file, another workspace, a clip, or none at all opens nothing of this file's", async () => {
  const w = world();
  await pull(w);
  const before = w.shelf.calls.length;
  // Another file's ticket at this file's address.
  const others = signShelfTicket(TICKET_KEY, { tenant: TENANT, file: OTHER_FILE, use: "read", expiresAt: NOW_S + 300 });
  assert.deepEqual(await said(await ask(w, { ticket: others })), [403, { error: "ticket", reason: "other_file" }]);
  // A clip's ticket (v1), for this very id: the shelf's reader knows no such ticket.
  const clips = await signTicket(TICKET_KEY, { item: FILE, expiresAt: NOW_S + 300 });
  assert.deepEqual(await said(await ask(w, { ticket: clips })), [403, { error: "ticket", reason: "malformed" }]);
  // Ended, forged, and none.
  const ended = signShelfTicket(TICKET_KEY, { tenant: TENANT, file: FILE, use: "read", expiresAt: NOW_S - 1 });
  assert.deepEqual(await said(await ask(w, { ticket: ended })), [403, { error: "ticket", reason: "expired" }]);
  const forged = signShelfTicket("another-key", { tenant: TENANT, file: FILE, use: "read", expiresAt: NOW_S + 300 });
  assert.deepEqual(await said(await ask(w, { ticket: forged })), [403, { error: "ticket", reason: "signature" }]);
  assert.equal((await ask(w, {})).status, 403);
  assert.equal(w.shelf.calls.length, before, "the bucket was asked nothing");

  // The same file's id signed for another workspace reaches that workspace's key alone, where nothing is.
  const elsewhere = { tenant: OTHER_TENANT, file: FILE, expiresAt: NOW_S + 300 };
  const read = await ask(w, { ticket: signShelfTicket(TICKET_KEY, { ...elsewhere, use: "read" }) });
  assert.equal(read.status, 404);
  assert.deepEqual(w.shelf.calls.at(-1), ["head", KEY_OF(OTHER_TENANT)]);
  await ask(w, { method: "DELETE", bearer: signShelfTicket(TICKET_KEY, { ...elsewhere, use: "delete" }) });
  assert.deepEqual(w.shelf.calls.at(-1), ["delete", KEY_OF(OTHER_TENANT)]);
  assert.equal(w.shelf.held.size, 1, "this workspace's file is where it was");
  assert.ok(w.shelf.held.has(KEY_OF()));
});

test("a path that is no file's, a method the shelf does not take, and a Worker with no shelf are each said so", async () => {
  const w = world();
  const read = ticketFor("read");
  for (const path of [
    "/shelf/",
    `/shelf/${FILE}`,
    `/shelf/${FILE}/poster`,
    `/shelf/a b/video`,
    `/shelf/${FILE}/video/x`,
  ]) {
    const url = new URL(`https://relay.example.com${path}`);
    url.searchParams.set("ticket", read);
    const answer = await answerShelf(new Request(url), w.env, w.deps);
    assert.deepEqual(await said(answer), [404, { error: "request", reason: "path" }], path);
  }
  const put = await ask(w, { method: "PUT", bearer: putTicket() });
  assert.equal(put.status, 405);
  assert.equal(put.headers.get("allow"), "GET, HEAD, POST, DELETE");
  // A ticket that holds, on a Worker bound to no bucket: off, for every ask. One that does not hold learns nothing.
  const unbound = world({ shelf: null });
  assert.deepEqual(await said(await ask(unbound, { ticket: read })), [503, { error: "shelf", reason: "off" }]);
  assert.equal((await ask(unbound, { method: "HEAD", ticket: read })).status, 503);
  assert.deepEqual(await said(await pull(unbound)), [503, { error: "shelf", reason: "off" }]);
  assert.equal((await ask(unbound, { ticket: "not-a-ticket" })).status, 403);
});

test("no answer says the ticket's key or where a file was pulled from", async () => {
  const w = world();
  const answers = [
    await pull(w),
    await ask(w, { ticket: ticketFor("read"), range: "bytes=0-9" }),
    await pull(world({ source: wholeFile(VIDEO.subarray(0, 10)) })),
    await pull(world(), { from: "https://elsewhere.example.com/x" }),
    await ask(w, { ticket: "forged" }),
  ];
  for (const answer of answers) {
    const text = `${[...answer.headers].flat().join(" ")} ${answer.status === 206 ? "" : await answer.text()}`;
    for (const secret of NEVER_SAID) assert.ok(!text.includes(secret), `${answer.status} says ${secret}`);
  }
});

test("the Worker's one door sends a shelf's path to the shelf and every other to the clip's road", async () => {
  // No deps here: the entry runs as Cloudflare runs it. A ticket that does not hold is refused before anything is asked.
  const env = { TICKET_KEY, KEY_DOOR_SECRET: "app-key", KEY_DOOR_URL: "https://app.example.com/api/sources/key" };
  const shelf = await entry.fetch(new Request(`${addressOf()}?ticket=nothing`), env);
  assert.deepEqual(await said(shelf), [403, { error: "ticket", reason: "malformed" }]);
  const clip = await entry.fetch(new Request("https://relay.example.com/clip/item-1?ticket=nothing"), env);
  assert.deepEqual(await said(clip), [403, { error: "ticket", reason: "malformed" }]);
  const neither = await entry.fetch(new Request("https://relay.example.com/elsewhere"), env);
  assert.deepEqual(await said(neither), [404, { error: "request", reason: "path" }]);
});

/* ------------------------------------------------------------------------------- what a workspace's shelf holds -- */

const listTicket = (tenant = TENANT) => signShelfTicket(TICKET_KEY, { tenant, use: "list", expiresAt: NOW_S + 300 });
/** One ask of the list: its ticket rides the header, as every ticket the app itself uses but a read's does. */
function askList(w, { method = "GET", bearer = listTicket(), ticket, cursor } = {}) {
  const url = new URL("https://relay.example.com/shelf/list");
  if (ticket) url.searchParams.set("ticket", ticket);
  if (cursor !== undefined) url.searchParams.set("cursor", cursor);
  const init = { method, headers: bearer ? { authorization: `Bearer ${bearer}` } : {} };
  return answerShelf(new Request(url, init), w.env, w.deps);
}
/** A file's object put straight into the bucket: what a list reads is its key, never its bytes. */
const put = (w, key) => w.shelf.held.set(key, { bytes: Buffer.from("x"), sha256: "0".repeat(64) });
const idOf = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("the list says which files one workspace's shelf holds, by their ids, and nothing of another's", async () => {
  const w = world();
  put(w, KEY_OF(TENANT, FILE));
  put(w, KEY_OF(TENANT, OTHER_FILE));
  put(w, KEY_OF(OTHER_TENANT, FILE));
  assert.deepEqual(await said(await askList(w)), [
    200,
    { files: [FILE, OTHER_FILE].sort(), other: 0, more: false, cursor: null },
  ]);
  // The prefix asked of the bucket is the ticket's own workspace, whole, with its slash.
  assert.deepEqual(w.shelf.calls.at(-1), ["list", `${TENANT}/`, null]);
  assert.deepEqual(await said(await askList(w, { bearer: listTicket(OTHER_TENANT) })), [
    200,
    { files: [FILE], other: 0, more: false, cursor: null },
  ]);
  // A workspace with nothing there holds none: an answer, not a refusal.
  const empty = signShelfTicket(TICKET_KEY, { tenant: idOf(9), use: "list", expiresAt: NOW_S + 300 });
  assert.deepEqual(await said(await askList(w, { bearer: empty })), [
    200,
    { files: [], other: 0, more: false, cursor: null },
  ]);
  assert.equal((await askList(w)).headers.get("cache-control"), "no-store");
});

test("a long list comes a page at a time, and its end is said, never guessed from a short page", async () => {
  const w = world();
  const all = Array.from({ length: 2_300 }, (_, i) => idOf(i + 1));
  for (const file of all) put(w, KEY_OF(TENANT, file));
  const seen = [];
  let cursor;
  let pages = 0;
  for (;;) {
    const [status, page] = await said(await askList(w, { cursor }));
    assert.equal(status, 200);
    seen.push(...page.files);
    pages += 1;
    if (!page.more) {
      assert.equal(page.cursor, null, "the last page hands no cursor on");
      break;
    }
    assert.ok(page.cursor, "more to come names where to go on from");
    cursor = page.cursor;
  }
  assert.equal(pages, 3, "a thousand a page");
  assert.deepEqual(seen, all, "every file once, in order");
  // The bucket may hand over fewer keys than a page holds and still have more: `more` is the bucket's own word.
  const short = world();
  put(short, KEY_OF(TENANT, FILE));
  short.shelf.list = async () => ({ objects: [{ key: KEY_OF(TENANT, FILE) }], truncated: true, cursor: "next-page" });
  assert.deepEqual(await said(await askList(short)), [
    200,
    { files: [FILE], other: 0, more: true, cursor: "next-page" },
  ]);
});

test("a key under a workspace's name that is no file's is counted, never named", async () => {
  const w = world();
  put(w, KEY_OF(TENANT, FILE));
  put(w, `${TENANT}/${OTHER_FILE}/poster`);
  put(w, `${TENANT}/stray`);
  put(w, `${TENANT}/${OTHER_FILE}/video/again`);
  assert.deepEqual(await said(await askList(w)), [200, { files: [FILE], other: 3, more: false, cursor: null }]);
});

test("only a list's ticket lists, in the header, by GET: a file's ticket lists nothing and a list's reads no file", async () => {
  const w = world();
  await pull(w);
  const before = w.shelf.calls.length;
  for (const [what, asked] of [
    ["a read's ticket", { bearer: ticketFor("read") }],
    ["a delete's ticket", { bearer: ticketFor("delete") }],
    ["a put's ticket", { bearer: putTicket() }],
  ])
    assert.deepEqual(await said(await askList(w, asked)), [403, { error: "ticket", reason: "use" }], what);
  // Its ticket rides the header and never an address.
  assert.equal((await askList(w, { bearer: null, ticket: listTicket() })).status, 403);
  assert.equal((await askList(w, { bearer: null })).status, 403);
  // Nor is it opened by a clip's ticket, signed under the same key.
  const clip = await signTicket(TICKET_KEY, { item: FILE, expiresAt: NOW_S + 300 });
  assert.equal((await askList(w, { bearer: clip })).status, 403);
  for (const method of ["POST", "DELETE", "HEAD", "PUT"]) {
    const answer = await askList(w, { method });
    assert.deepEqual([answer.status, answer.headers.get("allow")], [405, "GET"], method);
  }
  // A list's ticket opens no file: not its record, its bytes, a put or a removal.
  const list = listTicket();
  assert.equal((await ask(w, { method: "HEAD", ticket: list })).status, 403);
  assert.deepEqual(await said(await ask(w, { ticket: list })), [403, { error: "ticket", reason: "use" }]);
  assert.equal((await ask(w, { method: "DELETE", bearer: list })).status, 403);
  assert.equal((await ask(w, { method: "POST", bearer: list, body: { from: FROM } })).status, 403);
  assert.equal(w.shelf.calls.length, before, "the bucket was asked nothing");
  assert.equal(w.shelf.held.size, 1);
  // A cursor that is none, and a Worker with no shelf, are each said so.
  assert.deepEqual(await said(await askList(w, { cursor: "" })), [400, { error: "request", reason: "cursor" }]);
  assert.deepEqual(await said(await askList(w, { cursor: "c".repeat(2_049) })), [
    400,
    { error: "request", reason: "cursor" },
  ]);
  assert.deepEqual(await said(await askList(world({ shelf: null }))), [503, { error: "shelf", reason: "off" }]);
  // A bucket that gives no answer is said as that, and nothing of the failure with it.
  const silent = world();
  silent.shelf.list = async () => {
    throw new Error("internal error at bucket chanlytics-shelf");
  };
  assert.deepEqual(await said(await askList(silent)), [502, { error: "shelf", reason: "unreachable" }]);
});

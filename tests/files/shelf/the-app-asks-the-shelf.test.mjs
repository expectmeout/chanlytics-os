/**
 * The app's side of the shelf (packages/channels/src/files/shelf.ts, the archive plan's B2): a made video's file put
 * on the shelf, what the shelf holds of it read back, and its removal. The relay's own handler answers here, over a
 * bucket in memory, so what the app sends is what the Worker takes. Three answers are kept apart all the way: the
 * shelf holds none, the shelf gave no answer, and the shelf holds other bytes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";
import { importSrc } from "../../_source.mjs";
import { shaOf, shelfRelay } from "./_shelf.mjs";

const { putOnShelf, readShelfRecord, relayShelfAddress, removeFromShelf } = await importSrc(
  "packages/channels/src/files/shelf.ts",
);
const { readShelfTicket } = await import(at("apps/relay/src/ticket.ts"));

const RELAY_URL = "https://relay.example.com";
const TICKET_KEY = "ticket-key-for-this-file";
const SHELF = { relayUrl: RELAY_URL, ticketKey: TICKET_KEY };
const TENANT = "5d0c2b7e-0e55-4a53-9b4e-6f1c2a3b4c5d";
const FILE = "0b0e6c1e-6f0a-4b6e-9d3e-2a1f5c7d9e11";
const VIDEO_OF = { tenantId: TENANT, fileId: FILE };
const FROM_START = "https://files.example.com/storage/v1/object/sign/files/";
const FROM = `${FROM_START}${TENANT}/${FILE}/made.mp4?token=a-signed-address`;
const VIDEO = Uint8Array.from({ length: 256 * 1024 }, (_, i) => (i * 31 + (i >> 8)) & 0xff);
const SHA = shaOf(VIDEO);
const KEY = `${TENANT}/${FILE}/video`;

const whole =
  (bytes = VIDEO) =>
  () =>
    new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } });

/** The app's world: its calls go out through one fetch, and the relay's own handler answers the relay's address. */
function world({ source = whole(), ...relayOptions } = {}) {
  const relay = shelfRelay({ relayUrl: RELAY_URL, ticketKey: TICKET_KEY, from: FROM_START, source, ...relayOptions });
  const deps = {
    fetch: (url, init) => {
      assert.ok(relay.isRelays(url), `the app asks the relay alone, not ${url}`);
      return relay.answer(url, init);
    },
    // No waiting between tries here.
    sleep: async () => {},
  };
  return { relay, deps };
}
const put = (w, more = {}) =>
  putOnShelf(SHELF, { ...VIDEO_OF, from: FROM, bytes: VIDEO.length, sha256: SHA, ...more }, w.deps);

test("a file put on the shelf is there under its workspace's key, and its record reads back the same", async () => {
  const w = world();
  assert.deepEqual(await put(w), { ok: true, record: { bytes: VIDEO.length, sha256: SHA } });
  assert.deepEqual([...w.relay.shelf.held.keys()], [KEY]);
  assert.deepEqual(await readShelfRecord(SHELF, VIDEO_OF, w.deps), {
    ok: true,
    record: { bytes: VIDEO.length, sha256: SHA },
  });
});

test("a put's and a delete's tickets ride the header, a read's the address, and each says only what it may do", async () => {
  const w = world();
  await put(w);
  await readShelfRecord(SHELF, VIDEO_OF, w.deps);
  await removeFromShelf(SHELF, VIDEO_OF, w.deps);
  const [pulled, read, removed] = w.relay.asked;
  const claimOf = (ticket) => readShelfTicket(TICKET_KEY, ticket, Date.now());

  assert.equal(pulled.method, "POST");
  assert.equal(pulled.url, `${RELAY_URL}/shelf/${FILE}/video`, "no ticket in a write's address");
  assert.deepEqual(JSON.parse(pulled.body), { from: FROM });
  const putClaim = await claimOf(pulled.headers.authorization.replace(/^Bearer /, ""));
  assert.deepEqual(
    [putClaim.ok, putClaim.tenant, putClaim.file, putClaim.use, putClaim.bytes, putClaim.sha256],
    [true, TENANT, FILE, "put", VIDEO.length, SHA],
  );
  const minutesLeft = (putClaim.expiresAt * 1000 - Date.now()) / 60_000;
  assert.ok(minutesLeft > 4.9 && minutesLeft <= 5, `a write's ticket runs five minutes, not ${minutesLeft}`);

  assert.equal(read.method, "HEAD");
  const readAt = new URL(read.url);
  assert.equal(readAt.pathname, `/shelf/${FILE}/video`);
  assert.equal(read.headers.authorization, undefined);
  assert.equal((await claimOf(readAt.searchParams.get("ticket"))).use, "read");

  assert.equal(removed.method, "DELETE");
  assert.equal(removed.url, `${RELAY_URL}/shelf/${FILE}/video`);
  assert.equal((await claimOf(removed.headers.authorization.replace(/^Bearer /, ""))).use, "delete");
});

test("holding none, giving no answer and holding other bytes are three answers, never one", async () => {
  // Nothing there: the shelf says so itself.
  const empty = world();
  assert.deepEqual(await readShelfRecord(SHELF, VIDEO_OF, empty.deps), { ok: true, record: null });
  // No answer at all, on each try.
  const down = world();
  down.relay.state.down = true;
  assert.deepEqual(await readShelfRecord(SHELF, VIDEO_OF, down.deps), { ok: false });
  assert.equal(down.relay.asked.length, 2, "a read is asked once more before it is given up");
  // A Worker bound to no bucket, and a 404 the shelf did not say (a relay older than the shelf): no answer, not "none".
  const unbound = world({ shelf: null });
  assert.deepEqual(await readShelfRecord(SHELF, VIDEO_OF, unbound.deps), { ok: false });
  const older = { fetch: async () => new Response(null, { status: 404 }), sleep: async () => {} };
  assert.deepEqual(await readShelfRecord(SHELF, VIDEO_OF, older), { ok: false });
  // Other bytes: what the shelf holds is said as it is, and whoever asked compares.
  const other = Uint8Array.from(VIDEO, (byte) => byte ^ 0xff);
  const swapped = world({ source: whole(other) });
  await putOnShelf(SHELF, { ...VIDEO_OF, from: FROM, bytes: other.length, sha256: shaOf(other) }, swapped.deps);
  assert.deepEqual(await readShelfRecord(SHELF, VIDEO_OF, swapped.deps), {
    ok: true,
    record: { bytes: other.length, sha256: shaOf(other) },
  });
});

test("a put that the shelf refuses says why, in a word the job can act on", async () => {
  const cases = [
    [
      "other bytes than the checksum names",
      world({ source: whole(Uint8Array.from(VIDEO, (b) => b ^ 1)) }),
      {},
      "mismatch",
    ],
    ["another length", world({ source: whole(VIDEO.subarray(0, 100)) }), {}, "size"],
    ["the source refuses", world({ source: () => new Response("no such object", { status: 400 }) }), {}, "source"],
    ["an address not allowed", world(), { from: "https://elsewhere.example.com/x.mp4" }, "source"],
    ["a Worker bound to no bucket", world({ shelf: null }), {}, "off"],
  ];
  for (const [what, w, more, why] of cases) {
    assert.deepEqual(await put(w, more), { ok: false, why }, what);
    assert.equal(w.relay.shelf?.held.size ?? 0, 0, `${what}: nothing is stored`);
  }
  // No answer, and an answer of no known making: failed, to be tried again. A put is asked once: its job tries again.
  const down = world();
  down.relay.state.down = true;
  assert.deepEqual(await put(down), { ok: false, why: "failed" });
  assert.equal(down.relay.asked.length, 1);
  const odd = { fetch: async () => new Response("<html>bad gateway</html>", { status: 502 }), sleep: async () => {} };
  assert.deepEqual(await putOnShelf(SHELF, { ...VIDEO_OF, from: FROM, bytes: 1, sha256: SHA }, odd), {
    ok: false,
    why: "failed",
  });
});

test("a removal answers whether the shelf let it go: gone already is gone, and no answer is not", async () => {
  const w = world();
  await put(w);
  assert.equal(await removeFromShelf(SHELF, VIDEO_OF, w.deps), true);
  assert.equal(w.relay.shelf.held.size, 0);
  assert.equal(await removeFromShelf(SHELF, VIDEO_OF, w.deps), true, "one that was never there is gone already");
  const down = world();
  down.relay.state.down = true;
  assert.equal(await removeFromShelf(SHELF, VIDEO_OF, down.deps), false);
  const unbound = world({ shelf: null });
  assert.equal(await removeFromShelf(SHELF, VIDEO_OF, unbound.deps), false);
});

test("the address the video platform is sent to is the relay's, ends as a video's does and carries a read's ticket", async () => {
  const ends = Math.floor(Date.now() / 1000) + 6 * 3600;
  const address = new URL(relayShelfAddress(SHELF, VIDEO_OF, ends));
  assert.equal(address.origin, RELAY_URL);
  assert.equal(address.pathname, `/shelf/${FILE}/video.mp4`);
  assert.deepEqual([...address.searchParams.keys()], ["ticket"]);
  const claim = await readShelfTicket(TICKET_KEY, address.searchParams.get("ticket"), Date.now());
  assert.deepEqual(claim, { ok: true, tenant: TENANT, file: FILE, use: "read", expiresAt: ends });
  // And the relay answers it: a HEAD and a range, as the platform asks them.
  const w = world();
  await put(w);
  const head = await w.relay.answer(address.toString(), { method: "HEAD" });
  assert.deepEqual([head.status, head.headers.get("content-length")], [200, String(VIDEO.length)]);
  const part = await w.relay.answer(address.toString(), { headers: { range: "bytes=0-1023" } });
  assert.equal(part.status, 206);
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), VIDEO.subarray(0, 1024));
  assert.throws(() => relayShelfAddress({ ...SHELF, relayUrl: "http://relay.example.com" }, VIDEO_OF, ends), /https/);
});

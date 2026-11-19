/**
 * A clip on its way from a Drive to the video platform (the footage sources plan's acceptance tests 8 and 9), with the
 * real pieces joined in one process: the relay's own handler (apps/relay), the app's key door behind it (apps/edge
 * api/sources/key), and a Drive that answers from memory and can break one download off. What plays the video
 * platform here asks as it does on real accounts: one HEAD, one GET, and after a break a GET from its last 4 MiB.
 *
 * And the key door alone: it opens for the relay's knock, a ticket the app signed, and a clip being taken right now,
 * and for nothing else; the hour's key is in its answer and in no log line.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { linesOf } from "../../_log-lines.mjs";
import { importSrc } from "../../_source.mjs";
import {
  DOOR_SECRET,
  DRIVE_KEY,
  REFRESH_TOKEN,
  T,
  T2,
  TICKET_KEY,
  itemRow,
  keyDoor,
  realFetch,
  setPg,
  theSync,
  world,
} from "./_world.mjs";

const { answerRelay } = await import(at("apps/relay/src/relay.ts"));
const { signRelayTicket, relayClipAddress } = await importSrc("packages/channels/src/files/relay-ticket.ts");

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const MIB = 1_048_576;
const DOOR_URL = "https://edge.example.com/api/sources/key";
const RELAY_ENV = { TICKET_KEY, KEY_DOOR_SECRET: DOOR_SECRET, KEY_DOOR_URL: DOOR_URL };
const FILE_ID = "drive-file-large";
/** A clip of 10 MiB whose every byte says where it is, so a clip put back together wrong is told from a whole one. */
const CLIP = new Uint8Array(10 * MIB);
for (let i = 0; i < CLIP.length; i += 1) CLIP[i] = (i * 31 + (i >> 8)) & 0xff;

const inSix = () => Math.floor(Date.now() / 1000) + 6 * 3600;
const ticketFor = (item, expiresAt = inSix(), key = TICKET_KEY) => signRelayTicket(key, { item, expiresAt });

/** Drive, as the relay meets it: a file's record, or its bytes for a range; `breakAt` cuts the first download there. */
function driveForRelay({ breakAt = null } = {}) {
  const downloads = [];
  let broke = false;
  const answer = (url, init) => {
    const asked = new URL(url);
    assert.equal(asked.pathname, `/drive/v3/files/${FILE_ID}`, "the relay asks Drive for the ticket's file alone");
    assert.equal(init.headers.authorization, `Bearer ${DRIVE_KEY}`);
    if (asked.searchParams.get("alt") !== "media")
      return new Response(JSON.stringify({ size: String(CLIP.length), mimeType: "video/quicktime" }), { status: 200 });
    const range = /^bytes=(\d+)-(\d*)$/.exec(init.headers.range ?? "bytes=0-");
    const from = Number(range[1]);
    const to = range[2] ? Number(range[2]) : CLIP.length - 1;
    downloads.push({ from, to });
    const part = CLIP.subarray(from, to + 1);
    const cut = breakAt !== null && !broke ? breakAt : null;
    if (cut !== null) broke = true;
    // A broken download delivers what it sent, then dies: the bytes before the break are the fetcher's to keep.
    let sent = false;
    const body = new ReadableStream({
      pull(controller) {
        if (cut === null) {
          controller.enqueue(part);
          controller.close();
        } else if (!sent) {
          sent = true;
          controller.enqueue(part.subarray(0, cut));
        } else {
          controller.error(new Error("the connection was reset"));
        }
      },
    });
    return new Response(body, {
      status: 206,
      headers: {
        "content-type": "video/quicktime",
        "content-length": String(part.length),
        "content-range": `bytes ${from}-${to}/${CLIP.length}`,
      },
    });
  };
  return { downloads, answer };
}

/** The relay with the app's real key door behind it and Drive beyond: every call the relay makes is kept. */
function relayOver(drive) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === DOOR_URL) return keyDoor(new Request(DOOR_URL, init));
    return drive.answer(String(url), init);
  };
  const ask = (address, method, range) =>
    answerRelay(new Request(address, { method, headers: range ? { range } : {} }), RELAY_ENV, {
      fetch,
      nowMs: () => Date.now(),
    });
  return { calls, ask };
}

/** A body read as far as it comes: what arrived before it broke, and whether it broke. */
async function readAsFarAsItComes(response) {
  const reader = response.body.getReader();
  const parts = [];
  let broke = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
  } catch {
    // The download broke off: what arrived so far is kept, as a fetcher keeps it.
    broke = true;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return { bytes: out, broke };
}

/**
 * The video platform's fetch of an address, as it was measured on real accounts: one HEAD, one GET of the whole, and
 * after a break one more GET from its last 4 MiB. Answers the clip as it holds it at the end.
 */
async function fetchAsThePlatformDoes(relay, address) {
  const head = await relay.ask(address, "HEAD");
  assert.equal(head.status, 200);
  const size = Number(head.headers.get("content-length"));
  const held = new Uint8Array(size);
  let have = 0;
  for (let tries = 0; have < size && tries < 3; tries += 1) {
    const from = Math.floor(have / (4 * MIB)) * 4 * MIB;
    const got = await relay.ask(address, "GET", `bytes=${from}-`);
    assert.equal(got.status, 206);
    const { bytes } = await readAsFarAsItComes(got);
    held.set(bytes, from);
    have = from + bytes.length;
  }
  return { held, have, size };
}

/** One clip being taken: its item, the world, and its address as the take would hand it to the video platform. */
function clipBeingTaken(over = {}) {
  const item = itemRow({ provider_id: FILE_ID, state: "taking", ...over });
  const w = world({ tenants: [T, T2], items: [item] });
  const opened = theSync({ drive: {} });
  const ticket = ticketFor(item.id);
  const address = relayClipAddress("https://relay.example", { item: item.id, ticket, extension: "mov" });
  return { item, w, opened, ticket, address };
}

const knock = (body, secret = DOOR_SECRET) =>
  keyDoor(
    new Request(DOOR_URL, {
      method: "POST",
      headers: { ...(secret ? { authorization: `Bearer ${secret}` } : {}), "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const answered = async (response) => [response.status, await response.json()];

test("a large clip arrives whole after a forced break: the platform asks again from its last 4 MiB, and no more", async () => {
  const { w, address } = clipBeingTaken();
  // The download breaks off 6.5 MiB in.
  const drive = driveForRelay({ breakAt: 6 * MIB + MIB / 2 });
  const relay = relayOver(drive);
  const { result: fetched, lines } = await linesOf(() => fetchAsThePlatformDoes(relay, address));
  assert.equal(fetched.have, CLIP.length, "every byte arrived");
  assert.ok(Buffer.from(fetched.held).equals(Buffer.from(CLIP)), "and the clip is whole, byte for byte");
  assert.deepEqual(
    drive.downloads,
    [
      { from: 0, to: CLIP.length - 1 },
      { from: 4 * MIB, to: CLIP.length - 1 },
    ],
    "one download, then one more from the last 4 MiB: a break neither loses the clip nor starts it over",
  );
  // Google's units, counted where they are spent: the record's 5, a download's 200, and 200 more for the break.
  assert.equal(w.tables.source_days[0].units, 405);
  // What the relay was handed for each request is an hour's key from the door; nothing wrote it down.
  assert.ok(!JSON.stringify(lines).includes(DRIVE_KEY), "no Google key in a log line");
  assert.ok(!JSON.stringify(lines).includes(REFRESH_TOKEN));
  assert.equal(lines.filter((l) => l.event === "source_key" && l.level === "info").length, 3);
  for (const call of relay.calls) assert.ok(!call.url.includes(DRIVE_KEY), "no Google key in an address");
  assert.ok(!address.includes(DRIVE_KEY), "the clip's address carries a ticket, never a key");
});

test("a clip with no break is one HEAD and one GET: 205 of Google's units", async () => {
  const { w, address } = clipBeingTaken();
  const drive = driveForRelay();
  const fetched = await fetchAsThePlatformDoes(relayOver(drive), address);
  assert.ok(Buffer.from(fetched.held).equals(Buffer.from(CLIP)));
  assert.equal(drive.downloads.length, 1);
  assert.equal(w.tables.source_days[0].units, 205);
});

test("the key door answers the relay's knock with an hour's key for the ticket's own file", async () => {
  const { item, opened, ticket } = clipBeingTaken();
  assert.deepEqual(await answered(await knock({ ticket, method: "GET", range: "bytes=0-" })), [
    200,
    { access_token: DRIVE_KEY, file_id: FILE_ID },
  ]);
  assert.deepEqual(
    opened,
    [{ tenantId: T, sourceId: item.source_id }],
    "through the sync's own reader, for its workspace",
  );
});

test("a ticket opens one file and nothing else: another item's address, another workspace's clip", async () => {
  const mine = itemRow({ provider_id: FILE_ID, state: "taking" });
  const theirs = itemRow({ tenant_id: T2, provider_id: "drive-file-theirs", state: "taking" });
  const w = world({ tenants: [T, T2], items: [mine, theirs] });
  theirs.source_id = w.tables.media_sources[1].id;
  const opened = theSync({ drive: {} });
  const relay = relayOver(driveForRelay());
  // My ticket on their clip's address: the relay refuses before it knocks anywhere.
  const crossed = relayClipAddress("https://relay.example", {
    item: theirs.id,
    ticket: ticketFor(mine.id),
    extension: "mov",
  });
  const refused = await relay.ask(crossed, "GET");
  assert.deepEqual([refused.status, await refused.json()], [403, { error: "ticket", reason: "other_file" }]);
  assert.equal(relay.calls.length, 0);
  // And the door, asked with my ticket, names my file and opens my workspace's folder, whoever asks.
  const [, body] = await answered(await knock({ ticket: ticketFor(mine.id), method: "HEAD", range: null }));
  assert.equal(body.file_id, FILE_ID);
  assert.deepEqual(opened, [{ tenantId: T, sourceId: mine.source_id }]);
});

test("the door opens only for a clip being taken right now, however long its ticket still runs", async () => {
  for (const [over, what] of [
    [{ state: "in" }, "a clip already in"],
    [{ state: "failed" }, "one that failed"],
    [{ state: "waiting" }, "one still waiting"],
    [{ state: "gone" }, "one that is gone"],
    [{ kind: "image" }, "a photo"],
  ]) {
    const { ticket, opened, address } = clipBeingTaken(over);
    assert.deepEqual(
      await answered(await knock({ ticket, method: "GET", range: null })),
      [404, { ok: false, error: "not_found" }],
      what,
    );
    assert.equal(opened.length, 0, `${what}: no key is even asked for`);
    // Through the relay the video platform reads a plain refusal, and Drive is never asked.
    const relay = relayOver(driveForRelay());
    const said = await relay.ask(address, "GET");
    assert.deepEqual([said.status, await said.json()], [403, { error: "key_door", reason: "refused" }]);
    assert.ok(relay.calls.every((c) => c.url === DOOR_URL));
  }
  // A ticket for an item that never was.
  theSync({ drive: {} });
  world({});
  const nobody = ticketFor("0b0e6c1e-6f0a-4b6e-9d3e-2a1f5c7d9e11");
  assert.equal((await knock({ ticket: nobody, method: "GET", range: null })).status, 404);
  assert.equal((await knock({ ticket: ticketFor("not-a-row-id"), method: "GET", range: null })).status, 404);
});

test("the door refuses a knock without the app's key, and a ticket that is ended, forged or signed too long", async () => {
  const { item, ticket } = clipBeingTaken();
  assert.deepEqual(await answered(await knock({ ticket, method: "GET", range: null }, "another-key")), [
    401,
    { ok: false, error: "unauthorized" },
  ]);
  assert.equal((await knock({ ticket, method: "GET", range: null }, null)).status, 401);
  const past = Math.floor(Date.now() / 1000) - 60;
  assert.deepEqual(await answered(await knock({ ticket: ticketFor(item.id, past), method: "GET", range: null })), [
    403,
    { ok: false, error: "token_expired" },
  ]);
  assert.deepEqual(
    await answered(
      await knock({ ticket: ticketFor(item.id, inSix(), "another-ticket-key"), method: "GET", range: null }),
    ),
    [403, { ok: false, error: "token_signature" }],
  );
  const tooLong = Math.floor(Date.now() / 1000) + 25 * 3600;
  assert.equal((await knock({ ticket: ticketFor(item.id, tooLong), method: "GET", range: null })).status, 403);
  assert.equal((await knock({ method: "GET" })).status, 400, "no ticket asked nothing");
  assert.equal((await knock({ ticket, method: "DELETE", range: null })).status, 400);
});

test("a folder that may not be read opens nothing, and Google giving no answer is a 503 the platform asks again on", async () => {
  const closed = clipBeingTaken();
  theSync({ drive: {}, closed: "whoever connected the account left" });
  assert.deepEqual(await answered(await knock({ ticket: closed.ticket, method: "GET", range: null })), [
    404,
    { ok: false, error: "not_connected" },
  ]);

  const silent = clipBeingTaken();
  theSync({ drive: {}, silent: true });
  const { result: response, lines } = await linesOf(() => knock({ ticket: silent.ticket, method: "GET", range: null }));
  assert.deepEqual(await answered(response), [503, { ok: false, error: "unavailable" }]);
  assert.deepEqual([lines.at(-1).event, lines.at(-1).level], ["source_key", "error"]);
  // The relay passes that on as it is, so the video platform's fetch waits and asks again.
  const relay = relayOver(driveForRelay());
  assert.equal((await relay.ask(silent.address, "GET")).status, 503);
});

test("a deployment without the relay's keys has no such door", async () => {
  const { ticket } = clipBeingTaken();
  const kept = process.env.FOOTAGE_KEY_DOOR_SECRET;
  delete process.env.FOOTAGE_KEY_DOOR_SECRET;
  try {
    assert.equal((await knock({ ticket, method: "GET", range: null })).status, 404);
  } finally {
    process.env.FOOTAGE_KEY_DOOR_SECRET = kept;
  }
});

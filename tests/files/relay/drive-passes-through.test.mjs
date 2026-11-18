/**
 * The relay (footage sources, plan v4; apps/relay): one clip of a Google Drive answered to whoever holds its ticket, so the
 * video platform fetches it by address. The Worker's own handler runs here, over a fetch that plays the app's key door and
 * Drive from memory: a HEAD, a range, the whole clip, a ticket that has ended or names another file, Drive's refusals passed
 * on as they are, and no key or file name in any answer or log.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";

const { answerRelay } = await import(at("apps/relay/src/relay.ts"));
const { signTicket, readTicket } = await import(at("apps/relay/src/ticket.ts"));
/** The longest a ticket runs: a day. */
const TICKET_SECONDS_MAX = 24 * 60 * 60;

const NOW = Date.parse("2026-11-17T12:00:00Z");
const NOW_S = NOW / 1000;
const HOUR_S = 60 * 60;
const ENV = {
  TICKET_KEY: "ticket-key-for-this-file",
  KEY_DOOR_SECRET: "app-key-for-this-file",
  KEY_DOOR_URL: "https://app.example.com/api/sources/key",
};
const ITEM = "item-1";
const FILE_ID = "drive-file-1";
const DRIVE_KEY = "ya29.a-drive-key-for-this-file";
const FILE_NAME = "Saturday colour.MOV";
/** What must never be in an answer or a log: the keys, the file's name and its id at Drive. */
const NEVER_SAID = [DRIVE_KEY, ENV.TICKET_KEY, ENV.KEY_DOOR_SECRET, FILE_NAME, FILE_ID];

/** A clip of 3 MiB whose every byte says where it is, so a range read is told from another. */
const CLIP = Uint8Array.from({ length: 3 * 1024 * 1024 }, (_, i) => (i * 31 + (i >> 8)) & 0xff);

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

/** Drive, from memory: a file's record, or its bytes for the range asked. */
function drive(url, init) {
  const asked = new URL(url);
  assert.equal(asked.origin + asked.pathname, `https://www.googleapis.com/drive/v3/files/${FILE_ID}`);
  assert.equal(asked.searchParams.get("supportsAllDrives"), "true", "a shared drive's file is read too");
  assert.equal(init.headers.authorization, `Bearer ${DRIVE_KEY}`);
  if (asked.searchParams.get("alt") !== "media") {
    assert.equal(asked.searchParams.get("fields"), "size,mimeType");
    return json({ size: String(CLIP.length), mimeType: "video/quicktime" });
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(init.headers.range ?? "");
  if (!range)
    return new Response(CLIP, {
      status: 200,
      headers: { "content-type": "video/quicktime", "content-length": String(CLIP.length) },
    });
  const from = Number(range[1]);
  const to = range[2] ? Math.min(Number(range[2]), CLIP.length - 1) : CLIP.length - 1;
  return new Response(CLIP.subarray(from, to + 1), {
    status: 206,
    headers: {
      "content-type": "video/quicktime",
      "content-length": String(to - from + 1),
      "content-range": `bytes ${from}-${to}/${CLIP.length}`,
      "x-guploader-uploadid": "drive-says-more-than-is-passed-on",
    },
  });
}

/** The relay's world: the key door and Drive behind one fetch, every call kept, and a clock. */
function world({ door, files = drive } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === ENV.KEY_DOOR_URL)
      return door ? door(init) : json({ access_token: DRIVE_KEY, file_id: FILE_ID });
    return files(String(url), init);
  };
  return { calls, deps: { fetch, nowMs: () => NOW } };
}

const ticketFor = (item = ITEM, expiresAt = NOW_S + 2 * HOUR_S, key = ENV.TICKET_KEY) =>
  signTicket(key, { item, expiresAt });
const addressOf = (ticket, item = ITEM, tail = "") =>
  `https://relay.example.com/clip/${item}${tail}${ticket === null ? "" : `?ticket=${ticket}`}`;
const ask = async (w, { method = "GET", item, ticket, range, tail } = {}) =>
  answerRelay(
    new Request(addressOf(ticket === undefined ? await ticketFor() : ticket, item, tail), {
      method,
      headers: range ? { range } : {},
    }),
    ENV,
    w.deps,
  );
const bytesOf = async (response) => new Uint8Array(await response.arrayBuffer());

test("a HEAD answers the clip's size and type from Drive's record, says it takes ranges, and sends no bytes", async () => {
  const w = world();
  const ticket = await ticketFor();
  const answer = await ask(w, { method: "HEAD", ticket });
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get("content-length"), String(CLIP.length));
  assert.equal(answer.headers.get("content-type"), "video/quicktime");
  assert.equal(answer.headers.get("accept-ranges"), "bytes");
  assert.equal(answer.headers.get("cache-control"), "no-store");
  assert.equal((await bytesOf(answer)).length, 0);

  // The ticket was traded at the key door with the app's key, and the door was told what was asked.
  const [knock, record] = w.calls;
  assert.equal(knock.url, ENV.KEY_DOOR_URL);
  assert.equal(knock.init.method, "POST");
  assert.equal(knock.init.headers.authorization, `Bearer ${ENV.KEY_DOOR_SECRET}`);
  assert.deepEqual(JSON.parse(knock.init.body), { ticket, method: "HEAD", range: null });
  // A record's read (5 units), never a download (200), for a question that asks for no bytes.
  assert.equal(w.calls.length, 2);
  assert.ok(!record.url.includes("alt=media"));
});

test("a range GET passes the caller's range to Drive and Drive's bytes, status and lengths back", async () => {
  const w = world();
  const answer = await ask(w, { range: "bytes=1048576-1572863" });
  assert.equal(answer.status, 206);
  assert.equal(answer.headers.get("content-range"), `bytes 1048576-1572863/${CLIP.length}`);
  assert.equal(answer.headers.get("content-length"), "524288");
  assert.equal(answer.headers.get("content-type"), "video/quicktime");
  assert.equal(answer.headers.get("accept-ranges"), "bytes");
  assert.deepEqual(await bytesOf(answer), CLIP.subarray(1048576, 1572864));
  // Only what a fetcher needs is passed on: none of Drive's own headers.
  assert.equal(answer.headers.get("x-guploader-uploadid"), null);

  const [knock, download] = w.calls;
  assert.equal(JSON.parse(knock.init.body).range, "bytes=1048576-1572863");
  assert.equal(JSON.parse(knock.init.body).method, "GET");
  assert.equal(download.init.headers.range, "bytes=1048576-1572863");
  assert.ok(download.url.includes("alt=media"));
});

test("an open range runs to the clip's end, and a GET with no range is the whole clip", async () => {
  const rest = await ask(world(), { range: "bytes=3145000-" });
  assert.equal(rest.status, 206);
  assert.equal(rest.headers.get("content-range"), `bytes 3145000-${CLIP.length - 1}/${CLIP.length}`);
  assert.deepEqual(await bytesOf(rest), CLIP.subarray(3145000));

  const w = world();
  const whole = await ask(w, {});
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get("content-length"), String(CLIP.length));
  assert.deepEqual(await bytesOf(whole), CLIP);
  assert.equal(w.calls[1].init.headers.range, undefined);
});

test("the address may end in the clip's type, for a fetcher that reads one off a name", async () => {
  const answer = await ask(world(), { method: "HEAD", tail: "/clip.mov" });
  assert.equal(answer.status, 200);
  const other = await ask(world(), { method: "HEAD", tail: "/Saturday.mov" });
  assert.equal(other.status, 404);
});

test("a clip is passed on as it arrives: the answer is given before Drive's bytes are read", async () => {
  let handedOver = 0;
  const parts = [CLIP.subarray(0, 1000), CLIP.subarray(1000, 2000), CLIP.subarray(2000, 3000)];
  const slow = () =>
    new Response(
      new ReadableStream(
        {
          pull(controller) {
            const part = parts[handedOver];
            if (!part) return controller.close();
            handedOver += 1;
            controller.enqueue(part);
          },
        },
        { highWaterMark: 0 },
      ),
      { status: 200, headers: { "content-type": "video/mp4" } },
    );
  const answer = await ask(world({ files: slow }), {});
  assert.equal(answer.status, 200);
  assert.equal(handedOver, 0, "nothing was read from Drive to make the answer");
  assert.deepEqual(await bytesOf(answer), CLIP.subarray(0, 3000));
  assert.equal(handedOver, 3);
});

test("Drive has half a minute to begin its answer, and a clip that has begun is never cut off by that bound", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const MINUTE_MS = 60_000;

  // A Drive that never answers: the bound ends the wait, and the relay says whose silence it was.
  let heard;
  const asked = new Promise((resolve) => (heard = resolve));
  const silent = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")));
      heard();
    });
  const waiting = ask(world({ files: silent }), {});
  await asked;
  t.mock.timers.tick(MINUTE_MS / 2);
  const unanswered = await waiting;
  assert.equal(unanswered.status, 502);
  assert.deepEqual(await unanswered.json(), { error: "drive", reason: "unreachable" });

  // A clip whose bytes are still coming ten minutes on: the bound ended with Drive's first line.
  let bound;
  let close;
  const begun = (_url, init) => {
    bound = init.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(CLIP.subarray(0, 1000));
          close = () => controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "video/mp4" } },
    );
  };
  const answer = await ask(world({ files: begun }), {});
  t.mock.timers.tick(10 * MINUTE_MS);
  assert.equal(bound.aborted, false, "the download is not stopped");
  close();
  assert.deepEqual(await bytesOf(answer), CLIP.subarray(0, 1000));
});

test("a ticket that has ended opens nothing, and neither the key door nor Drive is asked", async () => {
  const w = world();
  const ended = await ticketFor(ITEM, NOW_S - 1);
  for (const method of ["GET", "HEAD"]) {
    const answer = await ask(w, { method, ticket: ended });
    assert.equal(answer.status, 403);
    if (method === "GET") assert.deepEqual(await answer.json(), { error: "ticket", reason: "expired" });
    else assert.equal((await bytesOf(answer)).length, 0);
  }
  // The last second it holds, and the first it does not.
  assert.equal((await ask(world(), { method: "HEAD", ticket: await ticketFor(ITEM, NOW_S + 1) })).status, 200);
  assert.equal((await ask(w, { method: "HEAD", ticket: await ticketFor(ITEM, NOW_S) })).status, 403);
  assert.equal(w.calls.length, 0);
});

test("a ticket for another file opens nothing here", async () => {
  const w = world();
  const others = await ticketFor("item-2");
  const answer = await ask(w, { ticket: others });
  assert.equal(answer.status, 403);
  assert.deepEqual(await answer.json(), { error: "ticket", reason: "other_file" });
  assert.equal(w.calls.length, 0);
  // At its own address it is a ticket like any other.
  assert.equal((await ask(world(), { method: "HEAD", item: "item-2", ticket: others })).status, 200);
});

test("a ticket the app did not sign, one changed after signing, and no ticket at all are refused", async () => {
  const w = world();
  const good = await ticketFor();
  const [version, claim, signature] = good.split(".");
  const longer = Buffer.from(JSON.stringify({ item: ITEM, exp: NOW_S + 20 * HOUR_S })).toString("base64url");
  const cases = [
    [await ticketFor(ITEM, NOW_S + HOUR_S, "another-key"), "signature"],
    [`${version}.${longer}.${signature}`, "signature"],
    [`${version}.${claim}.${signature.slice(0, -2)}AA`, "signature"],
    [`v2.${claim}.${signature}`, "malformed"],
    [`${version}.${claim}`, "malformed"],
    ["not-a-ticket", "malformed"],
    [null, "malformed"],
  ];
  for (const [ticket, reason] of cases) {
    const answer = await ask(w, { ticket });
    assert.equal(answer.status, 403, String(ticket));
    assert.deepEqual(await answer.json(), { error: "ticket", reason }, String(ticket));
  }
  assert.equal(w.calls.length, 0);
});

test("a ticket runs a day at most: one signed for longer is refused however it is signed", async () => {
  const day = await readTicket(ENV.TICKET_KEY, await ticketFor(ITEM, NOW_S + TICKET_SECONDS_MAX), NOW);
  assert.deepEqual(day, { ok: true, item: ITEM, expiresAt: NOW_S + TICKET_SECONDS_MAX });
  const longer = await readTicket(ENV.TICKET_KEY, await ticketFor(ITEM, NOW_S + TICKET_SECONDS_MAX + 1), NOW);
  assert.deepEqual(longer, { ok: false, reason: "too_long" });
  await assert.rejects(() => signTicket(ENV.TICKET_KEY, { item: "a name/with a slash.mov", expiresAt: NOW_S + 60 }));
  await assert.rejects(() => signTicket("", { item: ITEM, expiresAt: NOW_S + 60 }));
});

/** Drive's refusal as Drive words it: a sentence that names the file, and a one-word reason. */
const driveRefusal = (status, reason, headers = {}) =>
  new Response(
    JSON.stringify({
      error: {
        code: status,
        message: `File not found: ${FILE_ID}. (${FILE_NAME})`,
        errors: [{ domain: "global", reason, message: `File not found: ${FILE_ID}.` }],
      },
    }),
    { status, headers: { "content-type": "application/json", ...headers } },
  );

test("Drive's 403, 404 and 429 are passed on as they are: its status, its reason in one word, its rest, never its sentence", async () => {
  const cases = [
    [403, "userRateLimitExceeded", {}],
    [403, "insufficientFilePermissions", {}],
    [404, "notFound", {}],
    [429, "rateLimitExceeded", { "retry-after": "17" }],
  ];
  for (const [status, reason, headers] of cases) {
    for (const method of ["GET", "HEAD"]) {
      const answer = await ask(world({ files: () => driveRefusal(status, reason, headers) }), { method });
      assert.equal(answer.status, status, `${method} ${status}`);
      assert.equal(answer.headers.get("retry-after"), headers["retry-after"] ?? null);
      const body = await answer.text();
      if (method === "HEAD") assert.equal(body, "");
      else assert.deepEqual(JSON.parse(body), { error: "drive", reason });
      for (const word of NEVER_SAID) assert.ok(!body.includes(word), `${word} is not said`);
    }
  }
});

test("a refusal Drive words another way keeps its status; a key Drive does not take, and a Drive that fails, are said as Drive's", async () => {
  const plain = await ask(world({ files: () => new Response("<html>Sorry</html>", { status: 403 }) }), {});
  assert.equal(plain.status, 403);
  assert.deepEqual(await plain.json(), { error: "drive", reason: "unknown" });

  const stale = await ask(
    world({
      files: () =>
        json({ error: { code: 401, status: "UNAUTHENTICATED", message: "Invalid Credentials" } }, { status: 401 }),
    }),
    {},
  );
  assert.equal(stale.status, 401);
  assert.deepEqual(await stale.json(), { error: "drive", reason: "UNAUTHENTICATED" });

  const down = await ask(world({ files: () => driveRefusal(503, "backendError") }), {});
  assert.equal(down.status, 503);
  const gone = await ask(
    world({
      files: () => {
        throw new TypeError("fetch failed");
      },
    }),
    {},
  );
  assert.equal(gone.status, 502);
  assert.deepEqual(await gone.json(), { error: "drive", reason: "unreachable" });

  // A Google document has no bytes to fetch: its record names no size.
  const document = await ask(world({ files: () => json({ mimeType: "application/vnd.google-apps.document" }) }), {
    method: "HEAD",
  });
  assert.equal(document.status, 502);
});

test("the key door's no is a no, its rest is passed on, and Drive is not asked without a key", async () => {
  const cases = [
    [() => json({ error: "forbidden" }, { status: 403 }), 403, "refused", null],
    [() => json({ error: "not_found" }, { status: 404 }), 403, "refused", null],
    [() => json({}, { status: 429, headers: { "retry-after": "30" } }), 429, "rest", "30"],
    [() => json({}, { status: 503 }), 503, "rest", null],
    [() => json({}, { status: 500 }), 502, "failed", null],
    [() => json({ file_id: FILE_ID }), 502, "no_key", null],
    [() => json({ access_token: DRIVE_KEY, file_id: "../files/another?x=" }), 502, "no_file", null],
    [() => new Response("not json"), 502, "no_key", null],
    [
      () => {
        throw new TypeError("fetch failed");
      },
      502,
      "unreachable",
      null,
    ],
  ];
  for (const [door, status, reason, rest] of cases) {
    const w = world({ door });
    const answer = await ask(w, {});
    assert.equal(answer.status, status, reason);
    assert.deepEqual(await answer.json(), { error: "key_door", reason });
    assert.equal(answer.headers.get("retry-after"), rest);
    assert.equal(w.calls.length, 1, "only the door was asked");
  }
});

test("only GET and HEAD are answered, at a clip's address, for one range at a time", async () => {
  const w = world();
  for (const method of ["POST", "PUT", "DELETE"]) {
    const answer = await ask(w, { method });
    assert.equal(answer.status, 405);
    assert.equal(answer.headers.get("allow"), "GET, HEAD");
  }
  const elsewhere = await answerRelay(new Request("https://relay.example.com/"), ENV, w.deps);
  assert.equal(elsewhere.status, 404);
  const list = await ask(w, { range: "bytes=0-99,200-299" });
  assert.equal(list.status, 416);
  assert.deepEqual(await list.json(), { error: "request", reason: "range" });
  assert.equal(w.calls.length, 0);
  // The last bytes of a clip, as a player asks for them, are one range.
  assert.equal(JSON.parse((await passed({ range: "bytes=-500" })).init.body).range, "bytes=-500");
});

/** The key door's knock for one question, with Drive answering nothing of note. */
async function passed(question) {
  const w = world({ files: () => new Response(null, { status: 404 }) });
  await ask(w, question);
  return w.calls[0];
}

test("no key and no file name is written to a log, or said in an answer", async () => {
  const written = [];
  const levels = ["log", "info", "warn", "error", "debug", "trace"];
  const kept = Object.fromEntries(levels.map((level) => [level, console[level]]));
  for (const level of levels) console[level] = (...words) => written.push(words.map(String).join(" "));
  const answers = [];
  try {
    const ended = await ticketFor(ITEM, NOW_S - 1);
    const questions = [
      [world(), { method: "HEAD" }],
      [world(), { range: "bytes=0-99" }],
      [world(), { ticket: ended }],
      [world(), { ticket: await ticketFor("item-2") }],
      [world({ files: () => driveRefusal(404, "notFound") }), {}],
      [world({ files: () => driveRefusal(403, "userRateLimitExceeded") }), { method: "HEAD" }],
      [world({ files: () => driveRefusal(429, "rateLimitExceeded") }), {}],
      [world({ door: () => json({ error: `no key for ${FILE_NAME}` }, { status: 403 }) }), {}],
      [
        world({
          door: () => {
            throw new Error(`could not reach the door with ${ENV.KEY_DOOR_SECRET}`);
          },
        }),
        {},
      ],
      [
        world({
          files: () => {
            throw new Error(`Bearer ${DRIVE_KEY} was refused for ${FILE_NAME}`);
          },
        }),
        {},
      ],
    ];
    for (const [w, question] of questions) answers.push(await ask(w, question));
  } finally {
    for (const level of levels) console[level] = kept[level];
  }
  assert.deepEqual(written, [], "the relay writes nothing");
  for (const answer of answers) {
    const said = `${[...answer.headers].flat().join("\n")}\n${answer.status === 206 ? "" : await answer.text()}`;
    for (const word of NEVER_SAID) assert.ok(!said.includes(word), `${word} is in no answer`);
  }
});

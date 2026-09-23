/**
 * The edge's wires for a lead's mark (apps/edge/lib/leads/lead-marks.ts): one GET of a home page, one capped GET of
 * an image, and the copy stored under its own hash in 00161's bucket. Each answers null rather than throwing, so a
 * site that misbehaves costs its lead a mark and nothing else.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { imageBytes, leadMarkPath, pageText, storeLeadMark } from "../../../apps/edge/lib/leads/lead-marks.ts";
import { LEAD_MARK_PATH, LEAD_MARKS_BUCKET } from "../../../packages/contracts/src/leads.ts";
import { png } from "./_mark-images.mjs";

const PNG = { kind: "png", contentType: "image/png", width: 180, height: 180 };

/** A body handed over in pieces, counting how many were read: a capped read must stop asking. */
function trickle(chunks) {
  const seen = { pulls: 0 };
  let i = 0;
  const body = new ReadableStream({
    pull(c) {
      seen.pulls += 1;
      if (i < chunks.length) c.enqueue(chunks[i++]);
      else c.close();
    },
  });
  return { body, seen };
}

test("an image is read whole when it is a logo's size, asked for as an image we keep, and nothing else", async () => {
  const bytes = png(180, 180, 3000);
  let asked = null;
  const got = await imageBytes(
    async (url, init) => {
      asked = { url, init };
      return new Response(bytes, { headers: { "content-type": "application/octet-stream" } });
    },
    "https://zilkerstrength.example/touch.png",
    4000,
    5000,
  );
  assert.deepEqual([...got], [...bytes], "the bytes as they came, whatever the server called them");
  assert.equal(asked.url, "https://zilkerstrength.example/touch.png");
  assert.equal(asked.init.redirect, "follow");
  assert.ok(asked.init.signal instanceof AbortSignal, "bounded in time");
  assert.doesNotMatch(asked.init.headers.accept, /avif|svg/, "never a format we would not keep");
  assert.match(asked.init.headers["user-agent"], /^ChanlyticsBot\//, "and says who is asking");
});

test("an image past the cap is refused: said up front, before a byte is read; run long, cut off where it passed", async () => {
  const told = trickle([png(180, 180, 100)]);
  assert.equal(
    await imageBytes(
      async () => new Response(told.body, { headers: { "content-length": "9000" } }),
      "https://a.example/x.png",
      4000,
      5000,
    ),
    null,
    "a length past the cap",
  );
  assert.equal(told.seen.pulls <= 1, true, "is refused without reading the body through");

  const long = trickle([new Uint8Array(3000), new Uint8Array(3000), new Uint8Array(3000), new Uint8Array(3000)]);
  assert.equal(
    await imageBytes(async () => new Response(long.body), "https://a.example/x.png", 4000, 5000),
    null,
    "a body that says nothing and runs past the cap",
  );
  assert.ok(long.seen.pulls < 4, `stops asking once it has passed (${long.seen.pulls} pieces read)`);
});

test("an image that is not there, or a site that fails, is no bytes", async () => {
  assert.equal(
    await imageBytes(async () => new Response("gone", { status: 404 }), "https://a.example/x.png", 4000, 5000),
    null,
  );
  assert.equal(
    await imageBytes(
      async () => {
        throw new TypeError("fetch failed");
      },
      "https://a.example/x.png",
      4000,
      5000,
    ),
    null,
  );
});

test("a home page is read as text only when it is a page", async () => {
  const html = `<html><head><link rel="icon" href="/i.png"></head></html>`;
  assert.equal(
    await pageText(
      async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
      "https://a.example",
      4000,
    ),
    html,
  );
  assert.equal(
    await pageText(
      async () => new Response(png(10, 10), { headers: { "content-type": "image/png" } }),
      "https://a.example",
      4000,
    ),
    null,
    "a site whose front door is a picture has no head to read",
  );
});

test("the copy is stored in 00161's bucket under its own hash, as the type it was read as, cached for a year", async () => {
  const bytes = png(180, 180, 500);
  const calls = [];
  const db = {
    storage: {
      from: (bucket) => ({
        upload: async (path, body, opts) => {
          calls.push({ bucket, path, body, opts });
          return { data: { path }, error: null };
        },
      }),
    },
  };
  const path = await storeLeadMark(db, bytes, PNG);
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.equal(path, `${hash}.png`);
  assert.equal(path, leadMarkPath(bytes, PNG), "one spelling of the name");
  assert.match(path, LEAD_MARK_PATH, "and the only shape the column's CHECK lets in");
  assert.deepEqual(
    calls.map((c) => [c.bucket, c.path]),
    [[LEAD_MARKS_BUCKET, path]],
  );
  assert.equal(calls[0].body, bytes);
  assert.deepEqual(calls[0].opts, { contentType: "image/png", cacheControl: String(365 * 24 * 3600), upsert: true });
  assert.equal(await storeLeadMark(db, bytes, PNG), path, "the same bytes twice are the same name");
});

test("a copy storage refuses, throws on, or never answers is no copy", async () => {
  const refusing = {
    storage: { from: () => ({ upload: async () => ({ data: null, error: { message: "Bucket not found" } }) }) },
  };
  const throwing = {
    storage: {
      from: () => ({
        upload: async () => {
          throw new Error("socket hang up");
        },
      }),
    },
  };
  const silent = { storage: { from: () => ({ upload: () => new Promise(() => {}) }) } };
  const bytes = png(180, 180);
  assert.equal(await storeLeadMark(refusing, bytes, PNG), null);
  assert.equal(await storeLeadMark(throwing, bytes, PNG), null);
  assert.equal(await storeLeadMark(silent, bytes, PNG, 20), null);
});

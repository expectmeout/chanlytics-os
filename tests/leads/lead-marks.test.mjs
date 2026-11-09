/**
 * The edge's wires for a lead's mark (apps/edge/lib/leads/lead-marks.ts): its home page by the platform's page reader,
 * one capped GET of an image, and the copy stored under its own hash in 00161's bucket. Each answers null rather than
 * throwing, so a site that misbehaves costs its lead a mark and nothing else. And the leads sweep's second try over
 * them (markLeadsAgain), for the leads a collect committed with no time left to mark.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setSitePageReader } from "@chanlytics/channels/website";
import {
  fetchImageBytes,
  leadMarkPath,
  markLeadsAgain,
  findLeadSitePage,
  storeLeadMark,
} from "../../apps/edge/lib/leads/marks.ts";
import { MARK_ALLOWANCE_MS, markPlaces, siteReadsOf } from "../../packages/core/src/leads/index.ts";
import { DEADLINE_MARGIN_MS, JUDGE_MARGIN_MS, markUntil } from "../../packages/core/src/leads/runner/rules.ts";
import { LEAD_SITE_READ_USD } from "../../packages/contracts/src/leads/search/caps.ts";
import { LEAD_MARK_PATH, LEAD_MARKS_BUCKET } from "../../packages/contracts/src/leads/leads.ts";
import { fakeDb } from "../_fake-db.mjs";
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
  const got = await fetchImageBytes(
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
    await fetchImageBytes(
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
    await fetchImageBytes(async () => new Response(long.body), "https://a.example/x.png", 4000, 5000),
    null,
    "a body that says nothing and runs past the cap",
  );
  assert.ok(long.seen.pulls < 4, `stops asking once it has passed (${long.seen.pulls} pieces read)`);
});

test("an image that is not there, or a site that fails, is no bytes", async () => {
  assert.equal(
    await fetchImageBytes(async () => new Response("gone", { status: 404 }), "https://a.example/x.png", 4000, 5000),
    null,
  );
  assert.equal(
    await fetchImageBytes(
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

test("a home page is read by the platform's page reader as a browser drew it, its head at the top, and null where it could not be", async () => {
  const head = `<html><head><link rel="icon" href="/i.png"></head>`;
  const asked = [];
  let drawn = `${head}<body>${"x".repeat(1_200_000)}</body></html>`;
  // The reader stood in for (channels setSitePageReader; Firecrawl's in production).
  const before = setSitePageReader(async (url) => {
    asked.push(url);
    return drawn === null ? null : { url, html: drawn, markdown: "", title: null, description: null, brand: null };
  });
  try {
    const page = await findLeadSitePage("a.example", 4000);
    assert.ok(page.html.startsWith(head), "the head, where a mark is declared");
    assert.equal(
      page.html.length,
      1_000_000,
      "a Wix page's booking link sat 434,649 characters in; past this is not ours to hold",
    );
    assert.deepEqual(asked, ["https://a.example/"]);
    drawn = null;
    asked.length = 0;
    assert.equal(
      await findLeadSitePage("a.example", 4000),
      null,
      "a site the reader could not draw, either way it is spelled",
    );
    assert.deepEqual(
      asked,
      ["https://a.example/", "https://www.a.example/"],
      "a site often answers on one spelling alone",
    );
    asked.length = 0;
    assert.equal(await findLeadSitePage("10.0.0.5", 4000), null, "a private address is never asked for");
    assert.deepEqual(asked, []);
  } finally {
    setSitePageReader(before);
  }
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

/* ------------------------------------ the sweep's second try ------------------------------------ */

const T1 = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-11-04T12:00:00Z");
const MINUTE = 60_000;
const OLD_NAME = `${"f".repeat(64)}.png`;
const lead = (id, over = {}) => ({
  id,
  tenant_id: T1,
  website_host: `${id}.example`,
  logo_url: null,
  mark_path: null,
  stage: "ready",
  contact_id: null,
  contacted_at: null,
  exported_at: null,
  blanked_at: null,
  erased_at: null,
  found_at: new Date(NOW - 7 * MINUTE).toISOString(),
  ...over,
});
const icon = (href) => `<head><link rel="apple-touch-icon" href="${href}"></head>`;

/** The page reader as the sweep's wires hand it: `pages` by origin, each read kept. */
const readerOf = (pages, asked = []) => ({
  readSite: async (host) => {
    const url = `https://${host}`;
    asked.push(url);
    return pages[url] ? { url, html: pages[url], markdown: "", title: null, description: null, brand: null } : null;
  },
  fetchBytes: async () => png(180, 180),
});
/** A world for the sweep: the leads, their copies' bucket, and what each workspace was charged for reading. */
const sweepWorld = (leads) => {
  const spends = [];
  const db = fakeDb(
    { leads },
    {},
    {
      lead_site_reads_spent: (a) => {
        spends.push(a);
        return null;
      },
    },
  );
  db.storage = { from: () => ({ upload: async () => ({ error: null }) }) };
  return { db, spends, leads };
};

test("the sweep tries again the leads found in the five minutes before its last whole slot, with a site and no copy, keeps each copy it finds, and pays for what it read; no other lead is read", async () => {
  const T2 = "22222222-2222-4222-8222-222222222222";
  const w = sweepWorld([
    lead("a"),
    lead("b", { logo_url: "https://b.example/said.png" }),
    lead("c", { tenant_id: T2 }),
    lead("fresh", { found_at: new Date(NOW - 2 * MINUTE).toISOString() }),
    lead("old", { found_at: new Date(NOW - 20 * MINUTE).toISOString() }),
    lead("marked", { mark_path: OLD_NAME }),
    lead("nosite", { website_host: null }),
    lead("reached", { contacted_at: "2026-11-04T11:56:00Z" }),
    lead("blanked", { blanked_at: "2026-11-04T11:00:00Z" }),
    lead("erased", { erased_at: "2026-11-04T11:00:00Z" }),
  ]);
  const pages = {
    "https://a.example": icon("/a.png"),
    "https://b.example": icon("/b.png"),
    "https://c.example": "<head></head>",
  };
  const asked = [];
  const out = await markLeadsAgain(w.db, readerOf(pages, asked), NOW + 50_000, () => new Date(NOW));
  assert.deepEqual(out, { due: 3, kept: 2 });
  assert.deepEqual(asked.sort(), ["https://a.example", "https://b.example", "https://c.example"]);
  const row = (id) => w.leads.find((l) => l.id === id);
  assert.match(row("a").mark_path, LEAD_MARK_PATH);
  assert.equal(row("a").logo_url, "https://a.example/a.png", "a lead with no address gains the one its copy came from");
  assert.match(row("b").mark_path, LEAD_MARK_PATH);
  assert.equal(row("b").logo_url, "https://b.example/said.png", "and one with an address keeps it");
  assert.deepEqual([row("c").mark_path, row("c").logo_url], [null, null], "a page that declares no mark leaves none");
  assert.equal(row("marked").mark_path, OLD_NAME);
  assert.deepEqual(
    w.spends.map((x) => [x.p_tenant_id, x.p_reads, x.p_usd, x.p_round_id]).sort(),
    [
      [T1, 2, 2 * LEAD_SITE_READ_USD, undefined],
      [T2, 1, LEAD_SITE_READ_USD, undefined],
    ].sort(),
    "each workspace pays for its own, a page with no mark on it too; no round asked for these",
  );
});

test("a lead is due to one slot however late its tick runs: consecutive slots meet with no gap and no overlap", async () => {
  const at = (minutes) => new Date(NOW + minutes * MINUTE).toISOString();
  const leads = [-10.5, -10, -7, -5.01, -5].map((m, i) => lead(`l${i}`, { found_at: at(m) }));
  const dueAt = async (nowMs) => {
    const asked = [];
    await markLeadsAgain(sweepWorld(leads).db, readerOf({}, asked), nowMs + 50_000, () => new Date(nowMs));
    return asked.map((u) => u.slice("https://".length, -".example".length)).sort();
  };
  const tick = ["l1", "l2", "l3"];
  assert.deepEqual(await dueAt(NOW), tick, "on the slot: from ten minutes before it, up to five");
  assert.deepEqual(
    await dueAt(NOW + 4 * MINUTE + 59_000),
    tick,
    "a tick a late as can be looks at the same five minutes",
  );
  assert.deepEqual(await dueAt(NOW + 5 * MINUTE), ["l4"], "the next slot takes up where it stopped");
  assert.deepEqual(await dueAt(NOW - MINUTE), ["l0"], "and the one before ended where this begins");
});

test("with no reader the sweep looks at nothing: a key unset costs no read of the leads, and no count of work not done", async () => {
  const before = setSitePageReader(null);
  try {
    const w = sweepWorld([lead("a")]);
    const out = await markLeadsAgain(w.db, readerOf({}), NOW + 50_000, () => new Date(NOW));
    assert.deepEqual(out, { due: 0, kept: 0 });
    assert.deepEqual(w.db.seen, [], "nothing asked of the database");
  } finally {
    setSitePageReader(before);
  }
});

test("the sweep's second try keeps nothing on a lead blanked since it was read, and says so in its count", async () => {
  const w = sweepWorld([lead("a")]);
  const out = await markLeadsAgain(
    w.db,
    {
      ...readerOf({ "https://a.example": icon("/a.png") }),
      fetchBytes: async () => {
        w.leads[0].blanked_at = "2026-11-04T11:59:00Z";
        return png(180, 180);
      },
    },
    NOW + 50_000,
    () => new Date(NOW),
  );
  assert.deepEqual(out, { due: 1, kept: 0 });
  assert.equal(w.leads[0].mark_path, null);
});

test("what a batch's marks may take is the time behind them: the next judge's whole bound where another batch follows, only the kill margin behind the page's last", () => {
  const port = (leftMs) => ({ now: () => new Date(NOW), deadline: NOW + leftMs });
  assert.equal(markUntil(port(60_000), true), NOW + MARK_ALLOWANCE_MS, "with time to spare, its own allowance");
  assert.equal(
    markUntil(port(15_000), true),
    NOW + 15_000 - DEADLINE_MARGIN_MS,
    "the last batch keeps the kill margin",
  );
  assert.equal(
    markUntil(port(JUDGE_MARGIN_MS + 5_000), false),
    NOW + 5_000,
    "a batch another follows leaves the next judge its bound",
  );
  assert.ok(markUntil(port(JUDGE_MARGIN_MS), false) <= NOW, "and with no more than that it has none");
});

test("a page that takes nine seconds still leaves the mark its time: the step stops at `until`, and begins nothing short of it", async () => {
  const NAME = `${"a".repeat(64)}.png`;
  const run = async (until) => {
    let t = NOW;
    const place = { website_host: "a.example", logo_url: null, mark_path: null };
    const ports = {
      now: () => new Date(t),
      readSite: async () => {
        t += 9_000;
        return {
          url: "https://a.example/",
          html: icon("/a.png"),
          markdown: "",
          title: null,
          description: null,
          brand: null,
        };
      },
      fetchBytes: async () => png(180, 180),
      storeMark: async () => NAME,
    };
    const kept = await markPlaces(ports, siteReadsOf(ports), [place], until);
    return [kept, place.logo_url, place.mark_path];
  };
  assert.deepEqual(
    await run(NOW + 9_500),
    [0, "https://a.example/a.png", null],
    "the address, and no time for its bytes",
  );
  assert.deepEqual(await run(NOW + 20_000), [1, "https://a.example/a.png", NAME]);
  assert.deepEqual(await run(NOW + 500), [0, null, null], "no read is begun with under a second left");
});

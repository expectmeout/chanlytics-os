/**
 * A page's first reads answered as one (GET open, decision 0053 step 2; server/workspace/page-open.ts, contracts
 * openReads): who is looking and the page's own reads first, then what it draws beside them, each a line as it settles,
 * each answered by its own route as that route's GET would answer it, past one session check, one read of the membership
 * and one turn of the readers. Run over doubles for the rules, and through the real route for what each read answers.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AppError, PREFETCH_BESIDE, PREFETCH_OPEN, PREFETCH_READS, openReads } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { openPage } = await import(at("apps/dashboard/src/server/workspace/page-open.ts"));
const { memberContext } = await import(at("apps/dashboard/src/server/with-route.ts"));
const { load, readerContext } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const openRoute = await import(at("apps/dashboard/app/api/v1/open/route.ts"));
const viewsRoute = await import(at("apps/dashboard/app/api/v1/views/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const T = "11111111-1111-4111-8111-111111111111";
const tables = () => ({
  memberships: [
    {
      user_id: "u1",
      tenant_id: T,
      role: "owner",
      views: { today: { band: "queue" } },
      tenants: { slug: "harbor", name: "Harbor", timezone: "America/New_York" },
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
});
const ctxFor = (db = fakeDb(tables())) => ({ supabase: db, userId: "u1", email: "ada@example.com", params: {} });
const openReq = (query = "route=today&workspace=harbor") => new Request(`http://localhost/api/v1/open?${query}`);

/** Every line of an answer, as the head reads it: one JSON object a line. */
const linesOf = async (res) =>
  (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

/** A promise and its resolution, handed out: a read that answers when the test says. */
const deferred = () => {
  let resolve;
  const p = new Promise((r) => (resolve = r));
  return { p, resolve };
};
const turns = async (n = 20) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};

test("the pages that open through one read are the pages that say what they draw beside their own, in two tiers", () => {
  assert.deepEqual([...PREFETCH_OPEN], Object.keys(PREFETCH_BESIDE));
  const [own, beside] = openReads("today");
  assert.deepEqual(own, ["workspaces", ...PREFETCH_READS.today], "who is looking and the page's own first");
  assert.deepEqual(beside, [...PREFETCH_BESIDE.today], "then what it draws beside them");
  assert.equal(new Set([...own, ...beside]).size, own.length + beside.length, "no read twice");
  assert.ok(beside.includes("reports/headline?period=30d"), "the period line over the default period");
  assert.ok(openReads("today", "7d")[1].includes("reports/headline?period=7d"), "or the one this device last picked");
  assert.deepEqual(openReads("inbox")[1], [], "a page that draws nothing beside its own has no second tier");
});

test("the page's own reads are answered first, each as it settles; what it draws beside them leaves once they are in", async () => {
  const [own, beside] = openReads("today");
  const held = Object.fromEntries([...own, ...beside].map((k) => [k, deferred()]));
  const started = [];
  const routeOf = (key) => ({
    run: async () => {
      started.push(key);
      return held[key].p;
    },
  });
  const res = openPage(ctxFor(), openReq(), "today", null, routeOf);
  assert.equal(res.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const read = async () => {
    const { value } = await reader.read();
    text += decoder.decode(value);
  };

  await turns();
  assert.deepEqual(started.sort(), [...own].sort(), "the page's own reads left together, and nothing beside them yet");
  held.calls.resolve({ calls: [] });
  await read();
  assert.deepEqual(
    JSON.parse(text.trim()),
    { k: "calls", s: 200, b: { ok: true, data: { calls: [] } } },
    "the first in is the first written",
  );
  for (const k of own) if (k !== "calls") held[k].resolve({ k });
  await turns();
  assert.deepEqual(started.slice(own.length).sort(), [...beside].sort(), "once the page's own are in, the rest leave");
  for (const k of beside) held[k].resolve({ k });
  const rest = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest.push(decoder.decode(value));
  }
  const keys = (text + rest.join(""))
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).k);
  assert.deepEqual(keys.sort(), [...own, ...beside].sort(), "every read has its line, once");
});

test("a read's refusal is its own route's: its code, status and sentence, and the wait a limit counted; anything else is a 500 that says nothing", async () => {
  const routeOf = (key) => ({
    run: async () => {
      if (key === "metrics?days=1") throw new AppError("rate_limited", "Slow down.", 429, { retry_after_s: 12.2 });
      if (key === "setup") throw new Error("the database fell over");
      if (key === "views") throw new AppError("forbidden", "Not yours.", 403);
      return { key };
    },
  });
  const lines = await linesOf(openPage(ctxFor(), openReq(), "today", null, routeOf));
  const byKey = Object.fromEntries(lines.map((l) => [l.k, l]));
  assert.deepEqual(byKey["metrics?days=1"], {
    k: "metrics?days=1",
    s: 429,
    b: { ok: false, error: { code: "rate_limited", message: "Slow down.", details: { retry_after_s: 12.2 } } },
    h: { "retry-after": "13" },
  });
  assert.deepEqual(byKey.setup, {
    k: "setup",
    s: 500,
    b: { ok: false, error: { code: "internal", message: "Something went wrong." } },
  });
  assert.equal(byKey.views.s, 403);
  assert.equal(byKey.views.b.error.code, "forbidden");
  assert.deepEqual(
    byKey.calls,
    { k: "calls", s: 200, b: { ok: true, data: { key: "calls" } } },
    "and the rest answer as ever",
  );
});

test("the membership is read once for every read, and a reader two of them read is read once", async () => {
  const db = fakeDb(tables());
  const ctx = ctxFor(db);
  let reads = 0;
  const shared = {
    name: "test-shared",
    read: async () => ((reads += 1), { data: { n: reads }, rows: [], stamp: Date.now() }),
  };
  const routeOf = () => ({
    run: async (req, c) => {
      const m = await memberContext(c, new URL(req.url).searchParams.get("workspace"));
      return (await load(readerContext(c, m), shared, undefined)).data;
    },
  });
  const lines = await linesOf(openPage(ctx, openReq(), "today", null, routeOf));
  const [own, beside] = openReads("today");
  assert.equal(lines.length, own.length + beside.length);
  assert.ok(
    lines.every((l) => l.s === 200 && l.b.data.n === 1),
    "every read was handed the one reader's answer",
  );
  assert.equal(reads, 1, "the reader was read once");
  assert.equal(db.seen.filter((q) => q.table === "memberships").length, 1, "and the membership once");
});

test("through the real route, every read GET open answers has its route, and a read's line is the JSON its own request answers", async () => {
  const ctx = ctxFor();
  const res = await openRoute.GET.run(openReq(), ctx);
  const lines = await linesOf(res);
  const [own, beside] = openReads("today");
  assert.deepEqual(
    lines.map((l) => l.k).sort(),
    [...own, ...beside].sort(),
    "a line for each: none is without its route",
  );
  const views = lines.find((l) => l.k === "views");
  const alone = await viewsRoute.GET.run(new Request("http://localhost/api/v1/views?workspace=harbor"), ctxFor());
  assert.deepEqual(
    views,
    { k: "views", s: 200, b: { ok: true, data: alone } },
    "the views read, as its own GET answers it",
  );
  assert.deepEqual(alone, { views: { today: { band: "queue" } } });
});

test("GET open takes the pages it opens and the periods Reports offers; any other period is the default's", async () => {
  await assert.rejects(
    openRoute.GET.run(openReq("route=inbox&workspace=harbor"), ctxFor()),
    (e) => e.code === "validation",
  );
  const keysOf = async (query) => (await linesOf(await openRoute.GET.run(openReq(query), ctxFor()))).map((l) => l.k);
  assert.ok((await keysOf("route=today&period=7d&workspace=harbor")).includes("reports/headline?period=7d"));
  assert.ok((await keysOf("route=today&period=forever&workspace=harbor")).includes("reports/headline?period=30d"));
});

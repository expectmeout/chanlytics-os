/**
 * What the sender sees of a lead's own receptionist (decision 0079, L5): the lead sheet's line (contracts previewLineOf)
 * in each state, with what the business said is not right and the presses it offers; its route (GET and POST
 * leads/:id/preview), run as Next runs it over a database in memory with the edge answered by the test; and the edge's
 * Make their preview door, refused where it must be.
 *
 * Made-up businesses only.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_LINE_WORDS as W, previewLineOf, previewTriedWords } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const NOW = new Date("2026-11-02T15:00:00Z");
const DAY = 86_400_000;
const TOKEN = "TokenTokenTokenToken01";
const facts = (over = {}) => ({
  state: "ready",
  token: TOKEN,
  failed_why: null,
  ends_at: new Date(NOW.getTime() + 12 * DAY).toISOString(),
  first_sent_at: null,
  opened_count: 0,
  asked_count: 0,
  call_count: 0,
  call_seconds: 0,
  tried_at: null,
  claimed_at: null,
  not_right: [],
  ...over,
});
const line = (preview, makes = true) => previewLineOf({ preview, makes }, NOW);

test("the line, state by state: none yet, being set up, couldn't be made, ready, sent, opened, tried, theirs, ended", () => {
  assert.deepEqual(line(null), { words: W.none, tone: "quiet", said: [], make: true, open: null, link: null });
  assert.equal(line(null, false), null, "a workspace that makes none is told nothing");
  assert.deepEqual(
    [line(facts({ state: "building" })).words, line(facts({ state: "building" })).open],
    [W.building, null],
  );
  assert.equal(line(facts({ state: "failed", failed_why: "no_name" })).words, W.failed("no_name"));
  assert.equal(line(facts({ state: "failed", failed_why: "build_failed" })).tone, "warn");

  const ready = line(facts());
  assert.equal(ready.words, `${W.ready} · ends in 12 days`);
  assert.equal(ready.open, `/preview/${TOKEN}?look=1`, "Open it counts nothing");
  assert.equal(ready.link, `/preview/${TOKEN}`);
  assert.equal(ready.make, false, "one is made: nothing to make");
  assert.equal(line(facts({ first_sent_at: "2026-11-01T10:00:00Z" })).words, `${W.sent} · ends in 12 days`);
  assert.equal(line(facts({ opened_count: 3 })).words, `Opened 3 times · ends in 12 days`);
  const tried = line(
    facts({ opened_count: 2, asked_count: 4, call_count: 1, call_seconds: 72, tried_at: "2026-11-02T10:00:00Z" }),
  );
  assert.equal(tried.words, "Tried · 4 messages · a call of a minute · ends in 12 days");
  assert.equal(tried.tone, "go");

  const theirs = line(facts({ state: "claimed", claimed_at: "2026-11-02T12:00:00Z" }));
  assert.deepEqual([theirs.words, theirs.tone, theirs.link], [W.claimed, "done", null]);
  const ended = line(facts({ state: "ended", asked_count: 2, tried_at: "2026-10-01T10:00:00Z" }));
  assert.deepEqual([ended.words, ended.open, ended.link], [`${W.ended} · 2 messages`, null, null]);
  assert.equal(line(facts({ ends_at: "2026-11-01T00:00:00Z" })).words, W.ended, "past its end, ended, swept or not");
});

test("what they said is not right, under the line: by the fact's name, in their words, the newest three", () => {
  const said = line(
    facts({
      not_right: [
        { fact: "Phone", at: "x" },
        { fact: "Hours", said: "Saturday we close at 1", at: "x" },
        { fact: "services", at: "x" },
        { fact: "Address", said: "We moved to 40 Oak Ave", at: "x" },
        { nonsense: true },
      ],
    }),
  ).said;
  assert.deepEqual(said, [
    "Says the hours aren't right: “Saturday we close at 1”",
    "Says the services aren't right",
    "Says the address isn't right: “We moved to 40 Oak Ave”",
  ]);
  assert.equal(previewTriedWords({ asked_count: 0, call_count: 2, call_seconds: 250 }), "2 calls, 4 minutes in all");
});

/* ---- the route and the edge's door ---- */

const was = { EDGE_URL: process.env.EDGE_URL, EDGE_CALL_SECRET: process.env.EDGE_CALL_SECRET };
Object.assign(process.env, { EDGE_URL: "https://edge.example.com", EDGE_CALL_SECRET: "edge-secret-for-this-file" });
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
const route = await importSrc("apps/dashboard/app/api/v1/leads/[id]/preview/route.ts");

const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let edge = [];
let edgeAnswer = () => [200, { ok: true, id: "p1", state: "building", token: TOKEN }];
beforeEach(() => {
  setRateStore(memoryStore());
  edge = [];
  globalThis.fetch = async (url, init = {}) => {
    edge.push({ path: new URL(String(url)).pathname, body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = edgeAnswer();
    return Response.json(body, { status });
  };
});

/** The member's session: their workspace (ours or not) and its leads' previews, as RLS hands them. */
function ctxFor({ ours = true, rows = [] } = {}) {
  const tables = {
    tenants: [{ id: WS, ours }],
    lead_previews: rows,
    // The member the route resolves, as the session reads it.
    memberships: [
      {
        user_id: USER,
        tenant_id: WS,
        role: "operator",
        tenants: { slug: "chanlytics" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
  };
  return {
    tables,
    ctx: {
      supabase: fakeDb(tables),
      userId: USER,
      email: "ada@example.com",
      aal: "aal1",
      params: { id: LEAD },
      headers: {},
      metadata: {},
    },
  };
}
const ask = (method, c) =>
  route[method].run(
    new Request(`http://localhost/api/v1/leads/${LEAD}/preview?workspace=${WS}`, {
      method,
      ...(method === "POST" ? { body: "{}" } : {}),
    }),
    c,
  );

test("GET leads/:id/preview: the row's facts, never its chat, and whether this workspace makes previews", async () => {
  const row = {
    id: "p1",
    tenant_id: WS,
    lead_id: LEAD,
    ...facts({ opened_count: 2 }),
    turns: [{ role: "user", content: "secret words" }],
    failed_why: null,
  };
  const { ctx } = ctxFor({ rows: [row] });
  const out = await ask("GET", ctx);
  assert.equal(out.makes, true);
  assert.equal(out.preview.opened_count, 2);
  assert.equal("turns" in out.preview, false, "its chat stays on the row");
  const none = await ask("GET", ctxFor({ ours: false }).ctx);
  assert.deepEqual(none, { preview: null, makes: false });
});

test("POST leads/:id/preview: the edge's door makes it, and the line is read again; its refusals in its words", async () => {
  const c = ctxFor();
  await ask("POST", c.ctx);
  assert.deepEqual(
    edge.map((e) => [e.path, e.body]),
    [["/api/admin/previews/make", { tenant_id: WS, lead_id: LEAD }]],
  );
  for (const [status, error, words, code] of [
    [403, "platform_only", "Only Chanlytics' own workspace makes previews.", 403],
    [409, "preview_failed", "Previews are switched off.", 409],
    [404, "not_found", "Lead not found.", 404],
  ]) {
    edgeAnswer = () => [status, { ok: false, error, detail: words }];
    await assert.rejects(ask("POST", ctxFor().ctx), (e) => e.status === code && e.message === words, words);
  }
  edgeAnswer = () => [200, { ok: true, id: "p1", state: "building", token: TOKEN }];
});

test("the edge's Make their preview door: switched off, refused in words and nothing made; a body that names no lead", async () => {
  const { makePreviewFor } = await importSrc("apps/edge/lib/previews/make.ts");
  const { setPg } = await importSrc("apps/edge/lib/pg.ts");
  const asked = [];
  setPg(fakeDb({ leads: [] }, {}, { preview_make: (a) => (asked.push(a), null) }));
  const auth = { ok: true, via: "token", workspace: WS, user: USER };
  const was = process.env.LEAD_PREVIEWS;
  delete process.env.LEAD_PREVIEWS;
  try {
    const off = await makePreviewFor(auth, { lead_id: LEAD });
    assert.equal(off.status, 409);
    assert.deepEqual(await off.json(), { ok: false, error: "preview_failed", detail: "Previews are switched off." });
    const bad = await makePreviewFor(auth, { lead_id: "not-a-lead" });
    assert.equal(bad.status, 400);
    assert.deepEqual(asked, [], "nothing asked of the door");
  } finally {
    if (was === undefined) delete process.env.LEAD_PREVIEWS;
    else process.env.LEAD_PREVIEWS = was;
    setPg(null);
  }
});

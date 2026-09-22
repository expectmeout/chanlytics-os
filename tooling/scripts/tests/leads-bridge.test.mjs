/**
 * The Leads surface, read by view, and the courier that carries the acts.
 *
 * The surface mirrors People's split -- what is loaded is kept in a module
 * variable and the surface is derived from it every time -- and adds what the
 * review's E8 asks of a list that grows while somebody reads it: every read is
 * made under a key (the workspace and the whole view), an answer that lands
 * under a newer key is dropped, a refresh patches rows by id and keeps the
 * pages already loaded, and rows a refresh finds that are not drawn are
 * OFFERED ("12 new") rather than sorted in under the owner. The selection and
 * the cursor are the page's (Task 2), so nothing here touches them.
 *
 * Run, never read: the bridge module against a faked `window.fetch` that
 * answers rows of the real shape with fictional values, and can hold an answer
 * until the test lets it go -- which is the only way to prove the ordering
 * rules, because they are about two reads in flight at once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

/* ------------------------------- the window ------------------------------ */

const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
// The window's events, as a page hears them: the surface's own event is how the page learns a row changed.
const listeners = {};
globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  // On a workspace page, so the client names the workspace on every request the way it does in the browser.
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  // The zone the surface says its times in, published the way the workspace surface publishes it: no extra read.
  __WORKSPACES: [{ id: "ws-harbor", timezone: "America/Chicago" }],
  __ACTIVE_WORKSPACE: "ws-harbor",
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
  fetch: async () => { throw new Error("no wire"); },
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const { installLeadsCourier, leadsOverride, forgetLeadsViews, leadsBootView } = await import("../../../apps/dashboard/src/legacy-bridge/leads.ts");
installLeadsCourier();

/* -------------------------------- fixtures ------------------------------- */

const SEARCH_ID = "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
const OP = "7c1d9e20-5a3b-4c8d-9e1f-2a3b4c5d6e7f";
const PLAN = {
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "personal trainers in Austin who train people one to one",
  terms: ["personal trainer"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 20000, query: "Austin, TX" },
  count: 300,
  contact: "email",
  criteria: [{ key: "one_to_one", text: "trains people one to one", standard: "likely", required: true }],
  exclusions: [{ key: "big_gyms", text: "big gym chains", origin: "claude" }],
};
const round = (over = {}) => ({
  id: "b2c3d4e5-6f70-4812-9a3b-4c5d6e7f8091", seq: 2, purpose: "main", state: "ended", ending: "target_reached",
  question: null, target: 300, counted: 322, qualified: 272, review: 31, excluded: 19,
  emails_checked: 188, with_phone: 241, ending_pending: false, waiting_since: null,
  cost_usd: 4.12, ended_at: "2026-09-18T15:04:00.000Z", undo_op_id: OP, undo_version: 4, ...over,
});
const SEARCH_DONE = { id: SEARCH_ID, name: "Personal trainers · Austin", asked: PLAN.asked, asked_on: "2026-09-18T14:10:00.000Z", plan: PLAN, plan_version: 1, round: round() };
const SEARCH_RUNNING = { ...SEARCH_DONE, round: round({ state: "running", ending: null, ended_at: null, undo_op_id: null, undo_version: null }) };

let seq = 0;
/** One row in `leads_page`'s shape (4.6's `LeadRowDto`), with fictional values: .example domains, 555-01xx, ChIJfixture place ids. */
const leadRow = (over = {}) => {
  const n = ++seq;
  return {
    id: `1a2b3c4d-0000-4000-8000-${String(n).padStart(12, "0")}`,
    search_id: SEARCH_ID,
    place_id: `ChIJfixture${String(n).padStart(4, "0")}`,
    business_name: `Travis Heights Coaching ${n}`,
    category: "Personal trainer",
    city: "Austin", state: "TX", street: `${100 + n} Live Oak St`, postal_code: "78704",
    search_name: "Personal trainers · Austin",
    phone: `+1512555${String(100 + (n % 100)).padStart(4, "0")}`, phone_agrees: true, phone_wrong: false,
    email: `hello@travisheights${n}.example`, email_state: "ok", email_checked_at: "2026-09-18T14:40:00.000Z",
    website: `https://travisheights${n}.example`, instagram: null, rating: 4.9, reviews: 16,
    stage: "ready", closed_reason: null, contact_id: null,
    last_outcome: null, last_note: null, contacted_at: null, converted_at: null,
    places: 1, found_at: "2026-09-18T14:32:00.000Z", exported_at: null, version: 1,
    member: { class: "qualified", fit: "strong", reason: "Trains one to one, own studio", excluded_by: null, distance_m: 2400, counted: true, checks: [], other_emails: [] },
    ...over,
  };
};

const ROWS = [leadRow(), leadRow(), leadRow()];
const PAGE1 = [leadRow(), leadRow(), leadRow(), leadRow()];
const PAGE2 = [leadRow(), leadRow()];
const NEW_A = leadRow();
const NEW_B = leadRow();
const NEW_C = leadRow();
const READY = [leadRow({ stage: "ready" }), leadRow({ stage: "ready" })];
const NURTURE = [leadRow({ stage: "nurture" }), leadRow({ stage: "nurture" }), leadRow({ stage: "nurture" })];

const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 8, said_no: 4, not_a_fit: 7 };
const ZERO = { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 };
const SUGGESTIONS = {
  business_line: "A hair and nail salon in Austin",
  by_owner: false,
  made_at: "2026-09-19T09:00:00.000Z",
  items: [
    { words: "wedding planners in Austin", who_for: "brides booking hair and make-up", category_key: "wedding_planner", reach: "about 6 in 10 have an email" },
    { words: "photography studios in Austin", who_for: "shoots that need hair and make-up", category_key: "photographer", reach: null },
    { words: "boutique hotels in Austin", who_for: "guests asking the desk for a salon", category_key: "hotel", reach: null },
  ],
};

/* --------------------------------- the wire ------------------------------ */

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * A fake `window.fetch` answering the four reads and every write.
 *
 * `hold: true` parks every answer until `release(m)` lets it go; `m` is a
 * substring of the URL or a predicate over it, rather than an index, because
 * the typed client shares one request between two callers that ask for the
 * same URL inside two seconds -- so the nth answer is not the nth call.
 */
function wire(opts = {}) {
  // A new wire is a new world: what the tab held of the last one goes, as it does when the workspace is dropped.
  // `keep: true` is the same world answering differently (slower, or with a change): what is held stays.
  if (!opts.keep) forgetLeadsViews();
  const state = {
    searches: opts.searches ?? [],
    counts: opts.counts ?? ZERO,
    rows: opts.rows ?? [],
    /** Page two, when the view has one. */
    next: opts.next ?? null,
    suggestions: opts.suggestions ?? null,
    /** The month's standing, which the first page carries (D5). */
    month: opts.month ?? null,
    fail: opts.fail ?? null,
  };
  const reads = [];
  const writes = [];
  const freed = [];
  const parked = [];
  const allowed = (url) => freed.some((m) => (typeof m === "function" ? m(url) : url.includes(m)));
  const gate = (url) => (opts.hold ? new Promise((res) => { if (allowed(url)) res(); else parked.push({ url, res }); }) : Promise.resolve());
  const rowsOf = (query) => (typeof state.rows === "function" ? state.rows(query) : state.rows);

  globalThis.window.fetch = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const [path, q] = String(url).split("?");
    const query = Object.fromEntries(new URLSearchParams(q ?? ""));
    if (method === "GET") reads.push(String(url));
    else writes.push({ key: `${method} ${path}`, body: init.body ? JSON.parse(init.body) : undefined });
    await gate(String(url));
    if (state.fail === `${method} ${path}`) return json(500, { ok: false, error: { code: "internal", message: "boom" } });
    if (path === "/api/v1/lead-searches" && method === "GET") return json(200, { ok: true, data: { searches: state.searches, counts: state.counts } });
    if (path === "/api/v1/lead-suggestions" && method === "GET") return json(200, { ok: true, data: state.suggestions });
    if (path === "/api/v1/leads" && method === "GET") {
      if (query.after_key) return json(200, { ok: true, data: { rows: state.next ?? [], next: null, counts: state.counts } });
      const rows = rowsOf(query);
      const more = state.next && state.next.length ? { key: "k-page-one", id: rows.length ? rows[rows.length - 1].id : "" } : null;
      return json(200, { ok: true, data: { rows, next: more, counts: state.counts, ...(state.month ? { month: state.month } : {}) } });
    }
    if (method !== "GET") return json(200, { ok: true, data: { done: true } });
    return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  };

  return {
    reads,
    writes,
    /** What the server would answer from now on: a run that committed a page, a lead somebody changed. */
    now: (patch) => Object.assign(state, patch),
    release: (m) => { freed.push(m); for (const p of parked) if (!p.done && (typeof m === "function" ? m(p.url) : p.url.includes(m))) { p.done = true; p.res(); } },
  };
}

const L = () => globalThis.window.__LEADS;
const WS = "workspace=harbor";

/* --------------------------------- the tests ----------------------------- */

test("the Leads surface reads the searches and one view's rows, and publishes them for the page", async () => {
  const w = wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS });
  await leadsOverride.apply();
  assert.deepEqual(w.reads, [`/api/v1/lead-searches?${WS}`, `/api/v1/leads?list=all&sort=fit&dir=asc&limit=500&${WS}`]);
  assert.deepEqual(
    [L().rows.length, L().view.list, L().counts.all, L().searches[0].name, L().next, L().offered, L().route, L().readFailed],
    [ROWS.length, "all", 322, "Personal trainers · Austin", null, 0, "clients/leads", false],
  );
  assert.equal(L().rows[0].name, ROWS[0].business_name, "a row is the view model, never the stored row");
  assert.equal(L().tz, "America/Chicago", "every time on a row is said by the workspace's clock");
});

test("a read is keyed by the view: a slow answer for an old view is dropped, and the rows are the new view's", async () => {
  const w = wire({
    searches: [SEARCH_DONE], counts: COUNTS, hold: true,
    rows: (q) => (q.list === "ready" ? READY : NURTURE),
  });
  const first = globalThis.window.__leadsView("clients/leads:l-ready");          // held
  const second = globalThis.window.__leadsView("clients/leads:l-nurture");       // held
  w.release("lead-searches");
  w.release("list=nurture");
  await second;
  w.release("list=ready");
  await first;
  assert.equal(L().view.list, "nurture");
  assert.equal(L().rows.length, NURTURE.length);
  assert.ok(L().rows.every((r) => r.stage === "nurture"), "the ready rows never landed");
});

test("a refresh patches changed rows, keeps the loaded pages, and offers what is new under a fit sort", async () => {
  const w = wire({ searches: [SEARCH_DONE], rows: PAGE1, next: PAGE2, counts: COUNTS });
  await globalThis.window.__leadsView("clients/leads");
  await globalThis.window.__leadsMore();
  assert.equal(L().rows.length, PAGE1.length + PAGE2.length);
  w.now({ rows: [{ ...PAGE1[0], stage: "nurture" }, ...PAGE1.slice(1), NEW_A, NEW_B, NEW_C] });
  await leadsOverride.apply();                                          // what refresh-map and Realtime call
  assert.equal(L().rows.length, PAGE1.length + PAGE2.length, "no page was dropped");
  assert.equal(L().rows[0].stage, "nurture", "the changed row was patched in place");
  assert.equal(L().offered, 3, "12 new, said as a count; nothing re-sorted under the owner");
  await globalThis.window.__leadsTakeOffered();
  assert.equal(L().offered, 0);
  assert.ok(L().rows.some((r) => r.id === NEW_A.id));
});

test("under the found sort new rows append in the order found", async () => {
  const w = wire({ searches: [SEARCH_RUNNING], rows: PAGE1, counts: COUNTS });
  await globalThis.window.__leadsView({ sort: "found", dir: "desc" });
  w.now({ rows: [NEW_A, ...PAGE1] });
  await leadsOverride.apply();
  assert.deepEqual([L().offered, L().rows.at(-1).id], [0, NEW_A.id], "appended after what the owner is reading, not on top of it");
});

test("leadsMore appends only under the same view; its late answer after a view change is dropped", async () => {
  const pageOne = (u) => u.includes("/api/v1/leads?") && !u.includes("after_key");
  const w = wire({ searches: [SEARCH_DONE], rows: PAGE1, next: PAGE2, counts: COUNTS, hold: true });
  w.release("lead-searches");
  w.release(pageOne);
  await globalThis.window.__leadsView("clients/leads");
  const more = globalThis.window.__leadsMore();                         // held on the second page
  await globalThis.window.__leadsView("clients/leads:l-ready");
  w.release("after_key");
  await more;
  assert.equal(L().view.list, "ready");
  assert.ok(!L().rows.some((r) => PAGE2.some((p) => p.id === r.id)), "page two of the old view never joined the new one");
});

test("a failed read is its own state, never an empty list", async () => {
  wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS, fail: "GET /api/v1/leads" });
  await leadsOverride.apply().catch(() => {});
  assert.equal(L().readFailed, true);
});

test("the first day's suggestions are read only when the workspace has no search", async () => {
  const w = wire({ searches: [], rows: [], counts: ZERO, suggestions: SUGGESTIONS });
  await globalThis.window.__leadsView("clients/leads");
  assert.equal(w.reads.at(-1), `/api/v1/lead-suggestions?${WS}`);
  assert.equal(L().suggestions.items.length, 3);
  const w2 = wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS, suggestions: SUGGESTIONS });
  await globalThis.window.__leadsView("clients/leads");
  assert.ok(!w2.reads.some((u) => u.includes("lead-suggestions")), "a workspace with a search has work to read instead");
});

test("every act goes through its route with the id and the version it saw, never with rows", async () => {
  const w = wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS });
  await globalThis.window.__leadUndo(OP, 4);
  await globalThis.window.__leadKeep(SEARCH_DONE.id, ROWS[0].id);
  await globalThis.window.__leadsBulk({ by: "view", action: "contacted", view: { list: "all", sort: "fit", dir: "asc" } });
  await globalThis.window.__leadStage(ROWS[0].id, { kind: "outcome", outcome: "interested", note: "Tuesday" });
  await globalThis.window.__leadSearchUndo(SEARCH_DONE.id);
  assert.deepEqual(w.writes.map((x) => [x.key, x.body]), [
    [`POST /api/v1/lead-operations/${OP}/undo`, { version: 4 }],
    [`POST /api/v1/leads/${ROWS[0].id}/keep`, { search_id: SEARCH_DONE.id }],
    ["POST /api/v1/leads/bulk", { by: "view", action: "contacted", view: { list: "all", sort: "fit", dir: "asc" } }],
    [`POST /api/v1/leads/${ROWS[0].id}/stage`, { kind: "outcome", outcome: "interested", note: "Tuesday" }],
    [`POST /api/v1/lead-searches/${SEARCH_DONE.id}/undo`, undefined],
  ]);
});

/* ------------------------------ acts, at once ------------------------------ */

const REVIEW = leadRow({ member: { class: "review", fit: "look", reason: "Couldn't check the email", reasons: ["email:unknown"], excluded_by: null, distance_m: 2400, counted: false, checks: [], other_emails: [] } });
const LEFT_OUT = leadRow({ member: { class: "excluded", fit: null, reason: "A chain with 40 locations", excluded_by: "chain", distance_m: 2400, counted: false, checks: [], other_emails: [] } });
const clsOf = (id) => L().rows.find((r) => r.id === id).cls;
const heardSurface = () => { const heard = []; const on = () => heard.push(clsOf(REVIEW.id)); globalThis.window.addEventListener("surface:leads", on); return { heard, off: () => globalThis.window.removeEventListener("surface:leads", on) }; };

test("Keep, Exclude and Put back show on the row at once, and answer when the door accepts: the re-read is behind them, not in front of the next press", async () => {
  wire({ searches: [SEARCH_DONE], rows: [REVIEW, LEFT_OUT, ...ROWS], counts: COUNTS });
  await globalThis.window.__leadsView("clients/leads");
  assert.deepEqual([clsOf(REVIEW.id), clsOf(LEFT_OUT.id)], ["review", "excluded"]);
  // From here every answer is held, the way a slow network holds it.
  const w = wire({ searches: [SEARCH_DONE], rows: [REVIEW, LEFT_OUT, ...ROWS], counts: COUNTS, hold: true });
  const page = heardSurface();
  const kept = globalThis.window.__leadKeep(SEARCH_DONE.id, REVIEW.id);
  assert.equal(clsOf(REVIEW.id), "qualified", "before the door has answered: the row is what the press made it");
  assert.deepEqual(page.heard, ["qualified"], "and the page was told, once");
  w.release(`/leads/${REVIEW.id}/keep`);
  const r = await kept;
  assert.equal(r.ok, true, "answered with both re-reads still out: a press a second is a list worked at the owner's pace");
  // That the re-read still goes out behind the answer is the client's own rule (client-refresh-behind.test.mjs);
  // no runner is mounted here, so refresh-map's "POST leads/[id]/keep": leads has nothing to call.
  const back = globalThis.window.__leadPutBack(SEARCH_DONE.id, LEFT_OUT.id);
  assert.equal(clsOf(LEFT_OUT.id), "qualified", "Put back counts it, at once");
  w.release(`/leads/${LEFT_OUT.id}/put-back`);
  assert.equal((await back).ok, true);
  const out = globalThis.window.__leadExclude(SEARCH_DONE.id, ROWS[0].id);
  assert.equal(clsOf(ROWS[0].id), "excluded");
  w.release(`/leads/${ROWS[0].id}/exclude`);
  assert.equal((await out).ok, true);
  page.off();
  w.release(() => true);
  await new Promise((res) => setTimeout(res, 20));
});

test("a Keep the door refuses puts the row back as it was and says why: nothing on the page is left saying it was kept", async () => {
  wire({ searches: [SEARCH_DONE], rows: [REVIEW, ...ROWS], counts: COUNTS });
  await globalThis.window.__leadsView("clients/leads");
  wire({ searches: [SEARCH_DONE], rows: [REVIEW, ...ROWS], counts: COUNTS, fail: `POST /api/v1/leads/${REVIEW.id}/keep` });
  const page = heardSurface();
  const r = await globalThis.window.__leadKeep(SEARCH_DONE.id, REVIEW.id);
  page.off();
  assert.equal(r.ok, false);
  assert.equal(clsOf(REVIEW.id), "review", "as it was");
  assert.deepEqual(page.heard, ["qualified", "review"], "the page saw the press, then saw it taken back");
});

test("a row an act has changed is not put back by a re-read that no longer holds it: the kept lead stays kept where the owner left it", async () => {
  // Needs review, as the class tab reads it: once kept, the lead is not in that read any more.
  const w = wire({ searches: [SEARCH_DONE], rows: [REVIEW, ...ROWS], counts: COUNTS });
  await globalThis.window.__leadsView("clients/leads:c-review");
  const r = await globalThis.window.__leadKeep(SEARCH_DONE.id, REVIEW.id);
  assert.equal(r.ok, true);
  w.now({ rows: ROWS });
  await leadsOverride.apply();
  assert.equal(clsOf(REVIEW.id), "qualified", "REGRESSION: the row stayed on the page as Needs review, its Keep still offered, until the view was read again");
});

test("a stage change shows on the row at once, as the door will spell it (stageArgs), and a refused one is taken back; what the door alone decides is left to the re-read", async () => {
  const stageOf = (id) => L().rows.find((r) => r.id === id).stage;
  wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS });
  await globalThis.window.__leadsView("clients/leads");
  const w = wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS, hold: true });
  const p = globalThis.window.__leadStage(ROWS[0].id, { kind: "outcome", outcome: "interested", note: "Tuesday" });
  assert.equal(stageOf(ROWS[0].id), "converted", "an Interested call is Talking, at once");
  assert.equal(stageOf(ROWS[1].id), "ready", "and only that row");
  w.release(`/leads/${ROWS[0].id}/stage`);
  assert.equal((await p).ok, true);
  const q = globalThis.window.__leadStage(ROWS[1].id, { kind: "not_a_fit", why: "chain" });
  assert.equal(stageOf(ROWS[1].id), "archived");
  w.release(`/leads/${ROWS[1].id}/stage`);
  await q;
  const r = globalThis.window.__leadStage(ROWS[2].id, { kind: "outcome", outcome: "wrong_number" });
  assert.equal(stageOf(ROWS[2].id), "ready", "a wrong number moves no stage, so nothing is shown moving");
  w.release(`/leads/${ROWS[2].id}/stage`);
  await r;
  w.release(() => true);
  // Refused: back as it was.
  wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS, fail: `POST /api/v1/leads/${ROWS[2].id}/stage` });
  await globalThis.window.__leadsView("clients/leads");
  const no = await globalThis.window.__leadStage(ROWS[2].id, { kind: "said_no" });
  assert.deepEqual([no.ok, stageOf(ROWS[2].id)], [false, "ready"]);
});

test("a bulk act over ids shows on every row at once; one over a whole view shows nothing early, since nobody knows which rows it reaches", async () => {
  const stageOf = (id) => L().rows.find((r) => r.id === id).stage;
  wire({ searches: [SEARCH_DONE], rows: [REVIEW, ...ROWS], counts: COUNTS });
  await globalThis.window.__leadsView("clients/leads");
  const w = wire({ searches: [SEARCH_DONE], rows: [REVIEW, ...ROWS], counts: COUNTS, hold: true });
  const ids = [ROWS[0].id, ROWS[1].id];
  const p = globalThis.window.__leadsBulk({ by: "ids", action: "contacted", ids });
  assert.deepEqual(ids.map(stageOf), ["nurture", "nurture"], "Mark contacted: both rows are Contacted before the door answers");
  assert.equal(stageOf(ROWS[2].id), "ready", "and the row not picked is not");
  w.release("/leads/bulk");
  assert.equal((await p).ok, true);
  const k = globalThis.window.__leadsBulk({ by: "ids", action: "keep", ids: [REVIEW.id], search_id: SEARCH_DONE.id });
  assert.equal(clsOf(REVIEW.id), "qualified", "Keep from the bench: kept at once");
  w.release("/leads/bulk");
  await k;
  const before = L().rows.map((r) => [r.stage, r.cls]);
  const v = globalThis.window.__leadsBulk({ by: "view", action: "not_a_fit", view: { list: "all", sort: "fit", dir: "asc" } });
  assert.deepEqual(L().rows.map((r) => [r.stage, r.cls]), before, "select all 1,240 that match: the rows wait for the re-read");
  w.release("/leads/bulk");
  await v;
  w.release(() => true);
  // Refused: every row of it back.
  wire({ searches: [SEARCH_DONE], rows: [REVIEW, ...ROWS], counts: COUNTS, fail: "POST /api/v1/leads/bulk" });
  await globalThis.window.__leadsView("clients/leads");
  const no = await globalThis.window.__leadsBulk({ by: "ids", action: "not_a_fit", ids });
  assert.deepEqual([no.ok, ...ids.map(stageOf)], [false, "ready", "ready"]);
});

/* ------------------------------ views, held ------------------------------ */

test("a view the surface has already read paints at once on the way back, with its Show more pages, and is refreshed behind: a rail pick used to be a round trip each way", async () => {
  wire({ searches: [SEARCH_DONE], counts: COUNTS, rows: (q) => (q.list === "ready" ? READY : q.list === "nurture" ? NURTURE : PAGE1), next: PAGE2 });
  await globalThis.window.__leadsView("clients/leads");
  await globalThis.window.__leadsMore();
  assert.equal(L().rows.length, PAGE1.length + PAGE2.length);
  await globalThis.window.__leadsView("clients/leads:l-ready");
  assert.equal(L().rows.length, READY.length);
  // Back to all leads, with every answer held: what is on the page is what the surface held, before any read lands.
  const held = wire({ keep: true, searches: [SEARCH_DONE], counts: COUNTS, rows: (q) => (q.list === "ready" ? READY : PAGE1), next: PAGE2, hold: true });
  const heard = [];
  const on = () => heard.push([L().route, L().rows.length]);
  globalThis.window.addEventListener("surface:leads", on);
  const back = globalThis.window.__leadsView("clients/leads");
  assert.deepEqual([L().route, L().rows.length, L().next], ["clients/leads", PAGE1.length + PAGE2.length, null], "the held view, its Show more pages with it, before the wire has answered");
  assert.deepEqual(heard, [["clients/leads", PAGE1.length + PAGE2.length]], "and the page was told at once");
  assert.ok(held.reads.some((u) => u.includes("list=all")), "read again behind it all the same");
  held.release(() => true);
  await back;
  globalThis.window.removeEventListener("surface:leads", on);
  assert.equal(L().rows.length, PAGE1.length + PAGE2.length, "the refresh patched what it holds and dropped no page");
  // The other way too, and a view never read still reads first.
  const again = wire({ keep: true, searches: [SEARCH_DONE], counts: COUNTS, rows: (q) => (q.list === "ready" ? READY : q.list === "nurture" ? NURTURE : PAGE1), hold: true });
  const toReady = globalThis.window.__leadsView("clients/leads:l-ready");
  assert.deepEqual([L().route, L().rows.length], ["clients/leads:l-ready", READY.length]);
  again.release(() => true);
  await toReady;
  const toNurture = globalThis.window.__leadsView("clients/leads:l-nurture");
  assert.equal(L().route, "clients/leads:l-ready", "a view never read shows nothing of itself until it lands");
  again.release(() => true);
  await toNurture;
  assert.deepEqual([L().route, L().rows.length], ["clients/leads:l-nurture", NURTURE.length]);
});

test("a view held stays held across a write: a Keep on one view does not make the way back to another a read again", async () => {
  wire({ searches: [SEARCH_DONE], counts: COUNTS, rows: (q) => (q.list === "ready" ? READY : [REVIEW, ...PAGE1]) });
  await globalThis.window.__leadsView("clients/leads:l-ready");
  await globalThis.window.__leadsView("clients/leads");
  assert.equal((await globalThis.window.__leadKeep(SEARCH_DONE.id, REVIEW.id)).ok, true);
  const held = wire({ keep: true, searches: [SEARCH_DONE], counts: COUNTS, rows: (q) => (q.list === "ready" ? READY : PAGE1), hold: true });
  const back = globalThis.window.__leadsView("clients/leads:l-ready");
  assert.deepEqual([L().route, L().rows.length], ["clients/leads:l-ready", READY.length], "painted from what is held, the write notwithstanding: it is read again behind");
  held.release(() => true);
  await back;
});

test("a view is warmed on intent: the read goes out, nothing on the page moves, and the pick that follows paints at once", async () => {
  const w = wire({ searches: [SEARCH_DONE], counts: COUNTS, rows: (q) => (q.search === SEARCH_ID ? READY : PAGE1) });
  await globalThis.window.__leadsView("clients/leads");
  const before = w.reads.length;
  const heard = [];
  const on = () => heard.push(L().route);
  globalThis.window.addEventListener("surface:leads", on);
  await globalThis.window.__leadsWarm(`clients/leads:s-${SEARCH_ID}`);
  assert.ok(w.reads.slice(before).some((u) => u.includes(`search=${SEARCH_ID}`)), "the search's page was read");
  assert.deepEqual([L().route, heard], ["clients/leads", []], "and the page stayed where it was, told nothing");
  const held = wire({ keep: true, searches: [SEARCH_DONE], counts: COUNTS, rows: (q) => (q.search === SEARCH_ID ? READY : PAGE1), hold: true });
  const pick = globalThis.window.__leadsView(`clients/leads:s-${SEARCH_ID}`);
  assert.deepEqual([L().route, L().rows.length], [`clients/leads:s-${SEARCH_ID}`, READY.length], "picked: painted from what the warm read, before the wire answers");
  held.release(() => true);
  await pick;
  globalThis.window.removeEventListener("surface:leads", on);
  // Warmed once: a second hover reads nothing more while the view is held.
  const twice = held.reads.length;
  await globalThis.window.__leadsWarm(`clients/leads:s-${SEARCH_ID}`);
  assert.equal(held.reads.length, twice, "held already: no read");
});

// Measured on the salon's workspace, 21 Sep: a refresh on a search's Needs review read ALL leads first (500 rows,
// list=all, no search), drew them dimmed over the restored rows of the view the owner was on, then read that view.
// A cold boot has only the address and what the tab's cache restored; it read neither. (The boot itself, run in a
// fresh module: leads-cold-boot.test.mjs.)
test("the view a cold boot reads: the one the address names, in the order this tab last read", () => {
  const PEEK = "1a2b3c4d-0000-4000-8000-000000000001";
  const restored = (over) => ({ view: { searchId: null, list: "all", cls: null, chips: {}, sort: "rating", dir: "desc", ...over } });
  assert.deepEqual(
    leadsBootView(`#/clients/leads:s-${SEARCH_ID}:c-review:p-${PEEK}`, restored({ searchId: SEARCH_ID, cls: "review" })),
    { searchId: SEARCH_ID, list: "all", cls: "review", chips: {}, sort: "rating", dir: "desc" },
    "the lead open over the view is no part of it",
  );
  assert.deepEqual(leadsBootView("#/clients/leads:l-ready", null), { searchId: null, list: "ready", cls: null, chips: {}, sort: "fit", dir: "asc" }, "nothing restored: the view's own default order");
  assert.deepEqual(leadsBootView("#/today", restored({})), { searchId: null, list: "all", cls: null, chips: {}, sort: "rating", dir: "desc" }, "off the page: all leads, in the order the page will ask for when it opens");
  assert.deepEqual(leadsBootView("#/clients/leads", restored({ sort: "nonsense", dir: "sideways" })), { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" }, "an order the server does not know is never sent");
  assert.deepEqual(leadsBootView("#/clients/leads", { view: "garbage" }), { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" });
  assert.deepEqual(leadsBootView("", undefined), { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" }, "what it always read");
});

test("the courier installs exactly the names the page and the screens call, and no words of its own", () => {
  const installed = Object.keys(globalThis.window).filter((k) => k.startsWith("__lead")).sort();
  assert.deepEqual(installed, [
    "__leadBusinessLine", "__leadCheckAgain", "__leadDraft", "__leadErase", "__leadExclude", "__leadKeep", "__leadPeekVM", "__leadPutBack",
    "__leadRail", "__leadSearchAnswer", "__leadSearchMore", "__leadSearchRemove", "__leadSearchRename",
    "__leadSearchStop", "__leadSearchUndo", "__leadSearchWords", "__leadStage", "__leadUndo",
    "__leadsBulk", "__leadsMore", "__leadsRouteOf", "__leadsRouteParse", "__leadsStanding", "__leadsTakeOffered", "__leadsView", "__leadsWarm",
  ]);
  assert.equal(globalThis.window.__leadsRouteOf({ searchId: SEARCH_ID, list: "ready", cls: null }), `clients/leads:s-${SEARCH_ID}:l-ready`);
  assert.deepEqual(globalThis.window.__leadsRouteParse(`clients/leads:s-${SEARCH_ID}:l-ready`), { searchId: SEARCH_ID, list: "ready", cls: null, chips: {}, peek: null });
  assert.equal(globalThis.window.__leadRail(COUNTS, [SEARCH_DONE]).searches[0].count, 322);
  assert.equal(globalThis.window.__leadsStanding(COUNTS, [SEARCH_DONE]).total, "322 leads");
  // The words a lead wears are seeded whole in seed-globals.ts (__LEAD_WORDS, __LEAD_VM); the courier carries acts.
  assert.equal(globalThis.window.__LEAD_WORDS, undefined);
  assert.equal(globalThis.window.__LEAD_VM, undefined);
});

test("the surface declares the globals it owns, the tables a run writes, and its own event", () => {
  assert.deepEqual(
    [leadsOverride.key, leadsOverride.globals, leadsOverride.events, leadsOverride.refreshOnTables, leadsOverride.debounceMs],
    ["leads", ["__LEADS"], ["surface:leads"], ["leads", "lead_searches", "lead_rounds", "lead_search_members"], 800],
  );
});

test("the month's standing rides the surface, from the first page's own answer", async () => {
  wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS, month: { used: 262, left: 238, renewsOn: "Oct 1" } });
  await leadsOverride.apply();
  assert.deepEqual(L().month, { used: 262, left: 238, renewsOn: "Oct 1" }, "what a press costs is read from the surface, never from a page's own arithmetic");
  // A Keep just spent one, so a refresh moves it; a refresh whose page carried none keeps what was last known.
  wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS, month: { used: 263, left: 237, renewsOn: "Oct 1" } });
  await leadsOverride.apply();
  assert.deepEqual(L().month, { used: 263, left: 237, renewsOn: "Oct 1" });
  wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS });
  await leadsOverride.apply();
  assert.deepEqual(L().month, { used: 263, left: 237, renewsOn: "Oct 1" }, "what was last known, never a number the page made up");
});

/**
 * Offer it's route, run: POST /api/v1/calendar/freed over a stand-in edge (Today in three zones, 2 Nov 2026; decision
 * 0082). The page sends the cancelled visit; the route knocks on the edge's admin/calendar/freed-time as the member who
 * pressed (server/campaigns/playbook-run.ts offerFreedNow) and says what came of it: offered, to how many and whether
 * the batch waits for the owner's OK, or why not, in the owner's words (contracts offerRefusedWords, else the route's
 * own); a workspace past its plan is a 402, any other refusal a 502 in words, never a code. A viewer cannot press it, and
 * a body that names no visit reaches no edge.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CAMPAIGNS_PAUSED_WORDS, TODAY_PHONE_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

// The edge this deployment reaches, live: set before the server's modules read them.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "http://edge.test";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/calendar/freed/route.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** Rosa's visit, cancelled: Tuesday 8 September, 3 to 4 PM in New York. */
const V = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const BODY = { visit_id: V };

/** The stand-in edge: what each knock asked, and the answer it gives (a status and a body). */
let knocks = [];
let answer = { status: 200, body: { ok: true, offered: true, people: 3, waits: true } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  knocks.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response(JSON.stringify(answer.body), {
    status: answer.status,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  knocks = [];
  setRateStore(memoryStore());
});

const ctxFor = (role = "owner") => ({
  supabase: fakeDb({
    memberships: [
      { user_id: "u1", tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  }),
  userId: "u1",
  email: "ada@example.com",
  params: {},
});
const press = (body = BODY, role = "owner") =>
  route.POST.run(
    new Request(`http://localhost/api/v1/calendar/freed?workspace=${T}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    ctxFor(role),
  );
const edgeSays = (status, body) => {
  answer = { status, body };
};

test("offered: the edge is asked as the member who pressed, for the visit, and the route says to how many and whether it waits", async () => {
  edgeSays(200, { ok: true, offered: true, people: 3, waits: true });
  assert.deepEqual(await press(), { offered: true, people: 3, waits: true });
  assert.equal(knocks.length, 1);
  assert.equal(knocks[0].url, "http://edge.test/api/admin/calendar/freed-time");
  assert.deepEqual(
    [knocks[0].body.tenant_id, knocks[0].body.user_id, knocks[0].body.appointment_id],
    [T, "u1", V],
    "the visit and who pressed: the edge reads the time from the visit itself",
  );
  edgeSays(200, { ok: true, offered: true, people: 1, waits: false });
  assert.deepEqual(await press(), { offered: true, people: 1, waits: false }, "a sequence that sends on its own");
});

test("not offered: every reason in the owner's words, the time's and the run's own first, never a code", async () => {
  const said = async (why, detail) => {
    edgeSays(200, { ok: true, offered: false, why, ...(detail ? { detail } : {}) });
    const r = await press();
    assert.equal(r.offered, false);
    return r.why;
  };
  assert.equal(await said("gone"), "That cancellation is no longer on the calendar.");
  assert.equal(await said("too_soon"), "It starts too soon for the notice the receptionist gives.");
  assert.equal(await said("past_window"), "It is further ahead than the receptionist books.");
  assert.equal(await said("not_free"), "That time is no longer open.");
  assert.equal(await said("no_person"), "This one can't be offered.");
  assert.equal(await said("nobody"), TODAY_PHONE_WORDS.offer.nobody);
  assert.equal(await said("no_step"), "Nothing offers a freed time yet: set up Fill a cancellation in Campaigns.");
  assert.equal(await said("paused"), "Fill a cancellation is paused, or the workspace is, so nothing was offered.");
  assert.equal(
    await said("off", "template_not_approved"),
    "Nothing was offered: WhatsApp hasn’t approved its message.",
    "REGRESSION: a run that was off said only that it could not run, dropping why",
  );
  assert.equal(await said("off", "freed_time_passed"), "That hour has begun: nobody can take it now.");
  assert.equal(await said("off", "something new"), "Fill a cancellation could not run just now.");
  assert.equal(await said("weird"), "Nothing was offered (weird).", "a reason nobody wrote words for is said plainly");
});

test("refused: a workspace past its plan is a 402 in the plan's words; a run that failed, or an edge that did not answer, a 502 in words", async () => {
  edgeSays(402, { ok: false, error: "payment_required" });
  await assert.rejects(press(), (e) => {
    assert.deepEqual([e.status, e.message], [402, CAMPAIGNS_PAUSED_WORDS]);
    return true;
  });
  edgeSays(500, { ok: false, error: "run_failed", detail: "the read timed out" });
  await assert.rejects(press(), (e) => {
    assert.equal(e.status, 502);
    assert.match(e.message, /could not be made just now/);
    assert.ok(!e.message.includes("run_failed"), "never the code");
    return true;
  });
});

test("a viewer cannot press it, and a body that names no visit reaches no edge", async () => {
  await assert.rejects(press(BODY, "viewer"), (e) => e.status === 403);
  await assert.rejects(press({ ...BODY, visit_id: "rosa" }), (e) => e.code === "validation");
  assert.deepEqual(knocks, []);
});

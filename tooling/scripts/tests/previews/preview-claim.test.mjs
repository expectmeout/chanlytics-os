/**
 * Make it mine (decision 0079, L4), run as Next runs its page and routes over a database in memory, with Supabase's
 * auth server and the edge answered by the test:
 *
 *   - what its page (/preview/<token>/mine) draws the sign-up screen with, read on the server: whose receptionist and
 *     the address it was sent to, while it can be made theirs; nothing, alike, for every other link, and the page sends
 *     the browser back to the preview's own (the page draws a client screen this runner cannot load: the walk runs it);
 *   - a live link opens sign-up whatever the posture, since it stands for an invite code, and rides on the new account
 *     for the first screen to claim; one that cannot be made theirs opens nothing, and says nothing about itself;
 *   - the claim (POST preview-claims) is preview_claim on the claimer's own session, then what a first workspace's
 *     making does after its door (the platform's notice, the first alert address, sign-up's answers cleared), and what
 *     the preview was used for, as the claimer's first-run marks; a second claim is the door's own words.
 *
 * Made-up businesses only.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_RUN_HELPERS,
  PENDING_WORKSPACE_KEY,
  SIGNUP_WAITLIST,
  SIGNUP_WORDS,
  previewFirstRunMarks,
  setupLaterOf,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.com",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-this-file",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-for-this-file",
  EDGE_URL: "https://edge.example.com",
  EDGE_CALL_SECRET: "edge-secret-for-this-file",
  // The platform's notice goes only where the providers are live.
  EDGE_PROVIDERS: "live",
  SIGNUP_CODE: undefined,
};
const was = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
const setEnv = (o) => {
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};
setEnv(ENV);
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  setEnv(was);
});

const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/service-db.ts");
const signupRoute = await importSrc("apps/dashboard/app/api/v1/signup/route.ts");
const { previewForSignup } = await importSrc("apps/dashboard/src/server/previews/claim.ts");
const claimRoute = await importSrc("apps/dashboard/app/api/v1/preview-claims/route.ts");
after(() => setServiceClient(null));

const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN = "TokenTokenTokenToken01";
const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();
const SAME = { "sec-fetch-site": "same-origin" };
const FIXTURE = {
  id: WS,
  slug: "fixture-barbers",
  name: "Fixture Barbers",
  status: "active",
  timezone: "America/Chicago",
  locale: "en",
};

/** The sender's row of a preview, its workspace and the lead it was made from, on the service role. */
function world(over = {}) {
  const tables = {
    lead_previews: [
      {
        id: "p1",
        tenant_id: OURS,
        lead_id: "l1",
        preview_tenant_id: WS,
        token: TOKEN,
        state: "ready",
        ends_at: FUTURE,
        asked_count: 3,
        call_count: 1,
        call_seconds: 72,
        ...over,
      },
    ],
    tenants: [rows.tenant({ id: WS, name: "Fixture Barbers", slug: "fixture-barbers" })],
    leads: [
      {
        id: "l1",
        tenant_id: OURS,
        kind: "company",
        stage: "contacted",
        erased_at: null,
        blanked_at: null,
        business_name: "Fixture Barbers",
        category: "barber_shop",
        street: "12 Main St",
        city: "Austin",
        region: "TX",
        postal_code: "78701",
        phone_e164: "+15125550142",
        email: "owner@fixture.example",
        website_host: null,
        hours: {},
      },
    ],
    waitlist: [],
  };
  setServiceClient(fakeDb(tables));
  return tables;
}

/** Every request that leaves for Supabase's auth server or the edge, answered as each would. */
let wire = [];
beforeEach(() => {
  setRateStore(memoryStore());
  wire = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    wire.push({ host: u.host, path: u.pathname, body });
    if (u.pathname === "/auth/v1/signup")
      return Response.json({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        aud: "authenticated",
        role: "authenticated",
        email: body.email,
        identities: [{ identity_id: "i1", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }],
        user_metadata: body.data,
        created_at: "2026-11-02T15:00:00Z",
      });
    return Response.json({ ok: true });
  };
});

/** A sign-up, from a fresh network and address each time: the buckets are the limiter's test, not this file's. */
const signUpWith = (body) => (
  setRateStore(memoryStore()),
  signupRoute.POST(
    new Request("http://localhost/api/v1/signup", {
      method: "POST",
      headers: { ...SAME, "content-type": "application/json" },
      body: JSON.stringify({ name: "Fixture Barbers", password: "correct horse battery", ...body }),
    }),
  )
);

test("what Make it mine's page draws: whose receptionist and the address it was sent to, while it can be made theirs", async () => {
  world();
  assert.deepEqual(await previewForSignup(TOKEN), { business: "Fixture Barbers", email: "owner@fixture.example" });
  world({ asked_count: 20 });
  assert.equal((await previewForSignup(TOKEN))?.business, "Fixture Barbers", "its twenty said, it can still be theirs");
});

test("every other link is nothing, alike: someone's own, ended, failed, being set up, past its end, or none", async () => {
  world();
  for (const token of ["UnknownUnknownUnknown0", "short", "../../etc"])
    assert.equal(await previewForSignup(token), null, token);
  for (const over of [
    { state: "claimed" },
    { state: "ended" },
    { state: "failed" },
    { state: "building" },
    { ends_at: PAST },
  ]) {
    world(over);
    assert.equal(await previewForSignup(TOKEN), null, JSON.stringify(over));
  }
});

test("a live link opens sign-up whatever the posture, and rides on the new account for the first screen to claim", async () => {
  for (const code of ["SPRING-2026", SIGNUP_WAITLIST]) {
    setEnv({ SIGNUP_CODE: code });
    world();
    wire = [];
    const res = await signUpWith({ email: "owner@fixture.example", preview: TOKEN });
    const body = await res.json();
    assert.equal(res.status, 200, `${code}: ${JSON.stringify(body)}`);
    assert.deepEqual(body.data, { sent: true, next: null }, `${code}: an account made, its code on its way`);
    const made = wire.filter((w) => w.path === "/auth/v1/signup");
    assert.equal(made.length, 1, `${code}: no invite code asked, no list joined`);
    assert.deepEqual(made[0].body.data[PENDING_WORKSPACE_KEY], {
      name: "Fixture Barbers",
      timezone: null,
      preview: TOKEN,
    });
  }
  setEnv({ SIGNUP_CODE: undefined });
});

test("a link that cannot be made theirs opens nothing, and says nothing a link that names nothing would not", async () => {
  setEnv({ SIGNUP_CODE: "SPRING-2026" });
  const answers = [];
  for (const [over, token] of [
    [{ state: "claimed" }, TOKEN],
    [{ ends_at: PAST }, TOKEN],
    [{}, "UnknownUnknownUnknown0"],
  ]) {
    world(over);
    wire = [];
    const res = await signUpWith({ email: "owner@fixture.example", preview: token });
    answers.push([res.status, await res.json()]);
    assert.deepEqual(wire, [], "no account made");
  }
  assert.deepEqual(answers[0], [403, { ok: false, error: { code: "forbidden", message: SIGNUP_WORDS.codeWrong } }]);
  assert.deepEqual(answers[1], answers[0]);
  assert.deepEqual(answers[2], answers[0]);

  // Open, the link that is no link any more is not kept: the first screen makes a workspace, as for anyone.
  setEnv({ SIGNUP_CODE: undefined });
  world({ state: "ended" });
  wire = [];
  assert.equal((await signUpWith({ email: "owner@fixture.example", preview: TOKEN })).status, 200);
  assert.deepEqual(wire[0].body.data[PENDING_WORKSPACE_KEY], { name: "Fixture Barbers", timezone: null });
});

/* ---- the claim ---- */

/** The claimer's own session: the claim's door, their Setup view, the new workspace's settings and their metadata. */
function session({ claim = () => [FIXTURE], metadata = {} } = {}) {
  const views = [];
  const updated = [];
  const tables = {
    tenant_config: [{ tenant_id: WS, config: {}, version: 1, updated_at: "2026-11-02T00:00:00Z" }],
  };
  const db = fakeDb(tables, {}, { preview_claim: (a) => claim(a), member_view_set: (a) => (views.push(a), null) });
  db.auth = { updateUser: async (x) => (updated.push(x), { error: null }) };
  const ctx = {
    supabase: db,
    userId: OWNER,
    email: "owner@fixture.example",
    aal: "aal1",
    metadata,
    params: {},
    headers: {},
  };
  return { ctx, views, updated, tables };
}
const claimWith = (ctx, token = TOKEN) =>
  claimRoute.POST.run(
    new Request("http://localhost/api/v1/preview-claims", { method: "POST", body: JSON.stringify({ token }) }),
    ctx,
  );

test("the claim: the door on the claimer's own session, then what a first workspace's making does after its door", async () => {
  world();
  const asked = [];
  const { ctx, views, updated, tables } = session({
    claim: (a) => (asked.push(a), [FIXTURE]),
    metadata: { [PENDING_WORKSPACE_KEY]: { name: "Fixture Barbers", timezone: null, preview: TOKEN } },
  });
  const out = await claimWith(ctx);
  assert.deepEqual(out, { workspace: FIXTURE }, "answered as /api/v1/workspaces lists one");
  assert.deepEqual(asked, [{ p_token: TOKEN }], "the claimer is the session's, never anything sent");

  const told = wire.filter((w) => w.path === "/api/admin/signup-notify");
  assert.deepEqual(
    told.map((w) => w.body),
    [{ tenant_id: WS, email: "owner@fixture.example" }],
    "the platform mailbox hears of it once",
  );
  assert.deepEqual(
    tables.tenant_config[0].config,
    { notifications: { escalation_emails: ["owner@fixture.example"] } },
    "its owner is its first alert address",
  );
  assert.deepEqual(updated, [{ data: { [PENDING_WORKSPACE_KEY]: null } }], "sign-up's answers cleared");

  // Talked to and called on the page: its receptionist met and its rehearsal heard, as the first run's own marks.
  assert.equal(views.length, 1);
  assert.deepEqual([views[0].p_tenant_id, views[0].p_page], [WS, "setup"]);
  assert.deepEqual(setupLaterOf(views[0].p_view), [
    FIRST_RUN_HELPERS.receptionistMet,
    FIRST_RUN_HELPERS.rehearseSkipped,
  ]);
});

test("what a preview was used for is what its first run counts: talked to, met; called, heard; untried, nothing", async () => {
  assert.deepEqual(previewFirstRunMarks({ asked_count: 2, call_count: 0 }), [FIRST_RUN_HELPERS.receptionistMet]);
  assert.deepEqual(previewFirstRunMarks({ asked_count: 0, call_count: 1 }), [
    FIRST_RUN_HELPERS.receptionistMet,
    FIRST_RUN_HELPERS.rehearseSkipped,
  ]);
  world({ asked_count: 0, call_count: 0 });
  const { ctx, views } = session();
  await claimWith(ctx);
  assert.deepEqual(views, [], "nothing to count, nothing written");
});

test("a claim refused is the door's own words: someone's own already, ended, none, or the account's ten", async () => {
  world();
  for (const [error, status] of [
    [{ code: "55000", message: "Fixture Barbers is already set up." }, 409],
    [{ code: "55000", message: "This preview has ended." }, 409],
    [{ code: "P0002", message: "This preview was not found." }, 404],
    [{ code: "54000", message: "This account already owns 10 workspaces." }, 409],
  ]) {
    // A door that raises: the database refused, with its code (fakeDb makes the envelope).
    const { ctx, views, updated } = session({
      claim: () => {
        throw Object.assign(new Error(error.message), { code: error.code });
      },
    });
    wire = [];
    await assert.rejects(claimWith(ctx), (e) => e.status === status && e.message === error.message, error.message);
    assert.deepEqual([views, updated, wire], [[], [], []], `${error.message}: nothing follows a refusal`);
  }
  const { ctx } = session();
  await assert.rejects(claimWith(ctx, "not-a-token"), (e) => e.status === 400, "a body that is no link");
});

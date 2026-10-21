/**
 * The mailbox connection routes (decision 0056), run: the real route modules over a database in memory, the edge's door
 * answered by the test. What is proved is the policy each declares; the way to the provider's consent screen (its
 * client and scopes, a state signed for this workspace, this person and this provider); the way back (nothing trusted
 * before the state proves itself, a Business Profile's state refused, the code handed to the edge, one word for the page
 * on the workspace's own address); what the edge is sent for each verb, in a token for its door; how its refusals become
 * the owner's words; and that the pages' read of the mailboxes (Setup's and Connections', connections/email.ts) never
 * carries a token's name.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { verifyEdgeToken, verifyState, signState, newNonce, STATE_TTL_MS } from "@chanlytics/channels";
import { MAILBOX_SCOPES } from "@chanlytics/channels";

const SECRET = "state-secret-for-this-file";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.test";
process.env.EDGE_PROVIDERS = "live";
process.env.GOOGLE_OAUTH_STATE_SECRET = SECRET;
after(() => {
  for (const k of ["EDGE_CALL_SECRET", "EDGE_URL", "EDGE_PROVIDERS", "GOOGLE_OAUTH_STATE_SECRET"])
    delete process.env[k];
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const R = "apps/dashboard/app/api/v1/mailbox-connections";
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const connect = await import(at(`${R}/connect/route.ts`));
const callback = await import(at(`${R}/callback/route.ts`));
const one = await import(at(`${R}/[id]/route.ts`));
const resume = await import(at(`${R}/[id]/resume/route.ts`));
const check = await import(at(`${R}/[id]/check/route.ts`));
const testOne = await import(at(`${R}/[id]/test/route.ts`));
const { forgetMailboxesReadiness, mailboxConnectionsFor } = await import(
  at("apps/dashboard/src/server/connections/mailbox-connections.ts")
);
const { emailSetupFor } = await import(at("apps/dashboard/src/server/connections/email.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const M1 = "d1111111-1111-4111-8111-111111111111";
const READY = {
  ok: true,
  providers: ["google", "microsoft"],
  oauth: {
    google: {
      client_id: "google-client",
      redirect_uri: "https://app.example.test/api/v1/mailbox-connections/callback",
    },
    microsoft: { client_id: "ms-client", redirect_uri: "https://app.example.test/api/v1/mailbox-connections/callback" },
  },
};
beforeEach(() => {
  setRateStore(memoryStore());
  forgetMailboxesReadiness();
});

const membership = (role, tenant = A) => ({
  user_id: USER,
  tenant_id: tenant,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
const ctx = (role = "owner", tables = {}) => ({
  supabase: fakeDb({ memberships: [membership(role)], ...tables }),
  userId: USER,
  email: "ada@example.com",
  params: { id: M1 },
});
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x?workspace=${A}${q}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

/** The edge's door, answered by the test; every call kept with its body and token. */
function edge(answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, token: init.headers?.["x-edge-token"] ?? null });
    const [status, json] = answer(body);
    return new Response(JSON.stringify(json), { status });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
async function refused(p, code, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (words) assert.match(e.message, words);
    return true;
  });
}
const DTO = { id: M1, address: "sam@getharbor.example", state: "connected" };

test("each verb is an owner's or the partner's, in the workspace, under the settings limit; the callback is the account's", () => {
  const write = { kind: "write", scope: "workspace", role: "partner", rate: "settings", spend: false };
  for (const r of [one.PATCH, one.DELETE, resume.POST, check.POST, testOne.POST]) assert.deepEqual(r.policy, write);
  assert.deepEqual(connect.GET.policy, {
    kind: "read",
    scope: "workspace",
    role: "partner",
    rate: "settings",
    spend: false,
  });
  assert.deepEqual(callback.GET.policy, { kind: "read", scope: "account", role: null, rate: null, spend: false });
});

/** The way to the provider the connect door answered (as data, for the page to follow). */
const wayTo = (answered) => new URL(answered.url);

test("Connect: to the provider's own consent screen, with its client, its scopes and a state signed for this workspace, this person and this provider", async () => {
  const net = edge(() => [200, READY]);
  try {
    const res = await connect.GET.run(send("GET", null, "&provider=microsoft"), ctx());
    const to = wayTo(res);
    assert.equal(to.origin + to.pathname, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    assert.equal(to.searchParams.get("client_id"), "ms-client");
    assert.equal(to.searchParams.get("scope"), MAILBOX_SCOPES.microsoft.join(" "));
    const proof = await verifyState(SECRET, to.searchParams.get("state"), Date.now());
    assert.equal(proof.ok, true);
    assert.deepEqual([proof.state.t, proof.state.u, proof.state.p], [A, USER, "microsoft"]);
    await refused(connect.GET.run(send("GET", null, "&provider=yahoo"), ctx()), "validation");
    await refused(connect.GET.run(send("GET", null, "&provider=google"), ctx("operator")), "forbidden");
  } finally {
    net.restore();
  }
  const none = edge(() => [200, { ok: true, providers: [], oauth: {} }]);
  try {
    forgetMailboxesReadiness();
    await refused(
      connect.GET.run(send("GET", null, "&provider=google"), ctx()),
      "conflict",
      /isn't switched on here yet/,
    );
  } finally {
    none.restore();
  }
});

test("Reconnect asks the provider for its own mailbox's address, and the state carries which; the admin's link is Microsoft's alone", async () => {
  const net = edge(() => [200, READY]);
  const box = rows.mailboxConnection({ id: M1, tenant_id: A, provider: "google", address: "sam@getharbor.example" });
  try {
    const to = wayTo(
      await connect.GET.run(
        send("GET", null, `&provider=google&mailbox_id=${M1}`),
        ctx("owner", { mailbox_connections: [box] }),
      ),
    );
    assert.equal(to.searchParams.get("login_hint"), "sam@getharbor.example");
    const proof = await verifyState(SECRET, to.searchParams.get("state"), Date.now());
    assert.equal(proof.state.m, M1);
    await refused(
      connect.GET.run(send("GET", null, `&provider=microsoft&mailbox_id=${M1}`), ctx("owner", { mailbox_connections: [box] })),
      "not_found",
    );
    await refused(connect.GET.run(send("GET", null, `&provider=google&mailbox_id=${M1}`), ctx()), "not_found");

    const admin = wayTo(await connect.GET.run(send("GET", null, "&provider=microsoft&admin=1"), ctx()));
    assert.equal(admin.origin + admin.pathname, "https://login.microsoftonline.com/organizations/v2.0/adminconsent");
    assert.equal(admin.searchParams.get("client_id"), "ms-client");
    const signed = await verifyState(SECRET, admin.searchParams.get("state"), Date.now());
    assert.deepEqual([signed.state.p, signed.state.a], ["microsoft", 1]);
    assert.ok(signed.state.exp > Date.now() + 6 * 86_400_000, "an admin's link lasts the week it may take them");
    await refused(connect.GET.run(send("GET", null, "&provider=google&admin=1"), ctx()), "validation");
  } finally {
    net.restore();
  }
});

test("back from Microsoft: a sign-in its admin must approve says so; an admin's approval is good news; a Reconnect hands the edge its mailbox", async () => {
  const net = edge((b) => [200, b.op === "connect" ? { ok: true, made: false, mailbox: DTO } : READY]);
  const back = async (q) => {
    const res = await callback.GET.run(new Request(`https://app.example.test/api/v1/mailbox-connections/callback${q}`), ctx());
    return new URL(res.headers.get("location"));
  };
  const state = (extra) =>
    signState(SECRET, { t: A, u: USER, n: newNonce(), exp: Date.now() + STATE_TTL_MS, p: "microsoft", ...extra });
  try {
    const held = await back(
      "?error=access_denied&error_description=AADSTS90094%3A+Administrator+consent+is+required.",
    );
    assert.deepEqual([held.searchParams.get("mailbox"), held.searchParams.get("why")], ["error", "admin_consent"]);
    const approved = await back(`?admin_consent=True&tenant=t1&state=${await state({ a: 1 })}`);
    assert.equal(approved.searchParams.get("mailbox"), "admin_approved");
    const notApproved = await back(`?admin_consent=True&error=consent_required&state=${await state({ a: 1 })}`);
    assert.equal(notApproved.searchParams.get("why"), "admin_consent");
    assert.deepEqual(net.calls, [], "an admin's answer carries no code to the edge");

    const again = await back(`?state=${await state({ m: M1 })}&code=c`);
    assert.equal(again.searchParams.get("mailbox"), "reconnected");
    assert.equal(net.calls.at(-1).body.mailbox_id, M1);
  } finally {
    net.restore();
  }
});

test("the way back: nothing trusted before the state proves itself; the code to the edge; one word on the workspace's own address", async () => {
  const net = edge((b) => [200, b.op === "connect" ? { ok: true, made: true, mailbox: DTO } : READY]);
  const state = (p = "google", u = USER) =>
    signState(SECRET, { t: A, u, n: newNonce(), exp: Date.now() + STATE_TTL_MS, p });
  const back = async (q, c = ctx()) => {
    const res = await callback.GET.run(
      new Request(`https://app.example.test/api/v1/mailbox-connections/callback${q}`),
      c,
    );
    assert.equal(res.status, 302);
    return new URL(res.headers.get("location"));
  };
  try {
    const ok = await back(`?state=${await state()}&code=4%2Fcode`);
    assert.equal(ok.searchParams.get("mailbox"), "connected");
    assert.match(ok.pathname + ok.hash, /harbor/, "the workspace it was connected for");
    const [c] = net.calls;
    assert.equal(c.url, "https://edge.test/api/admin/mailboxes");
    assert.deepEqual(c.body, { op: "connect", tenant_id: A, user_id: USER, provider: "google", code: "4/code" });
    const v = verifyEdgeToken(process.env.EDGE_CALL_SECRET, c.token, "/api/admin/mailboxes");
    assert.deepEqual([v.ok, v.claims.ws, v.claims.user], [true, A, USER]);

    net.calls.length = 0;
    const declined = await back("?error=access_denied");
    assert.deepEqual([declined.searchParams.get("mailbox"), declined.searchParams.get("why")], ["error", "declined"]);
    const someoneElse = await back(`?state=${await state("google", "another-person")}&code=c`);
    assert.equal(someoneElse.searchParams.get("why"), "failed");
    const profileState = await signState(SECRET, { t: A, u: USER, n: newNonce(), exp: Date.now() + STATE_TTL_MS });
    assert.equal(
      (await back(`?state=${profileState}&code=c`)).searchParams.get("why"),
      "failed",
      "a Business Profile's state is not a mailbox's",
    );
    const operator = await back(`?state=${await state()}&code=c`, ctx("operator"));
    assert.equal(operator.searchParams.get("why"), "not_owner");
    assert.deepEqual(net.calls, [], "no code reached the edge for any of them");
  } finally {
    net.restore();
  }
  const refusing = edge(() => [400, { ok: false, error: "free_mail", reason: "free_mail" }]);
  try {
    const st = await signState(SECRET, { t: A, u: USER, n: newNonce(), exp: Date.now() + STATE_TTL_MS, p: "google" });
    const res = await callback.GET.run(
      new Request(`https://app.example.test/api/v1/mailbox-connections/callback?state=${st}&code=c`),
      ctx(),
    );
    const to = new URL(res.headers.get("location"));
    assert.deepEqual(
      [to.searchParams.get("mailbox"), to.searchParams.get("why")],
      ["error", "free_mail"],
      "the edge's reason, for the page's words",
    );
  } finally {
    refusing.restore();
  }
});

test("each verb names its mailbox at the edge, and answers the page's row", async () => {
  const net = edge((b) => [
    200,
    b.op === "remove"
      ? { ok: true, removed: true }
      : b.op === "test"
        ? { ok: true, sent: true }
        : { ok: true, mailbox: DTO },
  ]);
  try {
    assert.deepEqual(await one.PATCH.run(send("PATCH", { paused: true }), ctx()), { mailbox: DTO });
    assert.deepEqual(await one.PATCH.run(send("PATCH", { daily_cap: 25, signature: null }), ctx()), { mailbox: DTO });
    assert.deepEqual(await resume.POST.run(send("POST"), ctx()), { mailbox: DTO });
    assert.deepEqual(await check.POST.run(send("POST"), ctx()), { mailbox: DTO });
    assert.deepEqual(await testOne.POST.run(send("POST"), ctx()), { sent: true });
    assert.deepEqual(await one.DELETE.run(send("DELETE"), ctx()), { removed: true });
    assert.deepEqual(
      net.calls.map((c) => [c.body.op, c.body.mailbox_id, c.body.tenant_id]),
      [
        ["pause", M1, A],
        ["settings", M1, A],
        ["resume", M1, A],
        ["check", M1, A],
        ["test", M1, A],
        ["remove", M1, A],
      ],
    );
    assert.deepEqual([net.calls[1].body.daily_cap, net.calls[1].body.signature], [25, null]);
    await refused(one.PATCH.run(send("PATCH", { paused: true, address: "x@y.z" }), ctx()), "validation");
  } finally {
    net.restore();
  }
});

test("the edge's refusals become the owner's words", async () => {
  for (const [status, body, code, words] of [
    [503, { ok: false, error: "no_oauth_client" }, "upstream_email", /isn't switched on here yet/],
    [409, { ok: false, error: "not_held" }, "conflict", /isn't held/],
    [409, { ok: false, error: "provider_unauthorized" }, "conflict", /connect it again/],
    [400, { ok: false, error: "invalid", detail: "bad_cap" }, "validation", /between 1 and 40 a day/],
    [
      502,
      { ok: false, error: "provider_refused", detail: "Daily user sending limit exceeded" },
      "upstream_email",
      /Daily user sending limit/,
    ],
    [404, { ok: false, error: "not_found" }, "not_found", /isn't this workspace's/],
    [500, { ok: false, error: "unavailable" }, "internal", /Try again in a minute/],
  ]) {
    const net = edge(() => [status, body]);
    try {
      await refused(resume.POST.run(send("POST"), ctx()), code, words);
    } finally {
      net.restore();
    }
  }
});

test("the pages' read of the mailboxes never carries a token's name, removed ones aside, and says which providers are offered", async () => {
  const live = rows.mailboxConnection({ id: M1, tenant_id: A, credentials_ref: `mailbox-creds-${M1}` });
  const gone = rows.mailboxConnection({
    tenant_id: A,
    address: "old@getharbor.example",
    provider_account: "acct-old",
    state: "removed",
    removed_at: "2026-10-01T00:00:00Z",
  });
  const db = fakeDb({ mailbox_connections: [live, gone] });
  const read = await mailboxConnectionsFor(db, A);
  assert.deepEqual(
    read.map((m) => m.address),
    ["sam@getharbor.example"],
  );
  assert.equal("credentials_ref" in read[0], false);
  const net = edge(() => [200, READY]);
  try {
    // GET mailbox-connections went with #1695 (no page called it): Setup and Connections read them with the email line.
    const out = (await emailSetupFor(fakeDb({ mailbox_connections: [live] }), A, async () => null)).sending;
    assert.deepEqual(out.providers, ["google", "microsoft"]);
    assert.deepEqual(
      out.mailboxes.map((m) => m.id),
      [M1],
    );
    assert.ok(!JSON.stringify(out).includes("mailbox-creds"), "never a token's name");
  } finally {
    net.restore();
  }
});

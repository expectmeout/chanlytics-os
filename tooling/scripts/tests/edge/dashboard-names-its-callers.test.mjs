/**
 * What the dashboard's calls to the edge name: on every door the token carries the workspace and the person the call
 * is for, and the hash of the body it sends (apps/dashboard/src/server/edge.ts). `callEdge` asks for both said out
 * loud (a workspace or null, a person or null), so a call that forgets is one the compiler refuses; this runs the
 * callers whose person comes from a route (billing, Google, lines, templates) and Ask's streamed gateway, whose
 * request the edge measures before it reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyEdgeToken, edgeBodyMatches } from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";

const SECRET = "edge-secret-for-this-file";
process.env.EDGE_CALL_SECRET = SECRET;
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];

const { callEdge } = await importSrc("apps/dashboard/src/server/edge.ts");
const { edgeBilling } = await importSrc("apps/dashboard/src/server/workspace/billing.ts");
const { edgeGoogle } = await importSrc("apps/dashboard/src/server/connections/google.ts");
const { edgeLines } = await importSrc("apps/dashboard/src/server/connections/lines.ts");
const { syncTemplates, deleteTemplate } = await importSrc("apps/dashboard/src/server/campaigns/meta-templates.ts");
const { streamModel, GatewayRefused } = await importSrc("apps/dashboard/src/server/ask/gateway.ts");
const { tellPlatformOfSetupRequest, tellOwnerLive } = await importSrc("apps/dashboard/src/server/workspace/tell.ts");
const { sendHandoverInvite } = await importSrc("apps/dashboard/src/server/workspace/handover.ts");
const { sendPartnerInvite } = await importSrc("apps/dashboard/src/server/workspace/partner-invite.ts");
const { notifyPlatformSignup } = await importSrc("apps/dashboard/src/server/platform/signup.ts");

const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = "11111111-1111-4111-8111-111111111111";

/** Every request to the edge, captured and answered with an empty 200. */
function capture() {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ path: new URL(String(url)).pathname, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { seen, restore: () => (globalThis.fetch = real) };
}

/** The claims a captured request's token carries for its own door, and whether they bind the body sent. */
function claimsOf({ path, init }) {
  const v = verifyEdgeToken(SECRET, init.headers["x-edge-token"], path);
  assert.equal(v.ok, true, `${path}: a token for this door`);
  assert.equal(init.headers["x-diag-key"], undefined, `${path}: no key beside it`);
  return {
    ws: v.claims.ws,
    user: v.claims.user,
    bound: init.body === undefined || edgeBodyMatches(v.claims, init.body),
  };
}

test("a call to the edge says whose workspace and which person, and binds the body it sends", async () => {
  const c = capture();
  try {
    await callEdge("/api/admin/x", { a: 1 }, { workspace: W, user: P });
    await callEdge("/api/admin/y", null, { workspace: null, user: null, method: "GET" });
    assert.deepEqual(claimsOf(c.seen[0]), { ws: W, user: P, bound: true });
    assert.deepEqual(claimsOf(c.seen[1]), { ws: null, user: null, bound: true }, "a call about none says none");
    assert.equal(c.seen[1].init.body, undefined, "a GET has no body to bind, and its token names none");
  } finally {
    c.restore();
  }
});

test("billing, Google and lines name the person their route passes in the body; templates name the one who pressed", async () => {
  const c = capture();
  try {
    await edgeBilling({ op: "sync", tenant_id: W, user_id: P });
    await edgeGoogle({ op: "refresh", tenant_id: W, user_id: P });
    await edgeLines({ op: "retry", tenant_id: W, user_id: P, line_id: "line-1" });
    await syncTemplates(W, P);
    await deleteTemplate(W, "template-1", P);
    assert.equal(c.seen.length, 5);
    for (const req of c.seen) assert.deepEqual(claimsOf(req), { ws: W, user: P, bound: true }, req.path);
  } finally {
    c.restore();
  }
});

test("the platform's notices name the person who set them off: a setup request, the first calls, a handover, a partner's invitation, a new workspace", async () => {
  const c = capture();
  try {
    await tellPlatformOfSetupRequest(W, "a phone line", "ada@example.com", P);
    await tellOwnerLive(W, P);
    await sendHandoverInvite(W, "owner@example.com", P, {
      svc: { rpc: async () => ({ data: "an-account", error: null }) },
      live: true,
    });
    await sendPartnerInvite(W, P, { live: true });
    await notifyPlatformSignup(W, "ada@example.com", P);
    assert.deepEqual(
      c.seen.map((r) => r.path),
      [
        "/api/admin/setup-request",
        "/api/admin/you-are-live",
        "/api/admin/handover-invite",
        "/api/admin/partner-invite",
        "/api/admin/signup-notify",
      ],
    );
    for (const req of c.seen) assert.deepEqual(claimsOf(req), { ws: W, user: P, bound: true }, req.path);
  } finally {
    c.restore();
  }
});

test("Ask's model call names the workspace and the person and binds its request, and a retry mints a token of its own", async () => {
  const c = capture();
  const real = globalThis.fetch;
  let calls = 0;
  const tokens = [];
  globalThis.fetch = async (url, init) => {
    calls += 1;
    tokens.push(init.headers["x-edge-token"]);
    c.seen.push({ path: new URL(String(url)).pathname, init });
    // The model could not be reached: the gateway asks once more before it says so.
    return new Response(JSON.stringify({ ok: false, error: "upstream_anthropic", detail: "busy" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await assert.rejects(
      async () => {
        for await (const event of streamModel({
          tenantId: W,
          userId: P,
          request: { max_tokens: 10, system: "s", messages: [] },
        }))
          void event;
      },
      (e) => e instanceof GatewayRefused,
    );
    assert.equal(calls, 2, "asked once more");
    for (const req of c.seen) assert.deepEqual(claimsOf(req), { ws: W, user: P, bound: true }, "/api/admin/llm");
    assert.notEqual(tokens[0], tokens[1], "a token opens a door once: the second ask carries its own");
  } finally {
    globalThis.fetch = real;
  }
});

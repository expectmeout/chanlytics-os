/**
 * The permission layer, EXECUTED.
 *
 * memberContext and requireRole decide which workspace a request acts on and
 * whether the caller may change anything — and until now every assertion about
 * them was a regex over their source. That is the weaker guarantee: a rewrite
 * that keeps the words and loses the behaviour passes. These call the real
 * functions with a stubbed Supabase client.
 *
 * Reachable at all only because with-route.ts stopped importing through the
 * "@/" build alias; the module is otherwise unloadable outside Next.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const { memberContext, requireRole } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/with-route.ts")).href
);
const { isSameOrigin, requireUuid, jsonBody } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/request-guards.ts")).href
);

/** A Supabase stub that answers the one query memberContext makes. */
function ctxWith(rows, error = null) {
  return {
    userId: "u1",
    email: "someone@example.com",
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: rows, error }),
          }),
        }),
      }),
    },
  };
}

const OWNER = { tenant_id: "t-old", role: "owner", tenants: { slug: "old-shop" } };
const OPERATOR = { tenant_id: "t-new", role: "operator", tenants: { slug: "new-shop" } };

/* --------------------------- which workspace ----------------------------- */

test("with one membership, that is the workspace and nothing is ambiguous", async () => {
  const m = await memberContext(ctxWith([OWNER]));
  assert.equal(m.tenantId, "t-old");
  assert.equal(m.role, "owner");
  assert.equal(m.ambiguous, false);
});

test("the default is the OLDEST membership, not the alphabetical one", async () => {
  // The rows arrive ordered by created_at. Three resolvers used to disagree
  // here, and one sorted by name — so a member of two workspaces could see the
  // role chip of one business over the data of another.
  const m = await memberContext(ctxWith([OWNER, OPERATOR]));
  assert.equal(m.tenantId, "t-old");
});

test("two memberships and no named workspace is AMBIGUOUS", async () => {
  const m = await memberContext(ctxWith([OWNER, OPERATOR]));
  assert.equal(m.ambiguous, true, "reads may proceed on the default; writes must not");
});

test("naming a workspace resolves it and clears the ambiguity", async () => {
  const byId = await memberContext(ctxWith([OWNER, OPERATOR]), "t-new");
  assert.equal(byId.tenantId, "t-new");
  assert.equal(byId.role, "operator");
  assert.equal(byId.ambiguous, false);

  // /metrics accepted slugs before anything else did, so both forms work.
  const bySlug = await memberContext(ctxWith([OWNER, OPERATOR]), "new-shop");
  assert.equal(bySlug.tenantId, "t-new");
});

test("a workspace the caller does not belong to is a 404, never someone else's", async () => {
  // RLS means the query can only see this caller's own rows, so a foreign id
  // matches nothing — it must not fall back to the default workspace.
  await assert.rejects(
    () => memberContext(ctxWith([OWNER]), "t-someone-else"),
    (e) => e.code === "not_found" && e.status === 404,
  );
});

test("no memberships at all is a 404, not a crash", async () => {
  await assert.rejects(() => memberContext(ctxWith([])), (e) => e.code === "not_found");
});

test("a failed membership read throws rather than resolving to nothing", async () => {
  await assert.rejects(
    () => memberContext(ctxWith(null, { message: "connection reset" })),
    /connection reset/,
  );
});

/* ------------------------------ may they act ----------------------------- */

const member = (role, ambiguous = false) => ({ tenantId: "t1", role, ambiguous });

test("the role ladder is owner > operator > viewer", () => {
  assert.doesNotThrow(() => requireRole(member("owner"), "owner"));
  assert.doesNotThrow(() => requireRole(member("owner"), "operator"));
  assert.doesNotThrow(() => requireRole(member("operator"), "operator"));
  assert.doesNotThrow(() => requireRole(member("viewer"), "viewer"));
});

test("a viewer may change nothing, and an operator is not an owner", () => {
  assert.throws(() => requireRole(member("viewer"), "operator"), (e) => e.status === 403);
  assert.throws(() => requireRole(member("operator"), "owner"), (e) => e.status === 403);
  // The refusal says which, because "forbidden" alone sends people to support.
  assert.throws(() => requireRole(member("operator"), "owner"), /Only an owner/);
  assert.throws(() => requireRole(member("viewer"), "operator"), /Viewers can see everything/);
});

test("an AMBIGUOUS write is refused however senior the caller", () => {
  // A commit under the default workspace would silently change the wrong
  // business's settings, team or policy. The guard lives in requireRole
  // precisely so no route has to remember it.
  for (const role of ["owner", "operator"]) {
    assert.throws(
      () => requireRole(member(role, true), "operator"),
      /more than one workspace/,
      `${role} must still be refused`,
    );
  }
});

/* ------------------------------ the door itself -------------------------- */

const req = (headers) => new Request("https://app.example/api/v1/x", { headers });

test("same-origin evidence must be positive", () => {
  assert.equal(isSameOrigin(req({ "sec-fetch-site": "same-origin" })), true);
  // A typed URL or a bookmark, not an attacker's page.
  assert.equal(isSameOrigin(req({ "sec-fetch-site": "none" })), true);
  assert.equal(isSameOrigin(req({ "sec-fetch-site": "cross-site" })), false);
  // same-site is NOT same-origin: on vercel.app a sibling subdomain is
  // somebody else's app entirely.
  assert.equal(isSameOrigin(req({ "sec-fetch-site": "same-site" })), false);
});

test("a request carrying no evidence at all is refused, not exempted", () => {
  // The original bug: `if (origin && host && ...)` meant omitting Origin
  // skipped the check completely.
  assert.equal(isSameOrigin(req({})), false);
  assert.equal(isSameOrigin(req({ origin: "https://app.example" })), false, "origin without host");
});

test("without Fetch Metadata, Origin is compared to Host", () => {
  assert.equal(isSameOrigin(req({ origin: "https://app.example", host: "app.example" })), true);
  assert.equal(isSameOrigin(req({ origin: "https://evil.example", host: "app.example" })), false);
  assert.equal(isSameOrigin(req({ origin: "not a url", host: "app.example" })), false);
});

test("a malformed id is a 404, and a real one passes through", () => {
  const good = "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
  assert.equal(requireUuid(good, "conversation"), good);
  for (const bad of ["", "abc", "123", null, undefined, "3f8b2c1a-4d5e-4f6a-8b9c", `${good} or 1=1`]) {
    assert.throws(() => requireUuid(bad, "conversation"), (e) => e.status === 404, String(bad));
  }
});

test("a body that is not JSON says so, rather than reporting a missing field", async () => {
  const withBody = (b) =>
    new Request("https://app.example/x", { method: "POST", body: b, headers: { "content-type": "application/json" } });
  assert.deepEqual(await jsonBody(withBody('{"a":1}')), { a: 1 });
  await assert.rejects(() => jsonBody(withBody("not json")), (e) => e.code === "validation");
});

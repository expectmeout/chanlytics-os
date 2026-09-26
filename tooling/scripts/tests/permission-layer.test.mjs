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

test("with one membership, that is the workspace, named or not", async () => {
  const m = await memberContext(ctxWith([OWNER]));
  assert.equal(m.tenantId, "t-old");
  assert.equal(m.role, "owner");
});

test("the default is the OLDEST membership, not the alphabetical one", async () => {
  // The rows arrive ordered by created_at. Three resolvers used to disagree
  // here, and one sorted by name — so a member of two workspaces could see the
  // role chip of one business over the data of another.
  // Only the door whose job is "which workspace should this tab open" may take it.
  const m = await memberContext(ctxWith([OWNER, OPERATOR]), null, { defaultAllowed: true });
  assert.equal(m.tenantId, "t-old");
});

test("two memberships and no named workspace is refused, read or write", async () => {
  await assert.rejects(memberContext(ctxWith([OWNER, OPERATOR])), (e) => {
    assert.equal(e.code, "choose_workspace");
    assert.match(e.message, /more than one workspace/);
    return true;
  });
});

test("naming a workspace resolves it and clears the ambiguity", async () => {
  const byId = await memberContext(ctxWith([OWNER, OPERATOR]), "t-new");
  assert.equal(byId.tenantId, "t-new");
  assert.equal(byId.role, "operator");

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
  await assert.rejects(
    () => memberContext(ctxWith([])),
    (e) => e.code === "not_found",
  );
});

test("a failed membership read throws rather than resolving to nothing", async () => {
  await assert.rejects(() => memberContext(ctxWith(null, { message: "connection reset" })), /connection reset/);
});

/* ------------------------------ may they act ----------------------------- */

const member = (role) => ({ tenantId: "t1", role });

test("the role ladder is owner > partner > operator > viewer", () => {
  assert.doesNotThrow(() => requireRole(member("owner"), "owner"));
  assert.doesNotThrow(() => requireRole(member("owner"), "partner"));
  assert.doesNotThrow(() => requireRole(member("owner"), "operator"));
  assert.doesNotThrow(() => requireRole(member("partner"), "partner"));
  assert.doesNotThrow(() => requireRole(member("partner"), "operator"));
  assert.doesNotThrow(() => requireRole(member("operator"), "operator"));
  assert.doesNotThrow(() => requireRole(member("viewer"), "viewer"));
});

test("a partner sets the workspace up and is not its owner: a partner's door refuses an operator in the owner's words", () => {
  // Decision 0012: settings, the channels and the finder are the partner's; billing and the team are not.
  assert.throws(
    () => requireRole(member("partner"), "owner"),
    (e) => e.status === 403 && e.details?.needs === "owner",
  );
  assert.throws(
    () => requireRole(member("operator"), "partner"),
    (e) => e.status === 403 && e.details?.needs === "owner" && /Only an owner/.test(e.message),
    "the least role that may, in the words a member reads: until a workspace can say whether it has a partner, owner",
  );
});

test("a role the ladder does not know is refused at every door, not passed", () => {
  // `ROLE_RANK[unknown] < n` is `undefined < n`, which is false: a row carrying a role this build had never heard of
  // used to walk through every door in the app.
  for (const atLeast of ["viewer", "operator", "partner", "owner"]) {
    assert.throws(
      () => requireRole(member("manager"), atLeast),
      (e) => e.status === 403,
      `unknown role, door ${atLeast}`,
    );
    assert.throws(
      () => requireRole(member(undefined), atLeast),
      (e) => e.status === 403,
      `no role, door ${atLeast}`,
    );
  }
});

test("a viewer may change nothing, and an operator is not an owner", () => {
  assert.throws(
    () => requireRole(member("viewer"), "operator"),
    (e) => e.status === 403,
  );
  assert.throws(
    () => requireRole(member("operator"), "owner"),
    (e) => e.status === 403,
  );
  // The refusal says which, because "forbidden" alone sends people to support.
  assert.throws(() => requireRole(member("operator"), "owner"), /Only an owner/);
  assert.throws(() => requireRole(member("viewer"), "operator"), /Viewers can see everything/);
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
    assert.throws(
      () => requireUuid(bad, "conversation"),
      (e) => e.status === 404,
      String(bad),
    );
  }
});

test("a body that is not JSON says so, rather than reporting a missing field", async () => {
  const withBody = (b) =>
    new Request("https://app.example/x", { method: "POST", body: b, headers: { "content-type": "application/json" } });
  assert.deepEqual(await jsonBody(withBody('{"a":1}')), { a: 1 });
  await assert.rejects(
    () => jsonBody(withBody("not json")),
    (e) => e.code === "validation",
  );
});

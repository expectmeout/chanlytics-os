/**
 * One workspace, resolved once, applied everywhere.
 *
 * Multi-tenancy here failed in a way that reads as working: the database layer
 * is correct — RLS on all 19 tables, the (select auth.uid()) initPlan form, and
 * an index that serves it — so nothing leaked. What broke was the layer above.
 *
 * RLS answers "may this caller see this row". For someone who belongs to two
 * workspaces the answer is YES to both, so the read endpoints, scoped by RLS
 * alone, returned two businesses' customers interleaved in one inbox. Meanwhile
 * three routes each picked a default tenant by a DIFFERENT rule — oldest
 * membership, name-sorted tenant, oldest tenant — so the role chip could
 * describe one business and the data beneath it another. And the routes that
 * did resolve membership threw outright, because the client never sent a
 * workspace at all.
 *
 * These tests pin the shape of the fix rather than the queries: one resolver,
 * every read filtered, every write refusing to guess.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const API = path.join(ROOT, "apps/dashboard/app/api/v1");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

const withRoute = read("apps/dashboard/src/server/with-route.ts");
const surfaceData = read("apps/dashboard/src/legacy-bridge/surface-data.ts");
const runner = read("apps/dashboard/src/legacy-bridge/surface-runner.ts");

/* ------------------------ one resolver, one rule -------------------------- */

test("memberContext is the only place a default workspace is chosen", () => {
  // Each of these was a route resolving the tenant for itself, by its own rule.
  const offenders = [];
  for (const f of ["metrics/route.ts", "workspaces/route.ts"]) {
    const src = fs.readFileSync(path.join(API, f), "utf8");
    // Picking [0] off a tenants query IS the second rule. The list of
    // workspaces may still be returned — it just cannot decide which is active.
    if (/tenants\?\.\[0\]|tenants\[0\]/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "these routes still pick a default tenant themselves");
});

test("an explicit workspace resolves by id OR slug", () => {
  // /metrics accepted slugs and nothing else did, so the same query string
  // meant different things depending on which endpoint received it.
  assert.match(withRoute, /r\.tenant_id === wanted \|\| r\.tenants\?\.slug === wanted/);
});

test("a workspace the caller is not a member of is never silently swapped", () => {
  // RLS means the query cannot see other people's memberships, so a forged id
  // finds nothing — and that must 404, not fall through to their own default.
  assert.match(withRoute, /if \(!m\) throw new AppError\("not_found"/);
});

/* --------------------------- reads are scoped ----------------------------- */

test("every list endpoint filters by tenant, not by RLS alone", () => {
  // RLS is the floor: it stops cross-tenant reads no matter what. It is NOT a
  // scope — it happily returns every workspace the caller belongs to.
  const unscoped = [];
  for (const f of ["conversations/route.ts", "calls/route.ts", "escalations/route.ts"]) {
    const src = fs.readFileSync(path.join(API, f), "utf8");
    if (!(src.includes("memberContext") || src.includes("scope: workspace")) || !/\.eq\("tenant_id", tenantId\)/.test(src)) {
      unscoped.push(f);
    }
  }
  assert.deepEqual(unscoped, [], "these endpoints would merge two businesses into one list");
});

/* --------------------------- writes never guess --------------------------- */

test("a write refuses to act on a workspace nobody named", () => {
  // Reads fall back to a default, which is harmless. A COMMIT under the same
  // fallback changes the wrong business's settings, team or policy. The guard
  // sits inside requireRole because every mutating path already calls it —
  // per-route checks are the kind that get forgotten on route number six.
  const fn = withRoute.slice(withRoute.indexOf("export function requireRole"));
  assert.match(fn, /member\.ambiguous/, "requireRole must reject an unnamed workspace");
  assert.ok(
    fn.indexOf("member.ambiguous") < fn.indexOf("ROLE_RANK[member.role]"),
    "the ambiguity check must run BEFORE the role check, or an owner slips past it",
  );
});

test("ambiguity means more than one membership and nothing named", () => {
  assert.match(withRoute, /ambiguous: !wanted && rows\.length > 1/);
});

/* ------------------------------ the client -------------------------------- */

test("the workspace is appended at the fetch chokepoint", () => {
  // Not at the call sites. Three overrides fetch five endpoints between them,
  // and a sixth added later must not have to remember this.
  assert.match(surfaceData, /function scoped\(url: string\)/);
  assert.match(surfaceData, /fetchEnvelope<T>\(rawUrl: string\)[\s\S]{0,80}scoped\(rawUrl\)/);
});

test("a caller that names its own workspace is not overridden", () => {
  assert.match(surfaceData, /url\.includes\("workspace="\)/);
});

test("the server has the last word on which workspace is active", () => {
  // The stored preference is a REQUEST. The server validates membership and may
  // override it; whatever it decides is what later requests must agree with,
  // or the page renders one workspace's data under another's name.
  assert.match(surfaceData, /data\.activeWorkspaceId/);
  assert.match(surfaceData, /setActiveWorkspace\(data\.activeWorkspaceId\)/);
});

test("switching workspace clears the cache before it reloads", () => {
  // sessionStorage holds real transcripts. Reloading without clearing would
  // restore the previous business's rows under the new one's name.
  const fn = surfaceData.slice(surfaceData.indexOf("export function switchWorkspace"));
  assert.ok(
    fn.indexOf("clearSurfaceCache()") < fn.indexOf("window.location.assign"),
    "the cache must be cleared BEFORE navigating away",
  );
});

test("the cache is keyed on the ACTIVE workspace", () => {
  // Keyed on __WORKSPACES[0] this was constant for a member of two workspaces,
  // so the guard against restoring one tenant's rows under another's name could
  // never fire — the exact case it exists for.
  assert.match(runner, /__ACTIVE_WORKSPACE/);
});

/* ---------------- the checks every mutation should pass ------------------- */
{
  const { readCode } = await import("./_source.mjs");
  const wrapper = readCode("apps/dashboard/src/server/with-route.ts");
  const guards = readCode("apps/dashboard/src/server/request-guards.ts");
  const verbsSrc = readCode("apps/dashboard/src/server/verbs.ts");
  const replySrc = readCode("apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts");

  test("a cross-site write is refused before anything reads the database", () => {
    // These endpoints authenticate with a cookie, so a form on another site
    // could aim at them. Nothing stopped that except two accidents:
    // @supabase/ssr's SameSite=Lax default, and vercel.app being on the
    // public-suffix list. Both stop being true on a shared custom domain.
    const at = wrapper.indexOf("isSameOrigin(req)");
    assert.ok(at > -1, "withRoute must make the check");
    assert.ok(at < wrapper.indexOf("getUser()"), "and make it before the session lookup");
    assert.match(wrapper, /status: 403/);
  });

  test("reads stay exempt from the origin check", () => {
    // A GET changes nothing, and cross-site GETs are how link previews and
    // prefetches legitimately arrive.
    assert.match(wrapper, /req\.method !== "GET"/);
    assert.match(wrapper, /req\.method !== "HEAD"/);
  });

  test("a malformed id is a 404, not a 500", () => {
    // PostgREST answers 22P02 for a bad uuid, which withRoute turns into
    // "Something went wrong" — a typo in a URL reading as a server fault.
    assert.match(guards, /export function requireUuid/);
    assert.match(guards, /"not_found"/);
    assert.match(verbsSrc, /requireUuid\(id, "conversation"\)/, "checked once at the chokepoint");
  });

  test("the reply body is validated at the door", () => {
    // The one route that reaches a real person took whatever the body held. An
    // over-length reply was stored, reported queued, and failed 15 seconds
    // later as an escalation plus an alert email.
    assert.match(replySrc, /4096/);
    assert.match(replySrc, /safeParse/);
    assert.match(replySrc, /\.strict\(\)/);
  });

  test("template params come from config FIRST, not from the browser", () => {
    // The route's own comment has always said params are tenant facts resolved
    // server-side "so the browser neither knows nor ships any workspace's
    // booking link" — and the code preferred whatever the browser sent, so an
    // operator session could choose the link that lands on the customer's phone.
    const at = replySrc.indexOf("let params: string[] = []");
    const cfg = replySrc.indexOf("tenant_config", at);
    const client = replySrc.indexOf("body.template.params", at);
    assert.ok(at > -1 && cfg > -1 && client > -1);
    assert.ok(cfg < client, "config is consulted before the client's params");
  });
}

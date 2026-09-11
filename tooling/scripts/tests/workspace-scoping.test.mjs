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
import { importSrc } from "./_source.mjs";

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

test("a request refuses to act on a workspace nobody named, read or write", () => {
  // Reads used to fall back to the oldest membership, so a member of two
  // workspaces saw one business under another's name until the workspace
  // surface answered. Since plan 3.4 the resolver refuses before it picks:
  // one rule, in memberContext, for every route, read or write.
  const fn = withRoute.slice(withRoute.indexOf("export async function memberContext"));
  assert.match(fn, /if \(!wanted && rows\.length > 1 && !opts\.defaultAllowed\) throw new AppError\("choose_workspace", AMBIGUOUS\);/, "the resolver must refuse an unnamed workspace");
  assert.ok(fn.indexOf("!opts.defaultAllowed") < fn.indexOf("const m = wanted"), "the refusal must come BEFORE the pick, or the default leaks");
});

test("only /workspaces may take the default: answering where am I is its job", () => {
  const ws = read("apps/dashboard/app/api/v1/workspaces/route.ts");
  assert.match(ws, /memberContext\(ctx, preferred, \{ defaultAllowed: true \}\)/);
  assert.ok(!read("apps/dashboard/src/server/route.ts").includes("defaultAllowed"), "route() never takes the default");
});

/* ------------------------------ the client -------------------------------- */

test("the workspace is appended at the fetch chokepoint", () => {
  // Not at the call sites. Three overrides fetch five endpoints between them,
  // and a sixth added later must not have to remember this.
  assert.ok(!surfaceData.includes("fetch("), "the seam owns no fetch: the client appends the workspace at its one chokepoint (typed-client.test.mjs)");
  assert.ok(surfaceData.includes('read("GET '), "every read goes through the typed client");
});

test("a caller that names its own workspace is not overridden", async () => {
  // Run, not read: the client with a fake fetch, told the tab holds one
  // workspace, asked for another by name.
  const { createApi } = await importSrc("apps/dashboard/src/client/api.ts");
  const sent = [];
  const api = createApi({
    fetch: async (url) => { sent.push(url); return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 }); },
    workspace: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    onSignedOut: () => {},
    refresh: async () => {},
  });
  await api("GET conversations", { query: { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });
  assert.equal(sent[0], "/api/v1/conversations?workspace=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
});

test("the server has the last word on which workspace is active", () => {
  // The stored preference is a REQUEST. The server validates membership and may
  // override it; whatever it decides is what later requests must agree with,
  // or the page renders one workspace's data under another's name.
  assert.match(surfaceData, /data\.activeWorkspaceId/);
  assert.match(surfaceData, /rememberWorkspace\(slug\)/, "the server's word is what the home returns to");
  assert.match(surfaceData, /window\.location\.replace\(workspaceHref\(slug, window\.location\.hash\)\)/, "and what the address says");
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
  const replySrc = readCode("packages/core/src/conversations/reply.ts");
  const replyRoute = readCode("apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts");

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
    for (const what of ["conversation", "contact", "message", "call", "list", "broadcast", "template", "playbook"]) assert.ok(verbsSrc.includes('requireUuid(id, "' + what + '")'), what + ": checked once at the chokepoint, its loader");
  });

  test("the reply body is validated at the door", () => {
    // The one route that reaches a real person took whatever the body held. An
    // over-length reply was stored, reported queued, and failed 15 seconds
    // later as an escalation plus an alert email.
    assert.match(replyRoute, /4096/);
    assert.match(replyRoute, /input: ReplyBody/);
    assert.match(replyRoute, /\.strict\(\)/);
  });

  test("template params come from config FIRST, not from the browser", () => {
    // The route's own comment has always said params are tenant facts resolved
    // server-side "so the browser neither knows nor ships any workspace's
    // booking link" — and the code preferred whatever the browser sent, so an
    // operator session could choose the link that lands on the customer's phone.
    const cfg = replySrc.indexOf("await ports.templateFacts(conv.tenant_id)");
    const client = replySrc.indexOf("body.template.params", cfg);
    assert.ok(cfg > -1 && client > -1);
    assert.ok(cfg < client, "config is consulted before the client's params (core-reply.test.mjs runs it)");
  });
}

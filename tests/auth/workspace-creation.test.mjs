/**
 * Creating a workspace, without handing anyone the keys to do it.
 *
 * Every tenant to date was inserted by a migration or by hand in SQL, so
 * onboarding a second business was an engineering task. The missing piece was
 * never the UI — it was that `tenants` and `memberships` are SELECT-only under
 * RLS, deliberately: an INSERT policy on tenants would let any signed-in user
 * mint rows, and one on memberships would let them join a workspace nobody
 * invited them to.
 *
 * So the write goes through ONE security-definer function. These pin the
 * properties that make that safe rather than merely convenient — and the two
 * failure modes this project has already had elsewhere: a privileged path
 * reachable by the wrong caller, and a screen that renders a claim before the
 * data behind it has arrived.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc, readRaw, readCode } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const sql = readRaw("supabase/migrations/00021_create_workspace.sql");
const boot = readCode("apps/dashboard/src/bridge/FrameApp.tsx");

/* --------------------------- the privilege boundary ----------------------- */

test("anon cannot mint a tenant; only a signed-in caller can", () => {
  assert.match(sql, /revoke execute on function public\.create_workspace\(text, text\) from public, anon;/);
  assert.match(sql, /grant\s+execute on function public\.create_workspace\(text, text\) to authenticated;/);
});

test("the caller is read inside the function, never passed in", () => {
  // If the user were a parameter, anyone who could call the RPC could make
  // anyone else the owner of a workspace — or add themselves to one.
  assert.match(sql, /v_user\s+uuid\s*:=\s*auth\.uid\(\);/);
  assert.ok(!/p_user|p_owner|p_user_id/.test(sql), "identity must not be an argument");
  assert.match(sql, /if v_user is null then/, "and a session without a user is refused");
});

test("the privilege is scoped, not ambient", () => {
  assert.match(sql, /security definer/);
  // Without a pinned search_path, a definer function resolves unqualified names
  // through the CALLER's path — the classic privilege-escalation route.
  assert.match(sql, /set search_path = public/);
});

test("tenant and membership are one transaction", () => {
  // A tenant whose membership insert failed is a workspace nobody can see,
  // own or delete — and it still holds a slug. Two REST calls could not have
  // this property; a function body is one transaction.
  const tenantAt = sql.indexOf("insert into public.tenants");
  const memberAt = sql.indexOf("insert into public.memberships");
  assert.ok(tenantAt > 0 && memberAt > tenantAt, "both inserts live in the same body");
  assert.ok(!/commit;/i.test(sql), "no explicit commit that could split them");
});

/* ------------------------------ the inputs -------------------------------- */

test("an unreal timezone is refused at the door", () => {
  // describeNow() falls back to "you do not know what day it is" on an unknown
  // zone — so a typo here silently costs the receptionist its clock, forever,
  // with nothing on screen to say why.
  assert.match(sql, /from pg_timezone_names z where z\.name = v_tz/);
  assert.match(sql, /raise exception 'Unknown timezone/);
});

test("pg_timezone_names.name is QUALIFIED, because the function returns a `name`", () => {
  // PL/pgSQL keeps OUT parameters in scope for the whole body, so an
  // unqualified `name` here is ambiguous — and it fails at call time, not at
  // creation. This one shipped broken and was caught by running it.
  assert.ok(!/where name = v_tz/.test(sql), "the unqualified form is the bug");
});

test("slug generation terminates, and always produces something", () => {
  assert.match(sql, /if v_try > 50 then/, "the collision counter is bounded");
  assert.match(sql, /v_base := 'workspace';/, "a name of pure punctuation still gets a slug");
  assert.match(sql, /btrim\(v_base, '-'\);\s*--\s*left\(\) can strand/, "truncation cannot leave a trailing dash");
});

test("there is a cap, so one account cannot fill the tenants table", () => {
  assert.match(sql, /if v_owned >= 10 then/);
  assert.match(sql, /errcode = '54000'/, "a distinct code, so the route can say why");
});

/* -------------------------------- the route ------------------------------- */

// The route, run (app/api/v1/workspaces/create over server/workspace/create.ts): a signed-in person's request, the
// session's own client a database in memory whose create_workspace answers as the function does, the edge the
// platform's notice goes through on the wire. Until 26 Nov 2026 these read the route's and create.ts's text.
process.env.EDGE_URL ??= "https://edge.example.com";
process.env.EDGE_CALL_SECRET ??= "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.SIGNUP_CODE;
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
const createRoute = await importSrc("apps/dashboard/app/api/v1/workspaces/create/route.ts");
const USER = "uuuuuuuu-0000-4000-8000-000000000001";
const MADE = {
  id: "aaaaaaaa-0000-4000-8000-0000000000c1",
  slug: "luna-studio",
  name: "Luna Studio",
  timezone: "America/New_York",
};

/**
 * One press of the create screen, by a person who belongs to `memberships` workspaces already: what the route answered
 * (or refused), what the session's client was asked, and what reached the edge. `answer` is create_workspace's.
 */
async function create(body, { answer = () => MADE, memberships = 0 } = {}) {
  setRateStore(memoryStore());
  // The service role is never asked: this write is the session's.
  setServiceClient({
    from: () => assert.fail("the service role entered the request path"),
    rpc: () => assert.fail("the service role entered the request path"),
  });
  const asked = [];
  const supabase = fakeDb(
    {
      memberships: Array.from({ length: memberships }, (_, i) => ({
        id: `m${i}`,
        user_id: USER,
        tenant_id: `t${i}`,
        role: "owner",
      })),
      tenant_config: [],
    },
    {},
    {
      create_workspace: (args) => {
        asked.push(args);
        return answer(args);
      },
    },
  );
  supabase.auth = { updateUser: async () => ({ data: {}, error: null }) };
  const edge = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    edge.push({ path: new URL(String(url)).pathname, body: init.body ? JSON.parse(String(init.body)) : null });
    return Response.json({ ok: true });
  };
  try {
    const req = new Request("http://localhost/api/v1/workspaces/create", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
      body: JSON.stringify(body),
    });
    const ctx = { supabase, userId: USER, email: "owner@luna.example", aal: "aal1", params: {}, metadata: {} };
    try {
      return { answer: await createRoute.POST.run(req, ctx), asked, edge };
    } catch (e) {
      return { refused: { code: e.code, status: e.status, message: e.message }, asked, edge };
    } finally {
      setServiceClient(null);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("the route parses its body with a schema, and an unexpected field is a mistake, not a silent no-op", async () => {
  // Most /v1 routes hand-checked fields; this one set the better precedent rather than inheriting the older one.
  for (const body of [{}, { name: "" }, { name: "Luna Studio", owner: USER }, { name: "Luna Studio", timezone: 7 }]) {
    const r = await create(body);
    assert.equal(r.refused?.code, "validation", JSON.stringify(body));
    assert.deepEqual(r.asked, [], `${JSON.stringify(body)}: nothing asked of the database`);
  }
});

test("the route asks no role: there is no workspace yet to have one in, and the session is the authorisation", async () => {
  // Every other mutating route scopes to a workspace the caller belongs to. There is no such workspace here -- this is
  // the write that creates the thing roles are scoped to. Someone who belongs to none makes one on their own session's
  // client, the caller being the function's to read (auth.uid(), never a parameter: the database half below), and the
  // service role never enters the request path.
  const first = await create({ name: "Luna Studio", timezone: "America/New_York" });
  assert.deepEqual(first.answer, { workspace: MADE }, "in the shape /api/v1/workspaces lists");
  assert.deepEqual(
    first.asked,
    [{ p_name: "Luna Studio", p_timezone: "America/New_York" }],
    "no user among its arguments",
  );
  // And the mailbox hears about a workspace where workspaces are made (recordWorkspaceBegun, decision 0091).
  assert.deepEqual(
    first.edge.filter((c) => c.path === "/api/admin/signup-notify").map((c) => c.body.email),
    ["owner@luna.example"],
    "the platform's notice, from the one place workspaces begin",
  );
  // A second workspace, by someone who already owns one: still no role asked.
  assert.deepEqual((await create({ name: "Luna Two" }, { memberships: 1 })).answer, { workspace: MADE });
});

test("the function's own messages reach the owner, by their codes", async () => {
  // "Unknown timezone: Mars/Olympus" is more useful than "invalid input": the function's words, at the status its code
  // means (a bad name or zone, the per-account cap, a session with no user behind it).
  for (const [code, message, status, said] of [
    ["22023", "Unknown timezone: Mars/Olympus", 400, "validation"],
    ["54000", "You already own 10 workspaces.", 409, "conflict"],
    ["28000", "Sign in to create a workspace.", 403, "forbidden"],
  ]) {
    const r = await create(
      { name: "Luna Studio", timezone: "Mars/Olympus" },
      {
        answer: () => {
          throw Object.assign(new Error(message), { code });
        },
      },
    );
    assert.deepEqual(r.refused, { code: said, status, message }, code);
    assert.deepEqual(r.edge, [], `${code}: nobody is told of a workspace that was not made`);
  }
});

/* ------------------------------- the screen ------------------------------- */

test("the create screen waits for the fetch before claiming there is nothing", () => {
  // Before the workspace surface resolves, EVERY account looks like it has no
  // workspaces. Flashing "create your workspace" at an owner who has one is
  // the same class of lie as painting mockup data during a load — which this
  // project has shipped twice.
  assert.ok(
    boot.includes('isSurfaceReady("workspace") && allWorkspaces.length === 0'),
    "readiness must be part of the condition",
  );
});

test("a created workspace becomes the active one, and opens on its first run", () => {
  // Otherwise the owner creates a workspace and stays looking at nothing.
  assert.ok(
    boot.includes("switchWorkspace(w.id, w.slug, `#/${FIRST_RUN_ROUTE}`)"),
    "by its slug: a new workspace is not in __WORKSPACES yet, and an id address boots the app twice; at #/start, its first run",
  );
});

// The form says what its timezone decides, starts at the browser's own zone, and shows the server's refusal in its own
// words and becomes usable again: drawn and pressed in create-workspace-screen.test.mjs ("another workspace ... keeps its
// own form", "the zone starts at the device's own", "create once: a refusal leaves the form, filled in, with the server's
// sentence"). Pinned as CreateWorkspace.tsx's text until 26 Nov 2026.

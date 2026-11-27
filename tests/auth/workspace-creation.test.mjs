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
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

/* ----------------------------- the database's door ----------------------------- */

// The door itself (create_workspace over create_workspace_for), run on the stack in workspace-created.db.test.mjs: a
// signed-out caller cannot mint a tenant and the service role has no user to name; the caller is read inside the door
// and owns what it made, and create_workspace_for is no session's; a zone Postgres does not know and a name too short
// are refused, punctuation still gets a slug; one account owns ten at most, the eleventh refused as 54000. That a
// definer door pins its search_path is every door's rule (database/privileges.db.test.mjs). Pinned as 00021's text
// until 26 Nov 2026, which later migrations had replaced.

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

// The create screen waits for the workspace's read before claiming there is nothing, and a workspace made becomes the
// active one by its slug and opens on its first run: the frame, drawn, in shell/boot/the-frame-draws-what-it-holds.test.mjs, where another workspace asked
// for from the menu is the screen with its way back. Pinned as FrameApp.tsx's text until 27 Nov 2026.

// The form says what its timezone decides, starts at the browser's own zone, and shows the server's refusal in its own
// words and becomes usable again: drawn and pressed in create-workspace-screen.test.mjs ("another workspace ... keeps its
// own form", "the zone starts at the device's own", "create once: a refusal leaves the form, filled in, with the server's
// sentence"). Pinned as CreateWorkspace.tsx's text until 26 Nov 2026.

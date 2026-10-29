/**
 * A workspace's colour through its route (00490, decision 0075): the real route module, run over a database in memory
 * with the door answering as a test says. What is proved is who may, what the door is handed, how a refusal is worded,
 * and that the boot's list carries the colour beside the logo.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { LOOK_WORDS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const accent = await import(at("apps/dashboard/app/api/v1/workspaces/accent/route.ts"));
const workspaces = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";

/** The door, as a test says it answers: the colour it held, or the database's refusal. */
function door(answer) {
  const asked = [];
  return {
    asked,
    rpcs: {
      set_workspace_accent: (args) => {
        asked.push(args);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
}

const membership = (role = "owner") => [
  { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
];
const ctxFor = (tables, rpcs) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
const send = (method, body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

beforeEach(() => setRateStore(memoryStore()));

test("both declare their policy: whoever may change the workspace's settings, counted with the logo's changes", () => {
  const policy = { kind: "write", scope: "workspace", role: "partner", rate: "workspace_logo", spend: false };
  assert.deepEqual(accent.PUT.policy, policy);
  assert.deepEqual(accent.DELETE.policy, policy);
});

test("a save hands the door the colour lower-cased and answers it; a removal hands it nothing", async () => {
  const d = door("#c4452e");
  const out = await accent.PUT.run(send("PUT", { accent: "#2A6F97" }), ctxFor({ memberships: membership() }, d.rpcs));
  assert.deepEqual(out, { accent: "#2a6f97" });
  assert.deepEqual(d.asked, [{ p_tenant_id: A, p_accent: "#2a6f97" }]);
  const gone = door("#2a6f97");
  assert.deepEqual(await accent.DELETE.run(send("DELETE"), ctxFor({ memberships: membership() }, gone.rpcs)), {
    accent: null,
  });
  assert.deepEqual(gone.asked, [{ p_tenant_id: A, p_accent: "" }]);
});

test("anything but one #rrggbb is refused in the row's words before the door is asked", async () => {
  const d = door(null);
  for (const bad of ["blue", "#fff", "2a6f97", "#2a6f9", "", "#gggggg"])
    await refused(
      accent.PUT.run(send("PUT", { accent: bad }), ctxFor({ memberships: membership() }, d.rpcs)),
      "validation",
      400,
      LOOK_WORDS.unusable,
    );
  assert.deepEqual(d.asked, []);
});

test("a member who may not change the workspace's settings is refused, and so is the door's own refusal, in its words", async () => {
  for (const role of ["viewer", "operator"])
    await refused(
      accent.PUT.run(send("PUT", { accent: "#2a6f97" }), ctxFor({ memberships: membership(role) }, door(null).rpcs)),
      "forbidden",
      403,
    );
  const shut = Object.assign(
    new Error("Only someone who may change this workspace's settings can change its colour."),
    {
      code: "42501",
    },
  );
  await refused(
    accent.PUT.run(send("PUT", { accent: "#2a6f97" }), ctxFor({ memberships: membership() }, door(shut).rpcs)),
    "forbidden",
    403,
  );
});

test("where you are answers each workspace's colour beside its logo, and none from a database before 00490", async () => {
  const tables = {
    memberships: membership(),
    tenants: [
      {
        id: A,
        slug: "harbor",
        name: "Harbor",
        status: "active",
        timezone: "America/New_York",
        logo_path: null,
        accent: "#2a6f97",
      },
    ],
    profiles: [],
  };
  const rpcs = { platform_staff_state: () => "none" };
  const home = await workspaces.GET.run(new Request("http://localhost/api/v1/x"), ctxFor(tables, rpcs));
  assert.deepEqual([home.workspaces[0].accent, home.workspaces[0].logo_url], ["#2a6f97", null]);
  // A database that has not reached 00490 answers "column does not exist" for accent: read again without it.
  const db = fakeDb(tables, {}, rpcs);
  const older = {
    ...db,
    from: (t) => {
      const q = db.from(t);
      if (t !== "tenants") return q;
      return {
        select: (cols, o) =>
          /\baccent\b/.test(String(cols))
            ? {
                order: async () => ({
                  data: null,
                  error: { message: "column tenants.accent does not exist", code: "42703" },
                }),
              }
            : q.select(cols, o),
      };
    },
  };
  const before = await workspaces.GET.run(new Request("http://localhost/api/v1/x"), {
    supabase: older,
    userId: USER,
    email: "ada@example.com",
    params: {},
  });
  assert.deepEqual(
    before.workspaces.map((w) => [w.slug, w.accent]),
    [["harbor", null]],
    "not said, and the rest of the row as ever",
  );
});

/**
 * The account, run through route(): the real route modules, their `run`
 * called with a database in memory. What is proved is the policy each
 * declares and what the handler answers, not its text.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { SELLS_BY_REFUSAL } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const me = await import(at("apps/dashboard/app/api/v1/me/route.ts"));
const workspaces = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));
const create = await import(at("apps/dashboard/app/api/v1/workspaces/create/route.ts"));
const team = await import(at("apps/dashboard/app/api/v1/team/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const tenants = () => [
  { id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" },
  { id: B, slug: "bayside", name: "Bayside", status: "active", timezone: "America/New_York" },
];
const ctxFor = (tables, params = {}, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const inA = `?workspace=${A}`;
const inB = `?workspace=${B}`;
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("the three declare their policy: your name on the account and counted, where you are on the account with no bucket, the zone the owner's with none said out loud", () => {
  assert.deepEqual(me.PUT.policy, { kind: "write", scope: "account", role: null, rate: "profile_set", spend: false });
  assert.deepEqual(workspaces.GET.policy, { kind: "read", scope: "account", role: null, rate: null, spend: false });
  assert.deepEqual(workspaces.PATCH.policy, {
    kind: "write",
    scope: "workspace",
    role: "owner",
    rate: null,
    spend: false,
  });
});

test("your name: yours alone to set, judged by the contracts' rule before the database's, saved through the one door, and what the door says is what you are called", async () => {
  const door = [];
  const rpcs = {
    profile_set: (a) => {
      door.push(a);
      return { display_name: a.p_display_name };
    },
  };
  const tables = { memberships: both("viewer", "viewer") };
  await refused(
    me.PUT.run(send("PUT", { display_name: 5 }), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Give a name, or leave it empty to clear it.",
  );
  await refused(
    me.PUT.run(send("PUT", { display_name: "x".repeat(500) }), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "A name is at most",
  );
  assert.equal(door.length, 0, "nothing reached the door");
  assert.deepEqual(await me.PUT.run(send("PUT", { display_name: "  Ada   Lovelace " }), ctxFor(tables, {}, rpcs)), {
    display_name: "Ada Lovelace",
  });
  assert.deepEqual(
    await me.PUT.run(send("PUT", { display_name: "" }), ctxFor(tables, {}, rpcs)),
    { display_name: "" },
    "empty clears it",
  );
  assert.deepEqual(
    door.map((a) => a.p_display_name),
    ["Ada Lovelace", ""],
  );
  const refusedByDb = {
    profile_set: () => {
      throw new Error("profile_set: too soon");
    },
  };
  await refused(
    me.PUT.run(send("PUT", { display_name: "Ada" }), ctxFor(tables, {}, refusedByDb)),
    "validation",
    400,
    "too soon",
  );
});

test("where you are: every workspace with who is signed in; the active one by memberContext's rule, a stale preference degrading to the default rather than a 404; nowhere yet a real answer", async () => {
  const tables = {
    memberships: both("viewer", "owner"),
    tenants: tenants(),
    profiles: [{ user_id: USER, display_name: "Ada" }],
  };
  const home = await workspaces.GET.run(get(), ctxFor(tables, {}, { is_platform_admin: () => false }));
  assert.deepEqual(
    home.workspaces.map((w) => w.name),
    ["Bayside", "Harbor"],
    "by name",
  );
  assert.equal(home.activeWorkspaceId, A, "the oldest membership is the default");
  assert.deepEqual(home.user, {
    id: USER,
    email: "ada@example.com",
    role: "viewer",
    display_name: "Ada",
    platform_admin: false,
  });
  const bayside = await workspaces.GET.run(get(inB), ctxFor(tables, {}, { is_platform_admin: () => false }));
  assert.deepEqual(
    [bayside.activeWorkspaceId, bayside.user.role],
    [B, "owner"],
    "the role describes the workspace being viewed",
  );
  const stale = await workspaces.GET.run(
    get(`?workspace=${C}`),
    ctxFor(tables, {}, { is_platform_admin: () => false }),
  );
  assert.equal(stale.activeWorkspaceId, A, "a workspace this person was removed from degrades to their default");
  // ...and ONLY that. A memberships read that FAILED is not a stale preference:
  // degrading it would put this session in the oldest membership, which the
  // client then echoes back as ?workspace= on every later call -- an operator
  // working in a different business's inbox with nothing on screen saying so.
  const blind = {
    supabase: fakeDb(tables, { "memberships.select": { message: "statement timeout" } }),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  await assert.rejects(
    workspaces.GET.run(get(inB), blind),
    /statement timeout/,
    'the real cause, not a fallback and not a bare "no workspace"',
  );
  const admin = await workspaces.GET.run(get(), ctxFor(tables, {}, { is_platform_admin: () => true }));
  assert.equal(admin.user.platform_admin, true, "the nav's one bit rides along");
  const nowhere = await workspaces.GET.run(
    get(),
    ctxFor({ memberships: [], tenants: [], profiles: [] }, {}, { is_platform_admin: () => false }),
  );
  // "Nowhere yet" carries the door the first workspace meets: the sign-up
  // posture, open here because the test sets no SIGNUP_CODE.
  assert.deepEqual(nowhere, {
    workspaces: [],
    activeWorkspaceId: null,
    pending: null,
    posture: "open",
    user: { id: USER, email: "ada@example.com", role: null, display_name: null, platform_admin: false },
  });
});

test("the zone: the owner's, the workspace named, checked against Intl, and a change that landed on no row is a refusal rather than a success", async () => {
  const tables = { memberships: both("viewer", "owner"), tenants: tenants() };
  await refused(
    workspaces.PATCH.run(send("PATCH", { timezone: "America/Chicago" }), ctxFor(tables)),
    "choose_workspace",
    400,
  );
  await refused(
    workspaces.PATCH.run(send("PATCH", { timezone: "America/Chicago" }, inA), ctxFor(tables)),
    "forbidden",
    403,
    "Only an owner",
  );
  await refused(
    workspaces.PATCH.run(send("PATCH", { timezone: "Mars/Olympus" }, inB), ctxFor(tables)),
    "validation",
    400,
  );
  const changed = await workspaces.PATCH.run(send("PATCH", { timezone: "America/Chicago" }, inB), ctxFor(tables));
  assert.deepEqual(changed, {
    workspace: { id: B, slug: "bayside", name: "Bayside", status: "active", timezone: "America/Chicago" },
  });
  assert.equal(tables.tenants.find((t) => t.id === B).timezone, "America/Chicago");
  await refused(
    workspaces.PATCH.run(send("PATCH", { timezone: "America/Chicago" }, inB), ctxFor({ ...tables, tenants: [] })),
    "forbidden",
    403,
    "could not be changed",
  );
});

test("how customers buy: the owner's, one of the two answers, only what was sent written and read back, and a change that landed on no row is a refusal (0008)", async () => {
  const tables = { memberships: both("viewer", "owner"), tenants: tenants() };
  const ctx = () => ctxFor(tables);
  await refused(
    workspaces.PATCH.run(send("PATCH", { sells_by: "proposal" }, inA), ctx()),
    "forbidden",
    403,
    "Only an owner",
  );
  await refused(
    workspaces.PATCH.run(send("PATCH", { sells_by: "banana" }, inB), ctx()),
    "validation",
    400,
    SELLS_BY_REFUSAL,
  );
  await refused(
    workspaces.PATCH.run(send("PATCH", {}, inB), ctx()),
    "validation",
    400,
    "Send the workspace's timezone, or how its customers buy.",
  );
  const c = ctx();
  const changed = await workspaces.PATCH.run(send("PATCH", { sells_by: "proposal" }, inB), c);
  assert.deepEqual(changed, {
    workspace: {
      id: B,
      slug: "bayside",
      name: "Bayside",
      status: "active",
      timezone: "America/New_York",
      sells_by: "proposal",
    },
  });
  assert.deepEqual(
    c.supabase.seen.find((q) => q.table === "tenants" && q.op === "update").values,
    { sells_by: "proposal" },
    "the answer alone",
  );
  assert.equal(tables.tenants.find((t) => t.id === B).sells_by, "proposal");
  assert.equal(tables.tenants.find((t) => t.id === A).sells_by, undefined, "the workspace named, and no other");
  const both2 = await workspaces.PATCH.run(
    send("PATCH", { timezone: "America/Chicago", sells_by: "booking" }, inB),
    ctx(),
  );
  assert.deepEqual(
    [both2.workspace.timezone, both2.workspace.sells_by],
    ["America/Chicago", "booking"],
    "both at once",
  );
  // A bad zone beside a good answer writes neither.
  await refused(
    workspaces.PATCH.run(send("PATCH", { timezone: "Mars/Olympus", sells_by: "proposal" }, inB), ctx()),
    "validation",
    400,
  );
  assert.equal(tables.tenants.find((t) => t.id === B).sells_by, "booking");
  // A zone alone reads back only what it wrote, so it saves on a database that has no answer column yet.
  const z = ctx();
  await workspaces.PATCH.run(send("PATCH", { timezone: "America/Denver" }, inB), z);
  assert.equal(
    z.supabase.seen.find((q) => q.table === "tenants" && q.op === "update").columns,
    "id, slug, name, status, timezone",
  );
  await refused(
    workspaces.PATCH.run(send("PATCH", { sells_by: "proposal" }, inB), ctxFor({ ...tables, tenants: [] })),
    "forbidden",
    403,
    "How that workspace's customers buy could not be changed.",
  );
});

test("where you are says how each workspace's customers buy, and a database that has not reached 00160 still answers (0008)", async () => {
  const tables = {
    memberships: both("viewer", "owner"),
    tenants: [
      { ...tenants()[0], sells_by: "proposal" },
      { ...tenants()[1], sells_by: null },
    ],
    profiles: [],
  };
  const rpcs = { is_platform_admin: () => false };
  const home = await workspaces.GET.run(get(), ctxFor(tables, {}, rpcs));
  assert.deepEqual(
    home.workspaces.map((w) => [w.slug, w.sells_by]),
    [
      ["bayside", null],
      ["harbor", "proposal"],
    ],
  );
  // The database PostgREST answers "column does not exist" for sells_by: the boot read asks again without it, and
  // every workspace is not asked yet, rather than the app not starting.
  const db = fakeDb({ ...tables, tenants: tenants() }, {}, rpcs);
  const older = {
    ...db,
    from: (t) => {
      const q = db.from(t);
      if (t !== "tenants") return q;
      return {
        select: (cols, o) =>
          /\bsells_by\b/.test(String(cols))
            ? {
                order: async () => ({
                  data: null,
                  error: { message: "column tenants.sells_by does not exist", code: "42703" },
                }),
              }
            : q.select(cols, o),
      };
    },
  };
  const before = await workspaces.GET.run(get(), {
    supabase: older,
    userId: USER,
    email: "ada@example.com",
    params: {},
  });
  assert.deepEqual(
    before.workspaces.map((w) => [w.slug, w.sells_by]),
    [
      ["bayside", null],
      ["harbor", null],
    ],
  );
  assert.equal(before.activeWorkspaceId, A, "and where you are is answered as ever");
  // Any other failure is still the failure.
  const broken = fakeDb(tables, { "tenants.select": { message: "statement timeout" } }, rpcs);
  await assert.rejects(
    workspaces.GET.run(get(), { supabase: broken, userId: USER, email: "ada@example.com", params: {} }),
    /statement timeout/,
  );
});

test("the two that were held: a new workspace is a write of the account with no workspace to judge a role in, counted; the roster is a read of the workspace every member may make", () => {
  assert.deepEqual(create.POST.policy, {
    kind: "write",
    scope: "account",
    role: null,
    rate: "create_workspace",
    spend: false,
  });
  assert.deepEqual(team.GET.policy, { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
});

test("a new workspace: the body judged by its schema, the function's own words reaching the owner, and the workspace answered in the shape the list uses", async () => {
  const made = [];
  const rpcs = {
    create_workspace: (a) => {
      made.push(a);
      if (a.p_timezone === "Mars/Olympus")
        throw Object.assign(new Error("Unknown timezone: Mars/Olympus"), { code: "22023" });
      if (a.p_name === "One too many")
        throw Object.assign(new Error("An account may hold at most three workspaces."), { code: "54000" });
      return {
        id: C,
        slug: "harbor-two",
        name: a.p_name,
        status: "active",
        timezone: a.p_timezone ?? "America/New_York",
      };
    },
  };
  const tables = { memberships: both("viewer", "owner") };
  await refused(
    create.POST.run(send("POST", { name: "A" }), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "A workspace needs a name of at least 2 characters.",
  );
  await refused(
    create.POST.run(send("POST", { name: "Harbor Two", extra: 1 }), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
  );
  assert.equal(made.length, 0, "nothing reached the function");
  await refused(
    create.POST.run(send("POST", { name: "Harbor Two", timezone: "Mars/Olympus" }), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Unknown timezone: Mars/Olympus",
  );
  await refused(
    create.POST.run(send("POST", { name: "One too many" }), ctxFor(tables, {}, rpcs)),
    "conflict",
    409,
    "at most three workspaces",
  );
  const c1 = ctxFor(tables, {}, rpcs);
  const cleared = [];
  c1.supabase.auth = {
    updateUser: async (x) => {
      cleared.push(x);
      return { data: {}, error: null };
    },
  };
  c1.metadata = { pending_workspace: { name: "Harbor Two", timezone: "America/Chicago" } };
  const out = await create.POST.run(send("POST", { name: "Harbor Two", timezone: "America/Chicago" }), c1);
  assert.deepEqual(out, {
    workspace: { id: C, slug: "harbor-two", name: "Harbor Two", status: "active", timezone: "America/Chicago" },
  });
  assert.deepEqual(
    cleared,
    [{ data: { pending_workspace: null } }],
    "the name typed at sign-up is cleared once the workspace exists",
  );
  setRateStore(memoryStore()); // the second creation is the same person again: the ceiling above is not what this proves
  const c2 = ctxFor(tables, {}, rpcs);
  c2.supabase.auth = {
    updateUser: async () => {
      throw new Error("must not be called");
    },
  };
  c2.metadata = {};
  await create.POST.run(send("POST", { name: "Harbor Two", timezone: "America/Chicago" }), c2);
  assert.deepEqual(made.at(-1), { p_name: "Harbor Two", p_timezone: "America/Chicago" });
});

test("F3: a new workspace's first alert address is its creator's -- written through the settings door, and never over a choice or at the workspace's expense", async () => {
  const rpcs = {
    create_workspace: (a) => ({
      id: C,
      slug: "harbor-two",
      name: a.p_name,
      status: "active",
      timezone: "America/New_York",
    }),
  };
  // The provisioner (00017) has made the config row, empty, by the time the function returns.
  const tables = {
    memberships: both("viewer", "owner"),
    tenant_config: [{ tenant_id: C, config: {}, version: 1, updated_at: "2026-09-24T00:00:00Z" }],
  };
  const out = await create.POST.run(send("POST", { name: "Harbor Two" }), ctxFor(tables, {}, rpcs));
  assert.equal(out.workspace.id, C);
  assert.deepEqual(
    [tables.tenant_config[0].config, tables.tenant_config[0].version, tables.tenant_config[0].updated_by],
    [{ notifications: { escalation_emails: ["ada@example.com"] } }, 2, USER],
    "the creator's address, saved as the settings door saves: versioned, and by its author",
  );

  // A config row that is not there yet costs the owner nothing: the workspace is still answered.
  setRateStore(memoryStore());
  const bare = { memberships: both("viewer", "owner") };
  const again = await create.POST.run(send("POST", { name: "Harbor Two" }), ctxFor(bare, {}, rpcs));
  assert.equal(again.workspace.id, C);

  // An address already on the row is the owner's choice, and stays.
  setRateStore(memoryStore());
  const chosen = {
    memberships: both("viewer", "owner"),
    tenant_config: [
      {
        tenant_id: C,
        config: { notifications: { escalation_emails: ["desk@harbor.example"] } },
        version: 4,
        updated_at: "2026-09-24T00:00:00Z",
      },
    ],
  };
  await create.POST.run(send("POST", { name: "Harbor Two" }), ctxFor(chosen, {}, rpcs));
  assert.deepEqual(
    [chosen.tenant_config[0].config.notifications.escalation_emails, chosen.tenant_config[0].version],
    [["desk@harbor.example"], 4],
  );
});

test("the roster: the workspace the tab named, assembled after the caller proves membership, with the open invitations beside the members", async () => {
  const rpcs = {
    team_roster: (a) =>
      a.p_tenant_id === A
        ? [{ membership_id: "m1", member_user_id: USER, email: "ada@example.com", display_name: "Ada", role: "viewer" }]
        : [],
  };
  const tables = {
    memberships: both("viewer", "owner"),
    invitations: [
      {
        id: "i1",
        tenant_id: A,
        email: "bo@example.com",
        role: "operator",
        created_at: "2026-09-01T00:00:00Z",
        expires_at: "2026-09-08T00:00:00Z",
        accepted_at: null,
        revoked_at: null,
      },
      {
        id: "i2",
        tenant_id: A,
        email: "cy@example.com",
        role: "viewer",
        created_at: "2026-09-02T00:00:00Z",
        expires_at: "2026-09-09T00:00:00Z",
        accepted_at: "2026-09-03T00:00:00Z",
        revoked_at: null,
      },
      {
        id: "i3",
        tenant_id: B,
        email: "di@example.com",
        role: "viewer",
        created_at: "2026-09-02T00:00:00Z",
        expires_at: "2026-09-09T00:00:00Z",
        accepted_at: null,
        revoked_at: null,
      },
    ],
  };
  const out = await team.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.equal(out.members.length, 1, "the members the function names");
  assert.deepEqual(
    out.invites.map((i) => i.email),
    ["bo@example.com"],
    "open invitations only, this workspace's",
  );
});

test("the first workspace of an account that arrived through a provider meets the sign-up posture; an account already inside has no door", async () => {
  // Sign in with Google makes the auth user before /api/v1/signup could ask the
  // posture, so the create route asks it -- of an account with no membership yet.
  const rpcs = {
    create_workspace: (a) => ({
      id: C,
      slug: "harbor-one",
      name: a.p_name,
      status: "active",
      timezone: a.p_timezone ?? "America/New_York",
    }),
  };
  // A fresh account per call: the bucket is per person and this is one test.
  let n = 0;
  const nobody = () => ({ ...ctxFor({ memberships: [] }, {}, rpcs), userId: `new-${++n}` });
  const had = process.env.SIGNUP_CODE;
  try {
    process.env.SIGNUP_CODE = "waitlist";
    await refused(create.POST.run(send("POST", { name: "Harbor One" }), nobody()), "forbidden", 403, "small groups");
    const inside = await create.POST.run(
      send("POST", { name: "Harbor Two" }),
      ctxFor({ memberships: both("viewer", "viewer") }, {}, rpcs),
    );
    assert.equal(inside.workspace.name, "Harbor Two", "already inside: the list is not their door");

    process.env.SIGNUP_CODE = "let-me-in";
    await refused(
      create.POST.run(send("POST", { name: "Harbor One" }), nobody()),
      "forbidden",
      403,
      "invite code is not right",
    );
    await refused(create.POST.run(send("POST", { name: "Harbor One", code: "wrong" }), nobody()), "forbidden", 403);
    const opened = await create.POST.run(send("POST", { name: "Harbor One", code: "let-me-in" }), nobody());
    assert.equal(opened.workspace.name, "Harbor One", "the code opens it");

    delete process.env.SIGNUP_CODE;
    const open = await create.POST.run(send("POST", { name: "Harbor One" }), nobody());
    assert.equal(open.workspace.name, "Harbor One", "open: nothing asked");
  } finally {
    if (had === undefined) delete process.env.SIGNUP_CODE;
    else process.env.SIGNUP_CODE = had;
  }
});

test("the name Google gave stands in until the person gives one, and is never made from the email", async () => {
  const tables = { memberships: both("viewer", "owner"), tenants: tenants(), profiles: [] };
  const rpcs = { is_platform_admin: () => false };
  const fromGoogle = await workspaces.GET.run(get(), {
    ...ctxFor(tables, {}, rpcs),
    metadata: { full_name: "  Ada   Lovelace ", email: "ada@example.com" },
  });
  assert.equal(fromGoogle.user.display_name, "Ada Lovelace");
  const named = await workspaces.GET.run(get(), {
    ...ctxFor({ ...tables, profiles: [{ user_id: USER, display_name: "Ada L." }] }, {}, rpcs),
    metadata: { full_name: "Ada Lovelace" },
  });
  assert.equal(named.user.display_name, "Ada L.", "what they gave us wins");
  const nothing = await workspaces.GET.run(get(), {
    ...ctxFor(tables, {}, rpcs),
    metadata: { email: "hi@chanlytics.agency" },
  });
  assert.equal(nothing.user.display_name, null, "no name is no name");
});

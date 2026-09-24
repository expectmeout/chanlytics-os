/**
 * A list's life (decision 0009, phase 3; migration 00169), run through route(): the real route modules over a
 * database in memory.
 *
 * - A list something depends on -- a playbook names it, another list's rule reads it -- is archived, not deleted: it
 *   leaves People's rail and still resolves, and the running playbooks on it pause, each on the ledger. A list
 *   nothing depends on is deleted. PUT { archived: false } brings one back; a live list of the same name refuses it
 *   in words.
 * - Every change to a list is the ledger's: made, renamed, its rule changed, people put on and taken off, archived,
 *   restored, deleted.
 * - A playbook on an archived list is not resumed, and none is put on one.
 * - Either deploy order: a database 00169 has not reached reads every list as live, never as an error.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const lists = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));
const list = await import(at("apps/dashboard/app/api/v1/segments/[id]/route.ts"));
const playbook = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));
const runNow = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/run/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const K1 = "99999999-9999-4999-8999-999999999991";
const K2 = "99999999-9999-4999-8999-999999999992";
const T1 = "77777777-7777-4777-8777-777777777771";
const USER = "u1";
const ARCHIVED = "2026-09-20T12:00:00.000Z";
const operator = [
  { user_id: USER, tenant_id: B, role: "operator", tenants: { slug: "bayside" }, created_at: "2026-01-01" },
];
const ctxFor = (tables, params = {}, faults = {}) => ({
  supabase: fakeDb(tables, faults),
  userId: USER,
  email: "ada@example.com",
  params,
});
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
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
const ledger = (tables) => tables.decisions.map((d) => [d.verb, d.subject_type, d.subject_id]);
const pb = (id, over = {}) => ({
  id,
  tenant_id: B,
  name: "Win-back",
  trigger: "saved_list",
  list_id: S2,
  list_key: null,
  template_id: T1,
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 50,
  gap_days: 30,
  cadence_days: 0,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

test("a list nothing depends on is deleted, and the ledger says which", async () => {
  const tables = {
    memberships: operator,
    segments: [{ id: S2, tenant_id: B, name: "VIP", rule: null, archived_at: null }],
    segment_members: [{ segment_id: S2, contact_id: P2, tenant_id: B }],
    playbooks: [],
    decisions: [],
  };
  assert.deepEqual(await list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 })), { deleted: true, id: S2 });
  assert.ok(!tables.segments.some((s) => s.id === S2));
  assert.deepEqual(ledger(tables), [["delete_list", "list", S2]]);
  assert.deepEqual(tables.decisions[0].payload, { name: "VIP" });
  // A playbook put on it between the read and the delete: the database's reference refuses, and the route says so.
  tables.segments.push({ id: S1, tenant_id: B, name: "Regulars", rule: null, archived_at: null });
  await refused(
    list.DELETE.run(
      send("DELETE"),
      ctxFor(tables, { id: S1 }, { "segments.delete": { code: "23503", message: "violates foreign key constraint" } }),
    ),
    "conflict",
    409,
    "A playbook was just put on this list. Delete it again to archive it.",
  );
  assert.equal(tables.decisions.length, 1, "nothing recorded for a delete that did not happen");
});

test("a list a playbook runs on is archived, not deleted: it stays, and the running playbooks on it pause on the ledger", async () => {
  const tables = {
    memberships: operator,
    segments: [{ id: S2, tenant_id: B, name: "VIP", rule: null, archived_at: null }],
    segment_members: [{ segment_id: S2, contact_id: P2, tenant_id: B }],
    playbooks: [pb(K1), pb(K2, { name: "Birthday", state: "paused" })],
    decisions: [],
  };
  const r = await list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 }));
  assert.deepEqual(r, { archived: true, id: S2, paused: ["Win-back"], on_it: ["Birthday", "Win-back"], read_by: [] });
  const kept = tables.segments.find((s) => s.id === S2);
  assert.ok(kept && typeof kept.archived_at === "string", "the list is kept, archived");
  assert.equal(tables.segment_members.length, 1, "and its people with it");
  assert.equal(tables.playbooks.find((p) => p.id === K1).state, "paused");
  assert.deepEqual(ledger(tables), [
    ["pause_playbook", "playbook", K1],
    ["archive_list", "list", S2],
  ]);
  assert.deepEqual(tables.decisions[0].payload, { name: "Win-back", why: "list_archived" });
  assert.deepEqual(tables.decisions[1].payload, {
    name: "VIP",
    paused: ["Win-back"],
    on_it: ["Birthday", "Win-back"],
    read_by: [],
  });
  // Asked again, it is archived still: nothing paused twice, and nothing deleted.
  const again = await list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 }));
  assert.deepEqual(again.paused, []);
  assert.equal(kept.archived_at, tables.segments.find((s) => s.id === S2).archived_at, "the first moment stands");
});

test("a list another list's rule reads is archived too, and says which list reads it", async () => {
  const tables = {
    memberships: operator,
    segments: [
      { id: S1, tenant_id: B, name: "VIP", rule: null, archived_at: null },
      {
        id: S2,
        tenant_id: B,
        name: "VIPs who text",
        rule: { v: 2, all: [{ field: "in_list", op: "is", list: `list:${S1}` }] },
        archived_at: null,
      },
    ],
    segment_members: [],
    playbooks: [],
    decisions: [],
  };
  const r = await list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S1 }));
  assert.deepEqual(r, { archived: true, id: S1, paused: [], on_it: [], read_by: ["VIPs who text"] });
  assert.ok(tables.segments.some((s) => s.id === S1));
  // The list that reads it has nothing reading it: that one is deleted.
  assert.deepEqual(await list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 })), { deleted: true, id: S2 });
});

test("an archived list comes back on the ledger; a live list of the same name refuses it in words", async () => {
  const tables = {
    memberships: operator,
    segments: [{ id: S2, tenant_id: B, name: "VIP", rule: null, archived_at: ARCHIVED }],
    segment_members: [{ segment_id: S2, contact_id: P2, tenant_id: B }],
    decisions: [],
  };
  await refused(
    list.PUT.run(
      send("PUT", { archived: false }),
      ctxFor(
        tables,
        { id: S2 },
        {
          "segments.update": {
            code: "23505",
            message: 'duplicate key value violates unique constraint "segments_live_name"',
          },
        },
      ),
    ),
    "conflict",
    409,
    "A list with that name is on People now. Rename this one to bring it back.",
  );
  assert.equal(tables.segments[0].archived_at, ARCHIVED);
  const back = await list.PUT.run(send("PUT", { archived: false }), ctxFor(tables, { id: S2 }));
  assert.deepEqual(back, { id: S2, name: "VIP", ids: [P2], rule: null, archived_at: null });
  assert.equal(tables.segments[0].archived_at, null);
  assert.deepEqual(ledger(tables), [["restore_list", "list", S2]]);
  // A live list is not "restored": asking for it alone is nothing to change.
  await refused(list.PUT.run(send("PUT", { archived: false }), ctxFor(tables, { id: S2 })), "validation", 400);
});

test("every change to a list is the ledger's: made, renamed, people put on and taken off, its rule changed", async () => {
  const tables = {
    memberships: operator,
    segments: [
      { id: S1, tenant_id: B, name: "VIP", rule: null, archived_at: null },
      {
        id: S2,
        tenant_id: B,
        name: "Drifting",
        rule: { v: 2, all: [{ field: "calls", op: "at_least", n: 1 }] },
        archived_at: null,
      },
    ],
    segment_members: [{ segment_id: S1, contact_id: P2, tenant_id: B }],
    contacts: [
      { id: P1, tenant_id: B },
      { id: P2, tenant_id: B },
    ],
    decisions: [],
  };
  const made = await lists.POST.run(send("POST", { name: "Colour club" }, `?workspace=${B}`), ctxFor(tables));
  assert.deepEqual(made, { id: made.id, name: "Colour club", ids: [], rule: null, archived_at: null });
  await list.PUT.run(send("PUT", { name: "Best", add: [P1], remove: [P2] }), ctxFor(tables, { id: S1 }));
  const rule = { all: [{ field: "last_visit", op: "more_than", days: 60 }] };
  await list.PUT.run(send("PUT", { rule }), ctxFor(tables, { id: S2 }));
  assert.deepEqual(ledger(tables), [
    ["make_list", "list", made.id],
    ["rename_list", "list", S1],
    ["drop_from_list", "list", S1],
    ["add_to_list", "list", S1],
    ["change_list_rule", "list", S2],
  ]);
  assert.deepEqual(
    tables.decisions.map((d) => d.payload),
    [
      { name: "Colour club", kept: "hand" },
      { from: "VIP", to: "Best" },
      { name: "Best", count: 1 },
      { name: "Best", count: 1 },
      { name: "Drifting", rule: { v: 2, ...rule } },
    ],
  );
});

test("a restore and its new name land in one write: refused, neither happened; done, both are on the ledger", async () => {
  const tables = {
    memberships: operator,
    segments: [{ id: S2, tenant_id: B, name: "VIP", rule: null, archived_at: ARCHIVED }],
    segment_members: [],
    decisions: [],
  };
  const taken = { "segments.update": { code: "23505", message: "duplicate key value violates unique constraint" } };
  await refused(
    list.PUT.run(send("PUT", { name: "VIP two", archived: false }), ctxFor(tables, { id: S2 }, taken)),
    "conflict",
    409,
  );
  assert.deepEqual(
    [tables.segments[0].name, tables.segments[0].archived_at, tables.decisions.length],
    ["VIP", ARCHIVED, 0],
  );
  const back = await list.PUT.run(send("PUT", { name: "VIP two", archived: false }), ctxFor(tables, { id: S2 }));
  assert.deepEqual([back.name, back.archived_at], ["VIP two", null]);
  assert.deepEqual([tables.segments[0].name, tables.segments[0].archived_at], ["VIP two", null]);
  assert.deepEqual(ledger(tables), [
    ["rename_list", "list", S2],
    ["restore_list", "list", S2],
  ]);
});

test("a rule takes up no archived list; one that already read it keeps it", async () => {
  const reads = { v: 2, all: [{ field: "in_list", op: "is", list: `list:${S1}` }] };
  const tables = {
    memberships: operator,
    segments: [
      { id: S1, tenant_id: B, name: "VIP", rule: null, archived_at: ARCHIVED },
      { id: S2, tenant_id: B, name: "VIPs who text", rule: reads, archived_at: null },
      {
        id: K2,
        tenant_id: B,
        name: "Drifting",
        rule: { v: 2, all: [{ field: "calls", op: "at_least", n: 1 }] },
        archived_at: null,
      },
    ],
    segment_members: [],
    decisions: [],
  };
  await refused(
    list.PUT.run(send("PUT", { rule: reads }), ctxFor(tables, { id: K2 })),
    "validation",
    400,
    "VIP is archived. Restore it on People to read it.",
  );
  await refused(
    lists.POST.run(send("POST", { name: "Also VIP", rule: reads }, `?workspace=${B}`), ctxFor(tables)),
    "validation",
    400,
    "VIP is archived.",
  );
  // The list that read it before it was archived is edited, and keeps reading it.
  const kept = { v: 2, all: [...reads.all, { field: "calls", op: "at_least", n: 1 }] };
  const changed = await list.PUT.run(send("PUT", { rule: kept }), ctxFor(tables, { id: S2 }));
  assert.deepEqual(changed.rule, kept);
});

test("a playbook on an archived list is not resumed, and none is put on one; restored, it runs again", async () => {
  const tables = {
    memberships: operator,
    segments: [{ id: S2, tenant_id: B, name: "VIP", rule: null, archived_at: ARCHIVED }],
    segment_members: [],
    playbooks: [pb(K1, { state: "paused" })],
    templates: [
      {
        id: T1,
        tenant_id: B,
        channel: "whatsapp",
        name: "winback_offer",
        language: "en_US",
        body_preview: "Come back",
        variables: [],
        category: "marketing",
        meta_status: "approved",
        quality: null,
        rejected_reason: null,
        synced_at: null,
        source: "starter",
        hidden_at: null,
        title: null,
      },
    ],
    decisions: [],
  };
  await refused(
    playbook.PUT.run(send("PUT", { state: "running" }), ctxFor(tables, { id: K1 })),
    "validation",
    400,
    "Its list, VIP, is archived. Restore it on People, or move the playbook to another list.",
  );
  assert.equal(tables.playbooks[0].state, "paused");
  await refused(
    playbook.PUT.run(
      send("PUT", { name: "Win-back", trigger: "saved_list", list_id: S2, template_id: T1, params: [] }),
      ctxFor(tables, { id: K1 }),
    ),
    "validation",
    400,
    "VIP is archived. Restore it on People to run a playbook on it.",
  );
  // Nor run now: the button is hidden on a paused card, and the door refuses it too.
  await refused(
    runNow.POST.run(send("POST"), ctxFor(tables, { id: K1 })),
    "validation",
    400,
    "Its list, VIP, is archived.",
  );
  await list.PUT.run(send("PUT", { archived: false }), ctxFor(tables, { id: S2 }));
  const resumed = await playbook.PUT.run(send("PUT", { state: "running" }), ctxFor(tables, { id: K1 }));
  assert.equal(resumed.state, "running");
});

test("a list about whoever is looking is never a playbook's: none is put on one, and a list a playbook runs on takes no such rule (decision 0009)", async () => {
  const mine = { v: 2, all: [{ field: "assigned", op: "is", value: "me" }] };
  const tables = {
    memberships: operator,
    segments: [
      { id: S1, tenant_id: B, name: "Mine", rule: mine, archived_at: null },
      {
        id: S2,
        tenant_id: B,
        name: "VIP",
        rule: { v: 2, all: [{ field: "calls", op: "at_least", n: 1 }] },
        archived_at: null,
      },
    ],
    segment_members: [],
    playbooks: [pb(K1, { state: "paused" })],
    templates: [
      {
        id: T1,
        tenant_id: B,
        channel: "whatsapp",
        name: "winback_offer",
        language: "en_US",
        body_preview: "Come back",
        variables: [],
        category: "marketing",
        meta_status: "approved",
        quality: null,
        rejected_reason: null,
        synced_at: null,
        source: "starter",
        hidden_at: null,
        title: null,
      },
    ],
    decisions: [],
  };
  await refused(
    playbook.PUT.run(
      send("PUT", { name: "Win-back", trigger: "saved_list", list_id: S1, template_id: T1, params: [] }),
      ctxFor(tables, { id: K1 }),
    ),
    "validation",
    400,
    'Mine is about whoever is looking ("me")',
  );
  // VIP has a playbook on it (K1): a rule about "me" would stop it every day, so it is refused, and nothing changes.
  await refused(
    list.PUT.run(send("PUT", { rule: mine }), ctxFor(tables, { id: S2 })),
    "conflict",
    409,
    "Win-back runs on VIP",
  );
  assert.deepEqual(tables.segments[1].rule.all[0].field, "calls");
  assert.deepEqual(ledger(tables), []);
});

test("either deploy order: on a database 00169 has not reached, every list reads as live, never as an error", async () => {
  const { savedListsFor, savedListFor, listRow } = await import(at("packages/db/src/repositories/lists.ts"));
  const base = fakeDb({
    segments: [
      { id: "s1", tenant_id: "t1", name: "Regulars", rule: { v: 2, all: [{ field: "calls", op: "at_least", n: 1 }] } },
    ],
    segment_members: [],
  });
  const missing = { data: null, error: { code: "42703", message: "column segments.archived_at does not exist" } };
  const refusing = {
    eq() {
      return this;
    },
    order() {
      return this;
    },
    range: async () => missing,
    maybeSingle: async () => missing,
  };
  const db = {
    from: (table) => {
      const q = base.from(table);
      if (table !== "segments") return q;
      const select = q.select.bind(q);
      q.select = (columns, ...rest) => (String(columns).includes("archived_at") ? refusing : select(columns, ...rest));
      return q;
    },
  };
  const rule = { v: 2, all: [{ field: "calls", op: "at_least", n: 1 }] };
  assert.deepEqual(await savedListsFor(db, "t1"), [{ id: "s1", name: "Regulars", ids: [], rule, archived_at: null }]);
  assert.deepEqual(await savedListFor(db, "t1", "s1"), {
    id: "s1",
    name: "Regulars",
    ids: [],
    rule,
    archived_at: null,
  });
  assert.deepEqual(await listRow(db, "s1"), { id: "s1", tenant_id: "t1", name: "Regulars", rule, archived_at: null });
});

test("every table a surface repaints on is one the one subscription listens to -- People's lists named two it never heard", async () => {
  const WATCHED_TABLES = (await import(at("packages/db/src/realtime.ts"))).watchedTables();
  const surfaces = await import(at("apps/dashboard/src/legacy-bridge/surface-data.ts"));
  const unheard = Object.entries(surfaces).flatMap(([name, o]) =>
    Array.isArray(o?.refreshOnTables)
      ? o.refreshOnTables.filter((t) => !WATCHED_TABLES.includes(t)).map((t) => `${name}: ${t}`)
      : [],
  );
  assert.deepEqual(unheard, []);
  assert.ok(surfaces.peopleOverride.refreshOnTables.includes("segments"));
});

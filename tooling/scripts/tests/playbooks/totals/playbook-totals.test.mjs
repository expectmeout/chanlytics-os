/**
 * A playbook's totals, a run's counts and a message's sends (00373), as the dashboard reads them: contracts' guards and
 * mappings, the fake database's twins of the three functions, and Sent, GET playbooks and Settings' templates saying
 * the same counted by the database as by the fold they replace. Over the database in memory (_fake-db.mjs); the twins
 * are held to SQL in playbook-totals.db.test.mjs, and packages/db's doors in reports/report-repository.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaybookTotalsDto, runCountsOf, templateSendsOf } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("isPlaybookTotalsDto takes playbook_totals' answer -- by playbook id, each with its last run, the run that waits or null, and its history -- and nothing else", () => {
  const row = {
    runs: 2,
    sent: 3,
    delivered: 2,
    replied: 1,
    held: 1,
    last_run: { id: "b1", state: "sent", run_for: "2026-09-02", recipient_count: 2 },
    waiting: null,
    history: [
      {
        id: "b1",
        run_for: "2026-09-02",
        state: "sent",
        scheduled_for: "2026-09-02T14:00:00+00:00",
        recipient_count: 2,
        sent: 2,
        held: 0,
        delivered: 1,
        replied: 1,
      },
    ],
  };
  assert.equal(isPlaybookTotalsDto({}), true, "no playbook has run");
  assert.equal(isPlaybookTotalsDto({ p1: row }), true);
  assert.equal(
    isPlaybookTotalsDto({
      p1: { ...row, waiting: { id: "b2", recipient_count: 4, name: "Run 2", run_for: null, trigger: null } },
    }),
    true,
    "a run that waits, with no day and no moment kept",
  );
  for (const [bad, why] of [
    [null, "null"],
    [[], "an array"],
    ["{}", "text"],
    [{ p1: { ...row, runs: "2" } }, "a count as text"],
    [{ p1: { ...row, last_run: null } }, "a playbook in the answer has run"],
    [{ p1: { ...row, history: [{ ...row.history[0], scheduled_for: null }] } }, "a run's time is never empty"],
    [{ p1: { ...row, waiting: { id: "b2" } } }, "a waiting run says its people, its name, its day and its moment"],
    [{ p1: { ...row, lastRun: row.last_run, last_run: undefined } }, "memory's casing is not the database's"],
  ])
    assert.equal(isPlaybookTotalsDto(bad), false, why);
});

test("runCountsOf reads run_counts' answer in the order Sent has always written a run's counts, and templateSendsOf template_sends' in memory's casing; another shape is null", () => {
  const raw = {
    b1: {
      sent_by: { email: 1, sms: 0, whatsapp: 2 },
      replied: 1,
      read: 1,
      delivered: 2,
      failed: 0,
      skipped: 1,
      sent: 3,
      queued: 0,
    },
  };
  const got = runCountsOf(raw);
  assert.deepEqual(got, {
    b1: {
      queued: 0,
      sent: 3,
      skipped: 1,
      failed: 0,
      delivered: 2,
      read: 1,
      replied: 1,
      sent_by: { whatsapp: 2, sms: 0, email: 1 },
    },
  });
  assert.equal(
    JSON.stringify(got.b1),
    '{"queued":0,"sent":3,"skipped":1,"failed":0,"delivered":2,"read":1,"replied":1,"sent_by":{"whatsapp":2,"sms":0,"email":1}}',
    "the fold's key order, whatever order jsonb keeps",
  );
  assert.deepEqual(runCountsOf({}), {});
  for (const bad of [
    null,
    [],
    { b1: { ...raw.b1, sent: "3" } },
    { b1: { ...raw.b1, sent_by: null } },
    { b1: { ...raw.b1, sent_by: { whatsapp: 2 } } },
  ])
    assert.equal(runCountsOf(bad), null, JSON.stringify(bad));
  assert.deepEqual(
    templateSendsOf({
      winback_offer: { count: 3, last_at: "2026-09-17T14:00:00+00:00" },
      never_timed: { count: 1, last_at: null },
    }),
    { winback_offer: { count: 3, lastAt: "2026-09-17T14:00:00+00:00" }, never_timed: { count: 1, lastAt: null } },
  );
  assert.deepEqual(templateSendsOf({}), {});
  for (const bad of [null, [], { x: { count: "3", last_at: null } }, { x: { count: 3 } }])
    assert.equal(templateSendsOf(bad), null, JSON.stringify(bad));
});

/* ---- harbor: one moment that ran, one that never did, a reach-out's step, a one-off and an Inbox template ---- */

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 1, 14);
const iso = (ms) => new Date(ms).toISOString();
const pbRow = (id, over) => ({
  id,
  tenant_id: T,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: "tp1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-08-01T00:00:00Z",
  channels: ["whatsapp"],
  ...over,
});
const run = (id, i, over = {}) => ({
  id,
  tenant_id: T,
  name: `Run ${i}`,
  template_id: "tp1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  audience: { kind: "playbook", id: "p1", label: "Win-back", trigger: "quiet_30" },
  state: "sent",
  scheduled_for: iso(T0 + i * 24 * H),
  started_at: null,
  finished_at: null,
  recipient_count: 2,
  failure: null,
  created_at: iso(T0 + i * 24 * H),
  playbook_id: "p1",
  run_for: iso(T0 + i * 24 * H).slice(0, 10),
  ...over,
});
/** One person on a run, with their message's receipt where it has one, as the fixtures here write a person. */
const person = (broadcast, who, state, sentAt, status = null, channel = null) => ({
  tenant_id: T,
  broadcast_id: broadcast,
  contact_id: who,
  state,
  reason: state === "skipped" ? "opted_out" : null,
  sent_at: sentAt === null ? null : iso(sentAt),
  channel,
  message_id: null,
  messages: status ? { conversation_id: `cv-${who}`, status, meta: {} } : null,
});
const inbound = (id, who, ms, meta = {}) => ({
  id,
  tenant_id: T,
  conversation_id: `cv-${who}`,
  direction: "inbound",
  sender: "customer",
  type: "text",
  meta,
  created_at: iso(ms),
});
/**
 * p1 ran four times: b0 sent two (ana read, bo delivered by email) and held one back, ana answered within the hour and bo
 * only sent a booking tool's notice; b1 sent two by text (eli's carrier "read" is no read), eli answered 80 hours late;
 * b2 failed two, flo with a delivered message, who answered; b3 waits with two queued. p2 never ran; r1's step ran once;
 * h1 was sent by hand; the Inbox sent one template that left.
 */
const harbor = () => ({
  playbooks: [
    pbRow("p1"),
    pbRow("p2", { name: "Lapsed", trigger: "lapsed", created_at: "2026-08-02T00:00:00Z" }),
    pbRow("r1", {
      kind: "reach_out",
      name: "Reach out",
      trigger: "lead_first",
      policy_class: "outreach",
      created_at: "2026-08-03T00:00:00Z",
    }),
  ],
  broadcasts: [
    run("b0", 0),
    run("b1", 1),
    run("b2", 2, { state: "failed" }),
    run("b3", 3, { state: "pending_approval", recipient_count: 3 }),
    run("s1", 4, { playbook_id: "r1", audience: { kind: "reach_out", root_id: "r1", step_id: "r1" } }),
    run("h1", 5, { playbook_id: null, run_for: null, audience: { kind: "everyone", id: null, label: "Everyone" } }),
  ],
  broadcast_recipients: [
    person("b0", "ana", "sent", T0, "read"),
    person("b0", "bo", "sent", T0 + 60_000, "delivered", "email"),
    person("b0", "cy", "skipped", null),
    person("b1", "di", "sent", T0 + 24 * H, "sent", "sms"),
    person("b1", "eli", "sent", T0 + 24 * H, "read", "sms"),
    person("b2", "flo", "failed", T0 + 48 * H, "delivered"),
    person("b2", "gus", "failed", null),
    person("b3", "hal", "queued", null),
    person("b3", "ivy", "queued", null),
    person("s1", "jo", "sent", T0 + 96 * H, "delivered", "email"),
    person("h1", "kim", "sent", T0 + 120 * H, "delivered"),
  ],
  messages: [
    inbound("m1", "ana", T0 + H),
    inbound("m2", "bo", T0 + 2 * H, { email: { claim: "booking_notice" } }),
    inbound("m3", "eli", T0 + 24 * H + 80 * H),
    inbound("m4", "flo", T0 + 51 * H),
    {
      id: "m5",
      tenant_id: T,
      conversation_id: "cv-kim",
      direction: "outbound",
      sender: "human",
      type: "template",
      template_name: "winback_offer",
      external_id: "wamid.harbor-1",
      status: "delivered",
      meta: {},
      created_at: iso(T0 + 200 * H),
    },
  ],
  templates: [],
});
const counts = (queued, sent, skipped, failed, delivered, read, replied, whatsapp, sms, email) => ({
  queued,
  sent,
  skipped,
  failed,
  delivered,
  read,
  replied,
  sent_by: { whatsapp, sms, email },
});

test("the fake database's twins count harbor as the SQL does: each run, each moment playbook's totals, each message's sends", async () => {
  const db = fakeDb(harbor());
  const rc = await db.rpc("run_counts", { p_tenant_id: T, p_run_ids: ["b0", "b1", "b2", "b3", "s1", "h1", "nobody"] });
  assert.equal(rc.error, null, rc.error?.message);
  assert.deepEqual(rc.data, {
    b0: counts(0, 2, 1, 0, 2, 1, 1, 1, 0, 1),
    b1: counts(0, 2, 0, 0, 1, 0, 0, 0, 2, 0),
    b2: counts(0, 0, 0, 2, 1, 0, 1, 0, 0, 0),
    b3: counts(2, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    s1: counts(0, 1, 0, 0, 1, 0, 0, 0, 0, 1),
    h1: counts(0, 1, 0, 0, 1, 0, 0, 1, 0, 0),
  });
  const pt = (await db.rpc("playbook_totals", { p_tenant_id: T, p_history: 10 })).data;
  assert.deepEqual(Object.keys(pt), ["p1"], "the moment that ran: not Lapsed, never the reach-out");
  assert.deepEqual([pt.p1.runs, pt.p1.sent, pt.p1.delivered, pt.p1.replied, pt.p1.held], [4, 4, 4, 2, 3]);
  assert.deepEqual(
    pt.p1.history.map((h) => h.id),
    ["b3", "b2", "b1", "b0"],
  );
  assert.deepEqual(pt.p1.last_run, { id: "b3", state: "pending_approval", run_for: "2026-09-04", recipient_count: 3 });
  assert.deepEqual(pt.p1.waiting, {
    id: "b3",
    recipient_count: 3,
    name: "Run 3",
    run_for: "2026-09-04",
    trigger: "quiet_30",
  });
  assert.equal(isPlaybookTotalsDto(pt), true, "the twin answers the shape the guard takes");
  assert.deepEqual((await db.rpc("template_sends", { p_tenant_id: T })).data, {
    winback_offer: { count: 7, last_at: iso(T0 + 200 * H) },
  });
  assert.deepEqual(
    (await db.rpc("playbook_totals", { p_tenant_id: "elsewhere" })).data,
    {},
    "another workspace's are not this one's",
  );
});

/* ---- the dashboard over the fake database: the database's count, else the fold ---- */

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const Bc = await import(at("apps/dashboard/src/server/campaigns/broadcasts.ts"));

/** A function a database before 00373 does not have: PostgREST's PGRST202, which packages/db reads as "missing". */
const gone = (name) => () => {
  throw Object.assign(new Error(`Could not find the function public.${name}`), { code: "PGRST202" });
};
/** Harbor as a database before 00373 answers it: the dashboard reads the old way, for one release. */
const before00362 = (tables) =>
  fakeDb(
    tables,
    {},
    {
      run_counts: gone("run_counts"),
      playbook_totals: gone("playbook_totals"),
      template_sends: gone("template_sends"),
    },
  );

test("Sent and a run's sheet say what run_counts says, read in one call for the fifty, and the same bytes the fold says on a database before it", async () => {
  const sql = fakeDb(harbor());
  const listed = await Bc.listBroadcasts({ supabase: sql }, T);
  assert.deepEqual(
    sql.seen.filter((q) => q.rpc).map((q) => q.rpc),
    ["run_counts"],
    "one call for the fifty",
  );
  assert.equal(
    sql.seen.some((q) => q.table === "broadcast_recipients"),
    false,
    "no person read to count them",
  );
  const folded = await Bc.listBroadcasts({ supabase: before00362(harbor()) }, T);
  assert.equal(JSON.stringify(listed), JSON.stringify(folded), "byte for byte");
  assert.deepEqual(listed.broadcasts.find((b) => b.id === "b0").counts, counts(0, 2, 1, 0, 2, 1, 1, 1, 0, 1));
  assert.deepEqual(
    listed.broadcasts.find((b) => b.id === "b2").counts,
    counts(0, 0, 0, 2, 1, 0, 1, 0, 0, 0),
    "a failed person with a message, answered",
  );
  assert.equal(
    JSON.stringify(await Bc.listRuns({ supabase: fakeDb(harbor()) }, T)),
    JSON.stringify(await Bc.listRuns({ supabase: before00362(harbor()) }, T)),
  );
  const sheet = await Bc.getBroadcast({ supabase: fakeDb(harbor()) }, T, "b2");
  assert.deepEqual(sheet.broadcast.counts, counts(0, 0, 0, 2, 1, 0, 1, 0, 0, 0));
  assert.deepEqual(
    (await Bc.getBroadcast({ supabase: before00362(harbor()) }, T, "b2")).broadcast.counts,
    sheet.broadcast.counts,
  );
});

const P = await import(at("apps/dashboard/src/server/campaigns/playbooks.ts"));

test("GET playbooks' rows: the database's count read in one call, the same bytes the fold says on a database before it, a playbook that never ran all zeros, and the rows alone read without a run", async () => {
  const sql = fakeDb(harbor());
  const rows = await P.listPlaybooks({ supabase: sql }, T);
  assert.deepEqual(
    sql.seen.filter((q) => q.rpc).map((q) => q.rpc),
    ["playbook_totals"],
  );
  assert.equal(
    sql.seen.some((q) => q.table === "broadcasts" || q.table === "broadcast_recipients"),
    false,
    "no run read to sum them",
  );
  const folded = await P.listPlaybooks({ supabase: before00362(harbor()) }, T);
  assert.equal(JSON.stringify(rows), JSON.stringify(folded), "byte for byte");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["p2", "p1"],
    "the moments, newest first; the reach-out is its own sheet's",
  );
  assert.deepEqual(rows[0].totals, {
    runs: 0,
    sent: 0,
    delivered: 0,
    replied: 0,
    held: 0,
    lastRun: null,
    waiting: null,
    history: [],
  });
  const t = rows[1].totals;
  assert.deepEqual([t.runs, t.sent, t.delivered, t.replied, t.held], [4, 4, 4, 2, 3]);
  assert.deepEqual(t.lastRun, { id: "b3", state: "pending_approval", run_for: "2026-09-04", recipient_count: 3 });
  const bare = fakeDb(harbor());
  const plain = await P.playbookRows({ supabase: bare }, T);
  assert.deepEqual(
    plain,
    rows.map(({ totals: _totals, ...r }) => r),
    "the rows alone, as GET playbooks lists them",
  );
  assert.deepEqual(
    bare.seen.map((q) => q.table ?? `rpc:${q.rpc}`),
    ["playbooks"],
    "and nothing of a run",
  );
});

const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { templates: templatesReader } = await import(at("apps/dashboard/src/server/readers/templates.ts"));
const turn = (db) =>
  kernel.readerContext(
    { supabase: db, userId: "u1", email: "ada@example.com", params: {} },
    { tenantId: T, role: "viewer" },
  );

test("Settings' templates: how many of each went out is template_sends', one call where every sent person and every templated message was paged, and the same the fold says on a database before it", async () => {
  const sql = fakeDb(harbor());
  const read = (await kernel.load(turn(sql), templatesReader, { all: true })).data;
  assert.deepEqual(read.sends, { winback_offer: { count: 7, lastAt: iso(T0 + 200 * H) } });
  assert.ok(
    sql.seen.some((q) => q.rpc === "template_sends"),
    "the database's count",
  );
  assert.equal(
    sql.seen.some((q) => q.table === "broadcast_recipients"),
    false,
    "no sent person paged",
  );
  assert.equal(
    sql.seen.some((q) => q.table === "messages"),
    false,
    "no templated message paged",
  );
  const folded = (await kernel.load(turn(before00362(harbor())), templatesReader, { all: true })).data;
  assert.deepEqual(folded.sends, read.sends);
  assert.deepEqual(folded.usedBy, read.usedBy, "what sends each is read the same way");
  const composers = fakeDb(harbor());
  await kernel.load(turn(composers), templatesReader, { all: false });
  assert.equal(
    composers.seen.some((q) => q.rpc === "template_sends"),
    false,
    "the composers never ask, and never pay for it",
  );
});

/**
 * Outbound (broadcasts, templates, playbooks), run through route(): the real
 * route modules, their `run` called with a database in memory. What is
 * proved is the policy each declares and what the handler answers, not its
 * text. The verbs that reach Meta or the ledger's service client stop at the
 * production guard on this machine, which is itself the proof that nothing
 * is written for a verb that did not happen.
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
const broadcasts = await import(at("apps/dashboard/app/api/v1/broadcasts/route.ts"));
const approve = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/approve/route.ts"));
const cancel = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/cancel/route.ts"));
const templates = await import(at("apps/dashboard/app/api/v1/templates/route.ts"));
const template = await import(at("apps/dashboard/app/api/v1/templates/[id]/route.ts"));
const draft = await import(at("apps/dashboard/app/api/v1/templates/draft/route.ts"));
const starter = await import(at("apps/dashboard/app/api/v1/templates/starter/route.ts"));
const sync = await import(at("apps/dashboard/app/api/v1/templates/sync/route.ts"));
const playbooks = await import(at("apps/dashboard/app/api/v1/playbooks/route.ts"));
const playbook = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));
const run = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/run/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T1 = "77777777-7777-4777-8777-777777777771";
const T2 = "77777777-7777-4777-8777-777777777772";
const T3 = "77777777-7777-4777-8777-777777777773";
const T4 = "77777777-7777-4777-8777-777777777774";
const T9 = "77777777-7777-4777-8777-777777777779";
const B1 = "88888888-8888-4888-8888-888888888881";
const B2 = "88888888-8888-4888-8888-888888888882";
const B3 = "88888888-8888-4888-8888-888888888883";
const B4 = "88888888-8888-4888-8888-888888888884";
const K1 = "99999999-9999-4999-8999-999999999991";
const K2 = "99999999-9999-4999-8999-999999999992";
const K9 = "99999999-9999-4999-8999-999999999999";
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
const ctxFor = (tables, params = {}, rpcs = {}, opts = {}) => ({
  supabase: fakeDb(tables, {}, rpcs, opts),
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
const inB = `?workspace=${B}`;
const inA = `?workspace=${A}`;
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

const tpl = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  channel: "whatsapp",
  name: "visit_reminder",
  language: "en_US",
  body_preview: "See you at {{1}}",
  variables: [],
  category: "utility",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "starter",
  hidden_at: null,
  title: null,
  ...over,
});
const bc = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  name: "Reminder",
  template_id: T1,
  template_name: "visit_reminder",
  template_language: "en_US",
  params: [],
  audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "scheduled",
  scheduled_for: "2026-09-10T00:00:00Z",
  started_at: null,
  finished_at: null,
  recipient_count: 3,
  failure: null,
  created_at: "2026-09-10T00:00:00Z",
  playbook_id: null,
  run_for: null,
  ...over,
});
const pb = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  name: "Win-back",
  trigger: "quiet_30",
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

test("the seventeen declare their policy: the lists open to every member, every change operator-only and counted against its bucket, every single-row verb judged where its row lives", () => {
  const open = { kind: "read", scope: "workspace", role: null, rate: null, spend: false };
  const ws = (rate) => ({ kind: "write", scope: "workspace", role: "operator", rate, spend: false });
  const rw = (rate) => ({ kind: "write", scope: "row", role: "operator", rate, spend: false });
  assert.deepEqual(broadcasts.GET.policy, open);
  assert.deepEqual(templates.GET.policy, open);
  assert.deepEqual(playbooks.GET.policy, open);
  assert.deepEqual(broadcasts.POST.policy, ws("broadcast"));
  assert.deepEqual(approve.POST.policy, rw("broadcast"));
  assert.deepEqual(cancel.POST.policy, rw("broadcast"));
  assert.deepEqual(templates.POST.policy, ws("settings"));
  assert.deepEqual(template.PUT.policy, rw("settings"));
  assert.deepEqual(template.DELETE.policy, rw("settings"));
  assert.deepEqual(draft.POST.policy, ws("ask"));
  assert.deepEqual(starter.POST.policy, ws("settings"));
  assert.deepEqual(sync.POST.policy, ws("settings"));
  assert.deepEqual(playbooks.POST.policy, ws("playbook"));
  assert.deepEqual(playbook.PUT.policy, rw("playbook"));
  assert.deepEqual(playbook.DELETE.policy, rw("playbook"));
  assert.deepEqual(run.POST.policy, rw("playbook"));
});

test("the broadcasts list is the workspace the tab named, newest first, with what its messages earned", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    broadcasts: [
      bc(B1, A, { created_at: "2026-09-09T00:00:00Z" }),
      bc(B2, A, { created_at: "2026-09-10T00:00:00Z", state: "sent" }),
      bc(B3, B),
    ],
    broadcast_recipients: [
      {
        broadcast_id: B2,
        tenant_id: A,
        contact_id: "k1",
        state: "sent",
        reason: null,
        sent_at: "2026-09-10T01:00:00Z",
        messages: { conversation_id: null, status: "delivered" },
      },
    ],
  };
  const out = await broadcasts.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(
    out.broadcasts.map((b) => b.id),
    [B2, B1],
    "newest first, this workspace only",
  );
  assert.equal(out.broadcasts[0].counts.sent, 1);
  assert.equal(out.broadcasts[0].counts.delivered, 1, "delivered comes from the receipts");
  const bayside = await broadcasts.GET.run(get(inB), ctxFor(tables));
  assert.deepEqual(
    bayside.broadcasts.map((b) => b.id),
    [B3],
  );
});

test("a broadcast: the workspace must be named, a viewer is refused as a viewer, then the template, its values and the audience are judged in the person's words, before anything is written", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(T1, B),
      tpl(T2, B, { name: "offer", meta_status: "pending" }),
      tpl(T3, B, { name: "with_slot", variables: ["1"] }),
    ],
    tenants: [],
    tenant_config: [],
    policies: [],
  };
  const rpcs = { people_list: () => [] };
  const everyone = { kind: "everyone" };
  await refused(
    broadcasts.POST.run(send("POST", { template_id: T1, params: [], audience: everyone }), ctxFor(tables, {}, rpcs)),
    "choose_workspace",
    400,
  );
  await refused(
    broadcasts.POST.run(
      send("POST", { template_id: T1, params: [], audience: everyone }, inA),
      ctxFor(tables, {}, rpcs),
    ),
    "forbidden",
    403,
  );
  await refused(
    broadcasts.POST.run(send("POST", { template_id: "nope", audience: everyone }, inB), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "Pick a template.",
  );
  await refused(
    broadcasts.POST.run(
      send("POST", { template_id: T1, audience: { kind: "carrier pigeons" } }, inB),
      ctxFor(tables, {}, rpcs),
    ),
    "validation",
    400,
    "Pick who this goes to.",
  );
  await refused(
    broadcasts.POST.run(send("POST", { template_id: T9, audience: everyone }, inB), ctxFor(tables, {}, rpcs)),
    "not_found",
    404,
  );
  await refused(
    broadcasts.POST.run(send("POST", { template_id: T2, audience: everyone }, inB), ctxFor(tables, {}, rpcs)),
    "conflict",
    409,
    "not approved by WhatsApp",
  );
  await refused(
    broadcasts.POST.run(
      send("POST", { template_id: T3, params: [], audience: everyone }, inB),
      ctxFor(tables, {}, rpcs),
    ),
    "validation",
    400,
    "This template takes 1 value.",
  );
  const nobody = ctxFor(tables, {}, rpcs);
  await refused(
    broadcasts.POST.run(send("POST", { template_id: T1, params: [], audience: everyone }, inB), nobody),
    "conflict",
    409,
  );
  assert.equal(writes(nobody), 0, "nothing enrolled, nothing scheduled, nothing on the ledger");
});

test("approving and canceling a run: judged where it lives; a run not waiting is refused; a waiting run is skipped and a sending one stopped, each on the ledger; anything ended says so", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    broadcasts: [
      bc(B1, A, { state: "pending_approval" }),
      bc(B2, B, { state: "pending_approval", playbook_id: K1, name: "Win-back · 10 Sep" }),
      bc(B3, B, { state: "sending" }),
      bc(B4, B, { state: "sent" }),
    ],
    decisions: [],
  };
  await refused(approve.POST.run(send("POST"), ctxFor(tables, { id: B1 })), "forbidden", 403);
  await refused(
    approve.POST.run(send("POST"), ctxFor(tables, { id: B3 })),
    "conflict",
    409,
    "This run is not waiting for approval.",
  );
  await refused(approve.POST.run(send("POST"), ctxFor(tables, { id: K9 })), "not_found", 404);
  await refused(approve.POST.run(send("POST"), ctxFor(tables, { id: "not-a-uuid" })), "not_found", 404);
  await refused(cancel.POST.run(send("POST"), ctxFor(tables, { id: B1 })), "forbidden", 403);
  await refused(
    cancel.POST.run(send("POST"), ctxFor(tables, { id: B4 })),
    "conflict",
    409,
    "This broadcast has already been sent.",
  );
  const skipped = await cancel.POST.run(send("POST"), ctxFor(tables, { id: B2 }));
  assert.deepEqual(skipped, { id: B2, state: "canceled", was: "pending_approval", decision_id: skipped.decision_id });
  assert.equal(tables.broadcasts.find((b) => b.id === B2).state, "canceled");
  const stopped = await cancel.POST.run(send("POST"), ctxFor(tables, { id: B3 }));
  assert.equal(stopped.was, "sending");
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.subject_id, d.payload.was]),
    [
      ["cancel_broadcast", B2, "pending_approval"],
      ["cancel_broadcast", B3, "sending"],
    ],
  );
  await refused(cancel.POST.run(send("POST"), ctxFor(tables, { id: B2 })), "conflict", 409, "already been canceled");
});

test("a template says what sends it: the playbooks, the broadcasts a PERSON sent, and the one the Inbox books with -- and nothing, when nothing does", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(T1, B, { name: "winback_offer" }),
      tpl(T2, B, { name: "winback_offer", language: "es_MX" }),
      tpl(T3, B, { name: "autumn_promo", category: "marketing", source: "meta" }),
      // The starter's own three slots -- a name, the business, the link -- which is
      // what makes it the one bookingTemplate picks.
      tpl(T4, B, { name: "booking_link", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
      tpl(T9, A, { name: "elsewhere" }),
    ],
    playbooks: [
      pb(K1, B),
      pb(K2, B, { name: "Second wind", state: "paused" }),
      pb(K9, A, { name: "Another workspace" }),
    ],
    // Two by hand on one message, and one a playbook's run made: a run is the
    // playbook's doing and is not counted a second time as a broadcast.
    broadcasts: [
      bc(B1, B, { template_name: "winback_offer" }),
      bc(B2, B, { template_name: "winback_offer" }),
      bc(B3, B, { template_name: "winback_offer", playbook_id: K1 }),
      bc(B4, A, { template_name: "elsewhere" }),
    ],
  };
  const all = await templates.GET.run(get(`${inB}&all=1`), ctxFor(tables));
  assert.deepEqual(
    all.usedBy.winback_offer.playbooks.map((p) => [p.name, p.paused]),
    [
      ["Win-back", false],
      ["Second wind", true],
    ],
    "both playbooks, and which is paused",
  );
  assert.equal(all.usedBy.winback_offer.broadcasts, 2, "the playbook's own run is not a third broadcast");
  assert.equal(all.usedBy.booking_link.booking, true, "the Inbox books with it");
  assert.equal(
    all.usedBy.autumn_promo,
    undefined,
    "a message nothing sends is absent, and the page reads that as nothing",
  );
  assert.equal(all.usedBy.elsewhere, undefined, "another workspace's playbook and broadcast are not this one's");

  // The composers are picking something to send and never ask, so they do not
  // pay for the two reads.
  const composer = await templates.GET.run(get(inB), ctxFor(tables));
  assert.equal(composer.usedBy, undefined, "the composers' read stays one query");
});

test("what sends a template says what that thing is doing: a playbook's clock, a run waiting on the owner, the latest broadcasts a person sent -- the line under the words", async () => {
  const C = await import("@chanlytics/contracts");
  const K3 = "99999999-9999-4999-8999-999999999993";
  const tables = {
    memberships: both("viewer", "operator"),
    // The Inbox books with the starter's three slots, as it does on a real workspace;
    // without one, bookingTemplate falls back to another template and the Inbox sends that.
    templates: [
      tpl(T1, B, { name: "winback_offer" }),
      tpl(T2, B, { name: "monthly_offer" }),
      tpl(T3, B, { name: "quick_note" }),
      tpl(T4, B, { name: "save_our_number" }),
      tpl(T9, B, { name: "booking_link", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
    ],
    playbooks: [
      pb(K1, B),
      pb(K2, B, {
        name: "The month's offer",
        trigger: "everyone_monthly",
        template_name: "monthly_offer",
        cadence_days: 30,
      }),
      pb(K3, B, { name: "Save our number", trigger: "phoned_only", template_name: "save_our_number", state: "paused" }),
    ],
    broadcasts: [
      // The month's offer has a run waiting on the owner.
      bc(B1, B, { template_name: "monthly_offer", playbook_id: K2, state: "pending_approval" }),
      // Three a person sent with the quick note: the latest two are the ones named.
      bc(B2, B, {
        template_name: "quick_note",
        name: "Labor Day hours",
        state: "sent",
        created_at: "2026-09-01T00:00:00Z",
      }),
      bc(B3, B, {
        template_name: "quick_note",
        name: "Autumn colour",
        state: "sent",
        created_at: "2026-09-12T00:00:00Z",
      }),
      bc(B4, B, {
        template_name: "quick_note",
        name: "VIP regulars",
        state: "scheduled",
        created_at: "2026-09-20T00:00:00Z",
      }),
    ],
  };
  const { usedBy } = await templates.GET.run(get(`${inB}&all=1`), ctxFor(tables));
  assert.equal(
    usedBy.winback_offer.playbooks[0].runs,
    "runs daily at 10:00",
    "the clock, worded by the route from the playbook's own columns",
  );
  assert.equal(C.templateUseWords(usedBy.winback_offer), "Win-back playbook", "one playbook alone says what it is");
  assert.equal(C.templateUseNote(usedBy.winback_offer), "runs daily at 10:00");
  assert.equal(
    usedBy.monthly_offer.playbooks[0].waiting,
    true,
    "a run pending approval is its playbook waiting on the owner",
  );
  assert.equal(C.templateUseNote(usedBy.monthly_offer), "a run is waiting on you", "which outranks its clock");
  assert.equal(C.templateUseWords(usedBy.save_our_number), "Save our number playbook", "paused, still named plainly");
  assert.equal(
    C.templateUseNote(usedBy.save_our_number),
    "paused — nothing goes out",
    "and the line under it says it is paused",
  );
  assert.equal(usedBy.quick_note.broadcasts, 3);
  assert.deepEqual(usedBy.quick_note.recent, ["VIP regulars", "Autumn colour"], "newest first, two at most");
  assert.equal(C.templateUseNote(usedBy.quick_note), "VIP regulars, Autumn colour and 1 more");
  assert.equal(C.templateUseNote(null), null, "nothing sends it: no line under it");
  assert.equal(
    C.runsWords({ trigger: "everyone_monthly", run_hour: 9, cadence_days: 30 }),
    "runs every 30 days at 09:00",
  );
});

test("a template says how many went out and when the last did: the people a run SENT to and what the Inbox sent on it -- never the audience a run was scheduled for", async () => {
  const person = (broadcast_id, contact_id, state, sent_at = null, tenant_id = B) => ({
    broadcast_id,
    contact_id,
    tenant_id,
    state,
    reason: null,
    message_id: null,
    sent_at,
  });
  const msg = (id, over) => ({
    id,
    tenant_id: B,
    conversation_id: "cv1",
    contact_id: "c1",
    channel: "whatsapp",
    direction: "outbound",
    sender: "human",
    type: "template",
    body: "Hi",
    status: "sent",
    external_id: `wamid.${id}`,
    template_name: null,
    created_at: "2026-09-01T00:00:00Z",
    meta: {},
    ...over,
  });
  const tables = {
    memberships: both("viewer", "viewer"),
    templates: [
      tpl(T1, B, { name: "winback_offer" }),
      tpl(T2, B, { name: "winback_offer", language: "es_MX" }),
      tpl(T3, B, { name: "autumn_promo", category: "marketing", source: "meta" }),
      tpl(T4, B, { name: "booking_link", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
      tpl(T9, A, { name: "elsewhere" }),
    ],
    playbooks: [pb(K1, B)],
    // Scheduled for 3 and for 500: the audiences. What left is on the recipient rows.
    broadcasts: [
      bc(B1, B, { template_name: "winback_offer", state: "sent", recipient_count: 3 }),
      bc(B2, B, { template_name: "winback_offer", playbook_id: K1, state: "sent", recipient_count: 500 }),
      bc(B4, A, { template_name: "winback_offer", state: "sent" }),
    ],
    broadcast_recipients: [
      person(B1, "c1", "sent", "2026-09-10T15:00:00Z"),
      person(B1, "c2", "sent", "2026-09-10T15:00:04Z"),
      person(B1, "c3", "skipped"),
      person(B2, "c1", "sent", "2026-09-17T14:00:00Z"),
      person(B2, "c4", "failed"),
      person(B2, "c5", "queued"),
      // Another workspace's run, on a message of the same name.
      person(B4, "c9", "sent", "2026-09-19T09:00:00Z", A),
    ],
    messages: [
      // Sent from the Inbox into a closed window, and taken by WhatsApp.
      msg("m1", { template_name: "booking_link", created_at: "2026-09-18T16:00:00Z" }),
      // Still in its veto window, and one withdrawn: neither has left.
      msg("m2", {
        template_name: "booking_link",
        status: "queued",
        external_id: null,
        created_at: "2026-09-20T10:00:00Z",
      }),
      msg("m3", {
        template_name: "booking_link",
        status: "canceled",
        external_id: null,
        created_at: "2026-09-20T10:05:00Z",
      }),
      // A run's own message is on its recipient row already, and names no template.
      msg("m4", { meta: { source: "broadcast", broadcast_id: B1 }, created_at: "2026-09-10T15:00:00Z" }),
      msg("m5", { tenant_id: A, template_name: "booking_link", created_at: "2026-09-20T11:00:00Z" }),
    ],
  };
  const all = await templates.GET.run(get(`${inB}&all=1`), ctxFor(tables));
  assert.deepEqual(
    all.sends.winback_offer,
    { count: 3, lastAt: "2026-09-17T14:00:00Z" },
    "three people were sent it, not the 503 its runs were scheduled for",
  );
  assert.deepEqual(
    all.sends.booking_link,
    { count: 1, lastAt: "2026-09-18T16:00:00Z" },
    "the Inbox's send, and not the two that never left",
  );
  assert.equal(
    all.sends.autumn_promo,
    undefined,
    "a message nothing ever sent is absent, and the page says it was never sent",
  );
  assert.equal(all.sends.elsewhere, undefined, "another workspace's sends are not this one's");

  const composer = await templates.GET.run(get(inB), ctxFor(tables));
  assert.equal(composer.sends, undefined, "the composers never ask, and never pay for the reads");
});

test("past a thousand, a template's count is still every send: PostgREST answers at most max_rows, and a read that stops there undercounts the busiest messages", async () => {
  // 1,001 runs of one person each, and one run of 1,500: more runs AND more
  // people than one answer holds.
  const ids = Array.from({ length: 1002 }, (_, i) => `run-${String(i).padStart(4, "0")}`);
  const tables = {
    memberships: both("viewer", "viewer"),
    templates: [tpl(T1, B, { name: "visit_reminder" })],
    playbooks: [],
    broadcasts: ids.map((id) => bc(id, B, { template_name: "visit_reminder", state: "sent" })),
    broadcast_recipients: [
      ...ids.slice(0, 1001).map((id) => ({
        broadcast_id: id,
        contact_id: "c0",
        tenant_id: B,
        state: "sent",
        reason: null,
        message_id: null,
        sent_at: "2026-09-01T10:00:00Z",
      })),
      ...Array.from({ length: 1500 }, (_, i) => ({
        broadcast_id: ids[1001],
        contact_id: `c${String(i).padStart(4, "0")}`,
        tenant_id: B,
        state: "sent",
        reason: null,
        message_id: null,
        sent_at: "2026-09-19T10:00:00Z",
      })),
    ],
    messages: [],
  };
  const all = await templates.GET.run(get(`${inB}&all=1`), ctxFor(tables, {}, {}, { maxRows: 1000 }));
  assert.deepEqual(all.sends.visit_reminder, { count: 2501, lastAt: "2026-09-19T10:00:00Z" });
});

test("templates: the composers see the approved and unhidden, Settings sees everything; a submission is judged in Meta's terms at the door, a duplicate is a conflict, and the door itself is the production guard here", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(T1, B),
      tpl(T2, B, { name: "hello_world", hidden_at: "2026-09-01T00:00:00Z" }),
      tpl(T3, B, { name: "offer", meta_status: "pending" }),
      tpl(T4, A, { name: "elsewhere" }),
    ],
  };
  assert.deepEqual(
    (await templates.GET.run(get(inB), ctxFor(tables))).templates.map((t) => t.name),
    ["visit_reminder"],
  );
  assert.deepEqual(
    (await templates.GET.run(get(`${inB}&all=1`), ctxFor(tables))).templates.map((t) => t.name),
    ["hello_world", "offer", "visit_reminder"],
    "Settings, by name",
  );
  await refused(templates.GET.run(get(), ctxFor(tables)), "choose_workspace", 400, "say which one first");
  assert.deepEqual(
    (await templates.GET.run(get(inA), ctxFor(tables))).templates.map((t) => t.name),
    ["elsewhere"],
    "the workspace the tab named",
  );
  await refused(templates.POST.run(send("POST", { name: "x" }, inA), ctxFor(tables)), "forbidden", 403);
  await refused(templates.POST.run(send("POST", {}, inB), ctxFor(tables)), "validation", 400);
  const written = {
    name: "visit_reminder",
    language: "en_US",
    category: "utility",
    body: "See you at {{1}} tomorrow.",
    examples: ["3pm"],
  };
  await refused(templates.POST.run(send("POST", written, inB), ctxFor(tables)), "conflict", 409, "already exists");
  await refused(
    templates.POST.run(send("POST", { ...written, name: "visit_reminder_two" }, inB), ctxFor(tables)),
    "upstream_meta",
    502,
    "Submitting only works on the production dashboard.",
  );
});

test("one template: hidden or titled through the definer doors; deleting is refused while a broadcast still uses it, and stops at the production guard otherwise", async () => {
  const doors = [];
  const rpcs = {
    set_template_hidden: (a) => {
      doors.push(["hidden", a]);
      return null;
    },
    set_template_title: (a) => {
      doors.push(["title", a]);
      return null;
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [tpl(T1, A), tpl(T2, B, { name: "offer" })],
    broadcasts: [bc(B1, B, { template_name: "offer", template_language: "en_US", state: "sending" })],
    playbooks: [],
  };
  await refused(template.PUT.run(send("PUT", { hidden: true }), ctxFor(tables, { id: T1 }, rpcs)), "forbidden", 403);
  await refused(
    template.PUT.run(send("PUT", {}), ctxFor(tables, { id: T2 }, rpcs)),
    "validation",
    400,
    "Say what changes: whether it is hidden, or its title.",
  );
  assert.equal(doors.length, 0);
  assert.deepEqual(await template.PUT.run(send("PUT", { hidden: true }), ctxFor(tables, { id: T2 }, rpcs)), {
    id: T2,
    name: "offer",
    hidden: true,
  });
  assert.deepEqual(
    await template.PUT.run(send("PUT", { title: "  Monthly   offer " }), ctxFor(tables, { id: T2 }, rpcs)),
    { id: T2, name: "offer", title: "Monthly offer" },
  );
  assert.deepEqual(
    await template.PUT.run(send("PUT", { title: null }), ctxFor(tables, { id: T2 }, rpcs)),
    { id: T2, name: "offer", title: null },
    "null clears the title",
  );
  assert.deepEqual(doors, [
    ["hidden", { p_template_id: T2, p_hidden: true }],
    ["title", { p_template_id: T2, p_title: "Monthly offer" }],
    ["title", { p_template_id: T2, p_title: "" }],
  ]);
  await refused(template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T1 })), "forbidden", 403);
  await refused(
    template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T2 })),
    "conflict",
    409,
    "A broadcast is still using this template.",
  );
  tables.broadcasts[0].state = "sent";
  // REGRESSION (C8): a running playbook that sends it would skip every run from then on, and the delete said nothing.
  tables.playbooks.push(
    pb(K1, B, { name: "Win-back", template_name: "offer", template_language: "en_US" }),
    pb(K2, B, { name: "Welcome", template_name: "offer", template_language: "en_US" }),
    pb(K9, B, { name: "Spanish offer", template_name: "offer", template_language: "es" }),
  );
  await refused(
    template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T2 })),
    "conflict",
    409,
    "“Win-back” and “Welcome” still use this template. Pause them, or give them another, first.",
  );
  tables.playbooks[1].state = "paused";
  await refused(
    template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T2 })),
    "conflict",
    409,
    "“Win-back” still uses this template. Pause it, or give it another, first.",
  );
  tables.playbooks[0].state = "paused";
  await refused(
    template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T2 })),
    "upstream_meta",
    502,
    "Deleting only works on the production dashboard.",
  );
  await refused(template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T9 })), "not_found", 404);
});

test("a draft is judged in the body's words before the assistant is asked; the starter set refuses nothing to add, leaves one on file alone and stops at the guard; a sync stops at the guard", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [tpl(T1, B, { name: "visit_reminder" })] };
  await refused(
    draft.POST.run(send("POST", { brief: "Tell them about the new hours", category: "utility" }, inA), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(
    draft.POST.run(send("POST", { brief: "Hi", category: "utility" }, inB), ctxFor(tables)),
    "validation",
    400,
    "Say what you want to tell customers",
  );
  await refused(
    draft.POST.run(send("POST", { brief: "Tell them about the new hours", category: "spam" }, inB), ctxFor(tables)),
    "validation",
    400,
    "A template is marketing or utility.",
  );
  await refused(
    draft.POST.run(
      send("POST", { brief: "Tell them about the new hours", category: "utility", language: "xx_XX" }, inB),
      ctxFor(tables),
    ),
    "validation",
    400,
    "Pick a language from the list.",
  );
  await refused(starter.POST.run(send("POST", {}, inA), ctxFor(tables)), "forbidden", 403);
  await refused(
    starter.POST.run(send("POST", { keys: ["nope"] }, inB), ctxFor(tables)),
    "validation",
    400,
    "Pick at least one starter template, in English or Spanish.",
  );
  const onFile = await starter.POST.run(send("POST", { keys: ["visit_reminder"] }, inB), ctxFor(tables));
  assert.deepEqual(
    onFile.results.map((r) => [r.key, r.status, r.meta_status]),
    [["visit_reminder", "exists", "approved"]],
  );
  assert.deepEqual([onFile.submitted, onFile.existing, onFile.synced, onFile.failed], [0, 1, 0, 0]);
  await refused(
    starter.POST.run(send("POST", { keys: ["welcome_new"] }, inB), ctxFor(tables)),
    "upstream_meta",
    502,
    "Adding templates only works on the production dashboard.",
  );
  await refused(sync.POST.run(send("POST", undefined, inA), ctxFor(tables)), "forbidden", 403);
  await refused(
    sync.POST.run(send("POST", undefined, inB), ctxFor(tables)),
    "upstream_meta",
    502,
    "Syncing only works on the production dashboard.",
  );
});

test("a message written in one more language: judged against what the workspace has before the assistant is asked, and refused where it could not be sent as the same message", async () => {
  const body = "Hi {{1}}, 20% off any service this week.";
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(T1, B, {
        name: "offer",
        language: "en_US",
        category: "MARKETING",
        body_preview: body,
        variables: [{ position: 1, label: "First name", example: "Dani" }],
        components: [{ type: "BODY", text: body }],
      }),
      tpl(T2, B, {
        name: "offer",
        language: "es",
        category: "MARKETING",
        body_preview: "Hola {{1}}, 20% en todo esta semana.",
      }),
      tpl(T3, B, {
        name: "fall_news",
        category: "MARKETING",
        components: [
          { type: "HEADER", format: "TEXT", text: "Fall news" },
          { type: "BODY", text: "See you at {{1}}" },
        ],
      }),
      tpl(T4, A, { name: "theirs" }),
      tpl(T9, B, { name: "unread_words", body_preview: null }),
    ],
  };
  const ask = (b, q = inB) => draft.POST.run(send("POST", b, q), ctxFor(tables));
  // Nothing on file to write it from: said, rather than the assistant asked to translate nothing.
  await refused(
    ask({ language: "fr", translate: { id: T9 } }),
    "validation",
    400,
    "Its words are not on file here yet.",
  );
  // Who may: an operator of THIS workspace, as for any draft.
  await refused(ask({ language: "fr", translate: { id: T1 } }, inA), "forbidden", 403);
  // What it is written from, said once, and a language WhatsApp takes.
  await refused(
    ask({ language: "fr", translate: {} }),
    "validation",
    400,
    "Say which template to write in another language.",
  );
  await refused(
    ask({ language: "fr", translate: { id: T1, starter: "winback_offer" } }),
    "validation",
    400,
    "Say which template to write in another language.",
  );
  await refused(ask({ translate: { id: T1 } }), "validation", 400, "Pick a language from the list.");
  await refused(ask({ language: "tlh", translate: { id: T1 } }), "validation", 400, "Pick a language from the list.");
  // Another workspace's message is not this one's to write.
  await refused(ask({ language: "fr", translate: { id: T4 } }), "not_found", 404, "That template is not on file here.");
  // A language the message already has is not one more.
  await refused(ask({ language: "es", translate: { id: T1 } }), "conflict", 409, "It is on file in Spanish already.");
  await refused(
    ask({ language: "en_US", translate: { id: T1 } }),
    "conflict",
    409,
    "It is written in English (US) already.",
  );
  // A heading would not come with it -- the same name, a different message.
  await refused(ask({ language: "fr", translate: { id: T3 } }), "validation", 400, "it has a heading");
  // The library's own Spanish is added as it is, never paid for twice.
  await refused(ask({ language: "es", translate: { starter: "winback_offer" } }), "validation", 400, "add it as it is");
  await refused(
    ask({ language: "fr", translate: { starter: "nope" } }),
    "not_found",
    404,
    "That starter is not in the library.",
  );
});

test("playbooks: the workspace's with their runs' numbers and the business's clock; a new one is checked the way a broadcast is and started on the ledger", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    playbooks: [pb(K1, A), pb(K2, B, { name: "Welcome", trigger: "new_week" })],
    broadcasts: [bc(B1, B, { playbook_id: K2, state: "sent", run_for: "2026-09-10" })],
    broadcast_recipients: [],
    tenants: [{ id: B, name: "Bayside", timezone: "America/Chicago" }],
    templates: [tpl(T1, B, { name: "winback_offer", category: "marketing" })],
    decisions: [],
  };
  const bayside = await playbooks.GET.run(get(inB), ctxFor(tables));
  assert.deepEqual(
    bayside.playbooks.map((p) => [p.id, p.totals.runs]),
    [[K2, 1]],
  );
  assert.equal(bayside.timezone, "America/Chicago");
  const harbor = await playbooks.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(
    harbor.playbooks.map((p) => p.id),
    [K1],
  );
  await refused(
    playbooks.POST.run(send("POST", { trigger: "quiet_30", template_id: T1, params: [] }), ctxFor(tables)),
    "choose_workspace",
    400,
  );
  await refused(
    playbooks.POST.run(send("POST", { trigger: "quiet_30", template_id: T1, params: [] }, inA), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(playbooks.POST.run(send("POST", {}, inB), ctxFor(tables)), "validation", 400, "Pick what starts it");
  const made = await playbooks.POST.run(
    send("POST", { trigger: "quiet_30", template_id: T1, params: [] }, inB),
    ctxFor(tables),
  );
  assert.equal(made.state, "running");
  const row = tables.playbooks.find((p) => p.id === made.id);
  assert.deepEqual(
    [row.tenant_id, row.trigger, row.policy_class, row.template_name, row.created_by],
    [B, "quiet_30", "reengage", "winback_offer", USER],
  );
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.subject_id]),
    [["start_playbook", made.id]],
  );
});

test("one playbook: pause and resume on the ledger, the same state a no-op, a rewrite re-checked, a delete recorded as a pause; run now stops at the production guard", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    playbooks: [pb(K1, A), pb(K2, B)],
    templates: [tpl(T1, B, { name: "winback_offer", category: "marketing" })],
    decisions: [],
    broadcasts: [],
    broadcast_recipients: [],
  };
  await refused(playbook.PUT.run(send("PUT", { state: "paused" }), ctxFor(tables, { id: K1 })), "forbidden", 403);
  await refused(
    playbook.PUT.run(send("PUT", { state: "sleeping" }), ctxFor(tables, { id: K2 })),
    "validation",
    400,
    "A playbook is running or paused.",
  );
  assert.deepEqual(
    await playbook.PUT.run(send("PUT", { state: "running" }), ctxFor(tables, { id: K2 })),
    { id: K2, state: "running" },
    "the same state changes nothing",
  );
  const paused = await playbook.PUT.run(send("PUT", { state: "paused" }), ctxFor(tables, { id: K2 }));
  assert.deepEqual(paused, { id: K2, state: "paused", decision_id: paused.decision_id });
  assert.equal(tables.playbooks.find((p) => p.id === K2).state, "paused");
  assert.deepEqual(
    await playbook.PUT.run(
      send("PUT", { name: "Renamed", trigger: "quiet_30", template_id: T1, params: [] }),
      ctxFor(tables, { id: K2 }),
    ),
    { id: K2, name: "Renamed", state: "paused" },
  );
  assert.equal(tables.playbooks.find((p) => p.id === K2).name, "Renamed");
  await refused(run.POST.run(send("POST"), ctxFor(tables, { id: K1 })), "forbidden", 403);
  await refused(
    run.POST.run(send("POST"), ctxFor(tables, { id: K2 })),
    "upstream_meta",
    502,
    "Running only works on the production dashboard.",
  );
  await refused(run.POST.run(send("POST"), ctxFor(tables, { id: K9 })), "not_found", 404);
  await refused(playbook.DELETE.run(send("DELETE"), ctxFor(tables, { id: K1 })), "forbidden", 403);
  const gone = await playbook.DELETE.run(send("DELETE"), ctxFor(tables, { id: K2 }));
  assert.deepEqual(gone, { deleted: true, id: K2, decision_id: gone.decision_id });
  assert.ok(!tables.playbooks.some((p) => p.id === K2));
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.payload.deleted ?? false]),
    [
      ["pause_playbook", false],
      ["pause_playbook", true],
    ],
  );
  await refused(
    playbook.DELETE.run(send("DELETE"), ctxFor(tables, { id: K2 })),
    "not_found",
    404,
    "Playbook not found.",
  );
});

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
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"), membership(B, bayside, "bayside", "2026-02-01T00:00:00Z")];
const ctxFor = (tables, params = {}, rpcs = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") => new Request(`http://localhost/api/v1/x${q}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
  id, tenant_id, channel: "whatsapp", name: "visit_reminder", language: "en_US", body_preview: "See you at {{1}}", variables: [], category: "utility",
  meta_status: "approved", quality: null, rejected_reason: null, synced_at: null, source: "starter", hidden_at: null, title: null, ...over,
});
const bc = (id, tenant_id, over = {}) => ({
  id, tenant_id, name: "Reminder", template_id: T1, template_name: "visit_reminder", template_language: "en_US", params: [], audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "scheduled", scheduled_for: "2026-09-10T00:00:00Z", started_at: null, finished_at: null, recipient_count: 3, failure: null, created_at: "2026-09-10T00:00:00Z", playbook_id: null, run_for: null, ...over,
});
const pb = (id, tenant_id, over = {}) => ({
  id, tenant_id, name: "Win-back", trigger: "quiet_30", template_id: T1, template_name: "winback_offer", template_language: "en_US", params: [], policy_class: "reengage", state: "running",
  run_hour: 10, cap_per_run: 50, gap_days: 30, cadence_days: 0, last_run_for: null, last_run_at: null, created_at: "2026-09-01T00:00:00Z", ...over,
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
    broadcasts: [bc(B1, A, { created_at: "2026-09-09T00:00:00Z" }), bc(B2, A, { created_at: "2026-09-10T00:00:00Z", state: "sent" }), bc(B3, B)],
    broadcast_recipients: [{ broadcast_id: B2, tenant_id: A, contact_id: "k1", state: "sent", reason: null, sent_at: "2026-09-10T01:00:00Z", messages: { conversation_id: null, status: "delivered" } }],
  };
  const out = await broadcasts.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(out.broadcasts.map((b) => b.id), [B2, B1], "newest first, this workspace only");
  assert.equal(out.broadcasts[0].counts.sent, 1);
  assert.equal(out.broadcasts[0].counts.delivered, 1, "delivered comes from the receipts");
  const bayside = await broadcasts.GET.run(get(inB), ctxFor(tables));
  assert.deepEqual(bayside.broadcasts.map((b) => b.id), [B3]);
});

test("a broadcast: the workspace must be named, a viewer is refused as a viewer, then the template, its values and the audience are judged in the person's words, before anything is written", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [tpl(T1, B), tpl(T2, B, { name: "offer", meta_status: "pending" }), tpl(T3, B, { name: "with_slot", variables: ["1"] })],
    tenants: [], tenant_config: [], policies: [],
  };
  const rpcs = { people_list: () => [] };
  const everyone = { kind: "everyone" };
  await refused(broadcasts.POST.run(send("POST", { template_id: T1, params: [], audience: everyone }), ctxFor(tables, {}, rpcs)), "choose_workspace", 400);
  await refused(broadcasts.POST.run(send("POST", { template_id: T1, params: [], audience: everyone }, inA), ctxFor(tables, {}, rpcs)), "forbidden", 403);
  await refused(broadcasts.POST.run(send("POST", { template_id: "nope", audience: everyone }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Pick a template.");
  await refused(broadcasts.POST.run(send("POST", { template_id: T1, audience: { kind: "carrier pigeons" } }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Pick who this goes to.");
  await refused(broadcasts.POST.run(send("POST", { template_id: T9, audience: everyone }, inB), ctxFor(tables, {}, rpcs)), "not_found", 404);
  await refused(broadcasts.POST.run(send("POST", { template_id: T2, audience: everyone }, inB), ctxFor(tables, {}, rpcs)), "conflict", 409, "not approved by WhatsApp");
  await refused(broadcasts.POST.run(send("POST", { template_id: T3, params: [], audience: everyone }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "This template takes 1 value.");
  const nobody = ctxFor(tables, {}, rpcs);
  await refused(broadcasts.POST.run(send("POST", { template_id: T1, params: [], audience: everyone }, inB), nobody), "conflict", 409);
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
  await refused(approve.POST.run(send("POST"), ctxFor(tables, { id: B3 })), "conflict", 409, "This run is not waiting for approval.");
  await refused(approve.POST.run(send("POST"), ctxFor(tables, { id: K9 })), "not_found", 404);
  await refused(approve.POST.run(send("POST"), ctxFor(tables, { id: "not-a-uuid" })), "not_found", 404);
  await refused(cancel.POST.run(send("POST"), ctxFor(tables, { id: B1 })), "forbidden", 403);
  await refused(cancel.POST.run(send("POST"), ctxFor(tables, { id: B4 })), "conflict", 409, "This broadcast has already been sent.");
  const skipped = await cancel.POST.run(send("POST"), ctxFor(tables, { id: B2 }));
  assert.deepEqual(skipped, { id: B2, state: "canceled", was: "pending_approval", decision_id: skipped.decision_id });
  assert.equal(tables.broadcasts.find((b) => b.id === B2).state, "canceled");
  const stopped = await cancel.POST.run(send("POST"), ctxFor(tables, { id: B3 }));
  assert.equal(stopped.was, "sending");
  assert.deepEqual(tables.decisions.map((d) => [d.verb, d.subject_id, d.payload.was]), [["cancel_broadcast", B2, "pending_approval"], ["cancel_broadcast", B3, "sending"]]);
  await refused(cancel.POST.run(send("POST"), ctxFor(tables, { id: B2 })), "conflict", 409, "already been canceled");
});

test("templates: the composers see the approved and unhidden, Settings sees everything; a submission is judged in Meta's terms at the door, a duplicate is a conflict, and the door itself is the production guard here", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [tpl(T1, B), tpl(T2, B, { name: "hello_world", hidden_at: "2026-09-01T00:00:00Z" }), tpl(T3, B, { name: "offer", meta_status: "pending" }), tpl(T4, A, { name: "elsewhere" })],
  };
  assert.deepEqual((await templates.GET.run(get(inB), ctxFor(tables))).templates.map((t) => t.name), ["visit_reminder"]);
  assert.deepEqual((await templates.GET.run(get(`${inB}&all=1`), ctxFor(tables))).templates.map((t) => t.name), ["hello_world", "offer", "visit_reminder"], "Settings, by name");
  await refused(templates.GET.run(get(), ctxFor(tables)), "choose_workspace", 400, "say which one first");
  assert.deepEqual((await templates.GET.run(get(inA), ctxFor(tables))).templates.map((t) => t.name), ["elsewhere"], "the workspace the tab named");
  await refused(templates.POST.run(send("POST", { name: "x" }, inA), ctxFor(tables)), "forbidden", 403);
  await refused(templates.POST.run(send("POST", {}, inB), ctxFor(tables)), "validation", 400);
  const written = { name: "visit_reminder", language: "en_US", category: "utility", body: "See you at {{1}} tomorrow.", examples: ["3pm"] };
  await refused(templates.POST.run(send("POST", written, inB), ctxFor(tables)), "conflict", 409, "already exists");
  await refused(templates.POST.run(send("POST", { ...written, name: "visit_reminder_two" }, inB), ctxFor(tables)), "upstream_meta", 502, "Submitting only works on the production dashboard.");
});

test("one template: hidden or titled through the definer doors; deleting is refused while a broadcast still uses it, and stops at the production guard otherwise", async () => {
  const doors = [];
  const rpcs = {
    set_template_hidden: (a) => { doors.push(["hidden", a]); return null; },
    set_template_title: (a) => { doors.push(["title", a]); return null; },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [tpl(T1, A), tpl(T2, B, { name: "offer" })],
    broadcasts: [bc(B1, B, { template_name: "offer", template_language: "en_US", state: "sending" })],
    playbooks: [],
  };
  await refused(template.PUT.run(send("PUT", { hidden: true }), ctxFor(tables, { id: T1 }, rpcs)), "forbidden", 403);
  await refused(template.PUT.run(send("PUT", {}), ctxFor(tables, { id: T2 }, rpcs)), "validation", 400, "Say what changes: whether it is hidden, or its title.");
  assert.equal(doors.length, 0);
  assert.deepEqual(await template.PUT.run(send("PUT", { hidden: true }), ctxFor(tables, { id: T2 }, rpcs)), { id: T2, name: "offer", hidden: true });
  assert.deepEqual(await template.PUT.run(send("PUT", { title: "  Monthly   offer " }), ctxFor(tables, { id: T2 }, rpcs)), { id: T2, name: "offer", title: "Monthly offer" });
  assert.deepEqual(await template.PUT.run(send("PUT", { title: null }), ctxFor(tables, { id: T2 }, rpcs)), { id: T2, name: "offer", title: null }, "null clears the title");
  assert.deepEqual(doors, [
    ["hidden", { p_template_id: T2, p_hidden: true }],
    ["title", { p_template_id: T2, p_title: "Monthly offer" }],
    ["title", { p_template_id: T2, p_title: "" }],
  ]);
  await refused(template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T1 })), "forbidden", 403);
  await refused(template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T2 })), "conflict", 409, "A broadcast is still using this template.");
  tables.broadcasts[0].state = "sent";
  // REGRESSION (C8): a running playbook that sends it would skip every run from then on, and the delete said nothing.
  tables.playbooks.push(pb(K1, B, { name: "Win-back", template_name: "offer", template_language: "en_US" }), pb(K2, B, { name: "Welcome", template_name: "offer", template_language: "en_US" }), pb(K9, B, { name: "Spanish offer", template_name: "offer", template_language: "es" }));
  await refused(template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T2 })), "conflict", 409, "“Win-back” and “Welcome” still send this message. Pause them, or give them another message, first.");
  tables.playbooks[1].state = "paused";
  await refused(template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T2 })), "conflict", 409, "“Win-back” still sends this message. Pause it, or give it another message, first.");
  tables.playbooks[0].state = "paused";
  await refused(template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T2 })), "upstream_meta", 502, "Deleting only works on the production dashboard.");
  await refused(template.DELETE.run(send("DELETE"), ctxFor(tables, { id: T9 })), "not_found", 404);
});

test("a draft is judged in the body's words before the assistant is asked; the starter set refuses nothing to add, leaves one on file alone and stops at the guard; a sync stops at the guard", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [tpl(T1, B, { name: "visit_reminder" })] };
  await refused(draft.POST.run(send("POST", { brief: "Tell them about the new hours", category: "utility" }, inA), ctxFor(tables)), "forbidden", 403);
  await refused(draft.POST.run(send("POST", { brief: "Hi", category: "utility" }, inB), ctxFor(tables)), "validation", 400, "Say what you want to tell customers");
  await refused(draft.POST.run(send("POST", { brief: "Tell them about the new hours", category: "spam" }, inB), ctxFor(tables)), "validation", 400, "A template is marketing or utility.");
  await refused(draft.POST.run(send("POST", { brief: "Tell them about the new hours", category: "utility", language: "xx_XX" }, inB), ctxFor(tables)), "validation", 400, "Pick a language from the list.");
  await refused(starter.POST.run(send("POST", {}, inA), ctxFor(tables)), "forbidden", 403);
  await refused(starter.POST.run(send("POST", { keys: ["nope"] }, inB), ctxFor(tables)), "validation", 400, "Pick at least one starter template, in English or Spanish.");
  const onFile = await starter.POST.run(send("POST", { keys: ["visit_reminder"] }, inB), ctxFor(tables));
  assert.deepEqual(onFile.results.map((r) => [r.key, r.status, r.meta_status]), [["visit_reminder", "exists", "approved"]]);
  assert.deepEqual([onFile.submitted, onFile.existing, onFile.synced, onFile.failed], [0, 1, 0, 0]);
  await refused(starter.POST.run(send("POST", { keys: ["welcome_new"] }, inB), ctxFor(tables)), "upstream_meta", 502, "Adding templates only works on the production dashboard.");
  await refused(sync.POST.run(send("POST", undefined, inA), ctxFor(tables)), "forbidden", 403);
  await refused(sync.POST.run(send("POST", undefined, inB), ctxFor(tables)), "upstream_meta", 502, "Syncing only works on the production dashboard.");
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
  assert.deepEqual(bayside.playbooks.map((p) => [p.id, p.totals.runs]), [[K2, 1]]);
  assert.equal(bayside.timezone, "America/Chicago");
  const harbor = await playbooks.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(harbor.playbooks.map((p) => p.id), [K1]);
  await refused(playbooks.POST.run(send("POST", { trigger: "quiet_30", template_id: T1, params: [] }), ctxFor(tables)), "choose_workspace", 400);
  await refused(playbooks.POST.run(send("POST", { trigger: "quiet_30", template_id: T1, params: [] }, inA), ctxFor(tables)), "forbidden", 403);
  await refused(playbooks.POST.run(send("POST", {}, inB), ctxFor(tables)), "validation", 400, "Pick what starts it");
  const made = await playbooks.POST.run(send("POST", { trigger: "quiet_30", template_id: T1, params: [] }, inB), ctxFor(tables));
  assert.equal(made.state, "running");
  const row = tables.playbooks.find((p) => p.id === made.id);
  assert.deepEqual([row.tenant_id, row.trigger, row.policy_class, row.template_name, row.created_by], [B, "quiet_30", "reengage", "winback_offer", USER]);
  assert.deepEqual(tables.decisions.map((d) => [d.verb, d.subject_id]), [["start_playbook", made.id]]);
});

test("one playbook: pause and resume on the ledger, the same state a no-op, a rewrite re-checked, a delete recorded as a pause; run now stops at the production guard", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    playbooks: [pb(K1, A), pb(K2, B)],
    templates: [tpl(T1, B, { name: "winback_offer", category: "marketing" })],
    decisions: [], broadcasts: [], broadcast_recipients: [],
  };
  await refused(playbook.PUT.run(send("PUT", { state: "paused" }), ctxFor(tables, { id: K1 })), "forbidden", 403);
  await refused(playbook.PUT.run(send("PUT", { state: "sleeping" }), ctxFor(tables, { id: K2 })), "validation", 400, "A playbook is running or paused.");
  assert.deepEqual(await playbook.PUT.run(send("PUT", { state: "running" }), ctxFor(tables, { id: K2 })), { id: K2, state: "running" }, "the same state changes nothing");
  const paused = await playbook.PUT.run(send("PUT", { state: "paused" }), ctxFor(tables, { id: K2 }));
  assert.deepEqual(paused, { id: K2, state: "paused", decision_id: paused.decision_id });
  assert.equal(tables.playbooks.find((p) => p.id === K2).state, "paused");
  assert.deepEqual(await playbook.PUT.run(send("PUT", { name: "Renamed", trigger: "quiet_30", template_id: T1, params: [] }), ctxFor(tables, { id: K2 })), { id: K2, name: "Renamed", state: "paused" });
  assert.equal(tables.playbooks.find((p) => p.id === K2).name, "Renamed");
  await refused(run.POST.run(send("POST"), ctxFor(tables, { id: K1 })), "forbidden", 403);
  await refused(run.POST.run(send("POST"), ctxFor(tables, { id: K2 })), "upstream_meta", 502, "Running only works on the production dashboard.");
  await refused(run.POST.run(send("POST"), ctxFor(tables, { id: K9 })), "not_found", 404);
  await refused(playbook.DELETE.run(send("DELETE"), ctxFor(tables, { id: K1 })), "forbidden", 403);
  const gone = await playbook.DELETE.run(send("DELETE"), ctxFor(tables, { id: K2 }));
  assert.deepEqual(gone, { deleted: true, id: K2, decision_id: gone.decision_id });
  assert.ok(!tables.playbooks.some((p) => p.id === K2));
  assert.deepEqual(tables.decisions.map((d) => [d.verb, d.payload.deleted ?? false]), [["pause_playbook", false], ["pause_playbook", true]]);
  await refused(playbook.DELETE.run(send("DELETE"), ctxFor(tables, { id: K2 })), "not_found", 404, "Playbook not found.");
});

/**
 * The activity log: both ledgers in an owner's words, filtered by person,
 * kind and day. The words are executed per kind; the route is run over a
 * database in memory -- owners only, the noise families hidden unless named,
 * a person's rows including their threads' and calls', a day by the
 * workspace's clock, the page cut after the merge, the actors named.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { activityWords, isActivityNoise, ACTIVITY_KINDS, DECISION_VERBS, DECISION_SUBJECTS, EVENT_KINDS } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/activity/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

test("the words: a sentence per kind, the one or two fields a reader wants, nothing else of the payload", () => {
  assert.equal(activityWords("consent_change", { consent: "opted_in", source: "in_person", note: "SECRET", previous: "unknown" }), "Recorded a consent answer · yes to messages about their visit · in person");
  assert.equal(activityWords("contact.consent_changed", { purpose: "marketing", consent: "opted_out", source: "customer_message", words: "STOP" }), "A consent answer changed · no to offers · customer message");
  assert.equal(activityWords("export", { what: "workspace" }), "Exported data · everything");
  assert.equal(activityWords("export", { what: "people", rows: 312 }), "Exported data · everyone as a CSV · 312 rows");
  assert.equal(activityWords("export", { what: "conversation", messages: 40 }), "Exported data · a conversation");
  assert.equal(activityWords("pause_agent", { receptionist_mode: "never", batch: 12 }), "Paused the receptionist · never · one of 12");
  assert.equal(activityWords("end_call", {}), "Ended a call");
  assert.equal(activityWords("take_over", { how: "transfer", line: "+13055550199" }), "Took over a call · passed to the business's line", "the Inbox's verb on a call, and never the number");
  assert.equal(activityWords("take_over", { paused_until: "2026-09-14T15:00:00Z" }), "Took over a thread");
  assert.equal(activityWords("resume_agent", { receptionist_mode: "inherit" }), "Resumed the receptionist · follows the workspace");
  assert.equal(activityWords("send_broadcast", { name: "Spring offer", recipients: 40, approved: true }), "Sent a broadcast · Spring offer · 40 people · approved by hand");
  assert.equal(activityWords("broadcast.sent", { sent: 38, held: 2 }), "A broadcast finished · 38 got it · 2 held");
  assert.equal(activityWords("settings.changed", { fields: ["hours", "closures", "calendar", "notifications", "extra"] }), "Settings changed · hours, closures, calendar, notifications");
  assert.equal(activityWords("line.texting_rejected", { error: "provided Opt-in information (30896 · MESSAGE_FLOW)", e164: "+19296566623" }), "The carriers sent the registration back · provided Opt-in information (30896 · MESSAGE_FLOW)");
  assert.equal(activityWords("channel.message_template_status_update", { waba_id: "1" }), "Channel · message template status update", "a computed kind reads as words, not as a key");
  assert.equal(activityWords("something.new", null), "Something · new");
  assert.equal(activityWords("message.received", "not an object"), "A customer wrote");
  for (const k of [...DECISION_VERBS, ...EVENT_KINDS]) assert.ok(!/[_.]/.test(activityWords(k, {}).split(" · ")[0]), `${k}: the sentence is words, not the key`);
  assert.equal(isActivityNoise("usage.ask_tokens"), true);
  assert.equal(isActivityNoise("webhook.auth"), true);
  assert.equal(isActivityNoise("message.received"), false);
  assert.deepEqual(ACTIVITY_KINDS.slice(0, 3), ["approve", "edit", "decline"]);
  assert.ok(DECISION_VERBS.includes("export") && DECISION_SUBJECTS.includes("workspace"), "the ledger names an export of the workspace");
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const K1 = "33333333-3333-4333-8333-333333333333";
const USER = "u1";
const membership = (tenant_id, role, slug) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at: "2026-01-01T00:00:00Z" });
const get = (q = "") => new Request(`http://localhost/api/v1/x?workspace=${A}${q}`);
const ctxFor = (tables, rpcs = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params: {} });
const tables = (role = "owner") => ({
  memberships: [membership(A, role, "harbor")],
  tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  conversations: [{ id: C1, tenant_id: A, contact_id: P1 }],
  calls: [{ id: K1, tenant_id: A, contact_id: P1 }],
  decisions: [
    { id: "d1", tenant_id: A, verb: "consent_change", subject_type: "contact", subject_id: P1, actor_type: "user", actor_user_id: "u-ada", payload: { consent: "opted_in", source: "form" }, created_at: "2026-09-11T14:00:00Z" },
    { id: "d2", tenant_id: A, verb: "take_over", subject_type: "conversation", subject_id: C1, actor_type: "user", actor_user_id: "u-bo", payload: {}, created_at: "2026-09-11T15:00:00Z" },
    { id: "d3", tenant_id: A, verb: "export", subject_type: "workspace", subject_id: A, actor_type: "user", actor_user_id: "u-ada", payload: { what: "people", rows: 5 }, created_at: "2026-09-12T02:30:00Z" }, // 22:30 on the 11th, New York
    { id: "d4", tenant_id: B, verb: "export", subject_type: "workspace", subject_id: B, actor_type: "user", actor_user_id: "u-x", payload: {}, created_at: "2026-09-11T16:00:00Z" },
  ],
  events: [
    { id: "e1", tenant_id: A, kind: "message.received", subject_type: "message", subject_id: "m1", data: {}, created_at: "2026-09-11T14:30:00Z" },
    { id: "e2", tenant_id: A, kind: "usage.ask_tokens", subject_type: "user", subject_id: USER, data: { tokens: 400 }, created_at: "2026-09-11T14:45:00Z" },
    { id: "e3", tenant_id: A, kind: "webhook.delivery", subject_type: null, subject_id: null, data: {}, created_at: "2026-09-11T14:50:00Z" },
    { id: "e4", tenant_id: A, kind: "call.recorded", subject_type: "call", subject_id: K1, data: {}, created_at: "2026-09-10T10:00:00Z" },
    { id: "e5", tenant_id: A, kind: "broadcast.sent", subject_type: "broadcast", subject_id: "b1", data: { sent: 3, held: 1 }, created_at: "2026-09-12T13:00:00Z" }, // 09:00 on the 12th
  ],
});
const rpcs = { team_roster: () => [{ membership_id: "m1", member_user_id: "u-ada", email: "ada@example.com", display_name: "Ada", role: "owner" }, { membership_id: "m2", member_user_id: "u-bo", email: "bo@example.com", display_name: "", role: "operator" }] };
const ids = (r) => r.rows.map((x) => x.id);

test("owners read both ledgers newest first, the noise left out, the actors named; a member who is not an owner is refused", async () => {
  assert.deepEqual(route.GET.policy, { kind: "read", scope: "workspace", role: "owner", rate: "aggregate", spend: false });
  const r = await route.GET.run(get(), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(r), ["e-e5", "d-d3", "d-d2", "e-e1", "d-d1", "e-e4"], "merged across the two ledgers, newest first; usage and webhook rows absent");
  assert.deepEqual(r.actors, { "u-ada": "Ada", "u-bo": "bo@example.com" }, "a name, else the address");
  assert.equal(r.rows[1].text, "Exported data · everyone as a CSV · 5 rows");
  assert.equal(r.rows[3].text, "A customer wrote");
  assert.deepEqual(r.page, { offset: 0, limit: 100, has_more: false });
  assert.ok(r.kinds.includes("export") && r.kinds.includes("broadcast.sent"));
  await assert.rejects(route.GET.run(get(), ctxFor(tables("operator"), rpcs)), (e) => e.status === 403);
});

test("filters: a kind by name (noise included when asked), a person with their threads and calls, a day by the workspace's clock; a bad filter is refused", async () => {
  const kind = await route.GET.run(get("&kind=usage.ask_tokens"), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(kind), ["e-e2"], "named, the evidence shows");
  const verb = await route.GET.run(get("&kind=export"), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(verb), ["d-d3"], "this workspace's only");
  const person = await route.GET.run(get(`&person=${P1}`), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(person), ["d-d2", "d-d1", "e-e4"], "their own row, their thread's decision, their call's event");
  const day = await route.GET.run(get("&day=2026-09-11"), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(day), ["d-d3", "d-d2", "e-e1", "d-d1"], "the 11th in New York runs to 04:00Z on the 12th: the late export is in, the morning broadcast is not");
  const next = await route.GET.run(get("&day=2026-09-12"), ctxFor(tables(), rpcs));
  assert.deepEqual(ids(next), ["e-e5"]);
  await assert.rejects(route.GET.run(get("&day=yesterday"), ctxFor(tables(), rpcs)), (e) => e.code === "validation");
  await assert.rejects(route.GET.run(get("&kind=DROP%20TABLE"), ctxFor(tables(), rpcs)), (e) => e.code === "validation");
  await assert.rejects(route.GET.run(get("&person=not-a-uuid"), ctxFor(tables(), rpcs)), (e) => e.code === "validation");
});

test("a page is cut after the merge: the hundred-and-first row is on the next page", async () => {
  const t = tables();
  t.events = Array.from({ length: 130 }, (_, i) => ({ id: `x${i}`, tenant_id: A, kind: "message.received", subject_type: "message", subject_id: `m${i}`, data: {}, created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() }));
  t.decisions = [];
  const first = await route.GET.run(get(), ctxFor(t, rpcs));
  assert.equal(first.rows.length, 100);
  assert.equal(first.page.has_more, true);
  assert.equal(first.rows[0].id, "e-x129");
  const second = await route.GET.run(get("&offset=100"), ctxFor(t, rpcs));
  assert.deepEqual(second.rows.map((r) => r.id).slice(0, 2), ["e-x29", "e-x28"]);
  assert.equal(second.page.has_more, false);
});

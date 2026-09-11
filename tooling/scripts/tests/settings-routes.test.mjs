/**
 * Settings and setup, run through route(): the real route modules, their
 * `run` called with a database in memory. What is proved is the policy each
 * declares and what the handler answers, not its text. The verbs that reach
 * the edge stop at its credential or the production guard on this machine.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { resolveSystemPrompt } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const settings = await import(at("apps/dashboard/app/api/v1/settings/route.ts"));
const policies = await import(at("apps/dashboard/app/api/v1/policies/route.ts"));
const record = await import(at("apps/dashboard/app/api/v1/business-record/route.ts"));
const calendar = await import(at("apps/dashboard/app/api/v1/calendar/route.ts"));
const preview = await import(at("apps/dashboard/app/api/v1/calendar/preview/route.ts"));
const setupRequest = await import(at("apps/dashboard/app/api/v1/setup/request/route.ts"));
const search = await import(at("apps/dashboard/app/api/v1/lines/search/route.ts"));
const retry = await import(at("apps/dashboard/app/api/v1/lines/retry/route.ts"));
const forwarding = await import(at("apps/dashboard/app/api/v1/lines/forwarding/route.ts"));
const forwardingTest = await import(at("apps/dashboard/app/api/v1/lines/forwarding/test/route.ts"));
const connect = await import(at("apps/dashboard/app/api/v1/channels/whatsapp/connect/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const L1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"), membership(B, bayside, "bayside", "2026-02-01T00:00:00Z")];
const ctxFor = (tables, params = {}, rpcs = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") => new Request(`http://localhost/api/v1/x${q}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

const policy = (tenant_id, cls, mode, limits = {}) => ({ id: `${cls}-${tenant_id.slice(0, 1)}`, tenant_id, class: cls, mode, subject_type: null, subject_id: null, limits, updated_at: "2026-09-01T00:00:00Z" });

test("the fourteen declare their policy: the reads open to every member, the calendar counted with the aggregates, every change counted, the owner's where it is the business's identity or its lines", () => {
  const open = { kind: "read", scope: "workspace", role: null, rate: null, spend: false };
  const ws = (role, rate) => ({ kind: "write", scope: "workspace", role, rate, spend: false });
  assert.deepEqual(settings.GET.policy, open);
  assert.deepEqual(policies.GET.policy, open);
  assert.deepEqual(record.GET.policy, open);
  assert.deepEqual(calendar.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(settings.PUT.policy, ws("owner", "settings"));
  assert.deepEqual(policies.PUT.policy, ws("operator", "settings"));
  assert.deepEqual(record.PUT.policy, ws("owner", "business_record"));
  assert.deepEqual(preview.POST.policy, ws("operator", "settings"));
  assert.deepEqual(setupRequest.POST.policy, ws("operator", "setup_request"));
  assert.deepEqual(search.POST.policy, ws("owner", "lines_search"));
  assert.deepEqual(retry.POST.policy, ws("owner", "lines_retry"));
  assert.deepEqual(forwarding.POST.policy, ws("owner", "lines_forwarding"));
  assert.deepEqual(forwardingTest.POST.policy, ws("owner", "lines_forwarding"));
  assert.deepEqual(connect.POST.policy, ws("owner", "settings"));
});

test("the settings read: the workspace the tab named, with its version and the reader's role; a viewer sees the calendar feed masked and an owner whole; a config the parser refuses is its own state", async () => {
  const feed = "https://calendar.example.com/private/abcdef123456/basic.ics";
  const tables = {
    memberships: both("viewer", "owner"),
    tenant_config: [
      { tenant_id: A, config: { calendar: { ical_url: feed } }, version: 3, updated_at: "2026-09-01T00:00:00Z" },
      { tenant_id: B, config: { calendar: { ical_url: feed } }, version: 1, updated_at: "2026-09-01T00:00:00Z" },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_channels: [], google_listings: [],
  };
  const harbor = await settings.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual([harbor.version, harbor.role, harbor.configBroken], [3, "viewer", false]);
  assert.ok(harbor.config.calendar.ical_url.includes("…") && !harbor.config.calendar.ical_url.includes("abcdef123456"), "a viewer learns that a feed is set, not its address");
  assert.ok(harbor.facts && harbor.conflicts, "the resolved facts and their disagreements ride along");
  const bayside = await settings.GET.run(get(inB), ctxFor(tables));
  assert.deepEqual([bayside.version, bayside.role, bayside.config.calendar.ical_url], [1, "owner", feed]);
  const broken = { ...tables, tenant_config: [{ tenant_id: A, config: "nonsense", version: 7, updated_at: "2026-09-01T00:00:00Z" }] };
  const out = await settings.GET.run(get(inA), ctxFor(broken));
  assert.deepEqual([out.config, out.version, out.configBroken], [null, 7, true]);
  assert.ok(Array.isArray(out.issues) && out.issues.length > 0);
  await refused(settings.GET.run(get(inA), ctxFor({ ...tables, tenant_config: [] })), "not_found", 404);
});

test("the settings read composes what the receptionist is told, with the inputs the browser could not see -- the autonomy rows, the platform's facts -- and the clock beside it; nothing when no receptionist is configured", async () => {
  const BRAIN = { business_name: "Harbor Moving", booking_link: "https://book.example/harbor", system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.", fallbacks: { greeting: "g", error: "e", non_text: "n" }, profile: { hours: { mon: { open: "09:00", close: "17:00" } } } };
  const tables = {
    memberships: both("viewer", "owner"),
    tenant_config: [{ tenant_id: A, config: { brain: BRAIN }, version: 2, updated_at: "2026-09-01T00:00:00Z" }],
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_channels: [{ tenant_id: A, kind: "voice", number_e164: "+19295550100", status: "active" }],
    google_listings: [{ tenant_id: A, name: "Harbor Moving", address: "1 Pier St, Brooklyn, NY 11201" }],
    policies: [policy(A, "booking", "ask"), policy(A, "faq", "auto")],
  };
  const out = await settings.GET.run(get(inA), ctxFor(tables));
  const p = out.prompt;
  assert.ok(p, "a configured receptionist has a prompt to show");
  assert.equal(p.tz, "America/New_York");
  assert.ok(p.whatsapp.includes("Booking: when someone wants to book, reschedule or cancel, do not send the booking link."), "the autonomy row reached the composer");
  assert.ok(p.voice.includes("do not offer the booking link"), "the phone's text is the phone's");
  // The facts the platform holds -- here the provisioned line, which the composer states as the number to call -- reach it.
  const known = { workspace: { name: "Harbor", timezone: "America/New_York" }, channels: tables.tenant_channels.map(({ kind, number_e164, status }) => ({ kind, number_e164, status })), listing: { name: "Harbor Moving", address: "1 Pier St, Brooklyn, NY 11201" } };
  const pol = { booking: { mode: "ask" }, faq: { mode: "auto" } };
  assert.equal(p.whatsapp, resolveSystemPrompt(BRAIN, "whatsapp", "America/New_York", new Date(), pol, known), "the edge's call with the edge's arguments");
  assert.notEqual(p.whatsapp, resolveSystemPrompt(BRAIN, "whatsapp", "America/New_York", new Date(), pol, { workspace: known.workspace, channels: [], listing: null }), "the platform's own facts changed the prompt, so they reached the composer");
  assert.match(p.now, /^Right now it is .* \(America\/New_York\)\./, "the clock, in the zone, beside it");
  // No receptionist, no prompt: a blank card would claim the receptionist is told nothing.
  const none = await settings.GET.run(get(inA), ctxFor({ ...tables, tenant_config: [{ tenant_id: A, config: {}, version: 1, updated_at: "2026-09-01T00:00:00Z" }] }));
  assert.equal(none.prompt, null);
});

test("the settings write: the owner's, the workspace named, the body { config, version }, the write schema's refusals named by field, a stale version a conflict, the change on the ledger as fields never values", async () => {
  const tables = {
    memberships: both("viewer", "owner"),
    tenant_config: [{ tenant_id: B, config: {}, version: 1, updated_at: "2026-09-01T00:00:00Z" }],
    events: [],
  };
  await refused(settings.PUT.run(send("PUT", { config: {}, version: 1 }), ctxFor(tables)), "choose_workspace", 400);
  await refused(settings.PUT.run(send("PUT", { config: {}, version: 1 }, inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(settings.PUT.run(send("PUT", {}, inB), ctxFor(tables)), "validation", 400, "Body must be { config, version }.");
  await refused(settings.PUT.run(send("PUT", { config: [], version: 1 }, inB), ctxFor(tables)), "validation", 400, "Config rejected");
  const stale = ctxFor(tables);
  await refused(settings.PUT.run(send("PUT", { config: {}, version: 99 }, inB), stale), "conflict", 409, "Someone else saved settings");
  assert.equal(tables.tenant_config[0].version, 1, "a losing race changes nothing");
  const brain = { business_name: "Bayside Salon", booking_link: "https://book.example/bayside", system_prompt: "You are the receptionist for Bayside Salon, answering customers on WhatsApp in a warm, short way.", fallbacks: { greeting: "Hi! A person will be with you shortly.", error: "Sorry, something went wrong. A person will reply soon.", non_text: "Thanks! A person will look at that and reply." } };
  const saved = await settings.PUT.run(send("PUT", { config: { brain }, version: 1 }, inB), ctxFor(tables));
  assert.equal(saved.version, 2);
  assert.equal(saved.config.brain.business_name, "Bayside Salon");
  assert.deepEqual([tables.tenant_config[0].version, tables.tenant_config[0].updated_by], [2, USER], "the row records its author");
  assert.deepEqual(tables.events.map((e) => [e.kind, e.subject_id, e.data.fields, e.data.by, e.data.version]), [["settings.changed", B, ["booking_link", "business_name", "fallbacks", "system_prompt"], USER, 2]], "the keys that changed, never their values");
  await refused(settings.PUT.run(send("PUT", { config: {}, version: 1 }, inB), ctxFor({ ...tables, tenant_config: [] })), "conflict", 409, "no settings record yet");
});

test("the autonomy matrix: the workspace's own rows, read by every member; changed by an operator, in the words each refusal has; a delay edit keeps the mode, and limits are merged never replaced", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    policies: [
      policy(A, "reply", "auto"), policy(A, "money", "ask"),
      { ...policy(A, "reply", "never"), id: "person", subject_type: "contact", subject_id: "k1" },
      policy(B, "reply", "auto", { max_replies_day: 50, reply_delay_ms: 15000 }), policy(B, "booking", "auto"),
    ],
  };
  const harbor = await policies.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(harbor.policies.map((p) => p.class), ["money", "reply"], "the workspace's rows, by class; a person's own row is not the matrix");
  assert.equal(harbor.role, "viewer");
  await refused(policies.PUT.run(send("PUT", { class: "reply", mode: "ask" }, inA), ctxFor(tables)), "forbidden", 403);
  await refused(policies.PUT.run(send("PUT", { class: "nope", mode: "ask" }, inB), ctxFor(tables)), "validation", 400, "Unknown policy class.");
  await refused(policies.PUT.run(send("PUT", { class: "reply", mode: "loud" }, inB), ctxFor(tables)), "validation", 400, "Unknown mode.");
  await refused(policies.PUT.run(send("PUT", { class: "booking", mode: "veto" }, inB), ctxFor(tables)), "validation", 400, "Only replies can be held for review");
  await refused(policies.PUT.run(send("PUT", { class: "booking", mode: "never" }, inB), ctxFor(tables)), "validation", 400, "there is no \"never\"");
  await refused(policies.PUT.run(send("PUT", { class: "reply", replyDelayMs: 5 }, inB), ctxFor(tables)), "validation", 400, "The reply delay must be between");
  const changed = await policies.PUT.run(send("PUT", { class: "reply", mode: "ask", replyDelayMs: 30000 }, inB), ctxFor(tables));
  assert.deepEqual([changed.policy.class, changed.policy.mode, changed.policy.limits], ["reply", "ask", { max_replies_day: 50, reply_delay_ms: 30000 }], "the delay set, the day's cap kept");
  const delayOnly = await policies.PUT.run(send("PUT", { class: "reply", replyDelayMs: 45000 }, inB), ctxFor(tables));
  assert.deepEqual([delayOnly.policy.mode, delayOnly.policy.limits.reply_delay_ms], ["ask", 45000], "a delay edit carries no mode: the row keeps the one it has");
});

test("the business record: read by every member, nothing on file is null not a blank form; written by the owner, refused in the owner's words before anything leaves for the carriers", async () => {
  const tables = { memberships: both("operator", "owner"), business_records: [] };
  assert.deepEqual(await record.GET.run(get(inA), ctxFor(tables)), { record: null, path: null, problems: {} });
  const onFile = { ...tables, business_records: [{ tenant_id: B, created_at: "2026-09-01T00:00:00Z", legal_name: "Bayside LLC", tax_id: "12-3456789" }] };
  const out = await record.GET.run(get(inB), ctxFor(onFile));
  assert.equal(out.record.legal_name, "Bayside LLC");
  assert.ok(!("tenant_id" in out.record) && !("created_at" in out.record), "the row's plumbing stays behind");
  assert.ok(typeof out.path === "string" && typeof out.problems === "object");
  await refused(record.PUT.run(send("PUT", { record: {}, path: "standard" }, inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(record.PUT.run(send("PUT", { record: {}, path: "nope" }, inB), ctxFor(tables)), "validation", 400, "That is not a registration we file.");
  const missing = ctxFor(tables);
  await refused(record.PUT.run(send("PUT", { record: {}, path: "standard" }, inB), missing), "validation", 400);
  assert.equal(writes(missing), 0);
});

test("the calendar: a read of the workspace's week, counted with the aggregates; a preview is refused for a blank or a private address before anything is fetched", async () => {
  const tables = { memberships: both("viewer", "operator"), tenants: [], tenant_config: [] };
  const week = await calendar.GET.run(get(`?days=3&workspace=${A}&workspace=${A}`), ctxFor(tables));
  assert.ok(week.calendar && typeof week.calendar === "object", "the week as the receptionist reads it, even with no feed");
  await refused(preview.POST.run(send("POST", { url: "https://calendar.example.com/x.ics" }, inA), ctxFor(tables)), "forbidden", 403);
  await refused(preview.POST.run(send("POST", {}, inB), ctxFor(tables)), "validation", 400, "Paste the calendar's iCal address first.");
  await refused(preview.POST.run(send("POST", { url: "http://127.0.0.1/cal.ics" }, inB), ctxFor(tables)), "validation", 400, "full https:// or webcal:// address on the internet");
});

test("a setup request: an operator's, one thing it can ask for, recorded through the door, and the platform told only on this machine's terms", async () => {
  const asked = [];
  const rpcs = { setup_request: (a) => { asked.push(a); return { already: asked.length > 1, id: "r1" }; } };
  const tables = { memberships: both("viewer", "operator") };
  await refused(setupRequest.POST.run(send("POST", { what: "line" }, inA), ctxFor(tables, {}, rpcs)), "forbidden", 403);
  await refused(setupRequest.POST.run(send("POST", { what: "unicorn" }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Say what you are asking for.");
  await refused(setupRequest.POST.run(send("POST", {}, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Say what you are asking for.");
  assert.equal(asked.length, 0);
  const first = await setupRequest.POST.run(send("POST", { what: "line" }, inB), ctxFor(tables, {}, rpcs));
  assert.deepEqual(first, { request: { already: false, id: "r1" }, told: false }, "not production: the mailbox is not reached, and the answer says so");
  assert.deepEqual(asked, [{ p_tenant_id: B, p_what: "line" }]);
  const again = await setupRequest.POST.run(send("POST", { what: "line" }, inB), ctxFor(tables, {}, rpcs));
  assert.equal(again.told, false, "a repeat is never told twice");
});

test("lines: searching, retrying and forwarding are the owner's; each body is judged in its words; the forwarding doors get the normalized number", async () => {
  const doors = [];
  const rpcs = {
    line_forwarding_set: (a) => { doors.push(["set", a]); return L1; },
    line_forwarding_test: (a) => { doors.push(["test", a]); return { ok: true, until: "2026-09-11T10:30:00Z" }; },
  };
  const tables = { memberships: both("operator", "owner") };
  await refused(search.POST.run(send("POST", { area_code: 305 }, inA), ctxFor(tables, {}, rpcs)), "forbidden", 403, "Only an owner");
  await refused(search.POST.run(send("POST", { area_code: "30" }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Give a three-digit area code");
  await refused(search.POST.run(send("POST", { area_code: 305 }, inB), ctxFor(tables, {}, rpcs)), "internal", 502, "no_edge_credential");
  await refused(retry.POST.run(send("POST", { line_id: L1 }, inA), ctxFor(tables, {}, rpcs)), "forbidden", 403);
  await refused(retry.POST.run(send("POST", { line_id: "x" }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Which line?");
  await refused(forwarding.POST.run(send("POST", { number: "+1 305 555 0100", carrier: "verizon", mode: "always" }, inA), ctxFor(tables, {}, rpcs)), "forbidden", 403);
  await refused(forwarding.POST.run(send("POST", {}, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Give the number you keep");
  await refused(forwarding.POST.run(send("POST", { number: "+1 305 555 0100", carrier: "sprint", mode: "always" }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Pick your carrier.");
  await refused(forwarding.POST.run(send("POST", { number: "+1 305 555 0100", carrier: "verizon", mode: "sometimes" }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Pick which calls to forward.");
  assert.equal(doors.length, 0);
  assert.deepEqual(await forwarding.POST.run(send("POST", { number: "+1 (305) 555-0100", carrier: "verizon", mode: "unanswered" }, inB), ctxFor(tables, {}, rpcs)), { line_id: L1 });
  await refused(forwardingTest.POST.run(send("POST", { line_id: L1 }, inA), ctxFor(tables, {}, rpcs)), "forbidden", 403);
  await refused(forwardingTest.POST.run(send("POST", { line_id: "x" }, inB), ctxFor(tables, {}, rpcs)), "validation", 400, "Which line?");
  assert.deepEqual(await forwardingTest.POST.run(send("POST", { line_id: L1 }, inB), ctxFor(tables, {}, rpcs)), { test: { ok: true, until: "2026-09-11T10:30:00Z" } });
  assert.deepEqual(doors, [
    ["set", { p_tenant_id: B, p_number: "+13055550100", p_carrier: "verizon", p_mode: "unanswered", p_test_from: null }],
    ["test", { p_tenant_id: B, p_line_id: L1 }],
  ]);
});

test("connecting a WhatsApp number: the owner's, the sign-up ids validated at the door, and on this machine the exchange stops at the production guard with nothing on the ledger", async () => {
  const tables = { memberships: both("operator", "owner"), decisions: [] };
  const signup = { code: "AQD-sign-up-code", phone_number_id: "123456789012", waba_id: "987654321098" };
  await refused(connect.POST.run(send("POST", signup, inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(connect.POST.run(send("POST", {}, inB), ctxFor(tables)), "validation", 400, "The sign-up code is missing.");
  await refused(connect.POST.run(send("POST", { ...signup, waba_id: "x" }, inB), ctxFor(tables)), "validation", 400, "did not hand back a number and an account");
  const guard = ctxFor(tables);
  await refused(connect.POST.run(send("POST", signup, inB), guard), "upstream_meta", 502, "Connecting only works on the production dashboard.");
  assert.equal(writes(guard), 0);
  assert.equal(tables.decisions.length, 0);
});

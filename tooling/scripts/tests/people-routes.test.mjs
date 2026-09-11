/**
 * People and lists, run through route(): the real route modules, their `run`
 * called with a database in memory. What is proved is the policy each
 * declares and what the handler answers, not its text. The erasure's happy
 * path reaches the jobs ledger through the service client, so only its doors
 * are run here; erase.test.mjs holds its order.
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
const contacts = await import(at("apps/dashboard/app/api/v1/contacts/route.ts"));
const person = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));
const details = await import(at("apps/dashboard/app/api/v1/contacts/[id]/details/route.ts"));
const receptionist = await import(at("apps/dashboard/app/api/v1/contacts/[id]/receptionist/route.ts"));
const lists = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));
const list = await import(at("apps/dashboard/app/api/v1/segments/[id]/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"), membership(B, bayside, "bayside", "2026-02-01T00:00:00Z")];
const ctxFor = (tables, params = {}, rpcs = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") => new Request(`http://localhost/api/v1/x${q}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function refused(p, code, status, why) {
  await assert.rejects(p, (e) => { assert.equal(e.code, code, why ?? e.message); if (status) assert.equal(e.status, status, why); return true; });
}
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

const contact = (id, tenant_id, over = {}) => ({ id, tenant_id, phone_e164: "+15550000001", display_name: "Ada", erased_at: null, marketing_consent: null, notes: null, ...over });
/** A row as people_list answers it. */
const personRow = (id, over = {}) => ({ id, display_name: "Ada", phone_e164: "+15550000001", consent: "opted_in", dnc: false, ...over });
const pol = (tenant_id, subject_type, subject_id, mode) => ({ tenant_id, class: "reply", subject_type, subject_id, mode });

test("the ten declare their policy: the reads open to every member, the changes counted, the erasure and the receptionist the owner's, every single-row verb judged where its row lives", () => {
  const open = { kind: "read", role: null, rate: null, spend: false, scope: "workspace" };
  assert.deepEqual(contacts.GET.policy, open);
  assert.deepEqual(person.GET.policy, open);
  assert.deepEqual(lists.GET.policy, open);
  assert.deepEqual(contacts.POST.policy, { kind: "write", scope: "workspace", role: "operator", rate: "person_create", spend: false });
  assert.deepEqual(person.DELETE.policy, { kind: "write", scope: "row", role: "owner", rate: "erase", spend: false });
  assert.deepEqual(details.PUT.policy, { kind: "write", scope: "row", role: "operator", rate: "person_edit", spend: false });
  assert.deepEqual(receptionist.PUT.policy, { kind: "write", scope: "row", role: "owner", rate: "person_mode", spend: false });
  assert.deepEqual(lists.POST.policy, { kind: "write", scope: "workspace", role: "operator", rate: "lists", spend: false });
  assert.deepEqual(list.PUT.policy, { kind: "write", scope: "row", role: "operator", rate: "lists", spend: false });
  assert.deepEqual(list.DELETE.policy, { kind: "write", scope: "row", role: "operator", rate: "lists", spend: false });
});

test("the people list is the workspace the tab named: each person with their reply mode, and the calendar's state when none is connected", async () => {
  const tables = { memberships: both("viewer", "viewer"), policies: [pol(A, null, null, "auto"), pol(A, "contact", P2, "never")], tenants: [], tenant_config: [] };
  const rpcs = { people_list: (a) => (a.p_tenant_id === A ? [personRow(P1), personRow(P2)] : [personRow(P3)]) };
  const out = await contacts.GET.run(get(), ctxFor(tables, {}, rpcs));
  assert.deepEqual(out.people.map((p) => [p.id, p.effective_reply_mode, p.visits]), [[P1, "auto", null], [P2, "never", null]]);
  assert.equal(out.calendar.state, "none");
  const bayside = await contacts.GET.run(get(`?workspace=${B}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(bayside.people.map((p) => p.id), [P3]);
});

test("adding a person: the workspace must be named, a viewer is refused as a viewer, a number that is not one is refused in the product's words, and the door gets the normalized number", async () => {
  const made = [];
  const rpcs = { create_person: (a) => { made.push(a); return { contact_id: P1, existed: false }; } };
  const tables = { memberships: both("viewer", "operator") };
  await refused(contacts.POST.run(send("POST", { phone: "+1 555 000 0001" }), ctxFor(tables, {}, rpcs)), "choose_workspace", 400);
  await refused(contacts.POST.run(send("POST", { phone: "abc" }, `?workspace=${A}`), ctxFor(tables, {}, rpcs)), "forbidden", 403, "a viewer, whatever the body says");
  await refused(contacts.POST.run(send("POST", { phone: "abc" }, `?workspace=${B}`), ctxFor(tables, {}, rpcs)), "validation", 400);
  assert.equal(made.length, 0, "nothing reached the door");
  const out = await contacts.POST.run(send("POST", { phone: "+1 (555) 000-0001", name: "  Ada  ", source: "calendar" }, `?workspace=${B}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(out, { contact_id: P1, existed: false });
  assert.deepEqual(made, [{ p_tenant_id: B, p_phone_e164: "+15550000001", p_display_name: "Ada", p_source: "calendar" }]);
});

test("one person in full: the row with both reply modes, the notes, where they came from, the booking link; a person not in the named workspace is a 404", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    contacts: [contact(P1, A, { notes: "Sees Sofia" })],
    contact_identities: [{ contact_id: P1, channel: "whatsapp", external_id: "15550000001", created_at: "2026-08-01T00:00:00Z" }],
    conversations: [], calls: [],
    policies: [pol(A, null, null, "auto"), pol(A, "contact", P1, "ask")],
    events: [{ tenant_id: A, kind: "contact.added", subject_type: "contact", subject_id: P1, data: { source: "calendar", title: "Colour" }, created_at: "2026-08-01T00:00:00Z" }],
    tenant_config: [{ tenant_id: A, config: { brain: { booking_link: " https://book.example/melany " } } }],
    tenants: [],
  };
  const rpcs = { people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow(P1)] : []) };
  const { person: p } = await person.GET.run(get(), ctxFor(tables, { id: P1 }, rpcs));
  assert.equal(p.row.id, P1);
  assert.equal(p.row.effective_reply_mode, "ask");
  assert.equal(p.receptionist_mode, "ask");
  assert.equal(p.workspace_reply_mode, "auto");
  assert.equal(p.notes, "Sees Sofia");
  assert.equal(p.booking_link, "https://book.example/melany");
  assert.deepEqual(p.added, { at: "2026-08-01T00:00:00Z", source: "calendar", title: "Colour" });
  assert.equal(p.identities.length, 1);
  assert.deepEqual(p.conversations, []);
  assert.equal(p.visits, undefined, "no calendar connected");
  await refused(person.GET.run(get(`?workspace=${B}`), ctxFor(tables, { id: P1 }, rpcs)), "not_found", 404, "the workspace named on the request is the door");
  await refused(person.GET.run(get(), ctxFor(tables, { id: "not-a-uuid" }, rpcs)), "not_found", 404);
});

test("erasing a person is the owner's, judged where the person lives, and a refusal touches nothing", async () => {
  const tables = { memberships: both("owner", "operator"), contacts: [contact(P1, A), contact(P2, B)] };
  const operator = ctxFor(tables, { id: P2 });
  await refused(person.DELETE.run(send("DELETE"), operator), "forbidden", 403, "an operator in bayside, though an owner in harbor");
  assert.equal(writes(operator), 0);
  await refused(person.DELETE.run(send("DELETE"), ctxFor(tables, { id: P3 })), "not_found", 404);
  await refused(person.DELETE.run(send("DELETE"), ctxFor(tables, { id: "not-a-uuid" })), "not_found", 404);
});

test("details: an operator where the person lives, a name or notes or both, trimmed, through the two doors; an erased person is a 404", async () => {
  const doors = [];
  const rpcs = {
    set_person_name: (a) => { doors.push(["name", a]); return { name: a.p_name || null }; },
    set_person_notes: (a) => { doors.push(["notes", a]); return { notes: a.p_notes || null }; },
  };
  const tables = { memberships: both("viewer", "operator"), contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })] };
  await refused(details.PUT.run(send("PUT", { name: "Ada" }), ctxFor(tables, { id: P1 }, rpcs)), "forbidden", 403);
  await assert.rejects(details.PUT.run(send("PUT", {}), ctxFor(tables, { id: P2 }, rpcs)), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /Send a name, notes, or both\./);
    return true;
  });
  await refused(details.PUT.run(send("PUT", { name: "Ada" }), ctxFor(tables, { id: P3 }, rpcs)), "not_found", 404, "erased");
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  const out = await details.PUT.run(send("PUT", { name: "  Ada Lovelace  ", notes: " Sees Sofia " }), ctxFor(tables, { id: P2 }, rpcs));
  assert.deepEqual(out, { contact_id: P2, name: "Ada Lovelace", notes: "Sees Sofia" });
  assert.deepEqual(doors, [["name", { p_contact_id: P2, p_name: "Ada Lovelace" }], ["notes", { p_contact_id: P2, p_notes: "Sees Sofia" }]]);
  const cleared = await details.PUT.run(send("PUT", { notes: "" }), ctxFor(tables, { id: P2 }, rpcs));
  assert.deepEqual(cleared, { contact_id: P2, notes: null }, "an empty string clears");
});

test("the receptionist for one person: owner-only where they live, one of four modes, a policies row replaced not duplicated and removed by inherit, each change on the ledger", async () => {
  const tables = { memberships: both("operator", "owner"), contacts: [contact(P1, A), contact(P2, B)], policies: [], decisions: [] };
  await refused(receptionist.PUT.run(send("PUT", { mode: "never" }), ctxFor(tables, { id: P1 })), "forbidden", 403, "an operator in harbor, though an owner in bayside");
  await assert.rejects(receptionist.PUT.run(send("PUT", { mode: "loud" }), ctxFor(tables, { id: P2 })), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /Mode must be one of: auto, ask, never, inherit\./);
    return true;
  });
  assert.equal(tables.policies.length, 0);
  assert.deepEqual(await receptionist.PUT.run(send("PUT", { mode: "never" }), ctxFor(tables, { id: P2 })), { contact_id: P2, mode: "never" });
  assert.deepEqual(tables.policies.map((p) => [p.tenant_id, p.class, p.subject_type, p.subject_id, p.mode]), [[B, "reply", "contact", P2, "never"]]);
  await receptionist.PUT.run(send("PUT", { mode: "ask" }), ctxFor(tables, { id: P2 }));
  assert.deepEqual(tables.policies.map((p) => p.mode), ["ask"], "replaced, not duplicated");
  assert.deepEqual(await receptionist.PUT.run(send("PUT", { mode: "inherit" }), ctxFor(tables, { id: P2 })), { contact_id: P2, mode: null });
  assert.equal(tables.policies.length, 0, "inherit removes the person's own row");
  assert.deepEqual(tables.decisions.map((d) => [d.verb, d.subject_id, d.payload.receptionist_mode]), [["pause_agent", P2, "never"], ["pause_agent", P2, "ask"], ["resume_agent", P2, "inherit"]]);
});

test("lists: one workspace's with their members' ids; a viewer may not make one; the name is refused in the helper's words and kept tidy", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    segments: [{ id: S1, tenant_id: A, name: "Regulars" }, { id: S2, tenant_id: B, name: "VIP" }],
    segment_members: [{ segment_id: S1, contact_id: P1, tenant_id: A }, { segment_id: S2, contact_id: P2, tenant_id: B }],
  };
  assert.deepEqual(await lists.GET.run(get(), ctxFor(tables)), { lists: [{ id: S1, name: "Regulars", ids: [P1] }] });
  assert.deepEqual(await lists.GET.run(get(`?workspace=${B}`), ctxFor(tables)), { lists: [{ id: S2, name: "VIP", ids: [P2] }] });
  await refused(lists.POST.run(send("POST", { name: "Colour club" }, `?workspace=${A}`), ctxFor(tables)), "forbidden", 403);
  await refused(lists.POST.run(send("POST", { name: "   " }, `?workspace=${B}`), ctxFor(tables)), "validation", 400);
  const made = await lists.POST.run(send("POST", { name: "  Colour   club " }, `?workspace=${B}`), ctxFor(tables));
  assert.deepEqual(made, { id: made.id, name: "Colour club", ids: [] });
  assert.deepEqual(tables.segments.filter((s) => s.id === made.id).map((s) => [s.tenant_id, s.created_by]), [[B, USER]]);
});

test("one list: an operator where it lives; rename, add and remove in one request, adding twice is not an error; a delete removes it once", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    segments: [{ id: S1, tenant_id: A, name: "Regulars" }, { id: S2, tenant_id: B, name: "VIP" }],
    segment_members: [{ segment_id: S2, contact_id: P2, tenant_id: B }],
  };
  await refused(list.PUT.run(send("PUT", { name: "Best" }), ctxFor(tables, { id: S1 })), "forbidden", 403);
  await refused(list.PUT.run(send("PUT", {}), ctxFor(tables, { id: S2 })), "validation", 400, "nothing to change");
  await refused(list.PUT.run(send("PUT", { add: ["nope"] }), ctxFor(tables, { id: S2 })), "validation", 400);
  assert.deepEqual(await list.PUT.run(send("PUT", { name: " Best ", add: [P3, P3], remove: [P2] }), ctxFor(tables, { id: S2 })), { id: S2, name: "Best", ids: [P3] });
  assert.equal(tables.segments.find((s) => s.id === S2).name, "Best");
  assert.deepEqual(await list.PUT.run(send("PUT", { add: [P3] }), ctxFor(tables, { id: S2 })), { id: S2, name: "Best", ids: [P3] }, "adding someone twice is not an error");
  assert.equal(tables.segment_members.length, 1);
  await refused(list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S1 })), "forbidden", 403);
  assert.deepEqual(await list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 })), { deleted: true, id: S2 });
  assert.ok(!tables.segments.some((s) => s.id === S2));
  await refused(list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 })), "not_found", 404, "gone");
});

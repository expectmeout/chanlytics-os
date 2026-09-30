/**
 * People and lists, run through route(): the real route modules, their `run`
 * called with a database in memory. What is proved is the policy each
 * declares and what the handler answers, not its text. The erasure's happy
 * path reaches the jobs ledger through the service client, which is pointed at
 * the same database for the one test of what it hands the Ask scrub; the rest
 * run its doors, and erase.test.mjs holds its order.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { DEAL_REFUSALS } from "@chanlytics/contracts";
import { asText } from "../_log-lines.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { erasureKeys } = await import(at("apps/dashboard/src/server/people/erasure.ts"));
const contacts = await import(at("apps/dashboard/app/api/v1/contacts/route.ts"));
const receptionistMany = await import(at("apps/dashboard/app/api/v1/contacts/receptionist/route.ts"));
const notesMany = await import(at("apps/dashboard/app/api/v1/contacts/notes/route.ts"));
const views = await import(at("apps/dashboard/app/api/v1/views/route.ts"));
const viewSet = await import(at("apps/dashboard/app/api/v1/views/[page]/route.ts"));
const person = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));
const details = await import(at("apps/dashboard/app/api/v1/contacts/[id]/details/route.ts"));
const deal = await import(at("apps/dashboard/app/api/v1/contacts/[id]/deal/route.ts"));
const noteWrite = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/route.ts"));
const noteRemove = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/remove/route.ts"));
const noteDecide = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/decide/route.ts"));
const receptionist = await import(at("apps/dashboard/app/api/v1/contacts/[id]/receptionist/route.ts"));
const lists = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));
const list = await import(at("apps/dashboard/app/api/v1/segments/[id]/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const D1 = "dddddddd-1111-4111-8111-dddddddddddd";
const M1 = "eeeeeeee-1111-4111-8111-eeeeeeeeeeee";
const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
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
const inA = `?workspace=${A}`;
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
async function refused(p, code, status, why) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, why ?? e.message);
    if (status) assert.equal(e.status, status, why);
    return true;
  });
}
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

const contact = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  phone_e164: "+15550000001",
  display_name: "Ada",
  erased_at: null,
  marketing_consent: null,
  notes: null,
  ...over,
});
/** A row as people_list answers it. */
const personRow = (id, over = {}) => ({
  id,
  display_name: "Ada",
  phone_e164: "+15550000001",
  consent: "opted_in",
  dnc: false,
  ...over,
});
const pol = (tenant_id, subject_type, subject_id, mode) => ({
  tenant_id,
  class: "reply",
  subject_type,
  subject_id,
  mode,
});

test("the ten declare their policy: the reads open to every member, the changes counted, the erasure and the receptionist the owner's, every single-row verb judged where its row lives", () => {
  const open = { kind: "read", role: null, rate: null, spend: false, scope: "workspace" };
  assert.deepEqual(contacts.GET.policy, open);
  assert.deepEqual(person.GET.policy, open);
  assert.deepEqual(lists.GET.policy, open);
  assert.deepEqual(contacts.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "person_create",
    spend: false,
  });
  assert.deepEqual(person.DELETE.policy, {
    kind: "write",
    fresh: true,
    scope: "row",
    role: "owner",
    rate: "erase",
    spend: false,
  });
  assert.deepEqual(details.PUT.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "person_edit",
    spend: false,
  });
  assert.deepEqual(receptionist.PUT.policy, {
    kind: "write",
    scope: "row",
    role: "owner",
    rate: "person_mode",
    spend: false,
  });
  assert.deepEqual(lists.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "lists",
    spend: false,
  });
  assert.deepEqual(list.PUT.policy, { kind: "write", scope: "row", role: "operator", rate: "lists", spend: false });
  assert.deepEqual(list.DELETE.policy, { kind: "write", scope: "row", role: "operator", rate: "lists", spend: false });
});

test("the people list is the workspace the tab named: each person with their reply mode, and the calendar's state when none is connected", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    policies: [pol(A, null, null, "auto"), pol(A, "contact", P2, "never")],
    tenants: [],
    tenant_config: [],
  };
  const rpcs = { people_list: (a) => (a.p_tenant_id === A ? [personRow(P1), personRow(P2)] : [personRow(P3)]) };
  const out = await contacts.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.deepEqual(
    out.people.map((p) => [p.id, p.effective_reply_mode, p.visits]),
    [
      [P1, "auto", null],
      [P2, "never", null],
    ],
  );
  assert.equal(out.calendar.state, "none");
  assert.deepEqual(
    out.page,
    { q: null, offset: 0, limit: 1000, total: 0, has_more: false, next: null },
    "the page: counted where the rows are (none in this fixture's contacts table)",
  );
  const bayside = await contacts.GET.run(get(`?workspace=${B}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(
    bayside.people.map((p) => p.id),
    [P3],
  );
});

test("adding a person: the workspace must be named, a viewer is refused as a viewer, a number that is not one is refused in the product's words, and the door gets the normalized number", async () => {
  const made = [];
  const rpcs = {
    create_person: (a) => {
      made.push(a);
      return { contact_id: P1, existed: false };
    },
  };
  const tables = { memberships: both("viewer", "operator") };
  await refused(
    contacts.POST.run(send("POST", { phone: "+1 555 000 0001" }), ctxFor(tables, {}, rpcs)),
    "choose_workspace",
    400,
  );
  await refused(
    contacts.POST.run(send("POST", { phone: "abc" }, `?workspace=${A}`), ctxFor(tables, {}, rpcs)),
    "forbidden",
    403,
    "a viewer, whatever the body says",
  );
  await refused(
    contacts.POST.run(send("POST", { phone: "abc" }, `?workspace=${B}`), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
  );
  assert.equal(made.length, 0, "nothing reached the door");
  const out = await contacts.POST.run(
    send("POST", { phone: "+1 (555) 000-0001", name: "  Ada  ", source: "walk_in" }, `?workspace=${B}`),
    ctxFor(tables, {}, rpcs),
  );
  assert.deepEqual(out, { contact_id: P1, existed: false });
  // A door's own word goes through. Not "calendar" or "lead": people_list (00138) names those two, and they are the
  // sweep's and the converter's, written server-side. This door took any word, so a person added by hand could say "Your calendar".
  await contacts.POST.run(
    send("POST", { phone: "+1 (555) 000-0002", name: "Bea", source: "calendar" }, `?workspace=${B}`),
    ctxFor(tables, {}, rpcs),
  );
  assert.deepEqual(
    made,
    [
      { p_tenant_id: B, p_phone_e164: "+15550000001", p_display_name: "Ada", p_source: "walk_in" },
      { p_tenant_id: B, p_phone_e164: "+15550000002", p_display_name: "Bea", p_source: "manual" },
    ],
    "REGRESSION: the public door claimed the calendar's source",
  );
});

test("one person in full: the row with both reply modes, the notes, where they came from, the booking link; a person not in the named workspace is a 404", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    contacts: [contact(P1, A, { notes: "Sees Sofia" })],
    contact_identities: [
      { contact_id: P1, channel: "whatsapp", external_id: "15550000001", created_at: "2026-08-01T00:00:00Z" },
    ],
    conversations: [],
    calls: [],
    policies: [pol(A, null, null, "auto"), pol(A, "contact", P1, "ask")],
    events: [
      {
        tenant_id: A,
        kind: "contact.added",
        subject_type: "contact",
        subject_id: P1,
        data: { source: "calendar", title: "Colour" },
        created_at: "2026-08-01T00:00:00Z",
      },
      // Every change to either answer, as the doors write it: the profile shows these as evidence.
      {
        id: "ev-1",
        tenant_id: A,
        kind: "contact.consent_changed",
        subject_type: "contact",
        subject_id: P1,
        data: {
          consent: "opted_in",
          source: "customer_message",
          channel: "sms",
          message_external_id: "SM123",
          words: "START",
        },
        created_at: "2026-08-02T00:00:00Z",
      },
      {
        id: "ev-2",
        tenant_id: A,
        kind: "contact.consent_changed",
        subject_type: "contact",
        subject_id: P1,
        data: { purpose: "marketing", consent: "opted_in", source: "form", note: "signed 2 Sep", by: "u-ada" },
        created_at: "2026-08-03T00:00:00Z",
      },
      // Somebody else's change, and another kind: neither is this person's history.
      {
        id: "ev-3",
        tenant_id: A,
        kind: "contact.consent_changed",
        subject_type: "contact",
        subject_id: P2,
        data: { consent: "opted_out", source: "customer_message" },
        created_at: "2026-08-04T00:00:00Z",
      },
      {
        id: "ev-4",
        tenant_id: A,
        kind: "message.sent",
        subject_type: "message",
        subject_id: "m-1",
        data: {},
        created_at: "2026-08-05T00:00:00Z",
      },
    ],
    tenant_config: [{ tenant_id: A, config: { brain: { booking_link: " https://book.example/marisa " } } }],
    tenants: [],
  };
  const rpcs = { people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow(P1)] : []) };
  const { person: p } = await person.GET.run(get(inA), ctxFor(tables, { id: P1 }, rpcs));
  assert.equal(p.row.id, P1);
  assert.equal(p.row.effective_reply_mode, "ask");
  assert.equal(p.receptionist_mode, "ask");
  assert.equal(p.workspace_reply_mode, "auto");
  assert.equal(p.notes, "Sees Sofia");
  assert.equal(p.booking_link, "https://book.example/marisa");
  assert.deepEqual(p.added, { at: "2026-08-01T00:00:00Z", source: "calendar", title: "Colour" });
  assert.deepEqual(
    p.consent_history.map((c) => [
      c.id,
      c.purpose,
      c.consent,
      c.source,
      c.channel,
      c.message_external_id,
      c.words,
      c.by,
      c.note,
    ]),
    [
      ["ev-2", "marketing", "opted_in", "form", null, null, null, "u-ada", "signed 2 Sep"],
      ["ev-1", "conversational", "opted_in", "customer_message", "sms", "SM123", "START", null, null],
    ],
    "this person's consent changes, newest first, with the evidence each carries",
  );
  assert.equal(p.identities.length, 1);
  assert.deepEqual(p.conversations, []);
  assert.equal(p.visits, undefined, "no calendar connected");
  await refused(
    person.GET.run(get(`?workspace=${B}`), ctxFor(tables, { id: P1 }, rpcs)),
    "not_found",
    404,
    "the workspace named on the request is the door",
  );
  await refused(person.GET.run(get(inA), ctxFor(tables, { id: "not-a-uuid" }, rpcs)), "not_found", 404);
});

test("erasing a person is the owner's, judged where the person lives, and a refusal touches nothing", async () => {
  const tables = { memberships: both("owner", "operator"), contacts: [contact(P1, A), contact(P2, B)] };
  const operator = ctxFor(tables, { id: P2 });
  await refused(
    person.DELETE.run(send("DELETE"), operator),
    "forbidden",
    403,
    "an operator in bayside, though an owner in harbor",
  );
  assert.equal(writes(operator), 0);
  await refused(person.DELETE.run(send("DELETE"), ctxFor(tables, { id: P3 })), "not_found", 404);
  await refused(person.DELETE.run(send("DELETE"), ctxFor(tables, { id: "not-a-uuid" })), "not_found", 404);
});

test("a key that could not be READ stops the erasure, rather than erasing without it", async () => {
  // The keys are collected while the rows still exist, because after the
  // tombstone there is nowhere left to recompute them. The identities read used
  // to drop its error, so a failed read looked exactly like "no WhatsApp
  // identity" -- and the Blob job was queued without the wa_ids, leaving the
  // verbatim transcript in Blob for ever under a reply of `{ erased: true }`.
  const tables = { memberships: both("owner", "operator"), contacts: [contact(P1, A)] };
  for (const [table, what] of [
    ["contact_identities", /WhatsApp identities/],
    ["calls", /call recordings/],
    ["messages", /stored media/],
  ]) {
    const ctx = {
      supabase: fakeDb(tables, { [`${table}.select`]: { message: "statement timeout" } }),
      userId: USER,
      email: "ada@example.com",
      params: { id: P1 },
    };
    await assert.rejects(person.DELETE.run(send("DELETE"), ctx), (e) => {
      assert.equal(e.code, "internal", table);
      assert.match(e.message, what, table);
      assert.match(e.message, /nothing was deleted/, table);
      return true;
    });
    assert.equal(writes(ctx), 0, `${table}: refused before anything was queued or destroyed`);
    assert.equal(tables.contacts[0].erased_at, null, `${table}: the person is still there to try again`);
  }
});

test("an erasure hands the Ask scrub every spelling of the number and the address, before the rows go and after; a re-drive, the id", async () => {
  const scrubs = [];
  const rpcs = {
    scrub_ask_for_contact: (a) => {
      scrubs.push(a);
      return 0;
    },
    erase_contact: () => ({ counts: {}, storage_paths: [], jobs_canceled: 0 }),
  };
  /** The erasure on a database in memory, its service-client legs (the block, the finished jobs) on the same one. */
  const erase = async (tables) => {
    const ctx = ctxFor(
      { memberships: both("owner", "operator"), calls: [], messages: [], jobs: [], ...tables },
      { id: P1 },
      rpcs,
    );
    setServiceClient(ctx.supabase);
    try {
      return { out: await person.DELETE.run(send("DELETE"), ctx), seen: ctx.supabase.seen };
    } finally {
      setServiceClient(null);
    }
  };

  const { out, seen } = await erase({
    contacts: [contact(P1, A, { phone_e164: "+15550100123", email: "ada@example.com", erasing_since: null })],
    contact_identities: [
      { contact_id: P1, external_id: "15550100123" },
      { contact_id: P1, external_id: "ada.b@example.com" },
    ],
  });
  assert.equal(out.erased, true);
  const { needles } = erasureKeys({ phone_e164: "+15550100123", email: "ada@example.com" }, [
    "15550100123",
    "ada.b@example.com",
  ]);
  assert.ok(needles.includes("+1 (555) 010-0123") && needles.includes("ada.b@example.com"), "the spellings");
  assert.deepEqual(
    scrubs.map((a) => [a.p_tenant_id, a.p_contact_id, a.p_needles]),
    [
      [A, P1, needles],
      [A, P1, needles],
    ],
    "with every spelling, before erase_contact and after it",
  );
  assert.deepEqual(
    seen.filter((s) => s.rpc).map((s) => s.rpc),
    ["erasure_digests", "scrub_ask_for_contact", "erase_contact", "scrub_ask_for_contact"],
    "the digests are the database's (00263), made before the block is written",
  );

  // Already erased: nothing is left to spell them by, and the re-drive scrubs by the id alone.
  scrubs.length = 0;
  const again = await erase({
    contacts: [contact(P1, A, { phone_e164: null, email: null, erased_at: "2026-09-01T00:00:00Z" })],
  });
  assert.equal(again.out.already_erased, true);
  assert.deepEqual(
    scrubs.map((a) => [a.p_contact_id, a.p_needles]),
    [[P1, []]],
  );
});

test("details: an operator where the person lives, a name or notes or both, trimmed, through the two doors; an erased person is a 404", async () => {
  const doors = [];
  const rpcs = {
    set_person_name: (a) => {
      doors.push(["name", a]);
      return { name: a.p_name || null };
    },
    set_person_notes: (a) => {
      doors.push(["notes", a]);
      return { notes: a.p_notes || null };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
  };
  await refused(details.PUT.run(send("PUT", { name: "Ada" }), ctxFor(tables, { id: P1 }, rpcs)), "forbidden", 403);
  await assert.rejects(details.PUT.run(send("PUT", {}), ctxFor(tables, { id: P2 }, rpcs)), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /Send a name, notes, an email address or a proposal link\./);
    return true;
  });
  await refused(
    details.PUT.run(send("PUT", { name: "Ada" }), ctxFor(tables, { id: P3 }, rpcs)),
    "not_found",
    404,
    "erased",
  );
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  const out = await details.PUT.run(
    send("PUT", { name: "  Ada Lovelace  ", notes: " Sees Sofia " }),
    ctxFor(tables, { id: P2 }, rpcs),
  );
  assert.deepEqual(out, { contact_id: P2, name: "Ada Lovelace", notes: "Sees Sofia" });
  assert.deepEqual(doors, [
    ["name", { p_contact_id: P2, p_name: "Ada Lovelace" }],
    ["notes", { p_contact_id: P2, p_notes: "Sees Sofia" }],
  ]);
  const cleared = await details.PUT.run(send("PUT", { notes: "" }), ctxFor(tables, { id: P2 }, rpcs));
  assert.deepEqual(cleared, { contact_id: P2, notes: null }, "an empty string clears");
});

test("details: an email address is judged by the one normalizer before the door opens, stored in its spelling, cleared by an empty string, and the door's own refusal for a second person with it is a 409 in the owner's words", async () => {
  const doors = [];
  const taken = { code: "23505", message: "Another person here already has that address." };
  const rpcs = {
    set_person_email: (a) => {
      doors.push(a);
      if (a.p_email === "taken@example.com") {
        const e = new Error(taken.message);
        e.code = taken.code;
        throw e;
      }
      return { email: a.p_email || null };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
  };
  const put = (body, id = P2) => details.PUT.run(send("PUT", body), ctxFor(tables, { id }, rpcs));
  await refused(put({ email: "ana@example.com" }, P1), "forbidden", 403);
  await refused(put({ email: "ana@example.com" }, P3), "not_found", 404, "erased");
  for (const [typed, words] of [
    ["ana.example.com", /missing the @/],
    ["Ana <ana@example.com>", /Only the address itself/],
    ["ana@example", /full domain/],
  ]) {
    await assert.rejects(put({ email: typed }), (e) => {
      assert.equal(e.code, "validation");
      assert.match(e.message, words);
      return true;
    });
  }
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  assert.deepEqual(await put({ email: "  Ana@Example.COM " }), { contact_id: P2, email: "ana@example.com" });
  assert.deepEqual(
    doors,
    [{ p_contact_id: P2, p_email: "ana@example.com" }],
    "the door is handed the stored spelling, not the typed one",
  );
  assert.deepEqual(await put({ email: "" }), { contact_id: P2, email: null }, "an empty string clears");
  await assert.rejects(put({ email: "taken@example.com" }), (e) => {
    assert.equal(e.code, "conflict");
    assert.equal(e.status, 409);
    assert.equal(e.message, taken.message);
    return true;
  });
});

test("details: a proposal link is judged by the one normalizer before the door opens, stored with its scheme, cleared by an empty string", async () => {
  const doors = [];
  const rpcs = {
    set_person_proposal: (a) => {
      doors.push(a);
      return { proposal_url: a.p_url || null };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
  };
  const put = (body, id = P2) => details.PUT.run(send("PUT", body), ctxFor(tables, { id }, rpcs));
  await refused(put({ proposal: "https://docs.example.com/p/1" }, P1), "forbidden", 403);
  await refused(put({ proposal: "https://docs.example.com/p/1" }, P3), "not_found", 404, "erased");
  for (const [typed, words] of [
    ["docs", /full web address/],
    ["mailto:ana@example.com", /starting with https/],
    ["https://docs.example.com/p 1", /no spaces/],
  ]) {
    await assert.rejects(put({ proposal: typed }), (e) => {
      assert.equal(e.code, "validation");
      assert.match(e.message, words);
      return true;
    });
  }
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  assert.deepEqual(
    await put({ proposal: " docs.example.com/p/1 " }),
    { contact_id: P2, proposal_url: "https://docs.example.com/p/1" },
    "the scheme is supplied, the rest kept as typed",
  );
  assert.deepEqual(doors, [{ p_contact_id: P2, p_url: "https://docs.example.com/p/1" }]);
  assert.deepEqual(await put({ proposal: "" }), { contact_id: P2, proposal_url: null }, "an empty string clears");
  assert.deepEqual(doors[1], { p_contact_id: P2, p_url: "" });
});

test("the receptionist for one person: owner-only where they live, one of four modes, a policies row replaced not duplicated and removed by inherit, each change on the ledger", async () => {
  const tables = {
    memberships: both("operator", "owner"),
    contacts: [contact(P1, A), contact(P2, B)],
    policies: [],
    decisions: [],
  };
  await refused(
    receptionist.PUT.run(send("PUT", { mode: "never" }), ctxFor(tables, { id: P1 })),
    "forbidden",
    403,
    "an operator in harbor, though an owner in bayside",
  );
  await assert.rejects(receptionist.PUT.run(send("PUT", { mode: "loud" }), ctxFor(tables, { id: P2 })), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /Mode must be one of: auto, ask, never, inherit\./);
    return true;
  });
  assert.equal(tables.policies.length, 0);
  const silenced = await receptionist.PUT.run(send("PUT", { mode: "never" }), ctxFor(tables, { id: P2 }));
  assert.deepEqual([silenced.contact_id, silenced.mode], [P2, "never"]);
  assert.ok(/^[0-9a-f-]{36}$/.test(silenced.decision_id), "the ledger row rides back, so an undo can name it");
  assert.deepEqual(
    tables.policies.map((p) => [p.tenant_id, p.class, p.subject_type, p.subject_id, p.mode]),
    [[B, "reply", "contact", P2, "never"]],
  );
  await receptionist.PUT.run(send("PUT", { mode: "ask" }), ctxFor(tables, { id: P2 }));
  assert.deepEqual(
    tables.policies.map((p) => p.mode),
    ["ask"],
    "replaced, not duplicated",
  );
  const back = await receptionist.PUT.run(send("PUT", { mode: "inherit" }), ctxFor(tables, { id: P2 }));
  assert.deepEqual([back.contact_id, back.mode], [P2, null]);
  assert.equal(tables.policies.length, 0, "inherit removes the person's own row");
  // An undo from a card: the same verb, its row linked to the one it reverses, marked as a card's.
  await receptionist.PUT.run(send("PUT", { mode: "never" }), {
    ...ctxFor(tables, { id: P2 }),
    via: "ask",
    undoOf: back.decision_id,
  });
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.subject_id, d.payload.receptionist_mode]),
    [
      ["pause_agent", P2, "never"],
      ["pause_agent", P2, "ask"],
      ["resume_agent", P2, "inherit"],
      ["pause_agent", P2, "never"],
    ],
  );
  assert.deepEqual(
    tables.decisions.map((d) => d.undo_of),
    [null, null, null, back.decision_id],
    "only the undo is linked, to the row it undid",
  );
  assert.deepEqual(
    tables.decisions.map((d) => d.payload.via),
    [undefined, undefined, undefined, "ask"],
  );
});

test("lists: one workspace's with their members' ids; a viewer may not make one; the name is refused in the helper's words and kept tidy", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    segments: [
      { id: S1, tenant_id: A, name: "Regulars" },
      { id: S2, tenant_id: B, name: "VIP" },
    ],
    segment_members: [
      { segment_id: S1, contact_id: P1, tenant_id: A },
      { segment_id: S2, contact_id: P2, tenant_id: B },
    ],
  };
  assert.deepEqual(await lists.GET.run(get(inA), ctxFor(tables)), {
    lists: [{ id: S1, name: "Regulars", ids: [P1], rule: null, archived_at: null }],
  });
  assert.deepEqual(await lists.GET.run(get(`?workspace=${B}`), ctxFor(tables)), {
    lists: [{ id: S2, name: "VIP", ids: [P2], rule: null, archived_at: null }],
  });
  await refused(
    lists.POST.run(send("POST", { name: "Colour club" }, `?workspace=${A}`), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(lists.POST.run(send("POST", { name: "   " }, `?workspace=${B}`), ctxFor(tables)), "validation", 400);
  const made = await lists.POST.run(send("POST", { name: "  Colour   club " }, `?workspace=${B}`), ctxFor(tables));
  assert.deepEqual(made, { id: made.id, name: "Colour club", ids: [], rule: null, archived_at: null });
  assert.deepEqual(
    tables.segments.filter((s) => s.id === made.id).map((s) => [s.tenant_id, s.created_by]),
    [[B, USER]],
  );
});

test("one list: an operator where it lives; rename, add and remove in one request, adding twice is not an error; a delete removes it once", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    segments: [
      { id: S1, tenant_id: A, name: "Regulars" },
      { id: S2, tenant_id: B, name: "VIP" },
    ],
    segment_members: [{ segment_id: S2, contact_id: P2, tenant_id: B }],
  };
  await refused(list.PUT.run(send("PUT", { name: "Best" }), ctxFor(tables, { id: S1 })), "forbidden", 403);
  await refused(list.PUT.run(send("PUT", {}), ctxFor(tables, { id: S2 })), "validation", 400, "nothing to change");
  await refused(list.PUT.run(send("PUT", { add: ["nope"] }), ctxFor(tables, { id: S2 })), "validation", 400);
  assert.deepEqual(
    await list.PUT.run(send("PUT", { name: " Best ", add: [P3, P3], remove: [P2] }), ctxFor(tables, { id: S2 })),
    { id: S2, name: "Best", ids: [P3], rule: null, archived_at: null },
  );
  assert.equal(tables.segments.find((s) => s.id === S2).name, "Best");
  assert.deepEqual(
    await list.PUT.run(send("PUT", { add: [P3] }), ctxFor(tables, { id: S2 })),
    { id: S2, name: "Best", ids: [P3], rule: null, archived_at: null },
    "adding someone twice is not an error",
  );
  assert.equal(tables.segment_members.length, 1);
  await refused(list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S1 })), "forbidden", 403);
  assert.deepEqual(await list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 })), { deleted: true, id: S2 });
  assert.ok(!tables.segments.some((s) => s.id === S2));
  await refused(list.DELETE.run(send("DELETE"), ctxFor(tables, { id: S2 })), "not_found", 404, "gone");
});

/* ----------------------------------------------------------------------------
 * THE PEOPLE PAGE AT SCALE (slice D of the data program). The list pages and
 * counts; the search reaches the door only past the defaults; the batch doors
 * for the receptionist and a note; the view a member keeps per workspace.
 * ------------------------------------------------------------------------- */
const liveContact = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  phone_e164: "+15550000001",
  display_name: "Ada",
  wa_profile_name: null,
  erased_at: null,
  merged_into_contact_id: null,
  notes: null,
  ...over,
});

test("the list pages under one order and counts everyone: the door is named a query, an offset or a limit only when they leave their defaults", async () => {
  const asked = [];
  const rpcs = {
    people_list: (a) => {
      asked.push(a);
      return a.p_query ? [personRow(P2, { display_name: "Bo" })] : [personRow(P1), personRow(P2)];
    },
  };
  const tables = {
    memberships: both("viewer", "viewer"),
    policies: [],
    tenants: [],
    tenant_config: [],
    contacts: [
      liveContact(P1, A),
      liveContact(P2, A, { display_name: "Bo", phone_e164: "+15550000002" }),
      liveContact(P3, A, { erased_at: "2026-08-01T00:00:00Z" }), // erased: not counted
      liveContact("44444444-4444-4444-8444-444444444444", A, { merged_into_contact_id: P1 }), // merged: not counted
      liveContact("55555555-5555-4555-8555-555555555555", B), // another workspace
    ],
  };
  const first = await contacts.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.deepEqual(first.page, { q: null, offset: 0, limit: 1000, total: 2, has_more: false, next: null });
  assert.deepEqual(
    asked.at(-1),
    { p_tenant_id: A },
    "the first page names only the tenant: a database without 00112 answers as before",
  );
  const next = await contacts.GET.run(get(`${inA}&offset=1000`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(asked.at(-1), { p_tenant_id: A, p_offset: 1000 });
  assert.equal(next.page.offset, 1000);
  assert.equal(next.page.has_more, false);
  const found = await contacts.GET.run(get(`${inA}&q=%20bo%20`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(asked.at(-1), { p_tenant_id: A, p_query: "bo" }, "trimmed, and the door does the matching");
  assert.deepEqual(
    found.people.map((p) => p.id),
    [P2],
  );
  assert.deepEqual(
    found.page,
    { q: "bo", offset: 0, limit: 1000, total: 1, has_more: false, next: null },
    "counted with the same three matches",
  );
  const digits = await contacts.GET.run(get(`${inA}&q=0002`), ctxFor(tables, {}, rpcs));
  assert.equal(digits.page.total, 1, "three digits of a number count");
  const punct = await contacts.GET.run(get(`${inA}&q=a,b(c)`), ctxFor(tables, {}, rpcs));
  assert.equal(punct.page.total, 0, "the filter grammar's own characters never reach it");
  await refused(contacts.GET.run(get(`${inA}&offset=-1`), ctxFor(tables, {}, rpcs)), "validation", 400);
});

/**
 * people_list as 00276 answers it, over `n` people of workspace A in the kept order (the latest in touch first, then
 * the newest added, then the id, falling): a page after the cursor or the offset, each row carrying its place. With
 * `places: false`, a database before 00276: the same rows without their place, and no cursor taken. Every question is
 * kept in `asked`, and `move(id)` puts someone at the top, as a word from them would.
 */
function kept(n, { places = true } = {}) {
  const idOf = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const rows = Array.from({ length: n }, (_, i) => ({
    id: idOf(i + 1),
    at: new Date(Date.UTC(2026, 8, 1) - i * 60_000).toISOString(),
    added: "2026-01-01T00:00:00.000Z",
  }));
  const asked = [];
  // The order's comparison, falling: -1 when a comes first.
  const before = (a, b) =>
    a.at !== b.at ? (a.at > b.at ? -1 : 1) : a.added !== b.added ? (a.added > b.added ? -1 : 1) : a.id > b.id ? -1 : 1;
  const people_list = (a) => {
    asked.push(a);
    const order = [...rows].sort(before);
    const after = a.p_after_id ? { at: a.p_after_at, added: a.p_after_added, id: a.p_after_id } : null;
    if (after && !places) throw new Error("a database before 00276 was named a cursor");
    const from = after ? order.filter((r) => before(after, r) < 0) : order.slice(a.p_offset ?? 0);
    return from
      .slice(0, a.p_limit ?? 1000)
      .map((r) => personRow(r.id, places ? { in_touch_at: r.at, added_at: r.added } : {}));
  };
  const move = (id) => {
    rows.find((r) => r.id === id).at = new Date(Date.UTC(2026, 8, 2)).toISOString();
  };
  const contacts = rows.map((r) => liveContact(r.id, A));
  return { people_list, asked, move, contacts, idOf };
}

test("a page says where the next begins once its rows carry their place, and the next is read just past the last row; a cursor the route did not give is refused", async () => {
  const world = kept(1500);
  const tables = {
    memberships: both("viewer", "viewer"),
    policies: [],
    tenants: [],
    tenant_config: [],
    contacts: world.contacts,
  };
  const rpcs = { people_list: world.people_list };
  const first = await contacts.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.equal(first.people.length, 1000);
  assert.equal(
    first.people[999].in_touch_at,
    world.people_list({ p_tenant_id: A })[999].in_touch_at,
    "each row its place",
  );
  assert.equal(first.page.has_more, true);
  assert.equal(typeof first.page.next, "string", "where the next page begins, opaque to the page");
  // Someone the pages have not reached writes: they move above the cursor, and nobody is read twice.
  world.move(world.idOf(1200));
  const last = first.people[999];
  const second = await contacts.GET.run(
    get(`${inA}&offset=1000&after=${encodeURIComponent(first.page.next)}`),
    ctxFor(tables, {}, rpcs),
  );
  assert.deepEqual(
    world.asked.at(-1),
    { p_tenant_id: A, p_after_at: last.in_touch_at, p_after_added: last.added_at, p_after_id: last.id },
    "just past the last row, and the offset only counts what the page holds",
  );
  assert.equal(second.people.length, 499, "everyone past it but the one who wrote");
  assert.ok(!second.people.some((p) => first.people.some((q) => q.id === p.id)), "nobody twice");
  assert.deepEqual(second.page, { q: null, offset: 1000, limit: 1000, total: 1500, has_more: false, next: null });

  // A database before 00276: no place on the rows, so no cursor, and the next page is asked by offset as before.
  const before = kept(1500, { places: false });
  const old = await contacts.GET.run(
    get(inA),
    ctxFor({ ...tables, contacts: before.contacts }, {}, { people_list: before.people_list }),
  );
  assert.deepEqual([old.page.has_more, old.page.next], [true, null]);

  for (const bad of [
    "not-a-cursor",
    Buffer.from(JSON.stringify(["2026-09-01T00:00:00Z", "yesterday", P1])).toString("base64url"),
    Buffer.from(JSON.stringify(["2026-09-01T00:00:00Z", "2026-01-01T00:00:00Z", "not-a-uuid"])).toString("base64url"),
  ]) {
    await refused(contacts.GET.run(get(`${inA}&after=${bad}`), ctxFor(tables, {}, rpcs)), "validation", 400, bad);
  }
});

test("everyone is read a page at a time, each just past the last row's place, and nobody twice when someone writes between pages; by offset from a database before 00276", async () => {
  const { everyone } = await import(at("apps/dashboard/src/server/people/people.ts"));
  const world = kept(2500);
  const tables = { memberships: both("owner", "owner"), policies: [], contacts: world.contacts };
  let calls = 0;
  const people_list = (a) => {
    // Between the first page and the second, someone the pass has not reached writes.
    if (++calls === 2) world.move(world.idOf(2200));
    return world.people_list(a);
  };
  const all = await everyone(ctxFor(tables, {}, { people_list }), A);
  assert.equal(new Set(all.map((p) => p.id)).size, all.length, "nobody twice");
  assert.equal(all.length, 2499, "everyone but the one who moved above the cursor, whom the next pass reads first");
  assert.deepEqual(
    world.asked.map((a) => Object.keys(a).sort()),
    [
      ["p_tenant_id"],
      ["p_after_added", "p_after_at", "p_after_id", "p_tenant_id"],
      ["p_after_added", "p_after_at", "p_after_id", "p_tenant_id"],
    ],
  );

  const before = kept(2500, { places: false });
  const old = await everyone(
    ctxFor({ ...tables, contacts: before.contacts }, {}, { people_list: before.people_list }),
    A,
  );
  assert.equal(old.length, 2500);
  assert.deepEqual(before.asked, [
    { p_tenant_id: A },
    { p_tenant_id: A, p_offset: 1000 },
    { p_tenant_id: A, p_offset: 2000 },
  ]);
});

test("the receptionist's mode for many: owners, ours and not erased, the same policy row and ledger verb per person", async () => {
  assert.deepEqual(receptionistMany.PUT.policy, {
    kind: "write",
    scope: "workspace",
    role: "owner",
    rate: "person_mode",
    spend: false,
  });
  const tables = {
    memberships: both("owner", "viewer"),
    contacts: [liveContact(P1, A), liveContact(P2, A, { erased_at: "2026-08-01T00:00:00Z" }), liveContact(P3, B)],
    policies: [pol(A, "contact", P1, "auto")],
    decisions: [],
  };
  const out = await receptionistMany.PUT.run(
    send("PUT", { ids: [P1, P2, P3, P1], mode: "never" }, inA),
    ctxFor(tables),
  );
  assert.deepEqual(out, { done: 1, failed: [], skipped: [P2, P3] });
  assert.deepEqual(
    tables.policies.map((p) => [p.subject_id, p.mode]),
    [[P1, "never"]],
    "the one row per person, replaced in place",
  );
  assert.deepEqual(
    tables.decisions.map((d) => [d.subject_id, d.verb, d.payload.receptionist_mode, d.payload.batch]),
    [[P1, "pause_agent", "never", 3]],
  );
  const back = await receptionistMany.PUT.run(send("PUT", { ids: [P1], mode: "inherit" }, inA), ctxFor(tables));
  assert.deepEqual(back, { done: 1, failed: [], skipped: [] });
  assert.deepEqual(tables.policies, [], "inherit removes the row: they follow the workspace again");
  assert.equal(tables.decisions.at(-1).verb, "resume_agent");
  await refused(
    receptionistMany.PUT.run(send("PUT", { ids: [P1], mode: "never" }, `?workspace=${B}`), ctxFor(tables)),
    "forbidden",
    403,
    "a viewer there",
  );
  await refused(
    receptionistMany.PUT.run(send("PUT", { ids: [P1], mode: "loud" }, inA), ctxFor(tables)),
    "validation",
    400,
  );
});

test("a note for many: each person gets it as a note of their own, through the one note door -- a person whose notes were full was refused", async () => {
  assert.deepEqual(notesMany.PUT.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "person_edit",
    spend: false,
  });
  const written = [];
  const rpcs = {
    person_note_add: (a) => {
      written.push(a);
      return a.p_contact_id === P3 ? { error: "not_found" } : { note: { id: `n-${a.p_contact_id}` } };
    },
  };
  const tables = {
    memberships: both("operator", "viewer"),
    contacts: [liveContact(P1, A), liveContact(P2, A), liveContact(P3, A)],
  };
  const out = await notesMany.PUT.run(
    send("PUT", { ids: [P1, P2, P3], append: "  class of 12 Sep  " }, inA),
    ctxFor(tables, {}, rpcs),
  );
  assert.deepEqual(out, {
    done: 2,
    failed: [{ id: P3, message: "This person or this note is no longer here." }],
    skipped: [],
  });
  assert.deepEqual(
    written.map((w) => [w.p_contact_id, w.p_body, w.p_source]),
    [
      [P1, "class of 12 Sep", "bulk"],
      [P2, "class of 12 Sep", "bulk"],
      [P3, "class of 12 Sep", "bulk"],
    ],
    "trimmed, the same words for each, marked as People's bulk note",
  );
  await refused(
    notesMany.PUT.run(send("PUT", { ids: [P1], append: "   " }, inA), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
  );
});

test("a view is the workspace's: read from the member's own row, written through the door that judges the membership, a page name kept short", async () => {
  assert.deepEqual(views.GET.policy, { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
  assert.deepEqual(
    viewSet.PUT.policy,
    { kind: "write", scope: "workspace", role: "viewer", rate: "view_set", spend: false },
    "any member: it is their own view",
  );
  const tables = {
    memberships: [
      {
        ...membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
        views: { people: { sortBy: "name", sortDir: "asc", attentionTab: "quiet" } },
      },
      membership(B, "owner", "bayside", "2026-02-01T00:00:00Z"),
    ],
  };
  const mine = await views.GET.run(get(inA), ctxFor(tables));
  assert.deepEqual(mine, { views: { people: { sortBy: "name", sortDir: "asc", attentionTab: "quiet" } } });
  assert.deepEqual(
    await views.GET.run(get(`?workspace=${B}`), ctxFor(tables)),
    { views: {} },
    "per workspace: the other holds nothing yet",
  );
  const door = [];
  const rpcs = {
    member_view_set: (a) => {
      door.push(a);
      return { people: a.p_view, broadcasts: { tab: "history" } };
    },
  };
  const saved = await viewSet.PUT.run(
    send("PUT", { view: { sortBy: "last", sortDir: "desc" } }, `?workspace=${B}`),
    ctxFor(tables, { page: "people" }, rpcs),
  );
  assert.deepEqual(
    door,
    [{ p_tenant_id: B, p_page: "people", p_view: { sortBy: "last", sortDir: "desc" } }],
    "the workspace the tab named, never one from the body",
  );
  assert.deepEqual(
    saved,
    { views: { people: { sortBy: "last", sortDir: "desc" }, broadcasts: { tab: "history" } } },
    "the whole set comes back",
  );
  await refused(
    viewSet.PUT.run(send("PUT", { view: { a: 1 } }, inA), ctxFor(tables, { page: "People Page" }, rpcs)),
    "validation",
    400,
  );
  await refused(
    viewSet.PUT.run(send("PUT", { view: { big: "x".repeat(3000) } }, inA), ctxFor(tables, { page: "people" }, rpcs)),
    "validation",
    400,
  );
  await refused(
    viewSet.PUT.run(send("PUT", { view: "not an object" }, inA), ctxFor(tables, { page: "people" }, rpcs)),
    "validation",
    400,
  );
});

test("REGRESSION: a list past a thousand people is read to its last member -- its members were one select, which answers at most 1000 rows, so the rail, a profile and the composer lost everyone after the thousandth", async () => {
  const ids = Array.from({ length: 1500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const tables = {
    memberships: both("viewer", "operator"),
    segments: [{ id: S1, tenant_id: A, name: "Regulars" }],
    segment_members: ids.map((contact_id) => ({ segment_id: S1, contact_id, tenant_id: A })),
  };
  // PostgREST's max_rows, as the server has it.
  const ctx = {
    supabase: fakeDb(tables, {}, {}, { maxRows: 1000 }),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  const { lists: read } = await lists.GET.run(get(inA), ctx);
  assert.equal(read.length, 1);
  assert.equal(read[0].ids.length, 1500, "REGRESSION: 1000 of 1500");
  assert.deepEqual(new Set(read[0].ids), new Set(ids), "each of them once");
});

test("a person carries the runs that named them, newest first, and the lead they were found as -- their page could say neither", async () => {
  const run = (id, over) => ({
    id,
    tenant_id: A,
    name: `Run ${id}`,
    playbook_id: null,
    audience: { kind: "everyone", id: null, label: "Everyone" },
    scheduled_for: null,
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  });
  const tables = {
    memberships: both("owner", "owner"),
    contact_identities: [],
    conversations: [],
    calls: [],
    policies: [],
    events: [],
    contacts: [{ id: P1, tenant_id: A, notes: null }],
    tenant_config: [],
    tenants: [],
    broadcasts: [
      run("b-old", { created_at: "2026-08-01T00:00:00Z" }),
      run("b-pb", {
        playbook_id: "pb-1",
        audience: { kind: "playbook", id: "quiet_30", label: "Win-back" },
        created_at: "2026-09-01T00:00:00Z",
      }),
      run("b-held", { scheduled_for: "2026-08-20T00:00:00Z", created_at: "2026-08-19T00:00:00Z" }),
      run("b-theirs", { tenant_id: B }),
    ],
    broadcast_recipients: [
      {
        broadcast_id: "b-old",
        contact_id: P1,
        tenant_id: A,
        state: "sent",
        reason: null,
        sent_at: "2026-08-01T15:00:00Z",
        message_id: "m-old",
      },
      {
        broadcast_id: "b-pb",
        contact_id: P1,
        tenant_id: A,
        state: "sent",
        reason: null,
        sent_at: "2026-09-01T15:00:00Z",
        message_id: "m-pb",
      },
      {
        broadcast_id: "b-held",
        contact_id: P1,
        tenant_id: A,
        state: "skipped",
        reason: "no_marketing_consent",
        sent_at: null,
        message_id: null,
      },
      // Somebody else on a run, and this person on another workspace's: neither is theirs here.
      {
        broadcast_id: "b-old",
        contact_id: P2,
        tenant_id: A,
        state: "sent",
        reason: null,
        sent_at: "2026-08-01T15:00:00Z",
        message_id: "m-x",
      },
      {
        broadcast_id: "b-theirs",
        contact_id: P1,
        tenant_id: B,
        state: "sent",
        reason: null,
        sent_at: "2026-09-10T00:00:00Z",
        message_id: "m-y",
      },
    ],
    leads: [
      {
        id: "l-1",
        tenant_id: A,
        contact_id: P1,
        business_name: "Glow Studio",
        found_at: "2026-07-01T00:00:00Z",
        erased_at: null,
        blanked_at: null,
      },
      {
        id: "l-gone",
        tenant_id: A,
        contact_id: P1,
        business_name: "Erased",
        found_at: "2026-07-05T00:00:00Z",
        erased_at: "2026-07-06T00:00:00Z",
        blanked_at: null,
      },
    ],
  };
  const rpcs = { people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow(P1)] : []) };
  const { person: p } = await person.GET.run(get(inA), ctxFor(tables, { id: P1 }, rpcs));
  assert.deepEqual(
    p.campaigns.map((c) => [c.broadcast_id, c.state, c.reason, c.playbook_id, c.playbook_name, c.message_id]),
    [
      ["b-pb", "sent", null, "pb-1", "Win-back", "m-pb"],
      ["b-held", "skipped", "no_marketing_consent", null, null, null],
      ["b-old", "sent", null, null, null, "m-old"],
    ],
    "newest first by when each went or was due; a playbook's run named for its playbook",
  );
  assert.deepEqual(
    p.lead,
    // The lead's reach-out story (Part 6, H11) is its own read, which this world does not answer: none, never a failure.
    { id: "l-1", business_name: "Glow Studio", found_at: "2026-07-01T00:00:00Z", reach_out: null },
    "never an erased lead",
  );
});

test("REGRESSION: a change to a list past a thousand people answers with every one of them -- the answer was one select, and an Undo tells from it who an add really added", async () => {
  const ids = Array.from({ length: 1500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const tables = {
    memberships: both("owner", "owner"),
    segments: [{ id: S1, tenant_id: A, name: "Regulars" }],
    segment_members: ids.map((contact_id) => ({ segment_id: S1, contact_id, tenant_id: A })),
    contacts: [{ id: P3, tenant_id: A, erased_at: null }],
  };
  const ctx = {
    supabase: fakeDb(tables, {}, {}, { maxRows: 1000 }),
    userId: USER,
    email: "ada@example.com",
    params: { id: S1 },
  };
  const out = await list.PUT.run(send("PUT", { add: [P3] }), ctx);
  assert.equal(out.ids.length, 1501, "REGRESSION: 1000 of 1501");
  assert.ok(out.ids.includes(P3), "the one just added among them");
});

test("deal: a proposal is recorded through the door, its decision holds the move, and a viewer or an erased person is refused before the door opens", async () => {
  const doors = [];
  const rpcs = {
    deal_record: (a) => {
      doors.push(a);
      return {
        deal: {
          id: D1,
          contact_id: P2,
          service: a.p_service ?? null,
          stage: a.p_stage,
          proposed_at: "2026-09-23T12:00:00Z",
          decided_at: null,
          ended_at: null,
          amount_cents: null,
          per: null,
          currency: "USD",
          note: null,
          version: 1,
          created_at: "2026-09-23T12:00:00Z",
        },
        from: null,
      };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
    decisions: [],
  };
  await refused(deal.POST.run(send("POST", { stage: "proposed" }), ctxFor(tables, { id: P1 }, rpcs)), "forbidden", 403);
  await refused(
    deal.POST.run(send("POST", { stage: "proposed" }), ctxFor(tables, { id: P3 }, rpcs)),
    "not_found",
    404,
    "erased",
  );
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  await assert.rejects(
    deal.POST.run(send("POST", { stage: "banana" }), ctxFor(tables, { id: P2 }, rpcs)),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  await assert.rejects(
    deal.POST.run(send("POST", { stage: "proposed", when: "2026-09-20" }), ctxFor(tables, { id: P2 }, rpcs)),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  await assert.rejects(
    deal.POST.run(send("POST", { stage: "proposed", extra: 1 }), ctxFor(tables, { id: P2 }, rpcs)),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  assert.equal(doors.length, 0, "a bare date and an unknown key are refused before the door opens");
  const out = await deal.POST.run(
    send("POST", { stage: "proposed", service: "SEO", when: "2026-09-20T15:00:00.000Z" }),
    ctxFor(tables, { id: P2 }, rpcs),
  );
  assert.equal(out.deal.id, D1);
  assert.equal(out.from, null);
  assert.ok(out.decision_id);
  assert.deepEqual(doors, [
    { p_contact_id: P2, p_stage: "proposed", p_service: "SEO", p_when: "2026-09-20T15:00:00.000Z" },
  ]);
  const d = tables.decisions.at(-1);
  assert.equal(d.verb, "record_deal");
  assert.equal(d.subject_type, "deal");
  assert.equal(d.subject_id, D1);
  assert.deepEqual(d.payload, { contact_id: P2, stage: "proposed", from: null, service: "SEO" });
});

test("deal: the door's refusal is a sentence in the owner's words, and no decision is recorded; evidence takes the consent's shape", async () => {
  const doors = [];
  const rpcs = { deal_record: (a) => (doors.push(a), { error: "already_open" }) };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
    decisions: [],
  };
  const before = tables.decisions.length;
  await assert.rejects(deal.POST.run(send("POST", { stage: "proposed" }), ctxFor(tables, { id: P2 }, rpcs)), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /already have a proposal out/);
    return true;
  });
  assert.equal(tables.decisions.length, before);
  const won = {
    deal_record: (a) => (
      doors.push(a),
      {
        deal: {
          id: D1,
          contact_id: P2,
          service: null,
          stage: "won",
          proposed_at: "2026-09-01T12:00:00Z",
          decided_at: "2026-09-23T12:00:00Z",
          ended_at: null,
          amount_cents: 250000,
          per: "month",
          currency: "USD",
          note: null,
          version: 2,
          created_at: "2026-09-01T12:00:00Z",
        },
        from: "proposed",
      }
    ),
  };
  await deal.POST.run(
    send("POST", { stage: "won", deal_id: D1, version: 1, amount_cents: 250000, per: "month", message_id: M1 }),
    ctxFor(tables, { id: P2 }, won),
  );
  assert.deepEqual(doors.at(-1), {
    p_contact_id: P2,
    p_stage: "won",
    p_deal_id: D1,
    p_version: 1,
    p_amount_cents: 250000,
    p_per: "month",
    p_evidence: { message_id: M1 },
  });
  await deal.POST.run(
    send("POST", { stage: "won", deal_id: D1, version: 2, form_note: "DocuSign, Sep 20" }),
    ctxFor(tables, { id: P2 }, won),
  );
  assert.deepEqual(doors.at(-1).p_evidence, { form: "DocuSign, Sep 20" });
});

test("a note on a person (0007): one route writes or changes it, one takes it away, one keeps or dismisses a suggestion -- owner or operator, each on this person only", async () => {
  for (const r of [noteWrite, noteRemove, noteDecide])
    assert.deepEqual(r.POST.policy, {
      kind: "write",
      scope: "row",
      role: "operator",
      rate: "person_edit",
      spend: false,
    });
  const N1 = "abababab-1111-4111-8111-abababababab";
  const N2 = "cdcdcdcd-2222-4222-8222-cdcdcdcdcdcd";
  const at = "2026-09-20T15:00:00.000Z";
  const stored = (id, over = {}) => ({
    id,
    tenant_id: B,
    contact_id: P2,
    body: "Prefers Saturdays.",
    author_kind: "member",
    author_user_id: USER,
    for_user_id: null,
    team_only: false,
    state: "kept",
    source: "page",
    version: 1,
    created_at: at,
    updated_at: at,
    ...over,
  });
  const doors = [];
  const rpcs = {
    person_note_add: (a) => (
      doors.push(["add", a]),
      { note: stored(N1, { body: a.p_body, team_only: a.p_team_only }) }
    ),
    person_note_edit: (a) => (
      doors.push(["edit", a]),
      a.p_version === 1 ? { note: stored(N1, { body: a.p_body, version: 2 }) } : { error: "moved" }
    ),
    person_note_remove: (a) => (doors.push(["remove", a]), { removed: a.p_note_id }),
    person_note_decide: (a) => (
      doors.push(["decide", a]),
      a.p_keep ? { note: stored(N2, { state: "kept" }) } : { removed: a.p_note_id }
    ),
  };
  const tables = () => ({
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B)],
    person_notes: [
      stored(N1),
      stored(N2, { author_kind: "receptionist", author_user_id: null, state: "suggested" }),
      stored("efefefef-3333-4333-8333-efefefefefef", { contact_id: P1, tenant_id: A }),
    ],
  });

  await refused(
    noteWrite.POST.run(send("POST", { body: "Hi" }), ctxFor(tables(), { id: P1 }, rpcs)),
    "forbidden",
    403,
    "a viewer writes nothing",
  );
  await assert.rejects(
    noteWrite.POST.run(send("POST", { body: "x".repeat(601) }), ctxFor(tables(), { id: P2 }, rpcs)),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  assert.equal(doors.length, 0, "refused before any door opens");

  const added = await noteWrite.POST.run(
    send("POST", { body: "  Prefers Saturdays.  ", team_only: true }),
    ctxFor(tables(), { id: P2 }, rpcs),
  );
  assert.deepEqual(doors.at(-1), ["add", { p_contact_id: P2, p_body: "Prefers Saturdays.", p_team_only: true }]);
  assert.equal(added.note.mine, true, "the writer's own");
  assert.equal(added.note.team_only, true);

  await noteWrite.POST.run(
    send("POST", { body: "Changed.", note_id: N1, version: 1 }),
    ctxFor(tables(), { id: P2 }, rpcs),
  );
  assert.deepEqual(doors.at(-1), ["edit", { p_note_id: N1, p_body: "Changed.", p_team_only: false, p_version: 1 }]);
  await refused(
    noteWrite.POST.run(send("POST", { body: "Stale.", note_id: N1, version: 3 }), ctxFor(tables(), { id: P2 }, rpcs)),
    "conflict",
    409,
    "a stale version is refused in the owner's words",
  );

  const n = doors.length;
  await refused(
    noteRemove.POST.run(
      send("POST", { note_id: "efefefef-3333-4333-8333-efefefefefef" }),
      ctxFor(tables(), { id: P2 }, rpcs),
    ),
    "not_found",
    404,
    "a note on someone else is not this person's to take away",
  );
  assert.equal(doors.length, n, "and no door opened for it");
  assert.deepEqual(await noteRemove.POST.run(send("POST", { note_id: N1 }), ctxFor(tables(), { id: P2 }, rpcs)), {
    removed: N1,
  });

  const keptOut = await noteDecide.POST.run(
    send("POST", { note_id: N2, keep: true }),
    ctxFor(tables(), { id: P2 }, rpcs),
  );
  assert.equal(keptOut.note.state, "kept");
  assert.deepEqual(
    await noteDecide.POST.run(send("POST", { note_id: N2, keep: false }), ctxFor(tables(), { id: P2 }, rpcs)),
    {
      removed: N2,
    },
  );
});

test("deal: a proposal's link, its day, a reason for passing and what a person emptied each reach the door only when named, and are judged before it opens (0008)", async () => {
  const doors = [];
  const rpcs = {
    deal_record: (a) => (
      doors.push(a),
      {
        deal: {
          id: D1,
          contact_id: P2,
          service: null,
          stage: a.p_stage,
          proposed_at: "2026-09-23T12:00:00Z",
          decided_at: null,
          ended_at: null,
          amount_cents: null,
          per: null,
          currency: "USD",
          note: null,
          version: 2,
          created_at: "2026-09-23T12:00:00Z",
          proposal_url: a.p_proposal_url ?? null,
          valid_until: a.p_valid_until ?? null,
          lost_reason: a.p_lost_reason ?? null,
        },
        from: "proposed",
      }
    ),
  };
  const tables = { memberships: both("viewer", "operator"), contacts: [contact(P1, A), contact(P2, B)], decisions: [] };
  const run = (body) => deal.POST.run(send("POST", body), ctxFor(tables, { id: P2 }, rpcs));

  // The link as the one normalizer stores it, and the day it stands until.
  const out = await run({ stage: "proposed", proposal_url: " docs.example.com/p/2 ", valid_until: "2026-09-30" });
  assert.deepEqual(doors.at(-1), {
    p_contact_id: P2,
    p_stage: "proposed",
    p_proposal_url: "https://docs.example.com/p/2",
    p_valid_until: "2026-09-30",
  });
  assert.equal(out.deal.proposal_url, "https://docs.example.com/p/2", "the deal comes back with it");
  // A pass with its reason; a move that empties what a person cleared.
  await run({ stage: "lost", deal_id: D1, version: 1, lost_reason: "timing" });
  assert.deepEqual(doors.at(-1), {
    p_contact_id: P2,
    p_stage: "lost",
    p_deal_id: D1,
    p_version: 1,
    p_lost_reason: "timing",
  });
  await run({ stage: "proposed", deal_id: D1, version: 2, clear: ["proposal_url", "amount"] });
  assert.deepEqual(doors.at(-1), {
    p_contact_id: P2,
    p_stage: "proposed",
    p_deal_id: D1,
    p_version: 2,
    p_clear: ["proposal_url", "amount"],
  });
  // A day of null, an empty list and a blank link say nothing, so the door keeps what it has. Changed on purpose in
  // review: a blank link was refused ("A web address is needed."), but the sheet empties one with clear, and a field
  // left blank is simply not said.
  await run({ stage: "proposed", deal_id: D1, version: 3, valid_until: null, clear: [], proposal_url: "   " });
  assert.deepEqual(doors.at(-1), { p_contact_id: P2, p_stage: "proposed", p_deal_id: D1, p_version: 3 });
  await run({ stage: "proposed", proposal_url: "" });
  assert.deepEqual(doors.at(-1), { p_contact_id: P2, p_stage: "proposed" });

  // Refused before the door opens: not a link (in the words that say which kind), not a day, not a reason, not a field.
  const opened = doors.length;
  const why = async (body, words) =>
    assert.rejects(run(body), (e) => {
      assert.equal(e.code, "validation");
      if (words) assert.equal(e.message, words);
      return true;
    });
  await why(
    { stage: "proposed", proposal_url: "mailto:ana@example.com" },
    "That needs to be a web address, starting with https://.",
  );
  await why(
    { stage: "proposed", proposal_url: "docs" },
    "That needs a full web address, like docs.example.com/proposal.",
  );
  await why({ stage: "proposed", proposal_url: "x".repeat(601) });
  await why({ stage: "proposed", valid_until: "2026-02-31" });
  await why({ stage: "proposed", valid_until: "Sep 30" });
  await why({ stage: "lost", deal_id: D1, version: 3, lost_reason: "banana" });
  await why({ stage: "proposed", deal_id: D1, version: 3, clear: ["service"] });
  assert.equal(doors.length, opened, "no door was opened for any of them");

  // The door's own new refusals are sentences, and no decision is recorded for them.
  const decided = tables.decisions.length;
  for (const code of ["bad_link", "bad_reason", "bad_clear"]) {
    const refusing = { deal_record: () => ({ error: code }) };
    await assert.rejects(
      deal.POST.run(send("POST", { stage: "proposed" }), ctxFor(tables, { id: P2 }, refusing)),
      (e) => {
        assert.equal(e.message, DEAL_REFUSALS[code], code);
        return true;
      },
    );
  }
  assert.equal(tables.decisions.length, decided);
});

test("deals are on in People exactly where the workspace says some customers get a proposal first; a deal on file switches nothing (0008)", async () => {
  const won = {
    id: D1,
    tenant_id: A,
    contact_id: P1,
    service: null,
    stage: "won",
    proposed_at: "2026-09-01T12:00:00Z",
    decided_at: "2026-09-05T12:00:00Z",
    ended_at: null,
    amount_cents: 250000,
    per: "month",
    currency: "USD",
    note: null,
    version: 2,
    created_at: "2026-09-01T12:00:00Z",
    proposal_url: "https://docs.example.com/p/1",
    valid_until: null,
    lost_reason: null,
  };
  const world = (sellsBy) => ({
    memberships: both("viewer", "viewer"),
    policies: [],
    tenant_config: [],
    contacts: [contact(P1, A)],
    deals: [won],
    tenants: [{ id: A, slug: "harbor", ...(sellsBy === undefined ? {} : { sells_by: sellsBy }) }],
  });
  const rpcs = {
    people_list: (a) => (a.p_tenant_id === A && (!a.p_contact_id || a.p_contact_id === P1) ? [personRow(P1)] : []),
  };
  const list = async (s) => (await contacts.GET.run(get(inA), ctxFor(world(s), {}, rpcs))).deals_on;
  const page = async (s) => (await person.GET.run(get(inA), ctxFor(world(s), { id: P1 }, rpcs))).person;
  assert.equal(await list("proposal"), true);
  const p = await page("proposal");
  assert.equal(p.deals_on, true);
  assert.equal(p.deals[0].proposal_url, "https://docs.example.com/p/1", "each deal with its link");
  for (const s of ["booking", null, undefined]) {
    assert.equal(await list(s), false, `${s}: the list`);
    assert.equal((await page(s)).deals_on, false, `${s}: the person's page`);
  }
});

test("deal: the door answers the deal the person's People row shows now -- an open one first, then the newest -- which is not always the one it recorded", async () => {
  const D2 = "dddddddd-2222-4222-8222-dddddddddddd";
  const deals = [
    // Their newest: a proposal out, the deal their row shows.
    {
      id: D1,
      tenant_id: B,
      contact_id: P2,
      service: "SEO",
      stage: "proposed",
      proposed_at: "2026-09-20T12:00:00Z",
      decided_at: null,
      ended_at: null,
      amount_cents: 80_000,
      per: "once",
      currency: "USD",
      note: null,
      version: 1,
      created_at: "2026-09-20T12:00:00Z",
    },
    // An older engagement, still a client.
    {
      id: D2,
      tenant_id: B,
      contact_id: P2,
      service: "Ads",
      stage: "won",
      proposed_at: "2026-07-01T12:00:00Z",
      decided_at: "2026-07-05T12:00:00Z",
      ended_at: null,
      amount_cents: 50_000,
      per: "month",
      currency: "USD",
      note: null,
      version: 1,
      created_at: "2026-07-01T12:00:00Z",
    },
  ];
  const tables = { memberships: both("viewer", "operator"), contacts: [contact(P2, B)], decisions: [], deals };
  // The door, as it writes: the row it moved, with its version on.
  const rpcs = {
    deal_record: (a) => {
      const d = tables.deals.find((x) => x.id === a.p_deal_id);
      Object.assign(d, {
        stage: a.p_stage,
        version: d.version + 1,
        ...(a.p_amount_cents !== undefined ? { amount_cents: a.p_amount_cents } : {}),
        ...(a.p_stage === "lost" ? { decided_at: "2026-09-23T12:00:00Z" } : {}),
      });
      return { deal: { ...d }, from: "won" };
    },
  };
  // The older client's amount changed: it is what the door recorded, and the proposal is still what their row shows.
  let out = await deal.POST.run(
    send("POST", { stage: "won", deal_id: D2, version: 1, amount_cents: 60_000 }),
    ctxFor(tables, { id: P2 }, rpcs),
  );
  assert.deepEqual([out.deal.id, out.current.id], [D2, D1]);
  // The proposal passed: the client is the one open deal now, so it is their row's.
  out = await deal.POST.run(
    send("POST", { stage: "lost", deal_id: D1, version: 1, lost_reason: "price" }),
    ctxFor(tables, { id: P2 }, rpcs),
  );
  assert.deepEqual([out.deal.id, out.deal.stage, out.current.id], [D1, "lost", D2]);
  // Their deals could not be read: the write still answers, with no row to move until People is read again.
  const faulty = {
    ...ctxFor(tables, { id: P2 }, rpcs),
    supabase: fakeDb(tables, { "deals.select": { message: "statement timeout" } }, rpcs),
  };
  out = await deal.POST.run(send("POST", { stage: "won", deal_id: D2, version: 2, amount_cents: 70_000 }), faulty);
  assert.deepEqual([out.deal.id, out.current], [D2, null]);
});

test("a step (00166): the note route takes a day and a deal only when named, judging the day first; one route marks it done by anyone who acts; People's rows say who each is for, reading the team only when one is for someone", async () => {
  const noteDone = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/done/route.ts"));
  assert.deepEqual(noteDone.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "person_edit",
    spend: false,
  });
  const N1 = "abababab-1111-4111-8111-abababababab";
  const N2 = "efefefef-3333-4333-8333-efefefefefef";
  const stamp = "2026-09-20T15:00:00.000Z";
  const stored = (over = {}) => ({
    id: N1,
    tenant_id: B,
    contact_id: P2,
    body: "Call about the timeline",
    author_kind: "member",
    author_user_id: USER,
    for_user_id: null,
    team_only: true,
    state: "kept",
    source: "page",
    version: 1,
    created_at: stamp,
    updated_at: stamp,
    due_on: "2026-09-30",
    done_at: null,
    done_by: null,
    deal_id: null,
    ...over,
  });
  const doors = [];
  const rpcs = {
    person_note_add: (a) => (
      doors.push(["add", a]),
      { note: stored({ due_on: a.p_due_on ?? null, deal_id: a.p_deal_id ?? null }) }
    ),
    person_note_edit: (a) => (doors.push(["edit", a]), { note: stored({ version: 2 }) }),
    person_note_done: (a) => (
      doors.push(["done", a]),
      a.p_version === 9
        ? { error: "moved", version: 1 }
        : a.p_note_id === N1
          ? { note: stored({ done_at: stamp, done_by: USER, version: 2 }) }
          : { error: "not_a_step" }
    ),
  };
  const tables = () => ({
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B)],
    person_notes: [stored(), stored({ id: N2, due_on: null, team_only: false })],
  });
  const ctx = (id = P2) => ctxFor(tables(), { id }, rpcs);

  // A day that is not one is refused before any door opens.
  await assert.rejects(
    noteWrite.POST.run(send("POST", { body: "Call", due_on: "2026-02-30" }), ctx()),
    (e) => (assert.equal(e.code, "validation"), true),
  );
  assert.equal(doors.length, 0);
  // The day and the deal reach the door only when named; a change clears a day only when told to.
  const added = await noteWrite.POST.run(
    send("POST", { body: "Call about the timeline", due_on: "2026-09-30", deal_id: D1 }),
    ctx(),
  );
  assert.deepEqual(doors.at(-1), [
    "add",
    { p_contact_id: P2, p_body: "Call about the timeline", p_team_only: false, p_due_on: "2026-09-30", p_deal_id: D1 },
  ]);
  assert.deepEqual([added.note.due_on, added.note.deal_id, added.note.done_at], ["2026-09-30", D1, null]);
  await noteWrite.POST.run(send("POST", { body: "Plain" }), ctx());
  assert.deepEqual(
    doors.at(-1),
    ["add", { p_contact_id: P2, p_body: "Plain", p_team_only: false }],
    "a note names neither",
  );
  await noteWrite.POST.run(send("POST", { body: "No day now", note_id: N1, version: 1, clear_due: true }), ctx());
  assert.deepEqual(doors.at(-1), [
    "edit",
    { p_note_id: N1, p_body: "No day now", p_team_only: false, p_version: 1, p_clear_due: true },
  ]);

  // Done: by any operator, with the version the page saw; the door's refusals in the owner's words.
  const done = await noteDone.POST.run(send("POST", { note_id: N1, version: 1 }), ctx());
  assert.deepEqual(doors.at(-1), ["done", { p_note_id: N1, p_done: true, p_version: 1 }]);
  assert.deepEqual([done.note.done_at, done.note.done_by_me], [stamp, true]);
  await noteDone.POST.run(send("POST", { note_id: N1, done: false }), ctx());
  assert.deepEqual(doors.at(-1), ["done", { p_note_id: N1, p_done: false }]);
  await refused(noteDone.POST.run(send("POST", { note_id: N1, version: 9 }), ctx()), "conflict", 409);
  await refused(noteDone.POST.run(send("POST", { note_id: N2 }), ctx()), "validation", 400, "only a step is done");
  const n = doors.length;
  await refused(noteDone.POST.run(send("POST", { note_id: N1 }), ctx(P1)), "forbidden", 403, "a viewer marks nothing");
  assert.equal(doors.length, n, "and no door opened for it");

  // People's rows: who each next step is for, from the team, and the team read only when a step is for someone.
  let roster = 0;
  const listCtx = (rows) =>
    ctxFor(
      { memberships: both("viewer", "viewer"), policies: [], tenants: [], tenant_config: [] },
      {},
      {
        people_list: () => rows,
        team_roster: () => (
          roster++,
          [
            { member_user_id: USER, display_name: "Ada", email: "ada@example.com" },
            { member_user_id: "u2", display_name: "Sam", email: "sam@example.com" },
          ]
        ),
      },
    );
  const step = (id, forWho) => ({
    step_id: id,
    step_body: "Call",
    step_due_on: "2026-09-30",
    step_for_user_id: forWho,
  });
  const plain = await contacts.GET.run(get(inA), listCtx([personRow(P1, step(N1, null))]));
  assert.equal(roster, 0, "no step for anyone: the team is not read");
  assert.equal("step_for_name" in plain.people[0], false);
  const named = await contacts.GET.run(
    get(inA),
    listCtx([personRow(P1, step(N1, "u2")), personRow(P2, step(N2, USER)), personRow(P3)]),
  );
  assert.equal(roster, 1, "read once for the whole page");
  assert.deepEqual(
    named.people.map((p) => [p.step_for_name ?? null, p.step_for_me ?? null]),
    [
      ["Sam", false],
      ["Ada", true],
      [null, null],
    ],
  );
});

test("both People reads answer the workspace's pace where deals are on: its last year's yeses, their median wait and how many; the list reads it with its first page alone; none where deals are off", async () => {
  const now = Date.now();
  const DAY = 86_400_000;
  const iso = (ms) => new Date(ms).toISOString();
  const deal = (n, days, stage = "won") => ({
    id: `dddddddd-000${n}-4000-8000-dddddddddddd`,
    tenant_id: A,
    contact_id: P1,
    service: `Service ${n}`,
    stage,
    proposed_at: iso(now - (days + 3) * DAY),
    decided_at: iso(now - 3 * DAY),
    ended_at: null,
    amount_cents: null,
    per: null,
    currency: "USD",
    note: null,
    version: 1,
    created_at: iso(now - 60 * DAY),
    proposal_url: null,
    valid_until: null,
    lost_reason: null,
  });
  const world = (sellsBy) => ({
    memberships: both("viewer", "viewer"),
    policies: [],
    tenant_config: [],
    contacts: [contact(P1, A)],
    deals: [deal(1, 4), deal(2, 10), deal(3, 12), deal(4, 20), deal(5, 6, "ended"), deal(6, 2, "lost")],
    tenants: [{ id: A, slug: "harbor", sells_by: sellsBy }],
  });
  const rpcs = {
    people_list: (a) => (a.p_tenant_id === A && (!a.p_contact_id || a.p_contact_id === P1) ? [personRow(P1)] : []),
  };
  const list = async (s, q = "") => (await contacts.GET.run(get(inA + q), ctxFor(world(s), {}, rpcs))).deal_pace;
  const page = async (s) => (await person.GET.run(get(inA), ctxFor(world(s), { id: P1 }, rpcs))).person.deal_pace;
  // 4, 6, 10, 12 and 20 days: a pass is not a yes, an ended engagement was one.
  assert.deepEqual(await list("proposal"), { median_days: 10, yeses: 5 });
  assert.deepEqual(await page("proposal"), { median_days: 10, yeses: 5 }, "the person's page reads the same pace");
  assert.equal(await list("proposal", "&q=ro"), null, "a search reads no pace: People keeps its first page's");
  assert.equal(await list("booking"), null, "deals off: no pace");
  assert.equal(await page("booking"), null);
  // A read that fails costs the pace, never the list, and says so in the log.
  const logged = [];
  const keep = console.error;
  console.error = (...a) => logged.push(asText(a));
  try {
    const r = await contacts.GET.run(get(inA), {
      ...ctxFor(world("proposal"), {}, rpcs),
      supabase: fakeDb(world("proposal"), { "deals.select": { message: "statement timeout" } }, rpcs),
    });
    assert.equal(r.deal_pace, null);
    assert.equal(r.people.length, 1);
  } finally {
    console.error = keep;
  }
  assert.ok(
    logged.some((l) => l.startsWith("deal_pace_read_failed")),
    logged.join("\n"),
  );
});

test("the proposal follow-up's facts (0006): answered with People's first page where deals are on and its run would send -- its clock, whether it asks, what its template is for, and of who holds a proposal out, who had theirs, who is in a run on its way or waiting for a person, who heard this week; null otherwise", async () => {
  const now = Date.now();
  const DAY = 86_400_000;
  const iso = (ms) => new Date(ms).toISOString();
  const P4 = "44444444-4444-4444-8444-444444444444";
  const P5 = "55555555-5555-4555-8555-555555555555";
  const P6 = "66666666-6666-4666-8666-666666666666";
  const link = [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }];
  const run = (id, over) => ({
    id,
    tenant_id: A,
    playbook_id: "pb-follow",
    state: "sent",
    scheduled_for: iso(now - 2 * DAY),
    created_at: iso(now - 2 * DAY),
    run_for: null,
    params: link,
    ...over,
  });
  const policy = (mode) => ({
    tenant_id: A,
    class: "follow_up",
    mode,
    subject_type: null,
    subject_id: null,
    limits: {},
  });
  const playbook = (over = {}) => ({
    id: "pb-follow",
    tenant_id: A,
    trigger: "proposal_waiting",
    state: "running",
    run_hour: 10,
    last_run_for: null,
    template_name: "proposal_follow_up",
    template_language: "en_US",
    ...over,
  });
  const tenant = (over = {}) => ({
    id: A,
    slug: "harbor",
    sells_by: "proposal",
    timezone: "America/New_York",
    status: "active",
    ...over,
  });
  const template = (over = {}) => ({
    id: "tpl-follow",
    tenant_id: A,
    channel: "whatsapp",
    name: "proposal_follow_up",
    language: "en_US",
    meta_status: "approved",
    category: "utility",
    ...over,
  });
  const number = (config = { quality_rating: "GREEN" }) => ({
    tenant_id: A,
    kind: "whatsapp",
    status: "active",
    config,
  });
  const deal = (id, contact_id) => ({
    id,
    tenant_id: A,
    contact_id,
    stage: "proposed",
    proposed_at: iso(now - 20 * DAY),
  });
  const sent = (broadcast_id, contact_id, ms) => ({
    tenant_id: A,
    broadcast_id,
    contact_id,
    state: "sent",
    sent_at: iso(ms),
  });
  const queued = (broadcast_id, contact_id) => ({
    tenant_id: A,
    broadcast_id,
    contact_id,
    state: "queued",
    sent_at: null,
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now));
  const world = (over = {}) => ({
    memberships: both("viewer", "viewer"),
    policies: [policy("ask")],
    tenant_config: [],
    contacts: [contact(P1, A)],
    tenants: [tenant()],
    tenant_channels: [number()],
    templates: [template()],
    playbooks: [playbook()],
    // Who holds a proposal out: everyone here but P3.
    deals: [deal(D1, P1), deal("d-2", P2), deal("d-4", P4), deal("d-5", P5), deal("d-6", P6)],
    broadcasts: [
      run("sent-run", {}),
      run("queued-run", { state: "scheduled", scheduled_for: iso(now + 3_600_000) }),
      run("held-run", { state: "pending_approval", scheduled_for: iso(now), created_at: iso(now), run_for: today }),
      // Twelve days ago: past the week's breath, since the proposals went.
      run("old-run", { scheduled_for: iso(now - 12 * DAY), created_at: iso(now - 12 * DAY) }),
      run("winback", { playbook_id: "pb-win", params: [{ kind: "first_name" }] }),
    ],
    broadcast_recipients: [
      sent("sent-run", P1, now - 2 * DAY),
      // Followed up on a proposal since decided: nothing of theirs is out now.
      sent("sent-run", P3, now - 2 * DAY),
      queued("queued-run", P2),
      queued("held-run", P4),
      sent("old-run", P6, now - 12 * DAY),
      sent("winback", P3, now - 2 * DAY),
      sent("winback", P5, now - 2 * DAY),
    ],
    ...over,
  });
  const rpcs = { people_list: (a) => (a.p_tenant_id === A ? [personRow(P1)] : []) };
  const read = async (w, q = "") => (await contacts.GET.run(get(inA + q), ctxFor(w, {}, rpcs))).follow_up;
  const f = await read(world());
  assert.deepEqual([f.run_hour, f.last_run_for, f.asks, f.purpose], [10, null, true, "conversational"]);
  assert.deepEqual(
    Object.keys(f.had).sort(),
    [P1, P6].sort(),
    "the follow-ups that went, however long ago, since the proposals did; a win-back is none",
  );
  assert.deepEqual(Object.keys(f.queued), [P2], "the one in a run on its way");
  assert.deepEqual(Object.keys(f.held), [P4], "the one in a run waiting for a person");
  assert.deepEqual(
    Object.keys(f.heard).sort(),
    [P1, P2, P4, P5].sort(),
    "whom any run reached this week, of who holds a proposal out: the week's breath",
  );
  assert.equal((await read(world({ policies: [policy("auto")] }))).asks, false, "auto: its runs go");
  assert.equal((await read(world({ policies: [] }))).asks, true, "a class with no row runs as ask");
  assert.equal(
    (await read(world({ templates: [template({ category: "marketing" })] }))).purpose,
    "marketing",
    "Meta filed it as marketing: it reaches only a yes to offers too",
  );
  assert.equal(
    (await read(world({ templates: [template({ category: null })] }))).purpose,
    "marketing",
    "never synced: read as marketing, as the send reads it",
  );
  // Wherever its run would send nothing whoever it drew: no facts, and every row says what it said. A stop is the
  // rule, never a read that failed: a failure answers null too, and says so in the log.
  const stopped = [];
  const was = console.error;
  console.error = (...a) => stopped.push(a.join(" "));
  try {
    for (const [over, why] of [
      [{ policies: [policy("never")] }, "its class set to never"],
      [{ playbooks: [playbook({ state: "paused" })] }, "paused"],
      [{ playbooks: [] }, "none made"],
      [{ deals: [] }, "no proposal out: nobody to say anything of"],
      [{ tenants: [tenant({ sells_by: "booking" })] }, "deals off"],
      [{ tenants: [tenant({ status: "paused" })] }, "the workspace paused: the sweep runs nothing"],
      [{ tenant_channels: [] }, "no WhatsApp number"],
      [{ templates: [] }, "its template gone"],
      [{ templates: [template({ meta_status: "pending" })] }, "its template not one Meta approved"],
      [{ tenant_channels: [number({ quality_rating: "RED" })] }, "its number flagged"],
    ])
      assert.equal(await read(world(over)), null, why);
  } finally {
    console.error = was;
  }
  assert.deepEqual(stopped, [], "every stop is the rule's, none a failure");
  assert.equal(await read(world(), "&q=ro"), null, "a search reads none: People keeps its first page's");
  // A read that fails costs the facts, never the list, and says so in the log.
  const logged = [];
  const keep = console.error;
  console.error = (...a) => logged.push(asText(a));
  try {
    for (const fail of ["playbooks.select", "templates.select", "tenant_channels.select"]) {
      const r = await contacts.GET.run(get(inA), {
        ...ctxFor(world(), {}, rpcs),
        supabase: fakeDb(world(), { [fail]: { message: "statement timeout" } }, rpcs),
      });
      assert.deepEqual([r.follow_up, r.people.length], [null, 1], fail);
    }
  } finally {
    console.error = keep;
  }
  assert.equal(logged.filter((l) => l.startsWith("follow_up_facts_failed")).length, 3, logged.join("\n"));
});

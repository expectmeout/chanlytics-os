/**
 * Pausing or resuming the receptionist for one person is in that person's history.
 *
 * The door records it against the CONTACT (decisions.subject_type 'contact': core person-mode, and the many-at-once
 * door beside it), and the timeline already had its words (DECISION_LABELS: "Paused the receptionist"). But the person
 * reader fetched decisions on their threads alone (subject_type 'conversation'), so a pause never reached the page, and
 * a person with no thread at all had no decisions to read. Run through the real routes over one database in memory:
 * the owner makes the change, the person's own route answers, and the timeline is drawn from what it answered.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toPersonVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const person = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));
const receptionist = await import(at("apps/dashboard/app/api/v1/contacts/[id]/receptionist/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_T = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";
const C1 = "cccccccc-1111-4111-8111-cccccccccccc";
const USER = "u1";
const TZ = "America/New_York";

const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: T, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: TZ, sells_by: null }],
  tenant_config: [
    {
      tenant_id: T,
      config: {
        brain: {
          business_name: "Harbor",
          system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
        },
      },
    },
  ],
  contacts: [
    { id: ADA, tenant_id: T, phone_e164: "+19175550100", display_name: "Ada Lovelace", erased_at: null, notes: null },
    { id: BEN, tenant_id: T, phone_e164: "+19175550101", display_name: "Ben Example", erased_at: null, notes: null },
  ],
  contact_identities: [],
  conversations: [
    {
      id: C1,
      tenant_id: T,
      contact_id: ADA,
      state: "open",
      paused_until: null,
      last_wa_inbound_at: "2026-09-20T15:00:00Z",
      last_message_at: "2026-09-20T15:00:00Z",
    },
  ],
  messages: [],
  escalations: [],
  decisions: [
    // On Ada's thread: a snooze, which the page already showed.
    {
      id: "d-thread",
      tenant_id: T,
      subject_type: "conversation",
      subject_id: C1,
      verb: "snooze",
      actor_type: "user",
      actor_user_id: USER,
      payload: {},
      created_at: "2026-09-20T16:00:00Z",
    },
    // About Ben, and about someone in another workspace: neither is Ada's.
    {
      id: "d-ben",
      tenant_id: T,
      subject_type: "contact",
      subject_id: BEN,
      verb: "pause_agent",
      actor_type: "user",
      actor_user_id: USER,
      payload: { receptionist_mode: "never" },
      created_at: "2026-09-20T17:00:00Z",
    },
    {
      id: "d-elsewhere",
      tenant_id: OTHER_T,
      subject_type: "contact",
      subject_id: ADA,
      verb: "pause_agent",
      actor_type: "user",
      actor_user_id: "u9",
      payload: { receptionist_mode: "never" },
      created_at: "2026-09-20T18:00:00Z",
    },
  ],
  calls: [],
  policies: [],
  events: [],
  deals: [],
});

const rpcs = {
  people_list: (a) =>
    a.p_tenant_id === T
      ? [
          { id: ADA, display_name: "Ada Lovelace", phone_e164: "+19175550100", consent: "opted_in", dnc: false },
          { id: BEN, display_name: "Ben Example", phone_e164: "+19175550101", consent: "opted_in", dnc: false },
        ].filter((r) => r.id === a.p_contact_id)
      : [],
};

const ctx = (db, params) => ({ supabase: fakeDb(db, {}, rpcs), userId: USER, email: "ada@example.com", params });
const request = (url, init) =>
  new Request(`http://localhost/api/v1/${url}${url.includes("?") ? "&" : "?"}workspace=${T}`, init);

const read = async (db, id) => (await person.GET.run(request(`contacts/${id}`), ctx(db, { id }))).person;
const decide = (db, id, mode) =>
  receptionist.PUT.run(
    request(`contacts/${id}/receptionist`, { method: "PUT", body: JSON.stringify({ mode }) }),
    ctx(db, { id }),
  );
const timelineOf = (dto) =>
  toPersonVM(dto, TZ, new Date("2026-09-21T12:00:00Z"), USER).timeline.filter((t) => t.kind === "decision");

test("a pause the owner made for them is on their page, with the thread's decisions and not another person's or another workspace's", async () => {
  const db = tables();
  const before = await read(db, ADA);
  assert.deepEqual(
    before.decisions.map((d) => d.id),
    ["d-thread"],
    "only the thread's decision was read, and nothing else was theirs",
  );

  const paused = await decide(db, ADA, "never");
  const after = await read(db, ADA);
  assert.deepEqual(
    after.decisions.map((d) => [d.verb, d.subject_type, d.subject_id]),
    [
      ["pause_agent", "contact", ADA],
      ["snooze", "conversation", C1],
    ],
    "REGRESSION: the pause is recorded against them, and the reader never asked for it. Newest first",
  );
  assert.equal(after.decisions[0].id, paused.decision_id);
  assert.deepEqual(after.decisions[0].payload, { receptionist_mode: "never" });

  const items = timelineOf(after);
  assert.deepEqual(
    items.map((i) => [i.who, i.text]),
    [
      ["Paused the receptionist", "You paused automatic replies"],
      ["Snoozed", "You snoozed the thread"],
    ],
    "the timeline's own labels, now fed: the pause reads in their history",
  );
});

test("resuming reads the same way, and the page of a person with no thread still has their own decisions", async () => {
  const db = tables();
  assert.deepEqual((await read(db, BEN)).conversations, [], "Ben has no thread");
  const before = await read(db, BEN);
  assert.deepEqual(
    before.decisions.map((d) => d.id),
    ["d-ben"],
    "REGRESSION: a person with no thread read no decisions at all, whatever was recorded about them",
  );
  await decide(db, BEN, "inherit");
  const after = await read(db, BEN);
  assert.deepEqual(
    after.decisions.map((d) => d.verb),
    ["resume_agent", "pause_agent"],
  );
  assert.deepEqual(
    timelineOf(after).map((i) => i.who),
    ["Resumed the receptionist", "Paused the receptionist"],
  );
});

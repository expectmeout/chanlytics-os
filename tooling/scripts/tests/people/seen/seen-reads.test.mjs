/**
 * What a member has seen of a person rides each list's read (00346; server/people/person-seen.ts).
 *
 * The Inbox's and Conversations' read (readers/conversations.ts) says, for the member asking, when they last saw each
 * person and whether they put them back; the mark is one call to the door. And either deploy order works: a dashboard
 * deployed before the migration, or a reader run for Ask with no member behind its client, says nothing of anyone's
 * reading, so nothing is called new, where a list that failed to load would be the cost of an unread dot.
 *
 * Run over the database in memory, whose contact_seen answers from the floor and the marks a fixture holds
 * (_fake-db.mjs); the doors themselves are proved on a real Postgres by seen.db.test.mjs, beside this.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toConversationVM, toInboxThreadVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { conversations } = await import(at("apps/dashboard/src/server/readers/conversations.ts"));
const { seenOfPeople, markPersonSeen } = await import(at("apps/dashboard/src/server/people/person-seen.ts"));

const ZONE = "America/New_York";
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const K1 = "11111111-1111-4111-8111-111111111111";
const K2 = "22222222-2222-4222-8222-222222222222";
const K3 = "33333333-3333-4333-8333-333333333333";

const convo = (id, contactId, name, lastInbound) => ({
  id,
  tenant_id: T,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: lastInbound,
  last_message_at: "2026-10-07T12:00:00Z",
  last_inbound_at: lastInbound,
  contact_id: contactId,
  contacts: {
    id: contactId,
    display_name: name,
    wa_profile_name: null,
    phone_e164: "+15550000001",
    email: null,
    consent: "opted_in",
    dnc: false,
    marketing_consent: null,
    proposal_url: null,
  },
});
const ctxOf = (tables, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
const turn = (ctx) => kernel.readerContext(ctx, { tenantId: T, role: "viewer" });

test("the Inbox's read says, for the member asking, when they last saw each person and whether they put them back: one call to the door for the page", async () => {
  const ctx = ctxOf({
    conversations: [
      convo("c1", K1, "Ada Example", "2026-10-07T11:00:00Z"),
      convo("c2", K2, "Bea Example", "2026-10-07T09:00:00Z"),
      convo("c3", K3, "Cy Example", "2026-10-07T11:30:00Z"),
    ],
    messages: [],
    // Everything before ten is seen (the floor); Ada was opened at 11:15, after she wrote; Cy was put back.
    contact_reads: [{ tenant_id: T, user_id: USER, seen_at: "2026-10-07T10:00:00Z" }],
    contact_marks: [
      {
        tenant_id: T,
        contact_id: K1,
        user_id: USER,
        seen_at: "2026-10-07T11:15:00Z",
        unread_at: null,
        marked_at: "2026-10-07T11:15:02Z",
      },
      {
        tenant_id: T,
        contact_id: K3,
        user_id: USER,
        seen_at: "2026-10-07T11:45:00Z",
        unread_at: "2026-10-07T11:50:00Z",
      },
    ],
  });
  const read = await kernel.load(turn(ctx), conversations, { ids: null });
  const by = new Map(read.data.conversations.map((c) => [c.id, c]));
  assert.deepEqual(
    [by.get("c1").last_inbound_at, by.get("c1").seen_at, by.get("c1").marked_unread, by.get("c1").marked_at],
    ["2026-10-07T11:00:00Z", "2026-10-07T11:15:00.000Z", undefined, "2026-10-07T11:15:02Z"],
    "her own mark, later than the floor, and the stamp of its writing for the tab that made it",
  );
  assert.equal(by.get("c2").marked_at, undefined, "no mark of their own: no stamp");
  assert.deepEqual([by.get("c2").seen_at, by.get("c2").marked_unread], ["2026-10-07T10:00:00.000Z", undefined]);
  assert.deepEqual([by.get("c3").seen_at, by.get("c3").marked_unread], ["2026-10-07T11:45:00.000Z", true]);

  // And the two view models say the same of each: Ada read, Bea before the floor, Cy put back.
  const now = new Date("2026-10-07T12:30:00Z");
  assert.deepEqual(
    ["c1", "c2", "c3"].map((id) => toInboxThreadVM(by.get(id), null, ZONE, now).unread),
    [false, false, true],
  );
  assert.deepEqual(
    ["c1", "c2", "c3"].map((id) => toConversationVM(by.get(id), null, ZONE, now).unseen),
    [false, false, true],
  );
  const asked = ctx.supabase.seen.filter((q) => q.rpc === "contact_seen");
  assert.equal(asked.length, 1, "one call for the whole page");
  assert.deepEqual(asked[0].args, { p_tenant_id: T, p_contact_ids: [K1, K2, K3] });
});

test("someone who wrote after the member last looked is new to them, by that same read", async () => {
  const ctx = ctxOf({
    conversations: [convo("c1", K1, "Ada Example", "2026-10-07T11:00:00Z")],
    messages: [],
    contact_reads: [{ tenant_id: T, user_id: USER, seen_at: "2026-10-07T10:00:00Z" }],
    contact_marks: [],
  });
  const read = await kernel.load(turn(ctx), conversations, { ids: null });
  const [c] = read.data.conversations;
  assert.equal(toInboxThreadVM(c, null, ZONE, new Date("2026-10-07T12:30:00Z")).unread, true);
});

test("either deploy order: before the migration, and with no member behind the client, nothing is known and nothing is called new; any other failure is the read's", async () => {
  const refusing = (code) =>
    ctxOf(
      { conversations: [convo("c1", K1, "Ada Example", "2026-10-07T11:00:00Z")], messages: [] },
      {
        contact_seen: () => {
          throw Object.assign(new Error("refused"), { code });
        },
      },
    );
  for (const code of ["PGRST202", "42883", "28000"]) {
    const ctx = refusing(code);
    assert.deepEqual((await seenOfPeople(ctx, T, [K1]))(K1), {}, code);
    const read = await kernel.load(turn(ctx), conversations, { ids: null });
    const [c] = read.data.conversations;
    assert.deepEqual([c.seen_at, c.marked_unread], [undefined, undefined], `${code}: the list still reads`);
    assert.equal(toInboxThreadVM(c, null, ZONE, new Date("2026-10-07T12:30:00Z")).unread, false, code);
  }
  await assert.rejects(() => seenOfPeople(refusing("P0002"), T, [K1]), "not their workspace is a refusal, not a blank");
  await assert.rejects(() => seenOfPeople(refusing("57014"), T, [K1]), "a timeout is a read that failed");

  // Nobody asked about asks nothing.
  const quiet = refusing("57014");
  assert.deepEqual((await seenOfPeople(quiet, T, []))(K1), {});
  assert.equal(quiet.supabase.seen.filter((q) => q.rpc === "contact_seen").length, 0);
});

test("the mark is the door's own answer, said as the row says it; what the door refuses is carried back", async () => {
  const calls = [];
  const ctx = ctxOf(
    {},
    {
      contact_mark: (args) => {
        calls.push(args);
        const marked_at = "2026-10-07T12:00:01Z";
        return args.p_seen
          ? { contact_id: args.p_contact_id, seen_at: args.p_heard_at, unread_at: null, marked_at }
          : {
              contact_id: args.p_contact_id,
              seen_at: "2026-10-07T11:00:00Z",
              unread_at: "2026-10-07T12:00:00Z",
              marked_at,
            };
      },
    },
  );
  // Opened: seen up to the customer's last moment as the member's screen held it, and stamped by the database.
  assert.deepEqual(await markPersonSeen(ctx, K1, { seen: true, heardAt: "2026-10-07T11:30:00Z" }), {
    contact_id: K1,
    seen_at: "2026-10-07T11:30:00Z",
    marked_unread: false,
    marked_at: "2026-10-07T12:00:01Z",
  });
  assert.deepEqual(await markPersonSeen(ctx, K1, { seen: false, heardAt: null }), {
    contact_id: K1,
    seen_at: "2026-10-07T11:00:00Z",
    marked_unread: true,
    marked_at: "2026-10-07T12:00:01Z",
  });
  assert.deepEqual(
    calls,
    [
      { p_contact_id: K1, p_seen: true, p_heard_at: "2026-10-07T11:30:00Z" },
      { p_contact_id: K1, p_seen: false },
    ],
    "a moment is handed on where there is one, and left to the door's own clock where there is none",
  );

  const stranger = ctxOf(
    {},
    {
      contact_mark: () => {
        throw Object.assign(new Error("person not found"), { code: "P0002" });
      },
    },
  );
  await assert.rejects(
    () => markPersonSeen(stranger, K1, { seen: true, heardAt: null }),
    (e) => e.status === 404,
    "not their person: not found, as the door says",
  );
});

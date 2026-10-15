/**
 * The owner answers a booking the receptionist asked for through one door (POST conversations/:id/booking-request,
 * decision 0061), which Today's row, the Inbox's thread and the Calendar's visit all press: an operator's Booked it
 * reaches the database's door with the thread's open request and answers with the confirmation drafted from the row's
 * own words, in the business's clock; Can't hands the door the line the thread's hold will say; a viewer, a thread with
 * nothing waiting, a body that is not a yes or a no, and the door's own refusals are each refused in a sentence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const route = await import(at("apps/dashboard/app/api/v1/conversations/[id]/booking-request/route.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ROW = "dddddddd-0000-4000-8000-00000000d001";
const TZ = "America/New_York";

/** The workspace as the route reads it: the caller's seat, the thread, and the request (or none) waiting in it. */
function world(role, answer, { request = true } = {}) {
  const doors = [];
  const tables = {
    memberships: [
      { user_id: "u1", tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
    contacts: [{ id: "k1", tenant_id: T, phone_e164: "+13055550142", display_name: "Ana Ruiz" }],
    conversations: [{ id: CONV, tenant_id: T, contact_id: "k1", state: "needs_human" }],
    appointments: request
      ? [
          {
            id: ROW,
            tenant_id: T,
            contact_id: "k1",
            conversation_id: CONV,
            source: "receptionist",
            status: "proposed",
            starts_at: "2026-10-17T18:00:00.000Z",
            ends_at: "2026-10-17T20:00:00.000Z",
            service: "Balayage",
            timezone: TZ,
            created_at: "2026-10-15T12:00:00.000Z",
          },
        ]
      : [],
  };
  const ctx = {
    supabase: fakeDb(
      tables,
      {},
      {
        booking_request_answer: (a) => {
          doors.push(a);
          return answer;
        },
      },
    ),
    userId: "u1",
    email: "ada@example.com",
    params: { id: CONV },
  };
  return { ctx, doors };
}
const post = (body) =>
  new Request(`http://localhost/api/v1/conversations/${CONV}/booking-request`, {
    method: "POST",
    body: JSON.stringify(body),
  });
const BOOKED = { appointment: { id: ROW, status: "booked" }, hold: "resolved", decision_id: "dec-1" };

test("Booked it reaches the door with the thread's request, and answers with the confirmation for the member to send", async () => {
  const w = world("operator", BOOKED);
  const out = await route.POST.run(post({ booked: true }), w.ctx);
  assert.deepEqual(out, {
    appointment: { id: ROW, status: "booked" },
    hold: "resolved",
    decision_id: "dec-1",
    reply: "You're booked for Saturday, October 17 at 2:00 PM for a Balayage.",
  });
  assert.deepEqual(w.doors, [{ p_appointment_id: ROW, p_booked: true }]);
});

test("Can't hands the door the line the thread's hold will say, in the business's clock, and drafts nothing", async () => {
  const w = world("operator", { appointment: { id: ROW, status: "cancelled" }, hold: "reply", decision_id: "dec-2" });
  const out = await route.POST.run(post({ booked: false }), w.ctx);
  assert.equal(out.reply, null);
  assert.deepEqual(w.doors, [
    {
      p_appointment_id: ROW,
      p_booked: false,
      p_reply_words: "Could not book Sat, Oct 17, 2:00 PM · Balayage: reply to them",
    },
  ]);
});

test("refused in a sentence: a viewer, a thread with nothing waiting, a body that is no answer, and the door's own refusals", async () => {
  const viewer = world("viewer", BOOKED);
  await assert.rejects(route.POST.run(post({ booked: true }), viewer.ctx), (e) => e.status === 403);
  const none = world("operator", BOOKED, { request: false });
  await assert.rejects(route.POST.run(post({ booked: true }), none.ctx), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /Nothing here waits to be confirmed/);
    return true;
  });
  const odd = world("operator", BOOKED);
  await assert.rejects(route.POST.run(post({ booked: "yes" }), odd.ctx), (e) => e.code === "validation");
  assert.deepEqual([...viewer.doors, ...none.doors, ...odd.doors], [], "nothing reached the door for a refusal");
  const answered = world("operator", { error: "answered", status: "booked" });
  await assert.rejects(route.POST.run(post({ booked: true }), answered.ctx), (e) => {
    assert.equal(e.code, "validation");
    assert.equal(e.message, "It was answered already.");
    return true;
  });
});

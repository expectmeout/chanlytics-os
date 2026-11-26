/**
 * A time asked for on a form, as its owner answers it (00691; the Forms plan, F3; decision 0061), through the
 * dashboard's own routes over a database in memory: the request's page says the time and how long it is held, and it is
 * answered Booked it or Can't by the chat's own door, with the decision the member's. Booked it answers with the reply
 * it drafts from the visit's own words, for the member to send: nothing reaches the person by either press, and the
 * request waits in Needs you until they are told.
 *
 * The plan's "done when" lines lead: two people who ask for the same time are two requests, and the owner books one
 * and tells the other it can't; a request past its day is never booked blind; a confirmed visit is the form's, and the
 * link its request came through says where it came from.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { A, emailWire, FORM, formWorld, V1 } from "../_form-requests.mjs";
import { formTimeDoors } from "./_doors.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const name of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[name];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const requests = await import(at("apps/dashboard/app/api/v1/forms/requests/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { readerContext, load } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { formRequestsOpen } = await import(at("apps/dashboard/src/server/readers/forms.ts"));
const { getEmailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
const { formRowsOf } = await import(at("packages/contracts/src/today/queue/form-rows.ts"));

const wire = emailWire(getEmailWire);
beforeEach(async () => {
  setRateStore(memoryStore());
  await wire.says(true);
});
after(() => {
  setServiceClient(null);
  wire.undo();
});

const U = "11111111-1111-4111-8111-111111111111";
const HOUR_MS = 3_600_000;

/** The salon's world with its owner signed in, the time doors over its own, and the service role the same world's. */
function world() {
  const made = formWorld({
    more: {
      memberships: [
        {
          user_id: U,
          tenant_id: A,
          role: "owner",
          tenants: { slug: "luma-salon", name: "Luma Salon", timezone: "America/New_York" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      messages: [],
      appointments: [],
    },
    rpcs: (tables, doors, clock) => formTimeDoors(tables, doors, { clock }),
  });
  setServiceClient(made.db);
  const ctx = { supabase: made.db, userId: U, email: "ada@example.com", params: {} };
  const address = (route, query = "") => `http://localhost/api/v1/${route}?workspace=${A}${query}`;
  /** A visitor asks for a time `hours` from now, as the page sends it (a-visitor-asks-for-a-time proves the page). */
  const asks = async (reach, hours, service = "Balayage") => {
    const startsAt = new Date(made.clock.now + hours * HOUR_MS).toISOString();
    const { data } = await made.db.rpc("form_time_request_take", {
      p_tenant_id: A,
      p_form_id: FORM,
      p_version_id: V1,
      p_ref: crypto.randomUUID(),
      p_answers: { f1name: reach.name, f2mail: reach.email, f4want: "A warm, soft blonde." },
      p_reach: { name: reach.name, email: reach.email, phone: null },
      p_words: "0".repeat(64),
      p_starts_at: startsAt,
      p_ends_at: new Date(Date.parse(startsAt) + 2 * HOUR_MS).toISOString(),
      p_service: service,
      p_timezone: "America/New_York",
      p_link_code: "k7q2md",
    });
    return data;
  };
  return {
    ...made,
    ctx,
    asks,
    requestOf: (id) => requests.GET.run(new Request(address("forms/requests", `&id=${id}`)), ctx),
    pressRequest: (body) =>
      requests.POST.run(new Request(address("forms/requests"), { method: "POST", body: JSON.stringify(body) }), ctx),
  };
}

async function refused(p, words) {
  await assert.rejects(p, (e) => {
    assert.match(e.message, words);
    return true;
  });
}

const ANA = { name: "Ana Ruiz", email: "ana@example.com" };
const BEA = { name: "Bea Lopez", email: "bea@example.com" };

test("the request says the time it asked for, held a day at most, and nobody's in its way", async () => {
  const w = world();
  const ana = await w.asks(ANA, 48);
  const dto = await w.requestOf(ana.entry_id);
  assert.ok(dto.time, "the request carries its time");
  assert.equal(dto.time.status, "proposed");
  assert.equal(dto.time.holds, true);
  assert.equal(dto.time.service, "Balayage");
  assert.equal(dto.time.taken_by, null);
  assert.equal(dto.time.timezone, "America/New_York");
  assert.ok(Math.abs(Date.parse(dto.time.expires_at) - (w.clock.now + 23 * HOUR_MS)) < 60_000, "held 23 hours");
  assert.equal(dto.standing, "open");
  assert.equal(dto.place, "Your link", "the link its request came through");
});

test("Booked it books it with the chat's own door, drafts the reply, and leaves the request until they are told", async () => {
  const w = world();
  const ana = await w.asks(ANA, 48);
  const pressed = await w.pressRequest({ act: "book", entry_id: ana.entry_id });
  assert.match(pressed.reply, /^You're booked for .+ at .+ for a Balayage\.$/);
  assert.equal(pressed.message_id, null, "nothing was sent");
  const visit = w.tables.appointments.find((v) => v.id === ana.time.appointment_id);
  assert.equal(visit.status, "booked");
  const dto = await w.requestOf(ana.entry_id);
  assert.equal(dto.time.status, "booked");
  assert.equal(dto.time.holds, false);
  assert.equal(dto.standing, "open", "it waits in Needs you until the person is told");
  await refused(w.pressRequest({ act: "book", entry_id: ana.entry_id }), /answered already/i);
});

test("two people who ask for the same time: the owner books one, and the other says the time is taken and can't", async () => {
  const w = world();
  const ana = await w.asks(ANA, 50);
  const bea = await w.asks(BEA, 50, "Gloss");
  assert.notEqual(ana.time.appointment_id, bea.time.appointment_id, "two requests");
  assert.equal((await w.requestOf(bea.entry_id)).time.taken_by, null, "a request takes nothing from another");
  await w.pressRequest({ act: "book", entry_id: ana.entry_id });
  const beas = await w.requestOf(bea.entry_id);
  assert.equal(beas.time.taken_by, "Ana Ruiz", "the time is booked now, for her");
  assert.equal(beas.time.holds, true, "Bea's request still waits on its answer");
  const cant = await w.pressRequest({ act: "cant", entry_id: bea.entry_id });
  assert.equal(cant.reply, null, "Can't drafts nothing of its own: the reply offers other times");
  assert.equal(w.tables.appointments.find((v) => v.id === bea.time.appointment_id).status, "cancelled");
  assert.equal((await w.requestOf(bea.entry_id)).standing, "open", "she still has to be told");
});

test("past its day a request is never booked blind: Booked it is refused, Can't still answers it", async () => {
  const w = world();
  const ana = await w.asks(ANA, 30);
  // Its day has passed: nobody answered it in time.
  w.tables.appointments.find((v) => v.id === ana.time.appointment_id).expires_at = new Date(
    w.clock.now - 60_000,
  ).toISOString();
  const dto = await w.requestOf(ana.entry_id);
  assert.equal(dto.time.status, "proposed");
  assert.equal(dto.time.holds, false, "it holds its time no longer");
  await refused(w.pressRequest({ act: "book", entry_id: ana.entry_id }), /.+/);
  assert.equal(w.tables.appointments.find((v) => v.id === ana.time.appointment_id).status, "proposed");
  await w.pressRequest({ act: "cant", entry_id: ana.entry_id });
  assert.equal(w.tables.appointments.find((v) => v.id === ana.time.appointment_id).status, "cancelled");
});

test("a request that asked for no time has nothing to book", async () => {
  const w = world();
  const { data } = await w.db.rpc("form_request_take", {
    p_tenant_id: A,
    p_form_id: FORM,
    p_version_id: V1,
    p_ref: crypto.randomUUID(),
    p_answers: { f1name: "Cy", f2mail: "cy@example.com", f4want: "A trim." },
    p_reach: { name: "Cy", email: "cy@example.com", phone: null },
    p_words: "0".repeat(64),
  });
  assert.equal((await w.requestOf(data.entry_id)).time, null);
  await refused(w.pressRequest({ act: "book", entry_id: data.entry_id }), /asked for no time/);
});

test("Needs you says the time first, and where it stands", async () => {
  const w = world();
  const ana = await w.asks(ANA, 48);
  const bea = await w.asks(BEA, 30, "Gloss");
  await w.pressRequest({ act: "book", entry_id: bea.entry_id });
  const member = { tenantId: A, role: "owner", userId: U };
  const { data } = await load(readerContext(w.ctx, member), formRequestsOpen, undefined);
  const anas = data.requests.find((r) => r.id === ana.entry_id);
  assert.equal(anas.time.holds, true);
  const rows = formRowsOf({ now: new Date(w.clock.now), formRequests: data.requests, formHeld: [] });
  const anaRow = rows.find((r) => r.id === `q-f-${ana.entry_id}`);
  assert.match(anaRow.sentence, /^Asked for .+ · Balayage$/);
  assert.deepEqual(anaRow.status, ["Booked it or Can't"]);
  assert.equal(anaRow.quoted, false, "the time is the business's words, not theirs");
  const beaRow = rows.find((r) => r.id === `q-f-${bea.entry_id}`);
  assert.deepEqual(beaRow.status, ["Booked · tell them"]);
});

/**
 * A site's form has a held pile of its own (00726; the whole-system plan of 28 Nov 2026, lane 3), through the
 * dashboard's own reads and presses over a database in memory. An entry the website door held past its limit has no
 * person and told nobody: it waits on its form's sheet, held, saying why; the forms list says how many; it is no
 * request in Needs you until a member lets it through, and then it is one like any other. A member's "Not a real
 * request" holds a site's request as it holds a hosted form's, and letting it through brings it back. A held pile nobody
 * looked at for three days is said on Today, and opens the site's form. And a site's request says where it stands on
 * its form's sheet by the one rule: waiting, sending, answered, never answered.
 *
 * The SQL is proved on a database (a-site-s-entry-is-the-same-entry-for-good.db.test.mjs); the fake here holds its
 * rules (_form-requests.mjs, people/doors/_form-entries.mjs).
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { formsRouteOf, toTodayVM } from "@chanlytics/contracts";
import { A, emailWire, formWorld } from "../_form-requests.mjs";
import { at } from "../../_cron-doors-world.mjs";
import { NOW, metrics } from "../../today/record/_world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const name of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[name];

const forms = await import(at("apps/dashboard/app/api/v1/forms/route.ts"));
const siteSheet = await import(at("apps/dashboard/app/api/v1/forms/site-sheet/route.ts"));
const requests = await import(at("apps/dashboard/app/api/v1/forms/requests/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { readerContext, load } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { formRequestsOpen } = await import(at("apps/dashboard/src/server/readers/forms/forms.ts"));
const { getEmailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));

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
const DAY_MS = 86_400_000;
let digest = 0;
const hex = () => (digest += 1).toString(16).padStart(64, "0");

/** The salon's world with an owner signed in; `arrives` is a site's entry as the website door takes it. */
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
    },
  });
  setServiceClient(made.db);
  const ctx = { supabase: made.db, userId: U, email: "ada@example.com", params: {} };
  const address = (route, query = "") => `http://localhost/api/v1/${route}?workspace=${A}${query}`;
  const arrives = async (n, held = false) => {
    const answers = { form: "request", name: `Ana ${n}`, email: `ana${n}@example.com`, about: "Balayage" };
    const { data } = await made.db.rpc("form_entry_take", {
      p_tenant_id: A,
      p_form: "request",
      p_answers: { ...answers, note: "Can I come in March?" },
      p_person: { phone: null, email: answers.email, name: answers.name, detail: {} },
      p_words: hex(),
      p_owed: ["note", "notice"],
      p_host: "luma.example.com",
      p_form_ref: "consult",
      p_form_name: "Colour consultation",
      ...(held ? { p_held_why: "too_many" } : {}),
    });
    return data;
  };
  const read = (now = new Date()) =>
    load(readerContext(ctx, { tenantId: A, role: "owner" }, now), formRequestsOpen, undefined);
  return {
    ...made,
    ctx,
    arrives,
    formId: () => made.tables.outside_forms[0].id,
    needsYou: async (now) => (await read(now)).data,
    list: () => forms.GET.run(new Request(address("forms")), ctx),
    sheet: () =>
      siteSheet.GET.run(new Request(address("forms/site-sheet", `&form=${made.tables.outside_forms[0].id}`)), ctx),
    requestOf: (id) => requests.GET.run(new Request(address("forms/requests", `&id=${id}`)), ctx),
    pressRequest: (body) =>
      requests.POST.run(new Request(address("forms/requests"), { method: "POST", body: JSON.stringify(body) }), ctx),
  };
}

test("an entry the door held waits in its form's held pile, tells nobody, and a member lets it through", async () => {
  const w = world();
  const real = await w.arrives(1);
  const held = await w.arrives(2, true);
  assert.equal(held.outcome, "held");
  assert.equal(w.tables.contacts.length, 1, "a held entry makes no person");

  const sheet = await w.sheet();
  assert.deepEqual(
    sheet.entries.map((entry) => [entry.id, entry.standing]),
    [[real.entry_id, "open"]],
    "its newest entries hold the real one alone",
  );
  assert.deepEqual(
    sheet.held.map((entry) => [entry.id, entry.name, entry.held_why]),
    [[held.entry_id, "Ana 2", "too_many"]],
    "REGRESSION: a site's form had no held pile, so a held entry could be seen nowhere",
  );
  assert.equal((await w.list()).outside[0].held, 1, "the list says its pile beside the form");
  assert.deepEqual(
    (await w.needsYou()).requests.map((request) => request.id),
    [real.entry_id],
    "and it is no request in Needs you",
  );
  const page = await w.requestOf(held.entry_id);
  assert.deepEqual([page.standing, page.held_why, page.person], ["held", "too_many", null]);
  assert.equal(page.reach.email, "ana2@example.com", "its page says who it is about, as typed");

  await w.pressRequest({ act: "let_through", entry_id: held.entry_id });
  const after = await w.sheet();
  assert.deepEqual(
    [after.entries.map((entry) => entry.standing), after.held],
    [["open", "open"], []],
    "let through, it is a request like any other",
  );
  assert.equal((await w.needsYou()).requests.length, 2, "waiting in Needs you");
  assert.equal(w.tables.contacts.length, 2, "with its person, made then");
  assert.equal((await w.list()).outside[0].held, 0);
});

test("Not a real request holds a site's request, and letting it through brings it back", async () => {
  const w = world();
  const real = await w.arrives(1);
  await w.pressRequest({ act: "hold", entry_id: real.entry_id });
  const page = await w.requestOf(real.entry_id);
  assert.deepEqual(
    [page.standing, page.held_why],
    ["held", "member"],
    "REGRESSION: the press answered ok and changed nothing: the door named hosted forms alone",
  );
  assert.deepEqual((await w.needsYou()).requests, [], "it left Needs you");
  assert.deepEqual(
    (await w.sheet()).held.map((entry) => entry.held_why),
    ["member"],
    "and waits in its form's held pile, by a member's word",
  );
  await w.pressRequest({ act: "let_through", entry_id: real.entry_id });
  assert.equal((await w.requestOf(real.entry_id)).standing, "open");
  assert.equal(
    w.tables.events.filter((event) => event.kind === "form_entry.accepted").length,
    1,
    "telling nobody twice",
  );
});

test("a site's held pile nobody looked at for three days is said on Today, and opens the site's form", async () => {
  const w = world();
  const held = await w.arrives(1, true);
  assert.deepEqual((await w.needsYou()).held, [], "a fresh pile is not said yet");
  w.tables.form_entries.find((entry) => entry.id === held.entry_id).created_at = new Date(
    Date.now() - 4 * DAY_MS,
  ).toISOString();
  const piles = (await w.needsYou()).held;
  assert.deepEqual(
    piles.map((pile) => [pile.form_id, pile.site, pile.heading, pile.held]),
    [[w.formId(), true, "Colour consultation", 1]],
    "REGRESSION: only a form made here had its pile said",
  );
  // Its row's one door is the site's form, on the part that holds its pile.
  const pile = { ...piles[0], oldest_at: new Date(NOW.getTime() - 4 * DAY_MS).toISOString() };
  const vm = toTodayVM(metrics(), [], [], [], NOW, null, { formRequests: [], formHeld: [pile] });
  const row = vm.queue.rows.find((one) => one.kind === "form_held");
  assert.equal(row.cta.to, formsRouteOf({ form: w.formId(), site: true, part: "site" }));
  assert.equal(row.who, "Colour consultation");
});

test("a site's request says where it stands on its form's sheet: waiting, sending, answered, never answered", async () => {
  const w = world();
  const [waiting, going, went, old] = [await w.arrives(1), await w.arrives(2), await w.arrives(3), await w.arrives(4)];
  const reply = (entryId, status) => {
    const id = crypto.randomUUID();
    w.tables.messages.push({ id, tenant_id: A, direction: "outbound", sender: "human", status, channel: "email" });
    (w.tables.form_entry_links ??= []).push({
      id: crypto.randomUUID(),
      tenant_id: A,
      entry_id: entryId,
      kind: "reply",
      message_id: id,
      conversation_id: null,
      appointment_id: null,
      created_by: U,
      created_at: new Date().toISOString(),
    });
  };
  reply(going.entry_id, "queued");
  reply(went.entry_id, "sent");
  // Its form took requests long before, and this one came 61 days ago: past Needs you's sixty days, and unanswered.
  w.tables.outside_forms[0].requests_from = new Date(Date.now() - 90 * DAY_MS).toISOString();
  w.tables.form_entries.find((entry) => entry.id === old.entry_id).created_at = new Date(
    Date.now() - 61 * DAY_MS,
  ).toISOString();
  const standing = Object.fromEntries((await w.sheet()).entries.map((entry) => [entry.id, entry.standing]));
  assert.deepEqual(
    [standing[waiting.entry_id], standing[going.entry_id], standing[went.entry_id], standing[old.entry_id]],
    ["open", "sending", "answered", "aged"],
    "REGRESSION: all but the first read as answered, for not being in Needs you's list",
  );
  assert.deepEqual(
    (await w.needsYou()).requests.map((request) => request.id),
    [waiting.entry_id],
  );
});

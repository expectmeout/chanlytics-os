/**
 * A request from the business's own website is answered like one from a form made here (00709; Campaigns in three
 * tabs, call 3), through the dashboard's own reads and presses over a database in memory: it is in Needs you from its
 * form's switch on, named as its form is (the owner's name, else the site's, else its kind's), a hidden form's too and a
 * sign-up never; its Inbox page reads it against the fields the website door takes, says who it is about as typed and
 * which site it came from, and is drafted to; a member's word answers it and taking that back opens it again; and the
 * count Needs you says goes past the list's 200. The SQL that reads them is proved on a database
 * (a-site-s-forms-are-forms.db.test.mjs); the fake here holds its rules (_form-requests.mjs).
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { A, emailWire, formWorld } from "../_form-requests.mjs";
import { at } from "../../_cron-doors-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const name of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[name];

const requests = await import(at("apps/dashboard/app/api/v1/forms/requests/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { readerContext, load } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { formRequestsOpen } = await import(at("apps/dashboard/src/server/readers/forms.ts"));
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
  const arrives = async (over = {}) => {
    const n = over.n ?? 1;
    const form = over.form ?? "request";
    const answers =
      form === "request"
        ? { form, name: `Ana ${n}`, email: `ana${n}@example.com`, note: "Can I come in March?", about: "Balayage" }
        : { form, email: `ana${n}@example.com` };
    const { data } = await made.db.rpc("form_entry_take", {
      p_tenant_id: A,
      p_form: form,
      p_answers: answers,
      p_person: { phone: null, email: answers.email, name: answers.name ?? null, detail: {} },
      p_words: hex(),
      p_owed: ["note", "notice"],
      p_host: "luma.example.com",
      ...over.p,
    });
    return data;
  };
  return {
    ...made,
    ctx,
    arrives,
    needsYou: () => load(readerContext(ctx, { tenantId: A, role: "owner" }, new Date()), formRequestsOpen, undefined),
    requestOf: (id) => requests.GET.run(new Request(address("forms/requests", `&id=${id}`)), ctx),
    pressRequest: (body) =>
      requests.POST.run(new Request(address("forms/requests"), { method: "POST", body: JSON.stringify(body) }), ctx),
  };
}

test("a site's request is in Needs you, named as its form is, its answers its own words", async () => {
  const w = world();
  const unnamed = await w.arrives({ n: 1 });
  const named = await w.arrives({ n: 2, p: { p_form_ref: "consult", p_form_name: "Colour consultation" } });
  const { requests: rows, count } = (await w.needsYou()).data;
  const row = (id) => rows.find((r) => r.id === id);
  assert.ok(row(unnamed.entry_id) && row(named.entry_id), "both open");
  assert.equal(count, 2);
  assert.equal(row(unnamed.entry_id).heading, "Your website's form", "a form its site named nothing");
  assert.equal(row(named.entry_id).heading, "Colour consultation", "named as its site sends it");

  // The owner's own name wins, and blank goes back to the site's.
  const form = w.tables.outside_forms.find((f) => f.ref === "consult");
  form.name = "Consultations";
  assert.equal((await w.needsYou()).data.requests.find((r) => r.id === named.entry_id).heading, "Consultations");
});

test("a hidden form's requests still arrive; a sign-up never stands in Needs you", async () => {
  const w = world();
  const first = await w.arrives({ n: 3, p: { p_form_ref: "quiet" } });
  w.tables.outside_forms.find((f) => f.ref === "quiet").listed = false;
  const later = await w.arrives({ n: 4, p: { p_form_ref: "quiet" } });
  const signup = await w.arrives({ n: 5, form: "signup" });
  const ids = (await w.needsYou()).data.requests.map((r) => r.id);
  assert.ok(ids.includes(first.entry_id) && ids.includes(later.entry_id), "hidden only takes it off the list");
  assert.ok(!ids.includes(signup.entry_id), "a sign-up is never a request");
});

test("an entry from before its form's switch is no request", async () => {
  const w = world();
  const old = await w.arrives({ n: 6 });
  const form = w.tables.outside_forms.find(
    (f) => f.id === w.tables.form_entries.find((e) => e.id === old.entry_id).outside_form_id,
  );
  form.requests_from = new Date(Date.now() + 60_000).toISOString();
  assert.deepEqual((await w.needsYou()).data.requests, []);
  assert.equal((await w.needsYou()).data.count, 0);
});

test("its Inbox page: read against the website's fields, who it is about as typed, its site, and drafted to", async () => {
  const w = world();
  const taken = await w.arrives({ n: 7, p: { p_form_name: "Colour consultation" } });
  const page = await w.requestOf(taken.entry_id);
  assert.equal(page.heading, "Colour consultation");
  assert.equal(page.standing, "open");
  assert.equal(page.reach.email, "ana7@example.com");
  assert.equal(page.site, "luma.example.com", "the site it came from");
  assert.equal(page.drafts, true, "AI drafts its reply, as a form made here does by default");
  assert.ok(
    page.lines.some((line) => /March/.test(line.answer ?? line.value ?? JSON.stringify(line))),
    "their own words",
  );
  assert.match(page.note, /Can I come in March\?/);
});

test("a member's word answers it, and taking that back opens it again", async () => {
  const w = world();
  const taken = await w.arrives({ n: 8 });
  await w.pressRequest({ act: "mark", entry_id: taken.entry_id });
  assert.equal((await w.requestOf(taken.entry_id)).standing, "answered");
  assert.ok(!(await w.needsYou()).data.requests.some((r) => r.id === taken.entry_id));
  await w.pressRequest({ act: "unmark", entry_id: taken.entry_id });
  assert.equal((await w.requestOf(taken.entry_id)).standing, "open");
});

test("Needs you counts past the list's 200", async () => {
  const w = world();
  for (let n = 0; n < 205; n += 1) await w.arrives({ n: 100 + n });
  const { requests: rows, count } = (await w.needsYou()).data;
  assert.equal(rows.length, 200, "the list stops at 200");
  assert.equal(count, 205, "the count does not");
});

/**
 * A form on a business's own website (00488), run as Vercel runs the door, over a database in memory: the key or
 * nothing, a way to reach them or nothing, the person through the one door (source 'website'), what they asked
 * suggested as a note on their page, and the owner told once, on the bell alone for a form that arrives late.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";

const SERVICE_KEY = "service-role-key-for-this-file";
for (const k of ["RESEND_API_KEY", "LEAD_TO", "LEAD_FROM", "WHATSAPP_PHONE_ID"]) delete process.env[k];
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/website-form.ts"));
const { websiteFormNote, websiteFormPerson } = await import("@chanlytics/contracts");
const realFetch = globalThis.fetch;
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const keyOf = (t) => createHmac("sha256", SERVICE_KEY).update(`website-form:${t}`).digest("base64url");
const NOW = Date.now();

function world({ forgotten = false } = {}) {
  const resolved = [];
  const suggested = [];
  const notifications = [];
  const jobs = [];
  const db = fakeDb(
    { notifications, tenant_config: [{ tenant_id: A, config: {} }], tenant_channels: [], jobs },
    {},
    {
      resolve_person: (a) => {
        resolved.push(a);
        if (forgotten) throw Object.assign(new Error("This person asked to be forgotten."), { code: "PE001" });
        return { contact_id: PERSON, outcome: resolved.length === 1 ? "new" : "matched", existed: resolved.length > 1 };
      },
      person_note_suggest: (a) => {
        if (suggested.some((s) => s.p_source_id === a.p_source_id)) return { error: "already" };
        suggested.push(a);
        return { note: { id: `n-${suggested.length}` } };
      },
    },
  );
  return { db, resolved, suggested, notifications, jobs };
}

let w;
beforeEach(() => {
  w = world();
  setPg(w.db);
  globalThis.fetch = async () => new Response("{}", { status: 500 });
});

const SIGNUP = { workspace: A, key: keyOf(A), form: "signup", email: "Ana@Example.com", page: "promo", lang: "en" };
const REQUEST = {
  workspace: A,
  key: keyOf(A),
  form: "request",
  name: "Ana Ruiz",
  phone: "(555) 010-0175",
  about: "A seat in the spring class",
  note: "Can I start in March?",
};
const post = async (body) => {
  const res = await POST(
    new Request("https://edge.example/api/website-form", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { waitUntil: () => {} },
  );
  return [res.status, await res.json()];
};

test("the key or nothing: a key made for another workspace, or none, is refused before anything is read", async () => {
  assert.equal((await post({ ...SIGNUP, key: keyOf(B) }))[0], 401);
  assert.equal((await post({ ...SIGNUP, workspace: B }))[0], 401);
  assert.equal((await post({ ...SIGNUP, key: "x".repeat(43) }))[0], 401);
  assert.equal((await post({ ...SIGNUP, key: undefined }))[0], 400, "no key is not a form");
  assert.equal((await post("not json"))[0], 400);
  assert.equal((await post({ ...SIGNUP, form: "order" }))[0], 400, "a form the door does not know");
  assert.deepEqual([w.resolved.length, w.suggested.length, w.notifications.length], [0, 0, 0]);
});

test("a form with no way to reach them is refused, and one with a number nobody can dial is too", async () => {
  const [status, body] = await post({ ...REQUEST, phone: undefined });
  assert.deepEqual([status, body.error], [422, "invalid"]);
  assert.equal((await post({ ...REQUEST, phone: "12" }))[0], 422);
  assert.equal(w.resolved.length, 0);
});

test("a sign-up: the person through the one door as the website's, a note to keep, and the owner told on the bell", async () => {
  const [status, body] = await post(SIGNUP);
  assert.deepEqual([status, body], [200, { ok: true, kept: true }]);
  assert.equal(w.resolved.length, 1);
  const r = w.resolved[0];
  assert.deepEqual(
    [r.p_tenant_id, r.p_email, r.p_phone, r.p_source, r.p_assurance],
    [A, "ana@example.com", "", "website", "found"],
    "the address as one, the door's source, and a feed's assurance",
  );
  assert.deepEqual(w.suggested.length, 1);
  const n = w.suggested[0];
  assert.deepEqual([n.p_contact_id, n.p_source], [PERSON, "website"]);
  assert.equal(n.p_body, "Signed up for your offers on your website.");
  assert.equal(w.notifications.length, 1, "the owner is told");
  const row = w.notifications[0];
  assert.deepEqual(
    [row.kind, row.route, row.subject_type, row.subject_id],
    ["website_form", `clients/${PERSON}`, "contact", PERSON],
  );
  assert.equal(row.title, "ana@example.com signed up on your website");
  assert.equal(w.jobs.filter((j) => j.kind === "push_send").length, 1, "and the phones");
});

test("the same form sent twice is one note and one notice; another form from the same person is a second", async () => {
  await post(REQUEST);
  await post(REQUEST);
  assert.equal(w.resolved.length, 2, "the person door is asked each time: it matches them");
  assert.equal(w.suggested.length, 1, "one note");
  assert.equal(w.notifications.length, 1, "one notice");
  await post({ ...REQUEST, note: "Or April?" });
  assert.deepEqual([w.suggested.length, w.notifications.length], [2, 2]);
  assert.match(w.suggested[0].p_body, /^A seat in the spring class\. They wrote: "Can I start in March\?"$/);
  assert.equal(w.resolved[0].p_phone, "+15550100175", "the number as one");
  assert.equal(w.notifications[0].title, "Ana Ruiz sent a request on your website");
});

test("a form that arrives late says the day it was sent, and is told on the bell alone", async () => {
  const at = new Date(NOW - 7 * 24 * 3_600_000).toISOString();
  const [status] = await post({ ...REQUEST, at });
  assert.equal(status, 200);
  assert.match(w.suggested[0].p_body, / Sent [A-Z][a-z]{2} \d{1,2}\.$/);
  assert.equal(w.notifications.length, 1, "kept on the bell");
  assert.equal(w.jobs.length, 0, "no phone is told");
});

test("a person who asked to be forgotten is not made again, and nothing is kept", async () => {
  w = world({ forgotten: true });
  setPg(w.db);
  const [status, body] = await post(REQUEST);
  assert.deepEqual([status, body], [200, { ok: true, kept: false }]);
  assert.deepEqual([w.suggested.length, w.notifications.length], [0, 0]);
});

test("the note's words: at most a note's length, their words cut and never the line", () => {
  const long = websiteFormNote({ ...REQUEST, note: "x".repeat(2000) }, NOW);
  assert.equal(long.length, 600);
  assert.match(long, /^A seat in the spring class\. They wrote: "x+…"$/);
  assert.equal(
    websiteFormNote({ ...REQUEST, about: undefined, note: undefined }, NOW),
    "Sent a request on your website.",
  );
  assert.equal(websiteFormPerson({ name: " ", email: undefined, phone: "nope" }), null);
});

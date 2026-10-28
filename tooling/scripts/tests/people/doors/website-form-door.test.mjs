/**
 * A form on a business's own website (00488), run as Vercel runs the door, over a database in memory: the key or
 * nothing, a way to reach them or nothing, the person through the one door (source 'website'), what they asked
 * suggested as a note on their page, and the owner told once, on the bell alone for a form that arrives late.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyConfirmToken } from "@chanlytics/channels";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";

const SERVICE_KEY = "service-role-key-for-this-file";
for (const k of ["RESEND_API_KEY", "LEAD_TO", "LEAD_FROM", "WHATSAPP_PHONE_ID"]) delete process.env[k];
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.SUPABASE_URL = "https://db.example.supabase.co";
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/website-form.ts"));
const { websiteFormNote, websiteFormPerson } = await import("@chanlytics/contracts");
const realFetch = globalThis.fetch;
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOGO = "11111111-1111-4111-8111-111111111111";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const keyOf = (t) => createHmac("sha256", SERVICE_KEY).update(`website-form:${t}`).digest("base64url");
const NOW = Date.now();

/**
 * A workspace in New York unless said; `zone: null` is one whose row cannot be read. `person` is the row the person
 * door matched (absent: none read), `mailbox` whether the workspace has its hosted mailbox, `asked` the confirmations
 * already on the ledger.
 */
function world({ forgotten = false, zone = "America/New_York", person = null, mailbox = false, asked = [] } = {}) {
  const resolved = [];
  const suggested = [];
  const notifications = [];
  const jobs = [];
  const messages = [...asked];
  const conversations = [];
  const db = fakeDb(
    {
      notifications,
      tenants: zone
        ? [{ id: A, slug: "harbor", name: "Harbor", timezone: zone, logo_path: `${A}/${LOGO}.png`, accent: "#2a6f97" }]
        : [],
      tenant_config: [{ tenant_id: A, config: {} }],
      tenant_channels: [],
      jobs,
      ...(person
        ? {
            contacts: [
              { id: PERSON, tenant_id: A, consent: "unknown", dnc: false, email_marketing: "unknown", ...person },
            ],
            conversations,
            messages,
            mailboxes: mailbox
              ? [
                  {
                    id: "mb-1",
                    tenant_id: A,
                    local_part: "harbor",
                    reply_token: "abcdefghijklmnopqrstuvwx",
                    from_name: "Harbor",
                  },
                ]
              : [],
          }
        : {}),
    },
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
  return { db, resolved, suggested, notifications, jobs, messages, conversations };
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

test("a form that arrives late says the day it was sent, in the workspace's own zone, and is told on the bell alone", async () => {
  // 8:49 PM in New York on Oct 26, which UTC already calls Oct 27 (the first form re-sent, 28 Oct 2026).
  const [status] = await post({ ...REQUEST, at: "2026-10-27T00:49:00.320Z" });
  assert.equal(status, 200);
  assert.match(w.suggested[0].p_body, / Sent Oct 26\.$/, "REGRESSION: the day UTC had reached, not the workspace's");
  assert.equal(w.notifications.length, 1, "kept on the bell");
  assert.equal(w.jobs.length, 0, "no phone is told");

  // A workspace that keeps another zone says its own day; one whose zone cannot be read, the default zone's.
  w = world({ zone: "Asia/Tokyo" });
  setPg(w.db);
  await post({ ...REQUEST, at: "2026-10-26T16:30:00Z" });
  assert.match(w.suggested[0].p_body, / Sent Oct 27\.$/);
  w = world({ zone: null });
  setPg(w.db);
  await post({ ...REQUEST, at: "2026-10-27T00:49:00.320Z" });
  assert.match(w.suggested[0].p_body, / Sent Oct 26\.$/, "America/New_York, the default zone");
});

test("a person who asked to be forgotten is not made again, and nothing is kept", async () => {
  w = world({ forgotten: true });
  setPg(w.db);
  const [status, body] = await post(REQUEST);
  assert.deepEqual([status, body], [200, { ok: true, kept: false }]);
  assert.deepEqual([w.suggested.length, w.notifications.length], [0, 0]);
});

test("the note's words: at most a note's length, their words cut and never the line", () => {
  const when = { nowMs: NOW, tz: "America/New_York" };
  const long = websiteFormNote({ ...REQUEST, note: "x".repeat(2000) }, when);
  assert.equal(long.length, 600);
  assert.match(long, /^A seat in the spring class\. They wrote: "x+…"$/);
  assert.equal(
    websiteFormNote({ ...REQUEST, about: undefined, note: undefined }, when),
    "Sent a request on your website.",
  );
  const late = { ...REQUEST, note: undefined, at: "2026-10-27T00:49:00.320Z" };
  assert.match(
    websiteFormNote(late, { nowMs: NOW, tz: "Not/AZone" }),
    / Sent Oct 27\.$/,
    "a zone nobody knows: UTC's day",
  );
  assert.equal(websiteFormPerson({ name: " ", email: undefined, phone: "nope" }), null);
});

/* ------------------------------------------------ a sign-up asks its person to confirm (00489) -- */

const CONFIRM_SECRET = "the-confirm-secret-for-this-file";

/** The deployment can send email and seal a link, for the length of one test. */
function canSend(t) {
  const set = { EMAIL_DOMAIN: "mail.example.com", RESEND_API_KEY: "re_test_only", UNSUBSCRIBE_SECRET: CONFIRM_SECRET };
  for (const [k, v] of Object.entries(set)) process.env[k] = v;
  t.after(() => {
    for (const k of Object.keys(set)) delete process.env[k];
  });
}

const asks = () => w.messages.filter((m) => m.meta?.source === "signup_confirm");
const sends = () => w.jobs.filter((j) => j.kind === "outbound_send");

test("a sign-up asks its person to confirm: one email on their thread from the mailbox, its link, its send", async (t) => {
  canSend(t);
  w = world({ person: { email: "ana@example.com" }, mailbox: true });
  setPg(w.db);
  const [status, body] = await post(SIGNUP);
  assert.deepEqual(
    [status, body],
    [200, { ok: true, kept: true, confirm: "sent" }],
    "the site may say: check your email",
  );
  assert.equal(asks().length, 1, "one confirmation");
  const m = asks()[0];
  assert.deepEqual(
    [m.tenant_id, m.contact_id, m.channel, m.direction, m.sender, m.status],
    [A, PERSON, "email", "outbound", "system", "queued"],
  );
  const thread = w.conversations.find((c) => c.contact_id === PERSON);
  assert.equal(m.conversation_id, thread.id, "on the person's one thread");
  const r = m.meta.email.request;
  assert.deepEqual(r.to, ["ana@example.com"]);
  assert.equal(r.from, '"Harbor" <harbor@mail.example.com>', "the business's name, on the hosted mailbox");
  assert.equal(r.subject, "Confirm your sign-up with Harbor");
  assert.equal(r.headers["Auto-Submitted"], "auto-generated");
  assert.equal(r.headers["List-Unsubscribe"], undefined, "a confirmation is no offer");
  const link = /https:\/\/[^\s]+\/c\/([A-Za-z0-9_-]{87})/.exec(r.text);
  assert.ok(link, "the link is in the words");
  // The same words as a letter in the business's own look (decision 0075): its logo from our storage, its colour, one button.
  assert.match(
    r.html,
    new RegExp(`<img src="https://db\.example\.supabase\.co/[^"]*workspace-logos/${A}/${LOGO}\.png"`),
  );
  assert.match(r.html, /background:#2a6f97/);
  assert.match(r.html, new RegExp(`href="https://[^"]+/c/${link[1]}"[^>]*>Yes, send me offers<`));
  assert.match(r.html, /Sent for Harbor by Chanlytics./);
  assert.deepEqual(verifyConfirmToken([CONFIRM_SECRET], link[1]), { tenantId: A, contactId: PERSON, messageId: m.id });
  assert.deepEqual(m.meta.signup_confirm, {
    key: "ana@example.com",
    form: { form: "signup", page: "promo", about: null, lang: "en", at: null },
  });
  assert.equal(sends().length, 1, "and its send scheduled");
  const { request_id: _named, ...payload } = sends()[0].payload;
  assert.deepEqual(payload, {
    message_id: m.id,
    conversation_id: thread.id,
    to_email: "ana@example.com",
    proactive: true,
  });
  assert.match(w.notifications[0].body, /\nWe emailed them to confirm\. Offers by email start once they do\.\n/);
});

test("asked once: the same form again, or another sign-up while the ask is open, sends nothing more", async (t) => {
  canSend(t);
  w = world({ person: { email: "ana@example.com" }, mailbox: true });
  setPg(w.db);
  await post(SIGNUP);
  assert.deepEqual(
    await post(SIGNUP),
    [200, { ok: true, kept: true }],
    "nothing new went: the site says nothing of it",
  );
  await post({ ...SIGNUP, about: "The spring offers" });
  assert.equal(asks().length, 1);
  assert.equal(sends().length, 1);
  assert.equal(w.notifications.length, 2, "the same form is told once; another sign-up is told");
  assert.match(w.notifications.at(-1).body, /We already emailed them to confirm\./);

  // Two posts at once both read no open ask; the second's email is the first's, by its id, and is sent once.
  w = world({ person: { email: "ana@example.com" }, mailbox: true });
  setPg(w.db);
  await Promise.all([post(SIGNUP), post({ ...SIGNUP, about: "The spring offers" })]);
  assert.deepEqual([asks().length, sends().length], [1, 1]);
});

test("not asked, and the owner told why: no mailbox, a made-up address, another address on their page, a yes given", async (t) => {
  canSend(t);
  const cases = [
    [{ person: { email: "ana@example.com" }, mailbox: false }, SIGNUP, /you have no email address yet/],
    [
      { person: { email: "a.n.a.r@gmail.com" }, mailbox: true },
      { ...SIGNUP, email: "a.n.a.r@gmail.com" },
      /looks made up/,
    ],
    [{ person: { email: "ana@other.example" }, mailbox: true }, SIGNUP, /an address their page does not have/],
    [{ person: { email: "ana@example.com", email_marketing: "opted_in" }, mailbox: true }, SIGNUP, /already said yes/],
    [{ person: { email: "ana@example.com", consent: "opted_out" }, mailbox: true }, SIGNUP, /asked you to stop/],
  ];
  for (const [shape, form, said] of cases) {
    w = world(shape);
    setPg(w.db);
    assert.deepEqual(await post(form), [200, { ok: true, kept: true }], `no confirm: ${said}`);
    assert.deepEqual([asks().length, sends().length], [0, 0], String(said));
    assert.match(w.notifications[0].body, said);
    assert.equal(w.resolved.length, 1, "the person is kept all the same");
  }
});

test("not asked at all: a request, a sign-up with no address, one that arrives late", async (t) => {
  canSend(t);
  for (const form of [
    { ...REQUEST, email: "ana@example.com" },
    { ...SIGNUP, email: undefined, phone: "(555) 010-0175" },
    { ...SIGNUP, at: new Date(NOW - 2 * 3_600_000).toISOString() },
  ]) {
    w = world({ person: { email: "ana@example.com" }, mailbox: true });
    setPg(w.db);
    assert.deepEqual(await post(form), [200, { ok: true, kept: true }]);
    assert.equal(asks().length, 0);
    assert.doesNotMatch(w.notifications[0].body, /confirm/);
  }
});

test("the limits: three asks to one inbox in ninety days, fifty a day, and none once three today did not arrive", async (t) => {
  canSend(t);
  const old = (n, over = {}) =>
    Array.from({ length: n }, (_, i) => ({
      id: `a${i}aaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`.slice(0, 36),
      tenant_id: A,
      contact_id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`,
      conversation_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      channel: "email",
      direction: "outbound",
      sender: "system",
      type: "text",
      status: "sent",
      created_at: new Date(NOW - 8 * 86_400_000).toISOString(),
      meta: { source: "signup_confirm", signup_confirm: { key: "anaruiz@gmail.com" } },
      ...over,
    }));
  const typed = { ...SIGNUP, email: "Ana.Ruiz+promo@gmail.com" };
  w = world({ person: { email: "ana.ruiz+promo@gmail.com" }, mailbox: true, asked: old(3) });
  setPg(w.db);
  await post(typed);
  assert.equal(asks().length, 3, "the same inbox, spelled another way, asked three times already");
  assert.match(w.notifications[0].body, /asked 3 times already in 90 days/);

  w = world({
    person: { email: "ana@example.com" },
    mailbox: true,
    asked: old(50, { created_at: new Date(NOW - 3_600_000).toISOString(), meta: { source: "signup_confirm" } }),
  });
  setPg(w.db);
  await post(SIGNUP);
  assert.equal(asks().length, 50);
  assert.match(w.notifications[0].body, /today's 50 confirmations went out already/);

  w = world({
    person: { email: "ana@example.com" },
    mailbox: true,
    asked: old(3, {
      status: "failed",
      created_at: new Date(NOW - 3_600_000).toISOString(),
      meta: { source: "signup_confirm" },
    }),
  });
  setPg(w.db);
  await post(SIGNUP);
  assert.equal(asks().length, 3);
  assert.match(w.notifications[0].body, /did not arrive/);
});

/**
 * A form on a business's own website (00488, 00675), run as Vercel runs the door, over a database in memory: the key or
 * nothing, a way to reach them or nothing, then ONE write (the person through the one door, source 'website', the entry
 * and its event), answered only after it; and what the entry owes after it, each its own step from its event
 * (form-effects.ts, delivered here as the relay would: _form-entries.mjs): what they asked suggested as a note on their
 * page, the owner told once (on the bell alone for a form that arrives late), and a sign-up asked to confirm.
 *
 * The Forms plan's F0 "done when" leads: a request sent again a week later is a second entry that tells the owner; a
 * notice that fails is told on the next try and shows meanwhile; a database that fails the write is a refusal; the
 * platform's key can rotate and a site on a key of its own still sends; a forgotten person's entry leaves nothing.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyConfirmToken, newWebsiteFormKey, websiteFormKeyHash } from "@chanlytics/channels/tokens";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";
import { AGAIN_WITHIN_MS, deliver, formEntryDoors } from "./_form-entries.mjs";

const SERVICE_KEY = "service-role-key-for-this-file";
for (const k of ["RESEND_API_KEY", "LEAD_TO", "LEAD_FROM"]) delete process.env[k];
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.SUPABASE_URL = "https://db.example.supabase.co";
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { POST } = await import(at("apps/edge/api/website-form.ts"));
const { runFormEffect } = await import(at("apps/edge/lib/website/form-effects.ts"));
const { watchForms } = await import(at("apps/edge/lib/website/form-watch.ts"));
/** How many entries nobody was told of, as the health sweep's watch counts them. */
const watchFormEntries = async (db, nowMs) => (await watchForms(db, nowMs)).form_entries_untold;
const { websiteFormNote, websiteFormPerson } = await import("@chanlytics/contracts");
const realFetch = globalThis.fetch;
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  delete process.env.SUPABASE_URL;
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOGO = "11111111-1111-4111-8111-111111111111";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
/** The first key: made from the platform's own key and the workspace's id, as before 00675. */
const firstKeyOf = (t, service = SERVICE_KEY) =>
  createHmac("sha256", service).update(`website-form:${t}`).digest("base64url");
const NOW = Date.now();
const DAY_MS = 86_400_000;

/**
 * A workspace in New York unless said; `zone: null` is one whose row cannot be read. `person` is the row the person
 * door matched (absent: none read), `mailbox` whether the workspace has its hosted mailbox, `asked` the confirmations
 * already on the ledger, `keys` the website keys it keeps. `clock` is the database's now(), which a test moves on.
 */
function world({
  forgotten = false,
  zone = "America/New_York",
  person = null,
  mailbox = false,
  asked = [],
  keys = [],
} = {}) {
  const resolved = [];
  const suggested = [];
  const notifications = [];
  const jobs = [];
  const messages = [...asked];
  const conversations = [];
  const clock = { now: Date.now() };
  const tables = {
    notifications,
    tenants: zone
      ? [{ id: A, slug: "harbor", name: "Harbor", timezone: zone, logo_path: `${A}/${LOGO}.png`, accent: "#2a6f97" }]
      : [],
    tenant_config: [{ tenant_id: A, config: {} }],
    tenant_channels: [],
    jobs,
    events: [],
    form_entries: [],
    form_keys: [...keys],
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
  };
  const resolve = (a) => {
    resolved.push(a);
    if (forgotten) throw Object.assign(new Error("This person asked to be forgotten."), { code: "PE001" });
    return { contact_id: PERSON, outcome: resolved.length === 1 ? "new" : "matched", existed: resolved.length > 1 };
  };
  const doors = formEntryDoors(tables, { resolve, clock: () => clock.now });
  const faults = {};
  const db = fakeDb(tables, faults, {
    resolve_person: resolve,
    ...doors,
    person_note_suggest: (a) => {
      if (suggested.some((s) => s.p_source_id === a.p_source_id)) return { error: "already" };
      suggested.push(a);
      return { note: { id: `n-${suggested.length}` } };
    },
  });
  const handed = new Set();
  /** The relay's pass: every new event handed to its steps; the failures, by step. */
  const settle = (again = []) =>
    deliver(tables, (t, id, effect) => runFormEffect(db, t, id, effect), handed, { again });
  return {
    db,
    tables,
    faults,
    clock,
    settle,
    resolved,
    suggested,
    notifications,
    jobs,
    messages,
    conversations,
    entries: tables.form_entries,
  };
}

let w;
beforeEach(() => {
  w = world();
  setPg(w.db);
  globalThis.fetch = async () => new Response("{}", { status: 500 });
});

const SIGNUP = {
  workspace: A,
  key: firstKeyOf(A),
  form: "signup",
  email: "Ana@Example.com",
  page: "promo",
  lang: "en",
};
const REQUEST = {
  workspace: A,
  key: firstKeyOf(A),
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
/** A form posted, and everything it owes run, as the relay hands it on. */
const postAndSettle = async (body) => {
  const answer = await post(body);
  const failed = await w.settle();
  assert.deepEqual(failed, [], "every step settled");
  return answer;
};

/** A key of the workspace's own, as the dashboard makes one: shown once, kept as its hash. */
function ownKey(over = {}) {
  const key = newWebsiteFormKey();
  const row = {
    id: crypto.randomUUID(),
    tenant_id: A,
    name: "Main site",
    hash: websiteFormKeyHash(key),
    first: false,
    made_by: null,
    created_at: new Date(NOW - DAY_MS).toISOString(),
    last_used_at: null,
    ends_at: null,
    ...over,
  };
  return { key, row };
}

/* ----------------------------------------------------------------- the Forms plan's F0: "done when" -- */

test("the same request sent again a week later is a second entry, and tells the owner again", async () => {
  assert.deepEqual(await postAndSettle(REQUEST), [200, { ok: true, kept: true }]);
  assert.deepEqual([w.entries.length, w.notifications.length, w.suggested.length], [1, 1, 1]);
  // Sent again by a site that sends no id of its own and no time: within ten minutes it is a retry, the same entry.
  w.clock.now += AGAIN_WITHIN_MS - 60_000;
  assert.deepEqual(await postAndSettle(REQUEST), [200, { ok: true, kept: true }]);
  assert.deepEqual([w.entries.length, w.notifications.length], [1, 1], "a retry adds nothing and tells nobody twice");
  // A week on, the same words are a new request: kept, and told.
  w.clock.now += 7 * DAY_MS;
  assert.deepEqual(await postAndSettle(REQUEST), [200, { ok: true, kept: true }]);
  assert.equal(w.entries.length, 2, "REGRESSION: the words alone once kept it out forever");
  assert.equal(w.notifications.length, 2, "and the owner is told of it");
  assert.equal(w.suggested.length, 2, "its own note waits on their page");
  assert.notEqual(w.entries[0].id, w.entries[1].id);
});

test("the site's own id for an entry is the entry: the same id later is the same one, another id another", async () => {
  await postAndSettle({ ...REQUEST, entry_id: "site-41" });
  w.clock.now += 30 * DAY_MS;
  await postAndSettle({ ...REQUEST, entry_id: "site-41" });
  assert.deepEqual([w.entries.length, w.notifications.length], [1, 1]);
  await postAndSettle({ ...REQUEST, entry_id: "site-42" });
  assert.deepEqual([w.entries.length, w.notifications.length], [2, 2], "two presses the site named apart are two");
  assert.deepEqual(
    w.entries.map((e) => e.ref),
    ["site-41", "site-42"],
  );
});

test("a notice that fails is told on the next try, shows meanwhile, and repeats nothing else", async () => {
  w.faults["notifications.insert"] = { message: "the bell's table is not answering", code: "57014" };
  const [status] = await post(REQUEST);
  assert.equal(status, 200, "the entry is kept: the site is answered ok");
  const failed = await w.settle();
  assert.deepEqual(
    failed.map((f) => f.effect),
    ["notice"],
    "the notice's step fails, and says so",
  );
  const entry = w.entries[0];
  assert.equal(entry.effects.notice.state, "failed", "the entry says its notice failed");
  assert.equal(entry.told_at, null, "nobody told yet");
  assert.equal(entry.effects.note.state, "done", "the note went its own way");
  assert.equal(w.notifications.length, 0);
  // Meanwhile the watch finds it once it is ten minutes old, and pages the platform.
  assert.equal(await watchFormEntries(w.db, Date.parse(entry.created_at) + AGAIN_WITHIN_MS - 1000), 0);
  assert.equal(await watchFormEntries(w.db, Date.parse(entry.created_at) + AGAIN_WITHIN_MS + 1000), 1);

  delete w.faults["notifications.insert"];
  assert.deepEqual(await w.settle(failed), [], "the next try tells them");
  assert.equal(w.notifications.length, 1, "once");
  assert.equal(w.suggested.length, 1, "and the note is not suggested again");
  assert.equal(entry.effects.notice.state, "done");
  assert.ok(entry.told_at, "told now");
  assert.equal(entry.state, "processed");
  assert.equal(await watchFormEntries(w.db, Date.parse(entry.created_at) + AGAIN_WITHIN_MS + 1000), 0);
  // A second delivery of the same event, a re-drive, runs nothing again.
  assert.deepEqual(await w.settle(failed), []);
  assert.deepEqual([w.notifications.length, w.suggested.length], [1, 1]);
});

test("a database that fails the write answers the site with a refusal, never ok, and tells nobody", async () => {
  const doors = formEntryDoors(w.tables, { resolve: () => ({ contact_id: PERSON, outcome: "new" }) });
  w.db = fakeDb(
    w.tables,
    {},
    {
      ...doors,
      form_entry_take: () => {
        throw Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
      },
    },
  );
  setPg(w.db);
  const [status, body] = await post(REQUEST);
  assert.deepEqual([status, body.error], [503, "ingest_failed"], "the site sends it again");
  assert.deepEqual([w.entries.length, w.notifications.length, w.tables.events.length], [0, 0, 0]);

  // A key that cannot be checked is not called wrong: it is a refusal of the same kind.
  w.db = fakeDb(w.tables, { "form_keys.select": { message: "unreachable", code: "08006" } }, doors);
  setPg(w.db);
  assert.deepEqual((await post(REQUEST))[0], 503);
});

test("the platform's key can rotate: a site on a key of its own still sends, and the first key is refused", async () => {
  const mine = ownKey();
  w = world({ keys: [mine.row] });
  setPg(w.db);
  assert.equal((await postAndSettle({ ...REQUEST, key: mine.key }))[0], 200, "a key of the workspace's own");
  assert.ok(w.tables.form_keys[0].last_used_at, "its last use is kept");
  assert.equal(w.entries[0].key_id, mine.row.id, "and the entry says which key brought it");
  assert.equal((await postAndSettle({ ...REQUEST, note: "Before the turn" }))[0], 200, "the first key still works");
  const first = w.tables.form_keys.find((k) => k.first);
  assert.ok(first?.last_used_at, "the first key's own last use, once a site used it");

  process.env.SUPABASE_SERVICE_ROLE_KEY = "the-rotated-service-role-key";
  try {
    assert.equal((await post({ ...REQUEST, key: mine.key, note: "After the turn" }))[0], 200, "the moved site sends");
    assert.equal((await post({ ...REQUEST, note: "Still on the old first key" }))[0], 401, "the old first key");
    assert.equal(
      (await post({ ...REQUEST, key: firstKeyOf(A, "the-rotated-service-role-key"), note: "The new first" }))[0],
      200,
      "the first key, made again from the new one",
    );
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  }
});

test("a key changed is honoured for its day; a key ended, or another workspace's, is refused", async () => {
  const changed = ownKey({ ends_at: new Date(NOW + DAY_MS - 60_000).toISOString() });
  const ended = ownKey({ ends_at: new Date(NOW - 60_000).toISOString() });
  const theirs = ownKey({ tenant_id: B });
  w = world({ keys: [changed.row, ended.row, theirs.row] });
  setPg(w.db);
  assert.equal((await post({ ...REQUEST, key: changed.key }))[0], 200, "within its day");
  assert.equal((await post({ ...REQUEST, key: ended.key }))[0], 401);
  assert.equal((await post({ ...REQUEST, key: theirs.key }))[0], 401, "a key another workspace gave its site");
  // The first key ended is refused too: switched off on its owner's word.
  w.tables.form_keys.push({
    ...ownKey().row,
    id: crypto.randomUUID(),
    first: true,
    name: null,
    hash: null,
    ends_at: new Date(NOW - 1).toISOString(),
  });
  assert.equal((await post(REQUEST))[0], 401);
});

test("a person who asked to be forgotten: nothing is kept, and the site is answered ok", async () => {
  w = world({ forgotten: true });
  setPg(w.db);
  const [status, body] = await postAndSettle(REQUEST);
  assert.deepEqual([status, body], [200, { ok: true, kept: false }]);
  assert.deepEqual(
    [w.entries.length, w.tables.events.length, w.suggested.length, w.notifications.length, w.jobs.length],
    [0, 0, 0, 0, 0],
    "no entry, no event, no note, no notice",
  );
  assert.equal(await watchFormEntries(w.db, Date.now() + DAY_MS), 0, "and nothing waiting to be told");
});

/* -------------------------------------------------------------------------- the door, as before -- */

test("the key or nothing: a key made for another workspace, or none, is refused before anything is written", async () => {
  assert.equal((await post({ ...SIGNUP, key: firstKeyOf(B) }))[0], 401);
  assert.equal((await post({ ...SIGNUP, workspace: B }))[0], 401);
  assert.equal((await post({ ...SIGNUP, key: "x".repeat(43) }))[0], 401);
  assert.equal((await post({ ...SIGNUP, key: undefined }))[0], 400, "no key is not a form");
  assert.equal((await post("not json"))[0], 400);
  assert.equal((await post({ ...SIGNUP, form: "order" }))[0], 400, "a form the door does not know");
  assert.deepEqual([w.resolved.length, w.entries.length, w.notifications.length], [0, 0, 0]);
});

test("a form with no way to reach them is refused, and one with a number nobody can dial is too", async () => {
  const [status, body] = await post({ ...REQUEST, phone: undefined });
  assert.deepEqual([status, body.error], [400, "invalid"]);
  assert.equal((await post({ ...REQUEST, phone: "12" }))[0], 400);
  assert.equal(w.resolved.length, 0);
});

test("a sign-up: the person through the one door as the website's, a note to keep, and the owner told on the bell", async () => {
  const [status, body] = await postAndSettle(SIGNUP);
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
  const entry = w.entries[0];
  assert.deepEqual(entry.owed, ["note", "notice", "confirm"]);
  assert.equal(
    entry.effects.confirm.outcome,
    "gone",
    "the ask settled first, and said why it did not go: no page here",
  );
  assert.equal(entry.state, "processed");
  assert.deepEqual(
    Object.keys(entry.answers).sort(),
    ["email", "form", "lang", "page"],
    "what was sent, never the workspace or its key",
  );
});

test("the same form sent twice at once is one entry, one note and one notice; another form is a second", async () => {
  await Promise.all([post(REQUEST), post(REQUEST)]);
  await w.settle();
  assert.equal(w.entries.length, 1);
  assert.equal(w.resolved.length, 1, "the retry is found before the person door is asked again");
  assert.deepEqual([w.suggested.length, w.notifications.length], [1, 1]);
  await postAndSettle({ ...REQUEST, note: "Or April?" });
  assert.deepEqual([w.suggested.length, w.notifications.length], [2, 2]);
  assert.match(w.suggested[0].p_body, /^A seat in the spring class\. They wrote: "Can I start in March\?"$/);
  assert.equal(w.resolved[0].p_phone, "+15550100175", "the number as one");
  // A site's request is answered like any other (00709, call 3): its bell is a request's, named as its form is, and opens
  // the request in Inbox.
  assert.equal(w.notifications[0].title, "Ana Ruiz sent a request: Website form");
  assert.equal(w.notifications[0].kind, "form_request");
  assert.ok(w.notifications[0].route.startsWith("inbox/rq-"), "it opens the request in Inbox");
});

test("a form that arrives late says the day it was sent, in the workspace's own zone, and is told on the bell alone", async () => {
  // 8:49 PM in New York on Oct 26, which UTC already calls Oct 27 (the first form re-sent, 28 Oct 2026).
  const [status] = await postAndSettle({ ...REQUEST, at: "2026-10-27T00:49:00.320Z" });
  assert.equal(status, 200);
  assert.match(w.suggested[0].p_body, / Sent Oct 26\.$/, "REGRESSION: the day UTC had reached, not the workspace's");
  assert.equal(w.notifications.length, 1, "kept on the bell");
  assert.equal(w.jobs.length, 0, "no phone is told");
  assert.ok(w.entries[0].told_at, "and the bell's row is a notice");

  // A workspace that keeps another zone says its own day; one whose zone cannot be read, the default zone's.
  w = world({ zone: "Asia/Tokyo" });
  setPg(w.db);
  await postAndSettle({ ...REQUEST, at: "2026-10-26T16:30:00Z" });
  assert.match(w.suggested[0].p_body, / Sent Oct 27\.$/);
  w = world({ zone: null });
  setPg(w.db);
  await postAndSettle({ ...REQUEST, at: "2026-10-27T00:49:00.320Z" });
  assert.match(w.suggested[0].p_body, / Sent Oct 26\.$/, "America/New_York, the default zone");
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
  assert.equal(asks().length, 0, "the ask is the entry's own step, after the answer");
  assert.deepEqual(await w.settle(), []);
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
    new RegExp(`<img src="https://db\\.example\\.supabase\\.co/[^"]*workspace-logos/${A}/${LOGO}\\.png"`),
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
  assert.equal(w.notifications.length, 1, "the notice waited for the ask, and was told once");
  assert.match(w.notifications[0].body, /\nEmailed them to confirm\. Offers by email start once they do\.\n/);
});

test("asked once: the same form again, or another sign-up while the ask is open, sends nothing more", async (t) => {
  canSend(t);
  w = world({ person: { email: "ana@example.com" }, mailbox: true });
  setPg(w.db);
  await postAndSettle(SIGNUP);
  assert.deepEqual(
    await postAndSettle(SIGNUP),
    [200, { ok: true, kept: true }],
    "nothing new went: the site says nothing of it",
  );
  await postAndSettle({ ...SIGNUP, about: "The spring offers" });
  assert.equal(asks().length, 1);
  assert.equal(sends().length, 1);
  assert.equal(w.notifications.length, 2, "the same form is told once; another sign-up is told");
  assert.match(w.notifications.at(-1).body, /Already emailed them to confirm\./);

  // Two posts at once both read no open ask; the second's email is the first's, by its id, and is sent once.
  w = world({ person: { email: "ana@example.com" }, mailbox: true });
  setPg(w.db);
  await Promise.all([post(SIGNUP), post({ ...SIGNUP, about: "The spring offers" })]);
  await w.settle();
  assert.deepEqual([asks().length, sends().length], [1, 1]);
});

test("an ask whose step fails: the owner is told without its line, and the next try asks once", async (t) => {
  canSend(t);
  w = world({ person: { email: "ana@example.com" }, mailbox: true });
  setPg(w.db);
  w.faults["messages.insert"] = { message: "the messages table is not answering", code: "57014" };
  await post(SIGNUP);
  const failed = await w.settle();
  assert.deepEqual(
    failed.map((f) => f.effect),
    ["confirm"],
  );
  assert.equal(w.notifications.length, 1, "the owner hears of the sign-up all the same");
  assert.doesNotMatch(w.notifications[0].body, /confirm/, "and nothing is said of an ask that has not gone");
  delete w.faults["messages.insert"];
  assert.deepEqual(await w.settle(failed), []);
  assert.equal(sends().length, 1, "the next try asks");
  assert.equal(w.entries[0].effects.confirm.state, "done");
  assert.deepEqual(await w.settle(failed), [], "and a third run asks nothing");
  assert.deepEqual([asks().length, sends().length, w.notifications.length], [1, 1, 1]);
});

test("the notice handed on twice at once tells the owner once, and the delivery that lost has not failed", async (t) => {
  canSend(t);
  w = world({ person: { email: "ana@example.com" }, mailbox: true });
  setPg(w.db);
  await post(SIGNUP);
  const entry = w.entries[0];
  // The ask settles first, as its own step; then the notice runs from both of its events at the same moment.
  await runFormEffect(w.db, A, entry.id, "confirm");
  const both = await Promise.allSettled([
    runFormEffect(w.db, A, entry.id, "notice"),
    runFormEffect(w.db, A, entry.id, "notice"),
  ]);
  assert.deepEqual(
    both.map((r) => r.status),
    ["fulfilled", "fulfilled"],
    "neither throws: the one that found the row taken wrote nothing",
  );
  assert.equal(w.notifications.length, 1, "one row on the bell");
  assert.equal(entry.effects.notice.state, "done", "and the entry says told, never failed after it");
  assert.ok(entry.told_at);
});

test("not asked, and the owner told why: no mailbox, a made-up address, another address on their page, a yes given", async (t) => {
  canSend(t);
  const cases = [
    [{ person: { email: "ana@example.com" }, mailbox: false }, SIGNUP, /connect an email address first/],
    [
      { person: { email: "a.n.a.r@gmail.com" }, mailbox: true },
      { ...SIGNUP, email: "a.n.a.r@gmail.com" },
      /looks made up/,
    ],
    [{ person: { email: "ana@other.example" }, mailbox: true }, SIGNUP, /an address their page doesn't have/],
    [{ person: { email: "ana@example.com", email_marketing: "opted_in" }, mailbox: true }, SIGNUP, /already said yes/],
    [{ person: { email: "ana@example.com", consent: "opted_out" }, mailbox: true }, SIGNUP, /asked you to stop/],
  ];
  for (const [shape, form, said] of cases) {
    w = world(shape);
    setPg(w.db);
    assert.deepEqual(await postAndSettle(form), [200, { ok: true, kept: true }], `no confirm: ${said}`);
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
    assert.deepEqual(await postAndSettle(form), [200, { ok: true, kept: true }]);
    assert.equal(asks().length, 0);
    assert.deepEqual(w.entries[0].owed, ["note", "notice"], "no ask is owed");
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
  await postAndSettle(typed);
  assert.equal(asks().length, 3, "the same inbox, spelled another way, asked three times already");
  assert.match(w.notifications[0].body, /asked 3 times already in 90 days/);

  w = world({
    person: { email: "ana@example.com" },
    mailbox: true,
    asked: old(50, { created_at: new Date(NOW - 3_600_000).toISOString(), meta: { source: "signup_confirm" } }),
  });
  setPg(w.db);
  await postAndSettle(SIGNUP);
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
  await postAndSettle(SIGNUP);
  assert.equal(asks().length, 3);
  assert.match(w.notifications[0].body, /didn't arrive/);
});

/* ------------------------------------------------- where a visitor came from (the Ads tracking plan's T4) -- */

test("a form posted with where its visitor came from keeps it in the one shape, beside its answers; one with none is as before", async () => {
  const from = {
    utm_source: "google",
    utm_campaign: "spring-offer",
    utm_term: "<b>odd</b>",
    gclid: "Cj0KCQiA-click-id",
    referrer: "https://www.google.com/search?q=harbor+classes",
  };
  assert.deepEqual(await postAndSettle({ ...REQUEST, page: "classes", source: from }), [200, { ok: true, kept: true }]);
  assert.deepEqual(w.entries[0].source, {
    page: "classes",
    site: "google.com",
    labels: { utm_source: "google", utm_campaign: "spring-offer" },
  });
  assert.equal("source" in w.entries[0].answers, false, "kept once, in its own shape");
  assert.equal(JSON.stringify(w.entries[0]).includes("click-id"), false, "never a click id");
  assert.deepEqual(
    [w.notifications.length, w.suggested.length],
    [1, 1],
    "a label with odd characters costs the form nothing",
  );
  assert.match(
    w.suggested[0].p_body,
    /\. From Google \(spring-offer\)\./,
    "and the note on the person's page says who sent them",
  );

  assert.deepEqual(await postAndSettle({ ...REQUEST, entry_id: "no-source" }), [200, { ok: true, kept: true }]);
  assert.equal(w.entries[1].source, null);
  assert.equal(w.suggested[1].p_body.includes("From "), false, "a form that said nothing of it is noted as before");
});

test("where they came from is kept in the entry's own write (00709): no second write, so none can be lost", async () => {
  w.faults["form_entries.update"] = { message: "the table is not answering", code: "57014" };
  assert.deepEqual(await post({ ...REQUEST, source: { utm_source: "google" } }), [200, { ok: true, kept: true }]);
  assert.equal(w.entries.length, 1);
  assert.deepEqual(w.entries[0].source, { labels: { utm_source: "google" } }, "kept with the entry, never after it");
});

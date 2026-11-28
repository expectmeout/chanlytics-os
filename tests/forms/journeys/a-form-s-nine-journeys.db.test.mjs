/**
 * The nine journeys a form can take (the whole-system plan of 28 Nov 2026, lane 3; the outside engineering review's
 * form journeys), each run end to end on a real database through the doors the apps call. One workspace, its sites and
 * its forms, taken through a business's life:
 *
 *   1. an entry from a site makes the right person, request and source;
 *   2. the same entry again is the same entry;
 *   3. several forms on one site keep their own numbers;
 *   4. someone already a client writes in, and stays one person;
 *   5. a form becomes a conversation, and the request stays tied to it;
 *   6. that conversation becomes a booking, and where it came from survives;
 *   7. the site is disconnected, and its records stay;
 *   8. a form is retired, and its history stays;
 *   9. the person asks to be erased, and every form row of theirs goes.
 *
 * The code on either side of these doors runs in memory beside this file: the website door and what an entry owes
 * (tests/people/doors/website-form-door.test.mjs), a site's request through the dashboard
 * (website/a-site-s-request-is-answered-like-any-other.test.mjs) and a hosted form's whole road
 * (an-owner-makes-and-answers-a-form.test.mjs, a-visitor-fills-in-a-form.test.mjs). What each column of a form's rows
 * becomes at an erasure is the registry's (packages/db erasure/registry, form_entries under form_entries_trigger), held
 * to the schema by tests/people/erasure/erasure-registry.test.mjs and seeded by erasure-completeness.db.test.mjs.
 *
 * Journey 6 reads "booked after" by today's rule (00678: a visit that follows the request). The whole-system plan's
 * lane 4 gives that rule a window; its one assertion here moves with that rule.
 *
 * Skipped without a local database; never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : false;

const RUN = Date.now();
const HOUR_MS = 3_600_000;
let db;
let owner;
let tenantId;
let ownerId;
/** What a journey leaves for the ones after it: the site's key, its forms, and the people who wrote. */
const kept = {};

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
let digest = 0;
const hex = () => (digest += 1).toString(16).padStart(64, "0");
const phoneOf = (n) => `+1646555${String(4000 + n).slice(-4)}`;
const emailOf = (who) => `${who}-${RUN}@example.com`;
const WHERE_FROM = {
  page: "/contact",
  site: "instagram.com",
  labels: { utm_source: "instagram", utm_campaign: "spring" },
};

/** The website door's one write, as the edge calls it (packages/db takeFormEntry): a request from `who` unless said. */
const take = (who, n, over = {}) =>
  db.rpc("form_entry_take", {
    p_tenant_id: tenantId,
    p_form: "request",
    p_answers: { form: "request", name: who, email: emailOf(who), phone: phoneOf(n), note: "Can I come in March?" },
    p_person: { phone: phoneOf(n), email: emailOf(who), name: who, detail: { form: "request" } },
    p_words: hex(),
    p_owed: ["note", "notice"],
    p_key_id: kept.key,
    p_host: "studio.example.com",
    ...over,
  });
const entryOf = async (id) => ok(await db.from("form_entries").select("*").eq("id", id).maybeSingle(), "the entry");
const personOf = async (id) => ok(await db.from("contacts").select("*").eq("id", id).maybeSingle(), "the person");
const open = async () => ok(await owner.rpc("form_requests_open", { p_tenant_id: tenantId }), "open");
const openIds = async () => (await open()).map((line) => line.id);
const linksOf = async (entryId) =>
  ok(
    await db
      .from("form_entry_links")
      .select("kind, message_id, conversation_id")
      .eq("entry_id", entryId)
      .order("created_at"),
    "its links",
  );
const countOf = async (table, column = "tenant_id", value = tenantId) =>
  (await db.from(table).select("id", { count: "exact", head: true }).eq(column, value)).count;
const eventsOf = async (kind, subject) =>
  ok(await db.from("events").select("data").eq("tenant_id", tenantId).eq("kind", kind).eq("subject_id", subject));
/** What the workspace's forms brought, for one form owned by the site: its own line of form_results. */
const broughtBy = async (outsideFormId) =>
  ok(await owner.rpc("form_results", { p_tenant_id: tenantId, p_days: 30 }), "results").outside.find(
    (line) => line.outside_form_id === outsideFormId,
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `journeys-${RUN}`, name: "Harbor" })
      .select("id")
      .single(),
  ).id;
  const user = ok(
    await db.auth.admin.createUser({ email: emailOf("owner"), password: `pw-${RUN}-Aa1!`, email_confirm: true }),
    "the owner",
  ).user;
  ownerId = user.id;
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: ownerId, role: "owner" }), "the owner's seat");
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await owner.auth.signInWithPassword({ email: emailOf("owner"), password: `pw-${RUN}-Aa1!` }), "signed in");
  // The business connects its website: a key of its own, which makes its site.
  kept.key = ok(await owner.rpc("form_key_make", { p_tenant_id: tenantId, p_name: "Studio", p_hash: hex() }), "a key");
  kept.site = ok(await db.from("form_keys").select("site_id").eq("id", kept.key).single()).site_id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("events").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
  if (ownerId) await db.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

test("1. an entry from a site makes the right person, request and source", { skip }, async () => {
  const words = hex();
  const over = { p_ref: "site-1", p_words: words, p_form_ref: "consult", p_form_name: "Colour consultation" };
  const taken = ok(await take("ana", 1, { ...over, p_source: WHERE_FROM }), "the entry");
  assert.deepEqual([taken.outcome, taken.person, taken.clash], ["accepted", "new", false]);
  kept.ana = { ...taken, words, over };

  const ana = await personOf(taken.contact_id);
  assert.deepEqual(
    [ana.email, ana.phone_e164, ana.display_name, ana.tenant_id],
    [emailOf("ana"), phoneOf(1), "ana", tenantId],
    "the person: who the form said they are, in this workspace",
  );
  const [resolved] = await eventsOf("person.resolved", taken.contact_id);
  assert.deepEqual(
    [resolved.data.outcome, resolved.data.source],
    ["new", "website"],
    "made through the one door, as the website's",
  );

  const entry = await entryOf(taken.entry_id);
  assert.deepEqual(
    [entry.contact_id, entry.state, entry.ref, entry.key_id],
    [taken.contact_id, "accepted", "site-1", kept.key],
  );
  assert.deepEqual(entry.source, WHERE_FROM, "the source: where its visitor came from, kept in the entry's own write");
  const form = ok(await db.from("outside_forms").select("*").eq("id", entry.outside_form_id).single());
  assert.deepEqual(
    [form.site_id, form.form, form.ref, form.sent_name],
    [kept.site, "request", "consult", "Colour consultation"],
    "its form: the site's, found by the site's own id for it",
  );
  kept.consult = form.id;

  const request = (await open()).find((line) => line.id === taken.entry_id);
  assert.deepEqual(
    [request.contact_id, request.outside_form_id, request.heading, request.unreached],
    [taken.contact_id, form.id, "Colour consultation", false],
    "the request: open in Needs you, named as its form is, about that person",
  );
  assert.deepEqual(
    (await eventsOf("form_entry.accepted", taken.entry_id)).map((event) => event.data),
    [{ form: "request", owed: ["note", "notice"] }],
    "and its one event, from which its note and its notice start",
  );
  const site = ok(
    await db.from("form_sites").select("host, first_entry_at, last_entry_at").eq("id", kept.site).single(),
  );
  assert.ok(
    site.host === "studio.example.com" && site.first_entry_at && site.last_entry_at,
    "its site says it is receiving",
  );
});

test("2. the same entry again is the same entry", { skip }, async () => {
  const before = [await countOf("form_entries"), await countOf("contacts"), (await open()).length];
  const again = ok(
    await take("ana", 1, { ...kept.ana.over, p_words: kept.ana.words, p_source: WHERE_FROM }),
    "sent again",
  );
  assert.deepEqual(
    [again.outcome, again.entry_id, again.contact_id],
    ["again", kept.ana.entry_id, kept.ana.contact_id],
    "by the site's own id for it",
  );
  // A site that sends no id: the same words at once are a retry.
  const words = hex();
  const plain = ok(await take("bo", 2, { p_words: words, p_form_ref: "consult" }), "no id");
  const plainAgain = ok(await take("bo", 2, { p_words: words, p_form_ref: "consult" }), "no id, again");
  assert.deepEqual([plainAgain.outcome, plainAgain.entry_id], ["again", plain.entry_id]);
  kept.bo = plain;
  assert.deepEqual(
    [await countOf("form_entries"), await countOf("contacts"), (await open()).length],
    [before[0] + 1, before[1] + 1, before[2] + 1],
    "one more entry, person and request for Bo, and nothing more for anything sent twice",
  );
  assert.equal((await eventsOf("form_entry.accepted", kept.ana.entry_id)).length, 1, "and nobody is told twice");
});

test("3. several forms on one site keep their own numbers", { skip }, async () => {
  const party = ok(
    await take("cy", 3, { p_ref: "site-1", p_form_ref: "party", p_form_name: "Party bookings" }),
    "another form",
  );
  assert.equal(party.outcome, "accepted", "the same entry id on another of the site's forms is its own entry");
  kept.cy = party;
  const forms = ok(await db.from("outside_forms").select("id, ref").eq("tenant_id", tenantId).eq("site_id", kept.site));
  assert.deepEqual(forms.map((form) => form.ref).sort(), ["consult", "party"], "two forms, one site");
  kept.party = forms.find((form) => form.ref === "party").id;

  const [consult, partyNumbers] = [await broughtBy(kept.consult), await broughtBy(kept.party)];
  assert.deepEqual(
    [consult.entries, consult.people, partyNumbers.entries, partyNumbers.people],
    [2, 2, 1, 1],
    "each form counts its own entries and its own people",
  );
  const byForm = (await open()).reduce((count, line) => {
    count[line.outside_form_id] = (count[line.outside_form_id] ?? 0) + 1;
    return count;
  }, {});
  assert.deepEqual([byForm[kept.consult], byForm[kept.party]], [2, 1], "and Needs you names each request's own form");
});

test("4. someone already a client writes in, and stays one person", { skip }, async () => {
  // Dee has been a client for a year: her page holds her number, her address and her name.
  const dee = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phoneOf(4), email: emailOf("dee"), display_name: "Dee Marsh" })
      .select("id")
      .single(),
    "a client",
  ).id;
  const people = await countOf("contacts");
  // She fills in the site's form with her number, a nickname and another address.
  const taken = ok(
    await take("dee", 4, {
      p_form_ref: "consult",
      p_answers: { form: "request", name: "D.", email: emailOf("dee.other"), phone: phoneOf(4), note: "Roots again?" },
      p_person: { phone: phoneOf(4), email: emailOf("dee.other"), name: "D.", detail: { form: "request" } },
    }),
    "her request",
  );
  assert.equal(taken.contact_id, dee, "found by her number: the request is hers");
  assert.notEqual(taken.person, "new");
  assert.equal(await countOf("contacts"), people, "no second person was made");
  const page = await personOf(dee);
  assert.deepEqual(
    [page.email, page.display_name],
    [emailOf("dee"), "Dee Marsh"],
    "and her page is never overwritten by what was typed into a form",
  );
  assert.equal(
    (await entryOf(taken.entry_id)).answers.email,
    emailOf("dee.other"),
    "what she typed stays on the request",
  );
  kept.dee = { ...taken, contact_id: dee };
});

test("5. a form becomes a conversation, and the request stays tied to it", { skip }, async () => {
  // The owner answers Ana's request from the Inbox: the reply says which request it answers, and the database ties the
  // two in the message's own write (00713).
  const conversation = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: kept.ana.contact_id })
      .select("id")
      .single(),
    "her conversation",
  ).id;
  const message = { tenant_id: tenantId, conversation_id: conversation, channel: "email" };
  const reply = ok(
    await db
      .from("messages")
      .insert({
        ...message,
        direction: "outbound",
        sender: "human",
        status: "sent",
        meta: { form_entry_id: kept.ana.entry_id },
      })
      .select("id")
      .single(),
    "the reply",
  ).id;
  assert.deepEqual(
    await linksOf(kept.ana.entry_id),
    [{ kind: "reply", message_id: reply, conversation_id: null }],
    "the request is answered by that reply",
  );
  assert.equal((await openIds()).includes(kept.ana.entry_id), false, "and waits in Needs you no more");
  // She writes back, and the conversation goes on: the request is still the one that began it.
  ok(
    await db.from("messages").insert({ ...message, direction: "inbound", sender: "customer", status: "received" }),
    "her answer",
  );
  ok(
    await db.from("messages").insert({ ...message, direction: "outbound", sender: "ai", status: "sent" }),
    "AI's answer",
  );
  const [link] = await linksOf(kept.ana.entry_id);
  const tied = ok(await db.from("messages").select("conversation_id, contact_id").eq("id", link.message_id).single());
  assert.equal(tied.conversation_id, conversation, "tied through its reply to the conversation it became");
  const entry = await entryOf(kept.ana.entry_id);
  assert.deepEqual(
    [entry.contact_id, entry.outside_form_id],
    [kept.ana.contact_id, kept.consult],
    "the same person, the same form",
  );
  assert.equal((await openIds()).includes(kept.ana.entry_id), false, "and more messages never open it again");
  assert.equal((await broughtBy(kept.consult)).talked >= 1, true, "its form says a request became a conversation");
  kept.conversation = conversation;
});

test("6. that conversation becomes a booking, and where it came from survives", { skip }, async () => {
  const soon = (hours) => new Date(Date.now() + hours * HOUR_MS).toISOString();
  const visits = (await broughtBy(kept.consult)).visits;
  const visit = ok(
    await db
      .from("appointments")
      .insert({
        tenant_id: tenantId,
        contact_id: kept.ana.contact_id,
        source: "person",
        status: "booked",
        starts_at: soon(48),
        ends_at: soon(49),
        timezone: "UTC",
      })
      .select("id")
      .single(),
    "her visit",
  ).id;
  assert.ok(visit);
  // Where she came from is the entry's own, and a booking changes none of it.
  const entry = await entryOf(kept.ana.entry_id);
  assert.deepEqual(entry.source, WHERE_FROM, "the source its visitor came from is still on the request");
  assert.deepEqual(
    [entry.contact_id, entry.outside_form_id, (await linksOf(kept.ana.entry_id)).length],
    [kept.ana.contact_id, kept.consult, 1],
    "with its person, its form and the reply that answered it",
  );
  // By today's rule (00678), a visit that follows a request is that form's: lane 4 of the plan gives the rule a window.
  assert.equal((await broughtBy(kept.consult)).visits, visits + 1, "and her form says she booked after asking");
  assert.equal((await broughtBy(kept.party)).visits, 0, "a form she never filled in says nothing of it");
});

test("7. the site is disconnected, and its records stay", { skip }, async () => {
  const before = {
    entries: await countOf("form_entries"),
    forms: await countOf("outside_forms"),
    open: await openIds(),
    consult: await broughtBy(kept.consult),
  };
  assert.equal(ok(await owner.rpc("form_key_end", { p_tenant_id: tenantId, p_key_id: kept.key }), "ended"), true);
  const key = ok(await db.from("form_keys").select("ends_at, site_id").eq("id", kept.key).single());
  assert.ok(Date.parse(key.ends_at) <= Date.now(), "its key is refused from now on");
  assert.equal(key.site_id, kept.site, "and still says whose it was");
  const site = ok(await db.from("form_sites").select("id, host, last_entry_at").eq("id", kept.site).maybeSingle());
  assert.ok(site?.last_entry_at, "the site's record stays, with when it last sent");
  assert.deepEqual(
    [await countOf("form_entries"), await countOf("outside_forms"), await openIds()],
    [before.entries, before.forms, before.open],
    "its forms, its entries and its open requests are all as they were",
  );
  assert.deepEqual(await broughtBy(kept.consult), before.consult, "and so is what each form brought");
  // A request it sent before can still be answered: a member's word that it was.
  ok(
    await owner
      .from("form_entry_links")
      .insert({ tenant_id: tenantId, entry_id: kept.bo.entry_id, kind: "marked", created_by: ownerId }),
    "marked answered",
  );
  assert.equal((await openIds()).includes(kept.bo.entry_id), false);
});

test("8. a form is retired, and its history stays", { skip }, async () => {
  // A site's form, hidden: it leaves the list and nothing else.
  const entries = await countOf("form_entries", "outside_form_id", kept.party);
  const hide = { p_tenant_id: tenantId, p_form_id: kept.party, p_listed: false };
  assert.equal(ok(await owner.rpc("outside_form_listed", hide), "hidden"), true);
  const party = ok(await db.from("outside_forms").select("listed, first_entry_at").eq("id", kept.party).single());
  assert.deepEqual([party.listed, !!party.first_entry_at], [false, true], "hidden, with its history");
  assert.equal(await countOf("form_entries", "outside_form_id", kept.party), entries, "its entries stay");
  assert.equal((await openIds()).includes(kept.cy.entry_id), true, "its open request still waits in Needs you");
  assert.equal((await broughtBy(kept.party)).entries, 1, "and its numbers still say what it brought");

  // A form made here, turned off: no new request is taken, and what it took stays.
  const form = ok(
    await owner
      .from("forms")
      .insert({
        tenant_id: tenantId,
        slug: `colour-${RUN}`,
        draft: { heading: "Ask for a colour", fields: [{ id: "name", kind: "name", label: "Your name" }] },
        created_by: ownerId,
      })
      .select("id")
      .single(),
    "a form made here",
  ).id;
  const version = ok(
    await owner.rpc("form_publish", { p_tenant_id: tenantId, p_form_id: form }),
    "published",
  ).version_id;
  const request = (ref) =>
    db.rpc("form_request_take", {
      p_tenant_id: tenantId,
      p_form_id: form,
      p_version_id: version,
      p_ref: `${ref}-${RUN}`,
      p_answers: { name: "Eli" },
      p_reach: { name: "Eli", email: emailOf("eli"), phone: null },
      p_words: hex(),
    });
  const eli = ok(await request("eli-1"), "a request while it is live");
  assert.equal(eli.outcome, "accepted");
  assert.equal(ok(await owner.rpc("form_turn", { p_tenant_id: tenantId, p_form_id: form, p_on: false }), "off"), true);
  assert.equal(ok(await request("eli-2"), "a request after").outcome, "closed", "a retired form takes no new request");
  const kept1 = await entryOf(eli.entry_id);
  assert.deepEqual(
    [kept1.form_id, kept1.version_id, kept1.contact_id],
    [form, version, eli.contact_id],
    "its request stays",
  );
  assert.equal((await openIds()).includes(eli.entry_id), true, "still open, still answerable");
  const versions = ok(await db.from("form_versions").select("id").eq("form_id", form));
  assert.equal(versions.length, 1, "and the version its visitor saw is kept, so it still reads as they saw it");
  kept.eli = eli;
  kept.form = form;
});

test("9. the person asks to be erased, and every form row of theirs goes", { skip }, async () => {
  // Ana has an answered request with its reply and its conversation; she also has an entry held for a look on the form
  // made here, typed with her address, which has no person yet.
  ok(await owner.rpc("form_turn", { p_tenant_id: tenantId, p_form_id: kept.form, p_on: true }), "live again");
  const version = ok(await db.from("forms").select("live_version_id").eq("id", kept.form).single()).live_version_id;
  const held = ok(
    await db.rpc("form_request_take", {
      p_tenant_id: tenantId,
      p_form_id: kept.form,
      p_version_id: version,
      p_ref: `ana-held-${RUN}`,
      p_answers: { name: "Ana" },
      p_reach: { name: "Ana", email: emailOf("ana").toUpperCase(), phone: null },
      p_words: hex(),
      p_held_why: "too_fast",
    }),
    "held for a look",
  );
  assert.deepEqual([held.outcome, held.contact_id], ["held", null]);
  const others = [kept.bo.entry_id, kept.cy.entry_id, kept.dee.entry_id, kept.eli.entry_id];
  const reply = (await linksOf(kept.ana.entry_id))[0].message_id;

  ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", kept.ana.contact_id), "erased");

  assert.equal(
    await entryOf(kept.ana.entry_id),
    null,
    "her request is gone: its answers, its source, the site's id for it",
  );
  assert.equal(
    await entryOf(held.entry_id),
    null,
    "and the one held with no person, found by the address typed into it",
  );
  assert.deepEqual(await linksOf(kept.ana.entry_id), [], "with what tied it to her reply");
  assert.equal(await countOf("form_entries", "contact_id", kept.ana.contact_id), 0, "no form row names her");
  const typed = ok(
    await db.from("form_entries").select("id").eq("tenant_id", tenantId).ilike("reach->>email", emailOf("ana")),
    "entries typed with her address",
  );
  assert.deepEqual(typed, [], "none typed with her address is left either");
  // What is the business's own stays: its forms, its site, and everyone else's requests.
  for (const id of others) assert.ok(await entryOf(id), "another person's request is untouched");
  assert.ok(ok(await db.from("outside_forms").select("id").eq("id", kept.consult).maybeSingle()), "her form stays");
  assert.ok(ok(await db.from("form_sites").select("id").eq("id", kept.site).maybeSingle()), "and its site");
  assert.equal((await openIds()).includes(kept.ana.entry_id), false, "and Needs you says nothing of her");
  // Her address is off her row with the mark itself; the rest of the tombstone is erase_contact's own (the erasure suite).
  assert.equal((await personOf(kept.ana.contact_id)).email, null);
  assert.ok(reply, "her reply was a message of her conversation, which the erasure's own legs take");
});

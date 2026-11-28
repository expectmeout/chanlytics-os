/**
 * A business's own form on a real database (00680): a member makes a form and a link under the row rules, and
 * form_publish numbers its versions; link_open lands and counts; form_request_take keeps a request with its person and
 * its event in one write, once by the page's own id, and answers closed, stale and forgotten without writing; a
 * doubtful entry and a test are kept with no person and no event, and one let through gets both then; what answers a
 * request is a link from it, read by form_requests_open; a request's code carries it into a chat once; form_results
 * counts what the forms brought; a merge moves a person's requests, an erasure takes the held ones typed with their
 * address, and the purge takes what is old. A function body is what reading source cannot prove, so these run against
 * Postgres. Skipped without a local database; never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { hashLegacyErasedEmail } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const RUN = Date.now();
const REFUSED = "42501";
const DAY_MS = 86_400_000;
let db;
let tenantId;
let otherTenantId;
const users = {};
const sessions = {};
/** What the proofs hand on: the form, its versions, its link, and each request by the name of who sent it. */
const kept = {};

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const hex = (c) => c.repeat(64);
const address = (who) => `${who}-${RUN}@example.com`;
const DRAFT = { heading: "Ask for a colour", fields: [{ id: "name", kind: "name", label: "Your name" }] };

/** The door's one write, as the dashboard's public page calls it (packages/db takeFormRequest). */
const take = (ref, reach, over = {}) =>
  db.rpc("form_request_take", {
    p_tenant_id: tenantId,
    p_form_id: kept.form,
    p_version_id: kept.v2,
    p_ref: `${ref}-${RUN}`,
    p_answers: { name: reach.name ?? "" },
    p_reach: reach,
    p_words: hex("b"),
    ...over,
  });
const entryOf = async (id) => ok(await db.from("form_entries").select("*").eq("id", id).maybeSingle(), "the entry");
const eventsOf = async (entryId) =>
  ok(await db.from("events").select("id, data").eq("kind", "form_entry.accepted").eq("subject_id", entryId));
const openAs = async (who) => ok(await sessions[who].rpc("form_requests_open", { p_tenant_id: tenantId }), "open");
/** A row's moment set back, as time passing would. */
const aged = async (table, id, column, days) =>
  ok(
    await db
      .from(table)
      .update({ [column]: new Date(Date.now() - days * DAY_MS).toISOString() })
      .eq("id", id),
    `${table} aged`,
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (slug, name) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `${slug}-${RUN}`, name })
        .select("id")
        .single(),
      slug,
    ).id;
  tenantId = await workspace("request-form", "Harbor");
  otherTenantId = await workspace("request-form-other", "Quay");
  for (const [who, role, tenant] of [
    ["owner", "owner", tenantId],
    ["viewer", "viewer", tenantId],
    ["stranger", "owner", otherTenantId],
  ]) {
    const user = ok(
      await db.auth.admin.createUser({ email: address(who), password: `pw-${RUN}-Aa1!`, email_confirm: true }),
      who,
    ).user;
    users[who] = user.id;
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: user.id, role }), `${who}'s seat`);
    const as = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await as.auth.signInWithPassword({ email: address(who), password: `pw-${RUN}-Aa1!` }), who);
    sessions[who] = as;
  }
});

after(async () => {
  if (skip || !tenantId) return;
  for (const id of [tenantId, otherTenantId]) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of Object.values(users)) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

test(
  "a form is an owner's or an operator's to make, a member's to read, and published by its door alone",
  { skip },
  async () => {
    const { owner, viewer, stranger } = sessions;
    const row = (by) => ({ tenant_id: tenantId, slug: "colour", draft: DRAFT, created_by: users[by] });
    assert.equal((await viewer.from("forms").insert(row("viewer"))).error?.code, REFUSED, "a viewer makes none");
    assert.equal((await stranger.from("forms").insert(row("stranger"))).error?.code, REFUSED, "nor a stranger");
    const form = ok(await owner.from("forms").insert(row("owner")).select("id, state, live_version_id").single());
    assert.deepEqual([form.state, form.live_version_id], ["draft", null], "made a draft");
    kept.form = form.id;
    assert.equal(ok(await viewer.from("forms").select("id").eq("id", form.id)).length, 1, "a member reads it");
    assert.equal(ok(await stranger.from("forms").select("id").eq("id", form.id)).length, 0, "a stranger does not");

    const publish = (as, formId = form.id) => as.rpc("form_publish", { p_tenant_id: tenantId, p_form_id: formId });
    assert.equal((await publish(viewer)).error?.code, REFUSED);
    assert.equal((await publish(stranger)).error?.code, REFUSED);
    assert.equal((await publish(owner, tenantId)).error?.code, "P0002", "a form that is not the workspace's");
    const first = ok(await publish(owner), "publish");
    assert.deepEqual([first.made, first.n], [true, 1]);
    kept.v1 = first.version_id;
    const same = ok(await publish(owner), "publish again");
    assert.deepEqual([same.made, same.version_id], [false, first.version_id], "the same draft makes no version");
    ok(
      await owner
        .from("forms")
        .update({ draft: { ...DRAFT, heading: "Ask for a colour visit" } })
        .eq("id", form.id),
    );
    const second = ok(await publish(owner), "publish the change");
    assert.deepEqual([second.made, second.n], [true, 2]);
    kept.v2 = second.version_id;
    const before = ok(await db.from("form_versions").select("replaced_at").eq("id", kept.v1).single());
    assert.ok(before.replaced_at, "the version before is marked replaced");
    const byHand = await owner
      .from("form_versions")
      .insert({ tenant_id: tenantId, form_id: form.id, n: 9, description: {} });
    assert.equal(byHand.error?.code, REFUSED, "a version is the door's to write");
    // A member changes a form's draft and nothing else of it: not where it lives, not whether it is live.
    assert.equal((await owner.from("forms").update({ state: "off" }).eq("id", form.id)).error?.code, REFUSED);
    assert.equal(
      (await owner.from("forms").update({ tenant_id: otherTenantId }).eq("id", form.id)).error?.code,
      REFUSED,
    );
    assert.equal(ok(await owner.from("forms").delete().eq("id", form.id).select("id")).length, 0, "a live form stays");

    const turn = (as, on) => as.rpc("form_turn", { p_tenant_id: tenantId, p_form_id: form.id, p_on: on });
    assert.equal((await turn(viewer, false)).error?.code, REFUSED);
    assert.equal(ok(await turn(owner, false)), true, "turned off");
    assert.equal(ok(await turn(owner, false)), false, "off once");
  },
);

test("a link lands on its form and counts its opens by day, never a preview's", { skip }, async () => {
  const { owner, viewer } = sessions;
  const row = (by) => ({
    tenant_id: tenantId,
    subject_type: "form",
    subject_id: kept.form,
    place: "Instagram",
    created_by: users[by],
  });
  assert.equal((await viewer.from("links").insert(row("viewer"))).error?.code, REFUSED);
  const elsewhere = await owner.from("links").insert({ ...row("owner"), subject_id: tenantId });
  assert.equal(elsewhere.error?.code, REFUSED, "a link lands only on what the workspace owns");
  const link = ok(await owner.from("links").insert(row("owner")).select("id, code").single(), "a link");
  assert.match(link.code, /^[a-hjkmnp-z2-9]{6}$/, "its code made by itself");
  kept.link = link;
  assert.equal((await owner.rpc("link_open", { p_code: link.code })).error?.code, REFUSED, "the door is the server's");

  const landed = ok(await db.rpc("link_open", { p_code: link.code }), "open");
  assert.deepEqual(
    [landed.subject_id, landed.state, landed.slug, landed.stopped, landed.tenant_id],
    [kept.form, "off", "colour", false, tenantId],
  );
  ok(await db.rpc("link_open", { p_code: link.code.toUpperCase() }), "open, typed in capitals");
  ok(await db.rpc("link_open", { p_code: link.code, p_count: false }), "a chat app's preview");
  const days = ok(await db.from("link_days").select("opens").eq("link_id", link.id));
  assert.deepEqual(days, [{ opens: 2 }], "two opens on one day, the preview not counted");
  assert.equal(ok(await db.rpc("link_open", { p_code: "zzzzzz" })), null, "a code nobody holds");

  ok(await owner.from("links").update({ stopped_at: new Date().toISOString() }).eq("id", link.id), "stopped");
  const stopped = ok(await db.rpc("link_open", { p_code: link.code }));
  assert.equal(stopped.stopped, true);
  assert.deepEqual(ok(await db.from("link_days").select("opens").eq("link_id", link.id)), [{ opens: 2 }]);
  ok(await owner.from("links").update({ stopped_at: null }).eq("id", link.id), "shared again");
});

test(
  "one write: a request with its person and its event; once by the page's id; closed, stale and refused without one",
  { skip },
  async () => {
    const { owner } = sessions;
    const closed = ok(await take("closed", { name: "Ana Ruiz", email: address("ana") }), "closed");
    assert.deepEqual([closed.outcome, closed.entry_id], ["closed", null], "a form that is off keeps nothing");
    assert.equal(ok(await owner.rpc("form_turn", { p_tenant_id: tenantId, p_form_id: kept.form, p_on: true })), true);
    const byMember = await owner.rpc("form_request_take", {
      p_tenant_id: tenantId,
      p_form_id: kept.form,
      p_version_id: kept.v2,
      p_ref: "a-members",
      p_answers: {},
      p_reach: {},
      p_words: hex("b"),
    });
    assert.equal(byMember.error?.code, REFUSED, "the door's write is the server's");

    const ana = ok(
      await take(
        "ana",
        { name: "Ana Ruiz", email: address("Ana") },
        {
          p_link_code: kept.link.code,
          p_source: { link: kept.link.code, page: "/b/harbor/colour" },
        },
      ),
      "take",
    );
    assert.deepEqual([ana.outcome, ana.person], ["accepted", "new"]);
    assert.match(ana.code, /^[A-HJ-NP-Z2-9]{6}$/);
    kept.ana = ana;
    const entry = await entryOf(ana.entry_id);
    assert.deepEqual(
      [entry.state, entry.form, entry.link_id, entry.owed, entry.test, entry.held_why, entry.contact_id],
      ["accepted", "request", kept.link.id, ["note", "notice"], false, null, ana.contact_id],
    );
    const person = ok(await db.from("contacts").select("email, acquired_via").eq("id", ana.contact_id).single());
    assert.deepEqual([person.email, person.acquired_via], [address("ana"), "form"], "the person came by a form");
    const events = await eventsOf(ana.entry_id);
    assert.deepEqual(
      events.map((e) => e.data),
      [{ form: "request", owed: ["note", "notice"], form_id: kept.form }],
      "its event, holding nothing of what was typed",
    );
    const form = ok(await db.from("forms").select("last_entry_at").eq("id", kept.form).single());
    assert.ok(form.last_entry_at, "the form says when it last took one");

    const again = ok(await take("ana", { name: "Ana Ruiz", email: address("ana") }), "again");
    assert.deepEqual([again.outcome, again.entry_id, again.code], ["again", ana.entry_id, ana.code]);
    const second = ok(await take("ana-2", { name: "Ana R", email: address("ana") }), "the same person again");
    assert.deepEqual([second.outcome, second.contact_id], ["accepted", ana.contact_id]);
    assert.notEqual(second.person, "new");
    kept.ana2 = second;

    const before = ok(await take("bea", { name: "Bea", email: address("bea") }, { p_version_id: kept.v1 }), "v1");
    assert.equal(before.outcome, "accepted", "the version before is taken for a day");
    kept.bea = before;
    await aged("form_versions", kept.v1, "replaced_at", 2);
    const stale = ok(await take("cy", { name: "Cy", email: address("cy") }, { p_version_id: kept.v1 }), "stale");
    assert.deepEqual([stale.outcome, stale.entry_id, stale.version_id], ["stale", null, kept.v2]);

    assert.equal((await take("  ", {}, { p_ref: " " })).error?.code, "22023", "no page id");
    assert.equal((await take("x", {}, { p_tenant_id: otherTenantId })).error?.code, "P0002", "another's form");

    const gone = address("gone");
    ok(
      await db.from("contacts").insert({
        tenant_id: tenantId,
        erased_at: new Date().toISOString(),
        erased_email_hash: await hashLegacyErasedEmail(tenantId, gone),
      }),
      "the forgotten",
    );
    const forgotten = ok(await take("gone", { name: "Gone", email: gone }), "forgotten");
    assert.deepEqual([forgotten.outcome, forgotten.entry_id], ["forgotten", null]);
    const none = ok(await db.from("form_entries").select("id").eq("ref", `gone-${RUN}`));
    assert.equal(none.length, 0, "nothing of a forgotten person is written");
    const heldGone = ok(await take("gone-held", { name: "Gone", email: gone }, { p_held_why: "too_fast" }), "held");
    const through = ok(
      await db.rpc("form_entry_let_through", { p_tenant_id: tenantId, p_entry_id: heldGone.entry_id }),
    );
    assert.equal(through.outcome, "forgotten");
    assert.equal(await entryOf(heldGone.entry_id), null, "let through, a forgotten person's entry goes instead");
  },
);

test(
  "a doubtful entry and a test have no person and no event; let through, one gets both; set aside, it tells nobody twice",
  { skip },
  async () => {
    const letThrough = (id) => db.rpc("form_entry_let_through", { p_tenant_id: tenantId, p_entry_id: id });
    const hold = (id) => db.rpc("form_entry_hold", { p_tenant_id: tenantId, p_entry_id: id });
    const held = ok(await take("dan", { name: "Dan", email: address("dan") }, { p_held_why: "too_fast" }), "held");
    assert.deepEqual([held.outcome, held.contact_id], ["held", null]);
    assert.equal((await eventsOf(held.entry_id)).length, 0);
    const nobody = ok(await db.from("contacts").select("id").eq("tenant_id", tenantId).eq("email", address("dan")));
    assert.equal(nobody.length, 0, "nobody is made for a held entry");
    const through = ok(await letThrough(held.entry_id), "let through");
    assert.equal(through.outcome, "accepted");
    assert.ok(through.contact_id);
    assert.equal((await eventsOf(held.entry_id)).length, 1, "its event is written then");
    assert.equal(ok(await letThrough(held.entry_id)).outcome, "gone", "let through once");
    kept.dan = { ...held, contact_id: through.contact_id };

    assert.equal(ok(await hold(kept.ana.entry_id)), true, "a member says it is not a real request");
    const aside = await entryOf(kept.ana.entry_id);
    assert.deepEqual([aside.state, aside.held_why, aside.contact_id], ["held", "member", kept.ana.contact_id]);
    assert.equal(ok(await hold(kept.ana.entry_id)), false, "held once");
    assert.equal(ok(await letThrough(kept.ana.entry_id)).outcome, "back");
    assert.equal((await eventsOf(kept.ana.entry_id)).length, 1, "brought back, it tells nobody twice");
    assert.equal((await entryOf(kept.ana.entry_id)).state, "accepted", "its note is still owed");

    const trial = ok(await take("test", { name: "Owner", email: address("owner") }, { p_test: true }), "a test");
    assert.deepEqual([trial.outcome, trial.contact_id], ["test", null]);
    assert.equal((await eventsOf(trial.entry_id)).length, 0);
    assert.equal(ok(await hold(trial.entry_id)), false, "a test is not held");
    kept.test = trial;

    const base = { tenant_id: tenantId, form: "request", answers: {}, words: hex("c"), owed: [] };
    const hosted = { ...base, form_id: kept.form, version_id: kept.v2, reach: {} };
    const refused = async (row) => (await db.from("form_entries").insert(row)).error?.code;
    assert.equal(await refused({ ...hosted, state: "held" }), "23514", "held says why");
    assert.equal(await refused({ ...hosted, state: "accepted" }), "23514", "no accepted entry without its person");
    assert.equal(
      await refused({ ...base, contact_id: kept.ana.contact_id, form_id: kept.form }),
      "23514",
      "a form's entry names the version its visitor saw",
    );
    assert.equal(
      await refused({ ...hosted, tenant_id: otherTenantId, state: "held", held_why: "too_fast" }),
      "23503",
      "an entry is of its own workspace's form",
    );
  },
);

test(
  "a request is open until a link answers it: a reply that left, a member's word, or their own message",
  { skip },
  async () => {
    const { owner, viewer } = sessions;
    const open = await openAs("owner");
    assert.deepEqual(
      open.map((r) => r.id).sort(),
      [kept.ana.entry_id, kept.ana2.entry_id, kept.bea.entry_id, kept.dan.entry_id].sort(),
      "the four requests, no test among them",
    );
    const first = open.find((r) => r.id === kept.ana.entry_id);
    assert.deepEqual(
      [first.place, first.reach.name, first.heading, first.unreached],
      ["Instagram", "Ana Ruiz", "Ask for a colour visit", false],
    );
    assert.deepEqual(await openAs("stranger"), [], "another workspace's member reads none of it");

    const thread = ok(
      await db
        .from("conversations")
        .insert({ tenant_id: tenantId, contact_id: kept.ana.contact_id })
        .select("id")
        .single(),
    );
    const message = ok(
      await db
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: thread.id,
          channel: "email",
          direction: "outbound",
          sender: "human",
          status: "queued",
          body: "Hello Ana",
        })
        .select("id")
        .single(),
    );
    const link = (as, row) =>
      as.from("form_entry_links").insert({ tenant_id: tenantId, created_by: users[row.by], ...row.link });
    const reply = { entry_id: kept.ana.entry_id, kind: "reply", message_id: message.id };
    ok(await link(owner, { by: "owner", link: reply }), "the reply's link");
    const theirs = { entry_id: kept.ana2.entry_id, kind: "conversation", conversation_id: thread.id };
    assert.equal((await link(owner, { by: "owner", link: theirs })).error?.code, REFUSED, "a door's kind");
    const bare = { entry_id: kept.ana2.entry_id, kind: "reply" };
    assert.equal((await link(owner, { by: "owner", link: bare })).error?.code, "23514", "a reply names its message");
    const has = async (id) => (await openAs("owner")).find((r) => r.id === id);
    assert.equal(await has(kept.ana.entry_id), undefined, "a reply on its way answers the request");
    ok(await db.from("messages").update({ status: "failed" }).eq("id", message.id), "the reply failed");
    assert.equal((await has(kept.ana.entry_id))?.unreached, true, "open again, and it says nothing reached them");

    const word = { entry_id: kept.ana2.entry_id, kind: "marked" };
    assert.equal((await link(viewer, { by: "viewer", link: word })).error?.code, REFUSED, "not a viewer's");
    ok(await link(owner, { by: "owner", link: word }), "a member's word");
    assert.equal((await link(owner, { by: "owner", link: word })).error?.code, "23505", "said once");
    assert.equal(await has(kept.ana2.entry_id), undefined);
    const undo = (kind) =>
      owner.from("form_entry_links").delete().eq("entry_id", kept.ana2.entry_id).eq("kind", kind).select("id");
    assert.equal(ok(await undo("marked")).length, 1, "the word taken back");
    const replyGone = await owner
      .from("form_entry_links")
      .delete()
      .eq("entry_id", kept.ana.entry_id)
      .eq("kind", "reply")
      .select("id");
    assert.equal(ok(replyGone).length, 0, "a reply's link is not a member's to remove");
    assert.ok(await has(kept.ana2.entry_id), "open again");
  },
);

test("a request's code carries it into a chat once, and never joins two people", { skip }, async () => {
  const phone = "+16465550123";
  const person = (code, number) => db.rpc("form_code_person", { p_tenant_id: tenantId, p_code: code, p_phone: number });
  const link = (code, thread, message = null) =>
    db.rpc("form_code_link", {
      p_tenant_id: tenantId,
      p_code: code,
      p_conversation_id: thread,
      p_message_id: message,
    });
  const threadOf = async (contactId) =>
    ok(
      await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contactId }).select("id").single(),
      "a conversation",
    ).id;
  assert.equal(ok(await person("ZZZZZZ", phone)), false, "a code nobody holds");
  assert.equal(ok(await person(kept.bea.code.toLowerCase(), phone)), true, "an address and no number");
  const bea = ok(await db.from("contacts").select("phone_e164, email").eq("id", kept.bea.contact_id).single());
  assert.deepEqual([bea.phone_e164, bea.email], [phone, address("bea")], "the number added, the address kept");
  const withIt = ok(await db.from("contacts").select("id").eq("tenant_id", tenantId).eq("phone_e164", phone));
  assert.equal(withIt.length, 1, "nobody made beside her");
  assert.equal(ok(await person(kept.bea.code, "+16465550124")), false, "someone with a number is left as they are");

  const thread = await threadOf(kept.bea.contact_id);
  const wrote = ok(
    await db
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: thread,
        channel: "whatsapp",
        direction: "inbound",
        sender: "customer",
        status: "received",
        body: `Hi (ref ${kept.bea.code})`,
      })
      .select("id")
      .single(),
  );
  const linked = ok(await link(kept.bea.code, thread, wrote.id), "linked");
  assert.deepEqual([linked.linked, linked.entry_id, linked.same_person], [true, kept.bea.entry_id, true]);
  assert.equal(ok(await link(kept.bea.code, thread)).linked, false, "good once");
  const open = await openAs("owner");
  assert.equal(
    open.find((r) => r.id === kept.bea.entry_id),
    undefined,
    "their own message answers the request",
  );

  const held = ok(await take("eve", { name: "Eve", phone: "+16465550144" }, { p_held_why: "hidden_field" }), "held");
  const eve = ok(
    await db.rpc("resolve_person", {
      p_tenant_id: tenantId,
      p_channel: "whatsapp",
      p_external: "16465550144",
      p_phone: "+16465550144",
      p_name: "Eve",
      p_assurance: "observed",
      p_source: "inbound",
    }),
    "the one who wrote",
  );
  const eveThread = await threadOf(eve.contact_id);
  assert.equal(ok(await link(held.code, eveThread)).linked, true);
  const now = await entryOf(held.entry_id);
  assert.deepEqual(
    [now.state, now.held_why, now.contact_id],
    ["accepted", null, eve.contact_id],
    "a held entry whose code arrives is let through as the one who wrote",
  );
  assert.equal((await eventsOf(held.entry_id)).length, 1, "and its event is written then");
  kept.eve = { ...held, contact_id: eve.contact_id };
  assert.equal(ok(await link(kept.test.code, eveThread)).linked, false, "a test's code links nothing");

  await aged("form_entries", kept.ana2.entry_id, "created_at", 31);
  assert.equal(ok(await link(kept.ana2.code, thread)).linked, false, "a code is good for 30 days");
  await aged("form_entries", kept.ana2.entry_id, "created_at", 0);
});

test(
  "what the forms brought: requests, conversations, the people who booked and opens, by the place each came through",
  { skip },
  async () => {
    const soon = (hours) => new Date(Date.now() + 2 * DAY_MS + hours * 3_600_000).toISOString();
    ok(
      await db.from("appointments").insert({
        tenant_id: tenantId,
        contact_id: kept.bea.contact_id,
        source: "person",
        status: "booked",
        starts_at: soon(0),
        ends_at: soon(1),
        timezone: "UTC",
      }),
      "a visit after the request",
    );
    const results = ok(await sessions.owner.rpc("form_results", { p_tenant_id: tenantId, p_days: 30 }), "results");
    const through = results.places.find((p) => p.link_id === kept.link.id);
    const direct = results.places.find((p) => p.link_id === null);
    assert.deepEqual(
      [through.requests, through.talked, through.people],
      [1, 0, 1],
      "through the link: one request, whose reply failed",
    );
    assert.deepEqual(
      [direct.requests, direct.talked, direct.booked, direct.helped, direct.people],
      [4, 2, 1, 0, 4],
      "with no link: four people's requests, two that became a conversation, one person who booked from it",
    );
    assert.equal(direct.visits, direct.booked, "the key from before 00732 says the same people");
    // The form's own totals (00732): each person once however many places they came through, and the bookings themselves.
    const own = results.forms.find((form) => form.form_id === direct.form_id);
    const places = results.places.filter((place) => place.form_id === direct.form_id);
    assert.deepEqual(
      [own.requests, own.booked, own.helped, own.appointments],
      [places.reduce((sum, place) => sum + place.requests, 0), 1, 0, 1],
      "the form's own line: every request, one person who booked, one booking",
    );
    assert.equal(results.window_days, 14, "and the window it counted by");
    assert.deepEqual(
      results.opens.map((o) => [o.link_id, Number(o.opens)]),
      [[kept.link.id, 2]],
    );
    const none = ok(await sessions.stranger.rpc("form_results", { p_tenant_id: tenantId, p_days: 30 }));
    assert.deepEqual([none.places, none.opens], [[], []], "another workspace's member reads no count");
  },
);

test(
  "a merge moves a person's requests, an erasure takes the held ones typed with their address, the purge what is old",
  { skip },
  async () => {
    // Ana has an address and no number, Eve a number and no address: two records an owner may combine.
    ok(
      await sessions.owner.rpc("merge_people", { p_keep: kept.ana.contact_id, p_merge: kept.eve.contact_id }),
      "combined",
    );
    assert.equal((await entryOf(kept.eve.entry_id)).contact_id, kept.ana.contact_id, "her request follows");

    const typed = { name: "Dan", email: address("DAN") };
    const held = ok(await take("dan-held", typed, { p_held_why: "too_many" }), "held");
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", kept.dan.contact_id));
    assert.equal(await entryOf(held.entry_id), null, "the held entry typed with his address went with him");
    assert.equal(await entryOf(kept.dan.entry_id), null, "and his own request (00675)");

    const old = ok(await take("old", { name: "Old", email: address("old") }, { p_held_why: "too_fast" }), "held");
    await aged("form_entries", old.entry_id, "created_at", 31);
    await aged("form_entries", kept.test.entry_id, "created_at", 8);
    const went = ok(await db.rpc("form_entries_purge"), "purge");
    assert.ok(went >= 2, "the held entry nobody let through, and the old test");
    assert.equal(await entryOf(old.entry_id), null);
    assert.equal(await entryOf(kept.test.entry_id), null);
    assert.ok(await entryOf(kept.ana.entry_id), "a request stays");
    assert.equal((await sessions.owner.rpc("form_entries_purge")).error?.code, REFUSED, "the clock's alone");
  },
);

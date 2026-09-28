/**
 * A no reaches the business's own domain (00220, Reach out Part 5 PR 2), on a real database. The doors a reply's
 * reading will call, before anything calls them:
 *   - one predicate for "suppressed" (lead_addresses_suppressed and its one-row form): a domain row holds every address
 *     at it, an email row that address alone, and the send door's facts, the audience and the set form agree;
 *   - the consent door's reply sources: a reply's no is recorded and closes the leads as an unsubscribe does, and its
 *     undo puts the answer back only while that reply is what holds it (never after an unsubscribe or a complaint);
 *   - D18: a reply's no counts beside an unsubscribe, until it is undone;
 *   - the dated-step door: a step for the team, once per source, the person's next step on People;
 *   - the converter: lead_convert_by, and the member's Interested through it (lead_link_contact still converts on its own);
 *   - every re-created body equals its source's but for the lines it meant to change, and the new doors are closed to
 *     a session.
 * The migration is applied twice by the replay (Task 2.5's eighth), not here. Local stack only: it makes workspaces,
 * people and leads, and reads the catalog through the CLI (SUPABASE_CLI names it), as privileges.db.test.mjs does.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { leadSuppressionHash } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, people and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
/** One statement through `supabase db query --local` (privileges.db.test.mjs's way), and its rows. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  // The CLI says "Connecting to local database..." on stderr and puts the database's own error on stdout.
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}
/** A migration's text, by its number. */
const migration = (n) => {
  const dir = path.join(ROOT, "supabase/migrations");
  return fs.readFileSync(
    path.join(
      dir,
      fs.readdirSync(dir).find((f) => f.startsWith(`${n}_`)),
    ),
    "utf8",
  );
};
/** A function's body as a migration writes it: from `as $$` after its header to the next `$$`, as pg_proc keeps it. */
const bodyIn = (src, header) => {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `no ${header.split("\n")[0]}`);
  const open = src.indexOf("as $$", at) + "as $$".length;
  return src.slice(open, src.indexOf("$$", open));
};

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let owner;
const users = [];
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;
const personOf = (email, tenant = A) =>
  one(db.from("contacts").insert({ tenant_id: tenant, email, display_name: "Fixture Office" }));
const lead = (over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureNever${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: `office-${stamp}-${n}@fixture-never.example`,
      email_state: "ok",
      stage: "ready",
      ...over,
    }),
  );
};
const leadRow = async (id) => ok(await db.from("leads").select("*").eq("id", id).single());
const eventsOf = async (subject, kind) =>
  ok(await db.from("events").select("data, created_at").eq("tenant_id", A).eq("subject_id", subject).eq("kind", kind));
const marketing = (contact, state, source, over = {}) =>
  db.rpc("set_email_marketing", {
    p_tenant_id: A,
    p_contact_id: contact,
    p_state: state,
    p_source: source,
    p_message_id: null,
    p_evidence: { channel: "email", via: source },
    ...over,
  });
const consentOf = async (contact) =>
  ok(await db.from("contacts").select("email_marketing, email_marketing_source").eq("id", contact).single());
/** A person's one thread (conversations are one per person). */
const threads = new Map();
/** An email that left from `host` to this person, in the shape the send path freezes (trimmed to what is read). */
const sentTo = async (contact, host) => {
  const id = crypto.randomUUID();
  const thread =
    threads.get(contact) ?? (await one(db.from("conversations").insert({ tenant_id: A, contact_id: contact })));
  threads.set(contact, thread);
  ok(
    await db.from("messages").insert({
      id,
      tenant_id: A,
      conversation_id: thread,
      contact_id: contact,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map.",
      status: "sent",
      meta: {
        email: {
          subject: "Hi",
          to: "office@fixture-never.example",
          request: { from: `"Sam" <sam@${host}>`, to: ["office@fixture-never.example"] },
        },
      },
    }),
  );
  return id;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `never-a-${stamp}`, name: "Harbor Moving Co" }));
  B = await one(db.from("tenants").insert({ slug: `never-b-${stamp}`, name: "Another" }));
  const email = `never-owner-${stamp}@fixture-never.example`;
  const password = `pw-${stamp}-owner-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  owner = { id: made.data.user.id, c };
});
after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test(
  "one predicate: a domain row holds every address at it and an email row one address, and the door's facts, the audience and the set form agree",
  { skip },
  async () => {
    const own = `own-${stamp}.example`;
    const other = `other-${stamp}.example`;
    const s = await one(
      db
        .from("lead_searches")
        .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
    );
    const ours = await lead({ email: `office@${own}` });
    const theirs = await lead({ email: `hello@${other}` });
    const placed = await lead({ email: `hello@placed-${stamp}.example` });
    const phoned = await lead({ email: `hello@phoned-${stamp}.example`, phone_e164: "+15125550188" });
    const placeOf = ok(await db.from("leads").select("place_id").eq("id", placed).single()).place_id;
    for (const l of [ours, theirs, placed, phoned])
      ok(
        await db.from("lead_search_members").insert({
          search_id: s,
          lead_id: l,
          tenant_id: A,
          class: "qualified",
          counted: true,
          counted_month: new Date().toISOString().slice(0, 7),
          fit: "look",
          judgment: { answer: "yes", reasons: [], shares: [] },
        }),
      );
    const audience = async () =>
      ok(
        await db.rpc("reach_out_audience", {
          p_tenant_id: A,
          p_search_id: s,
          p_limit: 50,
          p_include_unconfirmed: false,
        }),
      )
        .map((r) => r.lead_id)
        .sort();
    const person = await personOf(`someone-${stamp}@fixture-never.example`);
    const facts = async (to) =>
      ok(
        await db.rpc("outreach_facts", {
          p_tenant_id: A,
          p_contact_id: person,
          p_to: to,
          p_host: `send.${own}`,
          p_since: new Date(Date.now() - 86_400_000).toISOString(),
        }),
      ).suppressed;
    const set = async (addresses, tenant = A) =>
      ok(await db.rpc("lead_addresses_suppressed", { p_tenant_id: tenant, p_addresses: addresses })).sort();
    const asked = [`sam@${own}`, ` Office@${own.toUpperCase()} `, `hello@${other}`, own, "", `sam@mail.${own}`, "sam@"];

    // No row yet: every door answers as it did before 00220.
    assert.deepEqual(await audience(), [ours, theirs, placed, phoned].sort());
    // The place and the number keep their own arms of the never-again test.
    ok(
      await db.from("lead_suppressions").insert([
        { tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, placeOf), what: "customer" },
        { tenant_id: A, kind: "phone", hash: await leadSuppressionHash(A, "+15125550188"), what: "erased" },
      ]),
    );
    assert.deepEqual(await audience(), [ours, theirs].sort(), "a place's row and a number's row still hold");
    assert.deepEqual(await set(asked), []);
    assert.equal(await facts(`sam@${own}`), false);

    ok(
      await db
        .from("lead_suppressions")
        .insert({ tenant_id: A, kind: "domain", hash: await leadSuppressionHash(A, own), what: "said_no" }),
    );
    // A domain row for nothing never holds an address that ends at its "@".
    ok(
      await db
        .from("lead_suppressions")
        .insert({ tenant_id: A, kind: "domain", hash: await leadSuppressionHash(A, ""), what: "said_no" }),
    );
    assert.deepEqual(
      await set(asked),
      [`office@${own}`, `sam@${own}`],
      "every address at the domain, as stored; a bare domain, a blank, an empty domain and another host's are not",
    );
    assert.equal(ok(await db.rpc("lead_address_suppressed", { p_tenant_id: A, p_address: `Dana@${own}` })), true);
    assert.equal(ok(await db.rpc("lead_address_suppressed", { p_tenant_id: A, p_address: `dana@${other}` })), false);
    assert.deepEqual(await set([`sam@${own}`], B), [], "another workspace's list is its own");
    assert.equal(await facts(`sam@${own}`), true, "the send door's facts ask the same predicate");
    assert.equal(await facts(`hello@${other}`), false);
    assert.deepEqual(await audience(), [theirs], "and so does the audience");

    // An address's own row holds that address alone.
    ok(
      await db
        .from("lead_suppressions")
        .insert({ tenant_id: A, kind: "email", hash: await leadSuppressionHash(A, `hello@${other}`), what: "said_no" }),
    );
    assert.deepEqual(await set([`hello@${other}`, `dana@${other}`]), [`hello@${other}`]);
    assert.equal(await facts(`hello@${other}`), true);
    assert.equal(await facts(`dana@${other}`), false);
    assert.deepEqual(await audience(), []);
  },
);

test(
  "the consent door: a reply's no is recorded and closes the leads, and its undo puts the answer back only while that reply holds it",
  { skip },
  async () => {
    const p = await personOf(`reply-${stamp}@fixture-never.example`);
    const ready = await lead({ contact_id: p });
    const nurture = await lead({ contact_id: p, stage: "nurture" });
    const said = ok(await marketing(p, "opted_out", "reply", { p_message_id: "22222222-2222-4222-8222-222222222222" }));
    assert.deepEqual(said, { changed: true, found: true, business: "Harbor Moving Co" });
    assert.deepEqual(await consentOf(p), { email_marketing: "opted_out", email_marketing_source: "reply" });
    const no = (await eventsOf(p, "contact.consent_changed")).map((e) => e.data);
    assert.deepEqual(no, [
      {
        purpose: "email_marketing",
        consent: "opted_out",
        source: "reply",
        channel: "email",
        via: "reply",
        message_id: "22222222-2222-4222-8222-222222222222",
        previous: "unknown",
      },
    ]);
    for (const l of [ready, nurture]) {
      const row = await leadRow(l);
      assert.deepEqual([row.stage, row.closed_reason], ["archived", "said_no"]);
      assert.equal((await eventsOf(l, "lead.stage"))[0].data.source, "reply");
    }
    const hash = await leadSuppressionHash(A, `reply-${stamp}@fixture-never.example`);
    const listed = () =>
      db.from("lead_suppressions").select("what").eq("tenant_id", A).eq("kind", "email").eq("hash", hash);
    assert.deepEqual(ok(await listed()), [{ what: "said_no" }], "a reply's no is on the list as said no");

    // The way back names only an answer it can take back to, and only the one the no found.
    for (const state of ["opted_out", null])
      assert.equal((await marketing(p, state, "reply_undone")).error?.code, "22023", String(state));
    assert.deepEqual(
      ok(await marketing(p, "opted_in", "reply_undone")),
      { changed: false, found: true, business: "Harbor Moving Co", refused: "not_previous", previous: "unknown" },
      "an undo never gives a yes the person did not",
    );
    assert.deepEqual(await consentOf(p), { email_marketing: "opted_out", email_marketing_source: "reply" });

    const undone = ok(
      await marketing(p, "unknown", "reply_undone", { p_message_id: "22222222-2222-4222-8222-222222222222" }),
    );
    assert.deepEqual(undone, { changed: true, found: true, business: "Harbor Moving Co" });
    assert.deepEqual(await consentOf(p), { email_marketing: "unknown", email_marketing_source: "reply_undone" });
    const back = (await eventsOf(p, "contact.consent_changed"))
      .map((e) => e.data)
      .find((d) => d.source === "reply_undone");
    assert.deepEqual(back, {
      purpose: "email_marketing",
      consent: "unknown",
      source: "reply_undone",
      channel: "email",
      via: "reply_undone",
      message_id: "22222222-2222-4222-8222-222222222222",
    });
    assert.deepEqual(ok(await listed()), [{ what: "said_no" }], "the answer only: the list is the undo door's");
    assert.equal((await leadRow(ready)).stage, "archived", "and so are the leads");
    assert.deepEqual(
      ok(await marketing(p, "unknown", "reply_undone")),
      { changed: false, found: true, business: "Harbor Moving Co", refused: "moved" },
      "taken back once",
    );

    // A yes the person gave is the answer an undo goes back to, and only that.
    const yes = await personOf(`said-yes-${stamp}@fixture-never.example`);
    ok(await db.from("contacts").update({ email_marketing: "opted_in", email_marketing_source: "form" }).eq("id", yes));
    ok(await marketing(yes, "opted_out", "reply"));
    assert.equal((await eventsOf(yes, "contact.consent_changed"))[0].data.previous, "opted_in");
    assert.equal(ok(await marketing(yes, "unknown", "reply_undone")).refused, "not_previous");
    assert.equal(ok(await marketing(yes, "opted_in", "reply_undone")).changed, true);
    assert.deepEqual(await consentOf(yes), { email_marketing: "opted_in", email_marketing_source: "reply_undone" });

    // Never asked: nothing to take back.
    const never = await personOf(`never-asked-${stamp}@fixture-never.example`);
    assert.equal(ok(await marketing(never, "unknown", "reply_undone")).refused, "moved");
    assert.deepEqual(await consentOf(never), { email_marketing: "unknown", email_marketing_source: null });
  },
);

test(
  "an unsubscribe or a complaint after a reply's no makes the no theirs, and nothing takes it back",
  { skip },
  async () => {
    for (const source of ["unsubscribe", "complaint"]) {
      const p = await personOf(`then-${source}-${stamp}@fixture-never.example`);
      ok(await marketing(p, "opted_out", "reply"));
      const said = ok(await marketing(p, "opted_out", source));
      assert.equal(said.changed, true, `${source}: the source moved, and it is said`);
      assert.deepEqual(await consentOf(p), { email_marketing: "opted_out", email_marketing_source: source });
      assert.deepEqual(
        (await eventsOf(p, "contact.consent_changed")).map((e) => e.data.source).sort(),
        ["reply", source].sort(),
      );
      assert.equal(ok(await marketing(p, "unknown", "reply_undone")).refused, "moved", source);
      assert.deepEqual(await consentOf(p), { email_marketing: "opted_out", email_marketing_source: source });
      // Pressed again: nothing more is said.
      assert.equal(ok(await marketing(p, "opted_out", source)).changed, false);
    }
    // A reply's no after an unsubscribe or a complaint leaves theirs holding it.
    for (const source of ["unsubscribe", "complaint"]) {
      const p = await personOf(`first-${source}-${stamp}@fixture-never.example`);
      ok(await marketing(p, "opted_out", source));
      assert.equal(ok(await marketing(p, "opted_out", "reply")).changed, false);
      assert.deepEqual(await consentOf(p), { email_marketing: "opted_out", email_marketing_source: source });
      assert.equal(ok(await marketing(p, "unknown", "reply_undone")).refused, "moved", source);
      assert.deepEqual(await consentOf(p), { email_marketing: "opted_out", email_marketing_source: source });
    }
  },
);

test("D18: a reply's no counts beside an unsubscribe, and stops counting once it is undone", { skip }, async () => {
  const host = `send-${stamp}.example`;
  const p = await personOf(`d18-${stamp}@fixture-never.example`);
  const q = await personOf(`d18b-${stamp}@fixture-never.example`);
  const first = await sentTo(p, host);
  const second = await sentTo(q, host);
  await sentTo(q, host);
  const third = await sentTo(p, host);
  const unsubscribed = async () =>
    ok(await db.rpc("sending_domain_counts", { p_tenant_id: A, p_host: host, p_since: null })).unsubscribed;
  assert.equal(await unsubscribed(), 0);
  ok(await marketing(p, "opted_out", "reply", { p_message_id: first }));
  assert.equal(await unsubscribed(), 1, "the email the reply answered is counted");
  // An undo that names another email is not this no's.
  ok(
    await db.from("events").insert({
      tenant_id: A,
      kind: "contact.consent_changed",
      category: "contact",
      subject_type: "contact",
      subject_id: p,
      data: { purpose: "email_marketing", consent: "unknown", source: "reply_undone", message_id: second },
    }),
  );
  assert.equal(await unsubscribed(), 1, "a reply_undone naming another email leaves the reply counted");
  ok(await marketing(p, "unknown", "reply_undone", { p_message_id: first }));
  assert.equal(await unsubscribed(), 0, "a no undone was never a no");
  ok(await marketing(q, "opted_out", "unsubscribe", { p_message_id: second }));
  assert.equal(await unsubscribed(), 1, "an unsubscribe counts as before");
  ok(await marketing(p, "opted_out", "reply", { p_message_id: first }));
  assert.equal(await unsubscribed(), 2, "a no said again after its undo counts again");
  // One person counts once in the window, however many of its emails their noes name.
  ok(await marketing(p, "opted_out", "unsubscribe", { p_message_id: third }));
  assert.equal(await unsubscribed(), 2, "a reply's no and then an unsubscribe are one person");
});

test(
  "the dated-step door: a step for the team, once per source, the person's next step, and only the service role's",
  { skip },
  async () => {
    const p = await personOf(`step-${stamp}@fixture-never.example`);
    const src = crypto.randomUUID();
    const step = (over = {}) =>
      db.rpc("person_step_from_playbook", {
        p_tenant_id: A,
        p_contact_id: p,
        p_due_on: "2027-01-04",
        p_words: "Write to Fixture Movers again: they said not now.",
        p_source_id: src,
        ...over,
      });
    const made = ok(await step()).note;
    assert.deepEqual(
      [made.due_on, made.team_only, made.source, made.source_id, made.author_kind, made.state, made.for_user_id],
      ["2027-01-04", true, "reach_out", src, "receptionist", "kept", null],
    );
    assert.deepEqual(ok(await step({ p_words: "A second time." })), { error: "already" }, "once per source");
    const later = ok(await step({ p_source_id: crypto.randomUUID(), p_due_on: "2027-02-01", p_words: "Later." })).note;
    const noted = await eventsOf(p, "contact.noted");
    assert.equal(noted.length, 2);
    const first = noted.map((e) => e.data).find((d) => d.note_id === made.id);
    assert.deepEqual([first.by, first.source, first.due_on, first.team_only], [null, "reach_out", "2027-01-04", true]);
    const [row] = ok(await db.rpc("people_list", { p_tenant_id: A, p_contact_id: p }));
    assert.deepEqual([row.step_id, row.step_due_on], [made.id, "2027-01-04"], "the earliest open step is theirs next");
    assert.notEqual(row.step_id, later.id);

    assert.deepEqual(ok(await step({ p_source_id: null })), { error: "no_source" }, "a step is once per source");
    const fresh = () => crypto.randomUUID();
    const elsewhere = await personOf(`step-b-${stamp}@fixture-never.example`, B);
    assert.deepEqual(ok(await step({ p_contact_id: elsewhere, p_source_id: fresh() })), { error: "not_found" });
    assert.deepEqual(ok(await step({ p_tenant_id: B, p_source_id: fresh() })), { error: "not_found" });
    assert.deepEqual(ok(await step({ p_words: "  ", p_source_id: fresh() })), { error: "empty" });
    assert.deepEqual(ok(await step({ p_words: "x".repeat(601), p_source_id: fresh() })), { error: "too_long" });
    assert.deepEqual(ok(await step({ p_due_on: null, p_source_id: fresh() })), { error: "no_day" });
    assert.deepEqual(ok(await step({ p_for_user_id: crypto.randomUUID(), p_source_id: fresh() })), {
      error: "not_a_member",
    });
    const denied = await owner.c.rpc("person_step_from_playbook", {
      p_tenant_id: A,
      p_contact_id: p,
      p_due_on: "2027-01-04",
      p_words: "From a session.",
    });
    assert.equal(denied.error?.code, "42501", "a session may not call the service role's door");
  },
);

test(
  "the converter: lead_convert_by converts a lead still being written to, and any lead only when asked",
  { skip },
  async () => {
    const convert = (leadId, how, anyStage = false, tenant = A) =>
      query(
        `select public.lead_convert_by('${tenant}'::uuid, '${leadId}'::uuid, '${how}', '{"message_id": "m-1"}'::jsonb, ${anyStage}) as r`,
      )[0].r;
    const ready = await lead();
    const nurture = await lead({ stage: "nurture", contacted_at: "2026-09-01T12:00:00Z" });
    const closed = await lead({ stage: "archived", closed_reason: "said_no" });
    const talking = await lead({ stage: "converted", converted_at: "2026-09-02T12:00:00Z" });

    assert.deepEqual(convert(ready, "reply"), { moved: true, version: 2 });
    const r = await leadRow(ready);
    assert.deepEqual([r.stage, r.closed_reason, r.version], ["converted", null, 2]);
    assert.ok(r.converted_at && r.contacted_at);
    assert.deepEqual(
      (await eventsOf(ready, "lead.converted")).map((e) => e.data),
      [{ message_id: "m-1", how: "reply" }],
    );
    assert.deepEqual(convert(nurture, "booking"), { moved: true, version: 2 });
    assert.equal((await leadRow(nurture)).contacted_at, "2026-09-01T12:00:00+00:00", "contacted when it was");

    assert.deepEqual(convert(closed, "deal"), { moved: false, version: 1 }, "a closed lead stays closed");
    assert.deepEqual(convert(talking, "reply"), { moved: false, version: 1 }, "a converted one is not converted twice");
    assert.deepEqual(await eventsOf(talking, "lead.converted"), []);
    assert.deepEqual(convert(ready, "reply", false, B), { moved: false, version: null }, "only the workspace's own");
    assert.deepEqual(convert(closed, "deal", true), { moved: true, version: 2 }, "any stage, when asked");
    assert.equal((await leadRow(talking)).converted_at, "2026-09-02T12:00:00+00:00");
    assert.throws(() => convert(nurture, "click"), /how must be call, reply, booking or deal/);

    const denied = await db.rpc("lead_convert_by", { p_tenant_id: A, p_lead_id: ready, p_how: "reply" });
    assert.ok(denied.error, "only definer doors call it: the service role holds no EXECUTE");
  },
);

test(
  "the member's Interested converts through lead_convert_by: one lead.converted, how call, the version moved once",
  { skip },
  async () => {
    const setStage = (l, args) => owner.c.rpc("lead_set_stage", { p_lead_id: l, ...args });
    const l = await lead({ email: `hello-${stamp}@fixture-never-interested.example` });
    const a = ok(await setStage(l, { p_outcome: "interested", p_note: "Wants a call Tuesday" }));
    assert.deepEqual(
      [a.stage, a.converted, a.existed, a.version, a.closed_reason],
      ["converted", true, false, 2, null],
    );
    const row = await leadRow(l);
    assert.deepEqual([row.stage, row.version, row.contact_id], ["converted", 2, a.contact_id]);
    assert.ok(row.converted_at && row.contacted_at);
    assert.deepEqual(
      (await eventsOf(l, "lead.converted")).map((e) => e.data),
      [{ contact_id: a.contact_id, existed: false, by: owner.id, how: "call" }],
    );
    const op = ok(await db.from("lead_operations").select("version, after").eq("id", a.op_id).single());
    assert.deepEqual([op.version, op.after.stage, op.after.converted], [2, "converted", true]);
    // A person made is never unmade from a toast, as before: the door answers "person", not "changed".
    assert.deepEqual(ok(await owner.c.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version })), {
      error: "person",
    });

    // A click to Talking converts nothing; Interested after it converts the lead into its person, as 00142 did.
    const clicked = await lead({ email: `clicked-${stamp}@fixture-never-interested.example` });
    const c1 = ok(await setStage(clicked, { p_stage: "converted" }));
    assert.deepEqual([c1.converted, c1.contact_id, c1.version], [false, null, 2]);
    assert.equal((await leadRow(clicked)).converted_at, null);
    assert.deepEqual(await eventsOf(clicked, "lead.converted"), []);
    const c2 = ok(await setStage(clicked, { p_outcome: "interested" }));
    assert.deepEqual([c2.converted, c2.version, c2.stage], [true, 3, "converted"]);
    assert.ok((await leadRow(clicked)).converted_at);
    assert.equal((await eventsOf(clicked, "lead.converted")).length, 1);
    // And the click still undoes, at the version the page saw: the version test holds.
    const c3 = ok(await setStage(clicked, { p_stage: "nurture" }));
    assert.deepEqual(ok(await owner.c.rpc("lead_undo", { p_op_id: c3.op_id, p_version: c3.version })).ok, true);
    assert.equal((await leadRow(clicked)).stage, "converted");

    // A closed lead converts by hand, as it did.
    const closed = await lead({ stage: "archived", closed_reason: "not_a_fit" });
    const c4 = ok(await setStage(closed, { p_outcome: "interested" }));
    assert.deepEqual([c4.stage, c4.closed_reason, c4.converted], ["converted", null, true]);
  },
);

/** What each function re-created whole changes, as [its source's lines, its lines now]; everything else is the same. */
const CHANGES = {
  outreach_lead_facts: [
    [
      [
        "    'suppressed', exists (",
        "      select 1 from public.lead_suppressions s",
        "       where s.tenant_id = p_tenant_id and s.kind = 'email'",
        "         and s.hash = public.lead_suppression_hash(p_tenant_id, lower(btrim(p_to)))),",
      ],
      ["    'suppressed', public.lead_address_suppressed(p_tenant_id, p_to),"],
    ],
  ],
  reach_out_audience: [
    [
      [
        "     -- Never the never-again list: the address (an opt-out, a customer, an erasure), and the place or the number",
        "     -- (a customer's or an erased person's, 00140: a number carries no opt-out of its own), so a business erased or",
        "     -- already a customer is not found again under a new address.",
      ],
      [
        "     -- Never the never-again list: the address (an opt-out, a customer, an erasure, a no, or its business's domain:",
        "     -- the one predicate), and the place or the number (a customer's or an erased person's, 00140: a number carries no",
        "     -- opt-out of its own), so a business erased or already a customer is not found again under a new address.",
        "     and not public.lead_address_suppressed(l.tenant_id, lower(btrim(l.email)))",
      ],
    ],
    [
      [
        "                       (x.kind = 'email' and x.hash = public.lead_suppression_hash(l.tenant_id, lower(btrim(l.email))))",
        "                    or (x.kind = 'place' and l.place_id is not null",
      ],
      ["                       (x.kind = 'place' and l.place_id is not null"],
    ],
  ],
  set_email_marketing: [
    [["  v_lead     record;"], ["  v_lead     record;", "  v_previous text;"]],
    [
      [
        "  -- The two noes a door can be trusted with: an unsubscribe link pressed, and a complaint the mail provider",
        '  -- reported (00177). "No thanks" in a reply (Part 5) and a member\'s own reset widen this door when they arrive.',
        "  if p_state is distinct from 'opted_out' or p_source is null or p_source not in ('unsubscribe', 'complaint') then",
        "    raise exception 'set_email_marketing records a no: opted_out, from unsubscribe or complaint' using errcode = '22023';",
      ],
      [
        "  -- The noes a door can be trusted with: an unsubscribe link pressed, a complaint the mail provider reported (00177),",
        "  -- and a reply read as no (00220). And one way back, a reply's no undone, to the answer it found.",
        "  if p_source = 'reply_undone' then",
        "    if p_state is null or p_state not in ('unknown', 'opted_in') then",
        "      raise exception 'set_email_marketing takes a reply''s no back to unknown or opted_in' using errcode = '22023';",
        "    end if;",
        "  elsif p_state is distinct from 'opted_out' or p_source is null or p_source not in ('unsubscribe', 'complaint', 'reply') then",
        "    raise exception 'set_email_marketing records a no: opted_out, from unsubscribe, complaint or reply' using errcode = '22023';",
      ],
    ],
    [
      ["  if v_contact.email_marketing is distinct from 'opted_out' then"],
      [
        "  -- A reply's no taken back: the answer only, and only while a reply's no is what holds it. Whether another reply's",
        "  -- no of theirs still stands, the suppressions and the leads are the undo door's, which holds the readings (00221).",
        "  if p_source = 'reply_undone' then",
        "    if v_contact.email_marketing is distinct from 'opted_out' or v_contact.email_marketing_source is distinct from 'reply' then",
        "      return jsonb_build_object('changed', false, 'found', true, 'business', v_business, 'refused', 'moved');",
        "    end if;",
        "    -- Back to exactly the answer the no found (its event's `previous`), never to one the person did not give.",
        "    select coalesce(e.data->>'previous', 'unknown') into v_previous",
        "      from public.events e",
        "     where e.tenant_id = p_tenant_id and e.kind = 'contact.consent_changed' and e.subject_id = p_contact_id",
        "       and e.data->>'purpose' = 'email_marketing' and e.data->>'source' = 'reply' and e.data->>'consent' = 'opted_out'",
        "     order by e.created_at desc",
        "     limit 1;",
        "    v_previous := coalesce(v_previous, 'unknown');",
        "    if p_state is distinct from v_previous then",
        "      return jsonb_build_object('changed', false, 'found', true, 'business', v_business, 'refused', 'not_previous',",
        "                                'previous', v_previous);",
        "    end if;",
        "    update public.contacts",
        "       set email_marketing = p_state, email_marketing_source = p_source, email_marketing_updated_at = now()",
        "     where id = p_contact_id and tenant_id = p_tenant_id;",
        "    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)",
        "    values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,",
        "            coalesce(p_evidence, '{}'::jsonb)",
        "            || jsonb_build_object('purpose', 'email_marketing', 'consent', p_state, 'source', p_source)",
        "            || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end);",
        "    return jsonb_build_object('changed', true, 'found', true, 'business', v_business);",
        "  end if;",
        "",
        "  -- The no is recorded once. A reply's no that an unsubscribe or a complaint follows becomes theirs: the source moves,",
        "  -- so nothing can take it back (the undo asks for source 'reply').",
        "  if v_contact.email_marketing is distinct from 'opted_out'",
        "     or (v_contact.email_marketing_source = 'reply' and p_source in ('unsubscribe', 'complaint')) then",
      ],
    ],
    [
      [
        "            || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end);",
      ],
      [
        "            || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end",
        "            -- A reply's no keeps the answer it found, the one its undo may go back to.",
        "            || case when p_source = 'reply' then jsonb_build_object('previous', v_contact.email_marketing) else '{}'::jsonb end);",
      ],
    ],
    [
      ["    values (p_tenant_id, 'email', public.lead_suppression_hash(p_tenant_id, v_address), 'email_opt_out')"],
      [
        "    values (p_tenant_id, 'email', public.lead_suppression_hash(p_tenant_id, v_address),",
        "            case when p_source = 'reply' then 'said_no' else 'email_opt_out' end)",
      ],
    ],
  ],
  sending_domain_counts: [
    [
      ["    -- workspace's events by kind and time), never before the ninety days the emails are read over."],
      [
        "    -- workspace's events by kind and time), never before the ninety days the emails are read over.",
        "    -- A person counts once, however many of the window's emails their noes name (a reply's no and then an",
        "    -- unsubscribe are two events).",
      ],
    ],
    [
      [
        "      select count(*) from recent r",
        "       where exists (",
        "         select 1 from public.events e",
        "          where e.tenant_id = p_tenant_id and e.kind = 'contact.consent_changed'",
        "            and e.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '90 days')",
        "            and e.data->>'purpose' = 'email_marketing' and e.data->>'source' = 'unsubscribe'",
        "            and e.data->>'message_id' = r.id::text)))",
      ],
      [
        "      select count(distinct e.subject_id) from recent r",
        "        join public.events e",
        "          on e.tenant_id = p_tenant_id and e.kind = 'contact.consent_changed'",
        "         and e.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '90 days')",
        "         and e.data->>'purpose' = 'email_marketing' and e.data->>'source' in ('unsubscribe', 'reply')",
        "         and e.data->>'message_id' = r.id::text",
        "         and not (e.data->>'source' = 'reply' and exists (",
        "           select 1 from public.events u",
        "            where u.tenant_id = p_tenant_id and u.kind = 'contact.consent_changed'",
        "              and u.created_at >= e.created_at and u.subject_id = e.subject_id",
        "              and u.data->>'purpose' = 'email_marketing' and u.data->>'source' = 'reply_undone'",
        "              and u.data->>'message_id' = e.data->>'message_id'))))",
      ],
    ],
  ],
  lead_set_stage: [
    [
      ["  -- worked, and a stage that was not named is kept (wrong_number)."],
      [
        "  -- worked, and a stage that was not named is kept (wrong_number). A conversion",
        "  -- is lead_convert_by's (its stage, closed reason, days and version), below.",
      ],
    ],
    [
      [
        "     set stage         = coalesce(v_stage, stage),",
        "         closed_reason = case when v_stage = 'archived' then p_reason",
      ],
      [
        "     set stage         = case when v_convert then stage else coalesce(v_stage, stage) end,",
        "         closed_reason = case when v_convert then closed_reason",
        "                              when v_stage = 'archived' then p_reason",
      ],
    ],
    [
      [
        "         converted_at  = case when v_convert then coalesce(converted_at, now()) else converted_at end,",
        "         contacted_at  = case when coalesce(v_stage, '') in ('nurture', 'converted') then coalesce(contacted_at, now()) else contacted_at end,",
      ],
      [
        "         contacted_at  = case when not v_convert and coalesce(v_stage, '') in ('nurture', 'converted') then coalesce(contacted_at, now()) else contacted_at end,",
      ],
    ],
    [
      ["         version       = version + 1"],
      ["         version       = case when v_convert then version else version + 1 end"],
    ],
    [
      [
        "    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)",
        "    values (v_lead.tenant_id, 'lead.converted', 'lead', 'lead', p_lead_id,",
        "            jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'how', 'call', 'by', v_user));",
      ],
      [
        "    -- Erased or blanked since it was read above: nothing converts, and the door says so rather than claim it.",
        "    if not coalesce((public.lead_convert_by(v_lead.tenant_id, p_lead_id, 'call',",
        "                       jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'by', v_user), true)->>'moved')::boolean, false) then",
        "      raise exception 'This lead is gone.' using errcode = 'P0002';",
        "    end if;",
        "    select * into v_lead from public.leads where id = p_lead_id;",
      ],
    ],
  ],
};
const SOURCES = {
  outreach_lead_facts: ["00211", "create or replace function public.outreach_lead_facts("],
  reach_out_audience: [
    "00197",
    "create or replace function public.reach_out_audience(\n  p_tenant_id uuid,\n  p_search_id uuid,\n  p_limit int,",
    "public.reach_out_audience(uuid, uuid, int, boolean)",
  ],
  set_email_marketing: ["00177", "create or replace function public.set_email_marketing("],
  sending_domain_counts: ["00188", "create or replace function public.sending_domain_counts("],
  lead_set_stage: ["00142", "create or replace function public.lead_set_stage("],
};

/** The migration that re-creates a function after 00220, whose own suite holds it to 00220's body. */
const LATER = { outreach_lead_facts: "00226" };

test("every function re-created whole is its source's body but for the lines it meant to change", { skip }, () => {
  const now = migration("00220");
  for (const [name, [from, header, signature]] of Object.entries(SOURCES)) {
    const source = bodyIn(migration(from), header);
    // Each change is found in the source as it was (once), and the changes are made in the order they stand.
    const at = CHANGES[name].map(([was, is]) => {
      const block = was.join("\n");
      assert.equal(source.split(block).length, 2, `${name}: its source says this once:\n${block}`);
      return { from: source.indexOf(block), to: source.indexOf(block) + block.length, is: is.join("\n") };
    });
    let want = "";
    let cut = 0;
    for (const c of at.sort((x, y) => x.from - y.from)) {
      want += source.slice(cut, c.from) + c.is;
      cut = c.to;
    }
    want += source.slice(cut);
    assert.equal(bodyIn(now, header), want, `${name}: 00220 writes its source's body with these changes only`);
    const [live] = query(
      signature
        ? `select prosrc from pg_proc where oid = '${signature}'::regprocedure`
        : `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}'`,
    );
    // A later migration that re-creates it whole runs now, and proves itself against this body (00226's suite).
    const later = LATER[name];
    assert.equal(live.prosrc, later ? bodyIn(migration(later), header) : want, `${name}: the database runs it`);
  }
});

test("every function re-created whole keeps its source's volatility, rights, search path and grants", { skip }, () => {
  // As main's replay has them before 00220: grantees beside the owner.
  const want = {
    "lead_set_stage(uuid,text,text,text,text,text)": [
      "v",
      true,
      ["search_path=public"],
      ["authenticated", "service_role"],
    ],
    "outreach_lead_facts(uuid,uuid,text,uuid)": ["s", true, ["search_path=public"], ["service_role"]],
    "reach_out_audience(uuid,uuid,integer,boolean)": ["s", true, ["search_path=public"], ["service_role"]],
    "sending_domain_counts(uuid,text,timestamp with time zone)": ["s", true, ["search_path=public"], ["service_role"]],
    "set_email_marketing(uuid,uuid,text,text,uuid,jsonb)": ["v", true, ["search_path=public"], ["service_role"]],
  };
  const rows = query(`select p.oid::regprocedure::text as fn, p.provolatile as vol, p.prosecdef as definer,
      p.proconfig as config,
      (select coalesce(array_agg(g.grantee::regrole::text order by g.grantee::regrole::text), '{}')
         from aclexplode(p.proacl) g where g.grantee <> p.proowner) as grantees
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid in ('public.lead_set_stage(uuid,text,text,text,text,text)'::regprocedure,
                   'public.outreach_lead_facts(uuid,uuid,text,uuid)'::regprocedure,
                   'public.reach_out_audience(uuid,uuid,integer,boolean)'::regprocedure,
                   'public.sending_domain_counts(uuid,text,timestamptz)'::regprocedure,
                   'public.set_email_marketing(uuid,uuid,text,text,uuid,jsonb)'::regprocedure)`);
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.fn, [r.vol, r.definer, r.config, r.grantees]])), want);
});

test("the new doors are closed to a session, and the converter to everyone", { skip }, () => {
  const rows = query(`select f as fn,
      has_function_privilege('anon', f, 'execute') as anon,
      has_function_privilege('authenticated', f, 'execute') as member,
      has_function_privilege('service_role', f, 'execute') as service,
      (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) as definer
    from unnest(array[
      'public.lead_addresses_suppressed(uuid, text[])',
      'public.lead_address_suppressed(uuid, text)',
      'public.person_step_from_playbook(uuid, uuid, date, text, uuid, uuid)',
      'public.lead_convert_by(uuid, uuid, text, jsonb, boolean)'
    ]) as f`);
  assert.deepEqual(rows.map((r) => [r.fn.replace(/\(.*/, ""), r.anon, r.member, r.service, r.definer]).sort(), [
    ["public.lead_address_suppressed", false, false, true, true],
    ["public.lead_addresses_suppressed", false, false, true, true],
    ["public.lead_convert_by", false, false, false, true],
    ["public.person_step_from_playbook", false, false, true, true],
  ]);
});

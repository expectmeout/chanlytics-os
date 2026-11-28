/**
 * 00726 on a real database (the whole-system plan of 28 Nov 2026, lane 3): a site's entry whose id its form had with
 * other words is the same entry for good, by the id it was sent with and its words (the outside review's four rows); an
 * entry past the door's limit is kept held with no person and no event, and a member lets it through; a member's "Not a
 * real request" holds a site's request too; the open requests read on from where the list ended, to every one counted;
 * where a named entry stands is read from its links (answered and how, sending, open, aged); and a reply that cannot be
 * tied to its request is not written at all (00713's trigger).
 *
 * The same statements are proved on the engine before the push (dev-tools/db-without-docker
 * example-doors-forms-requests.mjs). Skipped without a local database; never production.
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
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
let db;
let tenantId;
let otherId;
let ownerId;
let studio;
let popUp;
const made = [];

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
let digest = 0;
const hex = () => (digest += 1).toString(16).padStart(64, "0");
const phoneOf = (n) => `+1646555${String(3000 + n).slice(-4)}`;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/** The door's one write, as the edge calls it (packages/db takeFormEntry): a request from visitor `n` unless said. */
const take = (over = {}) => {
  const n = over.n ?? 1;
  return db.rpc("form_entry_take", {
    p_tenant_id: over.tenant ?? tenantId,
    p_form: "request",
    p_answers: { form: "request", phone: phoneOf(n), email: `v${n}-${RUN}@example.com`, about: `Ask ${n}` },
    p_person: { phone: phoneOf(n), email: `v${n}-${RUN}@example.com`, name: `Visitor ${n}`, detail: {} },
    p_words: over.p_words ?? hex(),
    p_owed: ["note", "notice"],
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k.startsWith("p_"))),
  });
};
const entryOf = async (id) => ok(await db.from("form_entries").select("*").eq("id", id).maybeSingle(), "the entry");
const open = async (args = {}) => ok(await db.rpc("form_requests_open", { p_tenant_id: tenantId, ...args }), "open");
const count = async () => ok(await db.rpc("form_requests_open_count", { p_tenant_id: tenantId }), "count");
const eventsOf = async (kind, subject) =>
  ok(await db.from("events").select("data").eq("tenant_id", tenantId).eq("kind", kind).eq("subject_id", subject));
const entryCount = async () =>
  (await db.from("form_entries").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)).count;
/** A conversation with the entry's person, and a reply in it with the status named, linked as what answered the entry. */
const conversationOf = async (contactId) =>
  ok(await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contactId }).select("id").single()).id;
const reply = async (entryId, conversationId, status) => {
  const row = { tenant_id: tenantId, conversation_id: conversationId, channel: "email", direction: "outbound" };
  const message = ok(
    await db
      .from("messages")
      .insert({ ...row, sender: "human", status })
      .select("id")
      .single(),
    "a reply",
  );
  ok(
    await db
      .from("form_entry_links")
      .insert({ tenant_id: tenantId, entry_id: entryId, kind: "reply", message_id: message.id }),
    "its link",
  );
  return message.id;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  [tenantId, otherId] = await Promise.all(
    ["for-good", "for-good-other"].map(
      async (slug) =>
        ok(
          await db
            .from("tenants")
            .insert({ slug: `${slug}-${RUN}`, name: "Harbor" })
            .select("id")
            .single(),
        ).id,
    ),
  );
  for (const [role, who, tenant] of [
    ["owner", "owner", tenantId],
    ["viewer", "viewer", tenantId],
    ["owner", "stranger", otherId],
  ]) {
    const email = `${who}-${RUN}@example.com`;
    const user = ok(
      await db.auth.admin.createUser({ email, password: `pw-${RUN}-Aa1!`, email_confirm: true }),
      who,
    ).user;
    made.push(user.id);
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: user.id, role }), `${who}'s seat`);
    if (who === "owner") ownerId = user.id;
  }
  const owner = await signedIn("owner");
  studio = ok(await owner.rpc("form_key_make", { p_tenant_id: tenantId, p_name: "Studio", p_hash: hex() }));
  popUp = ok(await owner.rpc("form_key_make", { p_tenant_id: tenantId, p_name: "Pop-up", p_hash: hex() }));
});

after(async () => {
  if (skip || !tenantId) return;
  for (const t of [tenantId, otherId]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of made) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/** A session of a member of the workspace, or of the stranger's. */
async function signedIn(who) {
  const as = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await as.auth.signInWithPassword({ email: `${who}-${RUN}@example.com`, password: `pw-${RUN}-Aa1!` }), who);
  return as;
}

test(
  "the same id with other words, sent again later, is still the same entry (the review's four rows)",
  { skip },
  async () => {
    const [wordsA, wordsB] = [hex(), hex()];
    const nine = ok(await take({ p_key_id: studio, p_ref: "123", p_words: wordsA }));
    assert.deepEqual([nine.outcome, nine.clash], ["accepted", false], "9:00 id 123 words A: kept");
    const nineOne = ok(await take({ p_key_id: studio, p_ref: "123", p_words: wordsB }));
    assert.deepEqual(
      [nineOne.outcome, nineOne.clash],
      ["accepted", true],
      "9:01 id 123 words B: kept, said as a clash",
    );
    assert.notEqual(nineOne.entry_id, nine.entry_id, "a new entry, never merged");
    const kept = await entryOf(nineOne.entry_id);
    assert.deepEqual([kept.ref, kept.sent_ref], [null, "123"], "its id as sent in a column of its own");
    const nineFive = ok(await take({ p_key_id: studio, p_ref: "123", p_words: wordsB }));
    assert.deepEqual([nineFive.outcome, nineFive.entry_id], ["again", nineOne.entry_id], "9:05 the same: again");

    // Half an hour on: both are older than the ten minutes a retry with no id is told by.
    for (const id of [nine.entry_id, nineOne.entry_id])
      ok(
        await db
          .from("form_entries")
          .update({ created_at: ago(30 * MIN_MS) })
          .eq("id", id),
      );
    const before = await entryCount();
    const nineThirty = ok(await take({ p_key_id: studio, p_ref: "123", p_words: wordsB }));
    assert.deepEqual(
      [nineThirty.outcome, nineThirty.entry_id],
      ["again", nineOne.entry_id],
      "REGRESSION: 9:30 the same was a third entry, once its id had been emptied",
    );
    assert.equal(await entryCount(), before, "and nothing was written");
    const first = ok(await take({ p_key_id: studio, p_ref: "123", p_words: wordsA }));
    assert.deepEqual([first.outcome, first.entry_id], ["again", nine.entry_id], "the first is still the first");

    const elsewhere = ok(await take({ p_key_id: popUp, p_ref: "123", p_words: wordsB }));
    assert.deepEqual(
      [elsewhere.outcome, elsewhere.clash],
      ["accepted", false],
      "never one id across a workspace: another site's 123 is its own entry",
    );
    const otherForm = ok(await take({ p_key_id: studio, p_ref: "123", p_words: wordsB, p_form_ref: "colour" }));
    assert.deepEqual([otherForm.outcome, otherForm.clash], ["accepted", false], "nor across one site's forms");

    // Two posts at one moment with the id the form already has, and the same new words: one entry.
    const wordsC = hex();
    const twins = await Promise.all([
      take({ p_key_id: studio, p_ref: "123", p_words: wordsC }),
      take({ p_key_id: studio, p_ref: "123", p_words: wordsC }),
    ]);
    assert.deepEqual(twins.map((r) => ok(r).outcome).sort(), ["accepted", "again"], "one kept, one the same again");
    assert.equal(ok(twins[0]).entry_id, ok(twins[1]).entry_id);
  },
);

test(
  "an entry past the door's limit is held: no person, no event, no stamp; a member lets it through",
  { skip },
  async () => {
    const people = async () =>
      (await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)).count;
    const before = await people();
    const words = hex();
    const flood = { p_key_id: popUp, p_ref: "f-1", p_form_ref: "flood", p_words: words, n: 40 };
    const held = ok(await take({ ...flood, p_held_why: "too_many" }));
    assert.deepEqual([held.outcome, held.contact_id], ["held", null]);
    const row = await entryOf(held.entry_id);
    assert.deepEqual([row.state, row.held_why, row.contact_id], ["held", "too_many", null]);
    assert.deepEqual(
      row.reach,
      { name: "Visitor 40", email: `v40-${RUN}@example.com`, phone: phoneOf(40) },
      "who it is about, as typed",
    );
    assert.deepEqual(row.owed, ["note", "notice"], "what the door said it owes, for when it is let through");
    assert.equal(await people(), before, "no person is made");
    assert.equal((await eventsOf("form_entry.accepted", held.entry_id)).length, 0, "no event: nothing it owes starts");
    const form = ok(await db.from("outside_forms").select("*").eq("id", row.outside_form_id).single());
    assert.deepEqual([form.first_entry_at, form.last_entry_at], [null, null], "its form is not stamped");
    assert.equal(
      (await open()).some((line) => line.id === held.entry_id),
      false,
      "and it is no open request",
    );

    const again = ok(await take({ ...flood, p_held_why: "too_many" }));
    assert.deepEqual([again.outcome, again.entry_id], ["held", held.entry_id], "sent again: the same held entry");
    const later = ok(await take(flood));
    assert.deepEqual([later.outcome, later.entry_id], ["held", held.entry_id], "and still held once the flood passed");
    const refused = await take({ p_key_id: popUp, p_held_why: "member" });
    assert.equal(refused.error?.code, "22023", "the door holds for one reason alone");

    const viewer = await signedIn("viewer");
    const stranger = await signedIn("stranger");
    for (const as of [viewer, stranger]) {
      const no = await as.rpc("form_entry_let_through", { p_tenant_id: tenantId, p_entry_id: held.entry_id });
      assert.equal(no.error?.code, "42501", "only a member who acts lets it through");
    }
    const owner = await signedIn("owner");
    const through = ok(await owner.rpc("form_entry_let_through", { p_tenant_id: tenantId, p_entry_id: held.entry_id }));
    assert.equal(through.outcome, "accepted");
    const after = await entryOf(held.entry_id);
    assert.deepEqual([after.state, after.held_why, after.contact_id], ["accepted", null, through.contact_id]);
    const who = ok(await db.from("contacts").select("email, phone_e164").eq("id", through.contact_id).single());
    assert.deepEqual(
      who,
      { email: `v40-${RUN}@example.com`, phone_e164: phoneOf(40) },
      "its person, from what was typed",
    );
    const told = await eventsOf("form_entry.accepted", held.entry_id);
    assert.deepEqual(
      told.map((event) => event.data),
      [{ form: "request", owed: ["note", "notice"] }],
      "its event written then, as the door's own",
    );
    const stamped = ok(await db.from("outside_forms").select("*").eq("id", row.outside_form_id).single());
    assert.ok(stamped.first_entry_at && stamped.last_entry_at, "its form stamped then");
    assert.ok(
      (await open()).some((line) => line.id === held.entry_id),
      "and it waits in Needs you",
    );
    const sent = ok(await take(flood));
    assert.deepEqual(
      [sent.outcome, sent.entry_id, sent.contact_id],
      ["again", held.entry_id, through.contact_id],
      "sent again by its site after: the same entry, with its person",
    );
  },
);

test("a member's Not a real request holds a site's request, and brings it back", { skip }, async () => {
  const real = ok(await take({ p_key_id: studio, p_ref: "h-1", n: 50 }));
  const viewer = await signedIn("viewer");
  const no = await viewer.rpc("form_entry_hold", { p_tenant_id: tenantId, p_entry_id: real.entry_id });
  assert.equal(no.error?.code, "42501");
  const owner = await signedIn("owner");
  const held = ok(await owner.rpc("form_entry_hold", { p_tenant_id: tenantId, p_entry_id: real.entry_id }));
  assert.equal(held, true, "REGRESSION: the door named hosted forms alone, and a site's request was never held");
  const row = await entryOf(real.entry_id);
  assert.deepEqual([row.state, row.held_why, row.contact_id], ["held", "member", real.contact_id]);
  assert.equal(
    (await open()).some((line) => line.id === real.entry_id),
    false,
    "it left Needs you",
  );
  assert.equal((await eventsOf("form_entry.held", real.entry_id)).length, 1);
  const back = ok(await owner.rpc("form_entry_let_through", { p_tenant_id: tenantId, p_entry_id: real.entry_id }));
  assert.equal(back.outcome, "back");
  assert.equal(
    (await eventsOf("form_entry.accepted", real.entry_id)).length,
    1,
    "a request again, telling nobody twice",
  );
});

test("the open requests read on from where the list ended, to every one counted", { skip }, async () => {
  const openBefore = await count();
  const words = Array.from({ length: 215 }, () => hex());
  for (let from = 0; from < words.length; from += 25)
    await Promise.all(
      words
        .slice(from, from + 25)
        .map((w, i) => take({ p_key_id: popUp, p_form_ref: "many", p_words: w, n: 100 + from + i })),
    );
  // Twelve of one very moment, as a burst writes them: the place to read on from is told by the id among them.
  const form = ok(await db.from("outside_forms").select("id").eq("tenant_id", tenantId).eq("ref", "many").single()).id;
  ok(
    await db
      .from("outside_forms")
      .update({ requests_from: ago(60 * MIN_MS) })
      .eq("id", form),
  );
  ok(
    await db
      .from("form_entries")
      .update({ created_at: ago(5 * MIN_MS) })
      .eq("tenant_id", tenantId)
      .in("words", words.slice(20, 32)),
  );
  const all = await count();
  assert.equal(all, openBefore + 215, "the count has no cap");
  const owner = await signedIn("owner");
  const page = async (args = {}) => ok(await owner.rpc("form_requests_open", { p_tenant_id: tenantId, ...args }));
  const first = await page();
  assert.equal(first.length, 200, "the list stops at 200, as before");
  const seen = new Map(first.map((line) => [line.id, line]));
  let last = first.at(-1);
  for (let pages = 0; pages < 5; pages += 1) {
    const next = await page({ p_before: last.created_at, p_before_id: last.id });
    if (next.length === 0) break;
    assert.equal(
      next.some((line) => seen.has(line.id)),
      false,
      "a page holds none it was given before",
    );
    for (const line of next) seen.set(line.id, line);
    last = next.at(-1);
  }
  assert.equal(seen.size, all, "REGRESSION: read on to the end, every counted request is reached");

  const ordered = [...seen.values()].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
  const burst = ordered.filter((line) => ordered.filter((o) => o.created_at === line.created_at).length >= 12);
  assert.equal(burst.length, 12, "twelve share one moment");
  const mid = burst[5];
  const at = ordered.findIndex((line) => line.id === mid.id);
  assert.deepEqual(
    (await page({ p_before: mid.created_at, p_before_id: mid.id })).map((line) => line.id),
    ordered.slice(at + 1, at + 201).map((line) => line.id),
    "from the middle of one moment, the next is exactly what follows it",
  );
  const stranger = await signedIn("stranger");
  assert.deepEqual(
    ok(await stranger.rpc("form_requests_open", { p_tenant_id: tenantId, p_before: last.created_at })),
    [],
    "a stranger reads none of it, on any page",
  );
});

test(
  "where a named entry stands: answered and how, sending, open, aged; the open list and the count agree",
  { skip },
  async () => {
    const names = ["open", "marked", "talked", "queued", "sent", "failed", "canceled", "failedThenQueued"];
    names.push("old", "oldAnswered", "sentThenFailed", "markedAndQueued");
    const E = {};
    const C = {};
    for (const [i, name] of names.entries()) {
      E[name] = ok(await take({ p_key_id: studio, p_form_ref: "stands", n: 400 + i }));
      C[name] = await conversationOf(E[name].contact_id);
    }
    const link = (row) => db.from("form_entry_links").insert({ tenant_id: tenantId, ...row });
    ok(await link({ entry_id: E.marked.entry_id, kind: "marked", created_by: ownerId }));
    ok(await link({ entry_id: E.talked.entry_id, kind: "conversation", conversation_id: C.talked }));
    await reply(E.queued.entry_id, C.queued, "queued");
    await reply(E.sent.entry_id, C.sent, "sent");
    await reply(E.failed.entry_id, C.failed, "failed");
    await reply(E.canceled.entry_id, C.canceled, "canceled");
    await reply(E.failedThenQueued.entry_id, C.failedThenQueued, "failed");
    await reply(E.failedThenQueued.entry_id, C.failedThenQueued, "queued");
    ok(
      await db
        .from("form_entries")
        .update({ created_at: ago(61 * DAY_MS) })
        .in("id", [E.old.entry_id, E.oldAnswered.entry_id]),
    );
    ok(
      await db
        .from("outside_forms")
        .update({ requests_from: ago(90 * DAY_MS) })
        .eq("tenant_id", tenantId)
        .eq("ref", "stands"),
    );
    await reply(E.oldAnswered.entry_id, C.oldAnswered, "delivered");
    await reply(E.sentThenFailed.entry_id, C.sentThenFailed, "read");
    await reply(E.sentThenFailed.entry_id, C.sentThenFailed, "failed");
    ok(await link({ entry_id: E.markedAndQueued.entry_id, kind: "marked", created_by: ownerId }));
    await reply(E.markedAndQueued.entry_id, C.markedAndQueued, "queued");
    const far = ok(await take({ tenant: otherId, n: 499 }));

    const ids = [...names.map((name) => E[name].entry_id), far.entry_id];
    const viewer = await signedIn("viewer");
    const stands = ok(await viewer.rpc("form_entries_standing", { p_tenant_id: tenantId, p_entry_ids: ids }));
    const of = (name) => stands.find((line) => line.id === E[name].entry_id);
    const want = { open: "open", marked: "answered", talked: "answered", queued: "sending", sent: "answered" };
    Object.assign(want, { failed: "open", canceled: "open", failedThenQueued: "sending", old: "aged" });
    Object.assign(want, { oldAnswered: "answered", sentThenFailed: "answered", markedAndQueued: "answered" });
    assert.deepEqual(Object.fromEntries(names.map((name) => [name, of(name)?.standing])), want);
    assert.deepEqual(
      [of("marked").how, of("talked").how, of("sent").how, of("sentThenFailed").how, of("markedAndQueued").how],
      ["marked", "conversation", "reply", "reply", "marked"],
      "what answered it: a member's word first, then a conversation, then a reply that left",
    );
    assert.equal(of("talked").conversation_id, C.talked);
    assert.deepEqual(
      [of("queued").how, of("open").how],
      [null, null],
      "sending and open name nothing that answered them",
    );
    assert.deepEqual(
      [of("failed").unreached, of("failedThenQueued").unreached, of("canceled").unreached, of("open").unreached],
      [true, true, false, false],
      "a reply that failed is said",
    );
    assert.equal(stands.length, names.length, "another workspace's entry is not in the answer");

    // One rule, three readers: an entry is in the list exactly where it stands open, and the count counts those.
    const listed = new Set((await open()).map((line) => line.id));
    for (const name of names.filter((n) => !n.startsWith("old")))
      assert.equal(listed.has(E[name].entry_id), want[name] === "open", `the open list agrees on ${name}`);
    assert.equal(listed.has(E.old.entry_id), false, "an aged one left the list at its sixty days");

    const stranger = await signedIn("stranger");
    assert.deepEqual(
      ok(await stranger.rpc("form_entries_standing", { p_tenant_id: tenantId, p_entry_ids: ids })),
      [],
      "a stranger reads no standing",
    );
    const nobody = createClient(URL_, ANON, { auth: { persistSession: false } });
    const out = await nobody.rpc("form_entries_standing", { p_tenant_id: tenantId, p_entry_ids: ids });
    assert.ok(out.error, "nobody signed out calls it");

    // The reply that was sending fails, as the sweep fails one stuck queued: back in Needs you, said as unreached.
    const counted = await count();
    const queued = ok(await db.from("form_entry_links").select("message_id").eq("entry_id", E.queued.entry_id));
    ok(
      await db
        .from("messages")
        .update({ status: "failed" })
        .in(
          "id",
          queued.map((row) => row.message_id),
        ),
    );
    const [afterwards] = ok(
      await viewer.rpc("form_entries_standing", { p_tenant_id: tenantId, p_entry_ids: [E.queued.entry_id] }),
    );
    assert.deepEqual([afterwards.standing, afterwards.unreached], ["open", true]);
    assert.equal((await open()).find((line) => line.id === E.queued.entry_id)?.unreached, true);
    assert.equal(await count(), counted + 1, "and it is counted again");
  },
);

test("a reply that cannot be tied to its request is not written (00713)", { skip }, async () => {
  const mine = ok(await take({ p_key_id: studio, p_form_ref: "tied", n: 600 }));
  const theirs = ok(await take({ tenant: otherId, n: 601 }));
  const conversationId = await conversationOf(mine.contact_id);
  const message = (formEntryId) =>
    db
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        channel: "email",
        direction: "outbound",
        sender: "human",
        status: "queued",
        meta: { form_entry_id: formEntryId },
      })
      .select("id")
      .single();
  const written = async () =>
    (await db.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId))
      .count;
  for (const [what, id] of [
    ["another workspace's request", theirs.entry_id],
    ["a request that is not there", "00000000-0000-4000-8000-00000000dead"],
    ["what is no id at all", "not-an-id"],
  ]) {
    const refused = await message(id);
    assert.ok(refused.error, `naming ${what}: the write is refused`);
    assert.equal(await written(), 0, `REGRESSION: and no message is written for ${what}`);
  }
  const sent = ok(await message(mine.entry_id), "naming its own request");
  const links = ok(await db.from("form_entry_links").select("kind, message_id").eq("entry_id", mine.entry_id));
  assert.deepEqual(links, [{ kind: "reply", message_id: sent.id }], "written, and linked in the same write");
});

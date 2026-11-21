/**
 * A website form's entry on a real database (00675): form_entry_take keeps the entry with its person and its event in
 * one write, finds the same entry again by the site's own id or by the same words within ten minutes, and writes
 * nothing at all for a person who asked to be forgotten; form_entry_settled keeps each step's outcome, says the entry
 * is processed once all are done, stamps when the owner was first told, writes the ask's first outcome as
 * form_entry.asked, and never rewrites an ask done; the keys' doors are an owner's; a person erased takes their entries.
 * A function body is what reading source cannot prove, so these run against Postgres. Skipped without a local database;
 * never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { hashLegacyErasedEmail, hashLegacyErasedPhone } from "@chanlytics/contracts";

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
let db;
let tenantId;
let ownerId;
let viewerId;
const made = [];

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const hex = (c) => c.repeat(64);

/** The door's one write, as the edge calls it (packages/db takeFormEntry). */
const take = (over = {}) =>
  db.rpc("form_entry_take", {
    p_tenant_id: tenantId,
    p_form: "request",
    p_answers: { form: "request", phone: "+16465550170", about: "A seat" },
    p_person: { phone: "+16465550170", email: null, name: "Ana", detail: { form: "request" } },
    p_words: hex("a"),
    p_owed: ["note", "notice"],
    ...over,
  });
const entryRows = () => db.from("form_entries").select("*").eq("tenant_id", tenantId).order("created_at");
const eventsOf = (kind) => db.from("events").select("id, subject_id, data").eq("tenant_id", tenantId).eq("kind", kind);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `form-entry-${RUN}`, name: "Harbor" })
      .select("id")
      .single(),
  ).id;
  for (const [role, who] of [
    ["owner", "owner"],
    ["viewer", "viewer"],
  ]) {
    const email = `${who}-${RUN}@example.com`;
    const user = ok(
      await db.auth.admin.createUser({ email, password: `pw-${RUN}-Aa1!`, email_confirm: true }),
      who,
    ).user;
    made.push(user.id);
    ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: user.id, role }), `${who}'s seat`);
    if (role === "owner") ownerId = user.id;
    else viewerId = user.id;
  }
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("events").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of made) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/** A session of a member of the workspace. */
async function signedIn(who) {
  const as = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await as.auth.signInWithPassword({ email: `${who}-${RUN}@example.com`, password: `pw-${RUN}-Aa1!` }), who);
  return as;
}

test(
  "one write: the entry, its person and its event together; the first key's row made at its first use",
  { skip },
  async () => {
    const kept = ok(await take(), "take");
    assert.equal(kept.outcome, "accepted");
    const [entry] = ok(await entryRows());
    assert.deepEqual(
      [entry.id, entry.contact_id, entry.state, entry.owed, entry.told_at],
      [kept.entry_id, kept.contact_id, "accepted", ["note", "notice"], null],
    );
    const person = ok(await db.from("contacts").select("phone_e164").eq("id", kept.contact_id).single());
    assert.equal(person.phone_e164, "+16465550170", "the person through resolve_person");
    const events = ok(await eventsOf("form_entry.accepted"));
    assert.deepEqual(
      events.map((e) => [e.subject_id, e.data]),
      [[kept.entry_id, { form: "request", owed: ["note", "notice"] }]],
      "its event, holding nothing of what was typed",
    );
    const first = ok(await db.from("form_keys").select("id, first, last_used_at").eq("tenant_id", tenantId));
    assert.equal(first.length, 1);
    assert.ok(first[0].first && first[0].last_used_at, "the first key, with its last use");
    assert.equal(entry.key_id, first[0].id);
  },
);

test(
  "once: the same words within ten minutes are the same entry, the site's id always, another id another",
  { skip },
  async () => {
    const before = ok(await entryRows()).length;
    const again = ok(await take(), "again");
    assert.equal(again.outcome, "again");
    assert.equal(ok(await entryRows()).length, before, "nothing new");
    // Ten minutes on, the same words are a new entry: backdate the first and ask again.
    const [first] = ok(await entryRows());
    ok(
      await db
        .from("form_entries")
        .update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() })
        .eq("id", first.id),
    );
    assert.equal(ok(await take(), "later").outcome, "accepted");
    // The site's own id: the same one is the same entry whatever the words; two at once are one.
    const both = await Promise.all([
      take({ p_ref: "site-7", p_words: hex("b") }),
      take({ p_ref: "site-7", p_words: hex("c") }),
    ]);
    const outcomes = both.map((r) => ok(r, "ref").outcome).sort();
    assert.deepEqual(outcomes, ["accepted", "again"]);
    assert.equal(ok(await take({ p_ref: "site-8", p_words: hex("b") })).outcome, "accepted");
  },
);

test("a person who asked to be forgotten: nothing is written at all, and the answer says so", { skip }, async () => {
  const phone = "+16465550188";
  ok(
    await db.from("contacts").insert({
      tenant_id: tenantId,
      phone_e164: null,
      erased_at: new Date().toISOString(),
      erased_phone_hash: await hashLegacyErasedPhone(tenantId, phone),
      erased_email_hash: await hashLegacyErasedEmail(tenantId, `gone-${RUN}@example.com`),
    }),
    "the forgotten",
  );
  const entries = ok(await entryRows()).length;
  const events = ok(await db.from("events").select("id").eq("tenant_id", tenantId)).length;
  const r = ok(
    await take({
      p_person: { phone, email: null, name: "Gone", detail: {} },
      p_answers: { form: "request", phone },
      p_words: hex("d"),
    }),
  );
  assert.deepEqual(r, { outcome: "forgotten", entry_id: null, contact_id: null });
  assert.equal(ok(await entryRows()).length, entries, "no entry");
  assert.equal(
    ok(await db.from("events").select("id").eq("tenant_id", tenantId)).length,
    events,
    "no event of any kind",
  );
  const living = ok(
    await db.from("contacts").select("id").eq("tenant_id", tenantId).is("erased_at", null).eq("phone_e164", phone),
  );
  assert.equal(living.length, 0, "and no person made again");
});

test(
  "settled: each step's outcome, processed once all are done, told once, the ask's first outcome its event",
  { skip },
  async () => {
    const kept = ok(await take({ p_form: "signup", p_words: hex("e"), p_owed: ["note", "notice", "confirm"] }));
    const settle = (effect, outcome) =>
      db.rpc("form_entry_settled", {
        p_tenant_id: tenantId,
        p_entry_id: kept.entry_id,
        p_effect: effect,
        p_outcome: outcome,
      });
    ok(await settle("note", { state: "done", outcome: "kept" }));
    ok(await settle("notice", { state: "failed", why: "mail_owed", told: true }));
    let row = ok(await db.from("form_entries").select("*").eq("id", kept.entry_id).single());
    assert.ok(row.told_at, "the bell's row is a notice: told");
    const toldAt = row.told_at;
    assert.equal(row.state, "accepted");
    ok(await settle("confirm", { state: "failed", why: "the ledger was down" }));
    assert.equal(ok(await eventsOf("form_entry.asked")).filter((e) => e.subject_id === kept.entry_id).length, 1);
    ok(await settle("confirm", { state: "done", outcome: "asked" }));
    assert.equal(
      ok(await eventsOf("form_entry.asked")).filter((e) => e.subject_id === kept.entry_id).length,
      1,
      "the ask's first outcome alone is news",
    );
    const rewrite = ok(await settle("confirm", { state: "done", outcome: "open" }));
    assert.equal(rewrite.settled, false, "an ask done is never written again");
    ok(await settle("notice", { state: "done", told: true }));
    const lost = ok(await settle("notice", { state: "failed", why: "not_kept", told: false }));
    assert.equal(lost.settled, false, "a twin that lost to a notice told writes nothing");
    row = ok(await db.from("form_entries").select("*").eq("id", kept.entry_id).single());
    assert.equal(row.effects.notice.state, "done");
    assert.equal(row.state, "processed");
    assert.equal(row.told_at, toldAt, "told once");
    assert.equal(row.effects.confirm.outcome, "asked");
    assert.equal((await settle("tea", { state: "done" })).error?.code, "22023");
    assert.equal((await settle("note", { state: "maybe" })).error?.code, "22023");
  },
);

test(
  "the keys are an owner's: made, changed with a day's grace, ended; a viewer may do none of it",
  { skip },
  async () => {
    const owner = await signedIn("owner");
    const viewer = await signedIn("viewer");
    const refused = await viewer.rpc("form_key_make", { p_tenant_id: tenantId, p_name: "Main site", p_hash: hex("1") });
    assert.equal(refused.error?.code, "42501");
    const id = ok(
      await owner.rpc("form_key_make", { p_tenant_id: tenantId, p_name: "  Main site ", p_hash: hex("1") }),
    );
    const listed = ok(await viewer.from("form_keys").select("id, name").eq("id", id).single());
    assert.equal(listed.name, "Main site", "a member reads the keys, named as kept");
    const changed = ok(await owner.rpc("form_key_change", { p_tenant_id: tenantId, p_key_id: id, p_hash: hex("2") }));
    assert.equal(changed.name, "Main site", "the door names the new key as the old one was");
    const next = changed.id;
    const [old, fresh] = await Promise.all(
      [id, next].map(async (k) => ok(await db.from("form_keys").select("name, ends_at").eq("id", k).single())),
    );
    // A key on its last day is not changed again: two old keys would be working.
    const twice = await owner.rpc("form_key_change", { p_tenant_id: tenantId, p_key_id: id, p_hash: hex("4") });
    assert.equal(twice.error?.code, "P0002");
    const graceMs = Date.parse(old.ends_at) - Date.now();
    assert.ok(graceMs > 23 * 3_600_000 && graceMs <= 24 * 3_600_000, "the old one honoured a day");
    assert.deepEqual([fresh.name, fresh.ends_at], ["Main site", null]);
    assert.equal(ok(await owner.rpc("form_key_end", { p_tenant_id: tenantId, p_key_id: next })), true);
    assert.equal(ok(await owner.rpc("form_key_end", { p_tenant_id: tenantId, p_key_id: next })), false, "ended once");
    assert.equal(
      (await owner.rpc("form_key_change", { p_tenant_id: tenantId, p_key_id: next, p_hash: hex("3") })).error?.code,
      "P0002",
    );
    const set = ok(await eventsOf("form_key.set"));
    assert.deepEqual(
      set.map((e) => e.data.act).sort(),
      ["changed", "ended", "made"],
      "each kept on the record, never the key",
    );
    assert.ok(!JSON.stringify(set).includes(hex("1")), "nor its hash");
    const viewerEnd = await viewer.rpc("form_key_end", { p_tenant_id: tenantId, p_key_id: id });
    assert.equal(viewerEnd.error?.code, "42501");
    assert.ok(ownerId && viewerId);
  },
);

test("a person erased takes their entries with them", { skip }, async () => {
  const kept = ok(
    await take({ p_words: hex("f"), p_person: { phone: "+16465550177", email: null, name: "Bo", detail: {} } }),
  );
  ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", kept.contact_id));
  const left = ok(await db.from("form_entries").select("id").eq("contact_id", kept.contact_id));
  assert.equal(left.length, 0);
});

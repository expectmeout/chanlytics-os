/**
 * A person is resolved by one door, on a real database (00342, decision 0034 steps 1 to 3).
 *
 * Nine writers each matched a person their own way, and nothing merged or said when two records might be one person.
 * resolve_person is the door they move onto: the erasure digests first, then the identity, the number and the address
 * in that order, two numbers being two people; it fills what is empty and never overwrites, keeps the identity with how
 * sure the door was of it, never merges, and answers a doubt instead; contact.added for a new person, person.resolved
 * for every call, in the same transaction. A definer door with locks and unique keys is what reading source cannot
 * prove. Runs against Postgres in the database workflow; skipped without a local database. The service role calls it,
 * as the doors do; a session is refused, which the last case holds.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { legacyErasedEmailHash, legacyErasedPhoneHash } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
let tenantId;
let userId;
let as;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `resolve-${RUN}`, name: "Resolve" })
    .select("id")
    .single();
  if (t.error) throw new Error(t.error.message);
  tenantId = t.data.id;
  const email = `owner-${RUN}@example.com`;
  const made = await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  userId = made.data.user.id;
  const m = await db.from("memberships").insert({ tenant_id: tenantId, user_id: userId, role: "owner" });
  if (m.error) throw new Error(m.error.message);
  as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
  if (s.error) throw new Error(s.error.message);
});

after(async () => {
  if (skip || !tenantId) return;
  // events has no foreign key to tenants (it is partitioned), so the tenant's rows go first or they outlive it.
  await db.from("events").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
  if (userId) await db.auth.admin.deleteUser(userId);
});

/** The door, as the service role calls it: every argument named, the ones not given null. */
const door = (args) =>
  db.rpc("resolve_person", {
    p_tenant_id: tenantId,
    p_channel: null,
    p_external: null,
    p_phone: null,
    p_email: null,
    p_name: null,
    p_assurance: "observed",
    p_source: "inbound",
    ...args,
  });
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const living = async (fields = "id, phone_e164, email, display_name, wa_profile_name") => {
  const r = await db
    .from("contacts")
    .select(fields)
    .eq("tenant_id", tenantId)
    .is("erased_at", null)
    .order("created_at");
  return ok(r, "contacts");
};
const identitiesOf = async (id) =>
  ok(
    await db.from("contact_identities").select("channel, external_id, assurance").eq("contact_id", id).order("channel"),
    "identities",
  );
const eventsOf = async (kind, subjectId) => {
  let q = db.from("events").select("subject_id, data").eq("tenant_id", tenantId).eq("kind", kind).order("created_at");
  if (subjectId) q = q.eq("subject_id", subjectId);
  return ok(await q, kind);
};

test(
  "the same person seen by WhatsApp, then SMS, then by a member, then by email is one row with three identities",
  { skip },
  async () => {
    const phone = "+16465550141";
    const email = `ana-${RUN}@example.com`;
    // WhatsApp: the profile name is theirs, not a member's word, so it is the profile's column.
    const wa = ok(
      await door({ p_channel: "whatsapp", p_external: "16465550141", p_phone: phone, p_name: "Ana Ruiz" }),
      "whatsapp",
    );
    assert.deepEqual([wa.outcome, wa.existed, wa.matched_by, wa.identity], ["new", false, null, "added"]);
    // SMS, the same number: matched by it, and a second identity.
    const sms = ok(await door({ p_channel: "sms", p_external: phone, p_phone: phone }), "sms");
    assert.deepEqual(
      [sms.contact_id, sms.outcome, sms.matched_by, sms.identity],
      [wa.contact_id, "matched", "phone", "added"],
    );
    // A member types the name and the address: both were empty, both are filled, the address through its own door.
    const typed = ok(
      await door({ p_phone: phone, p_email: email, p_name: "Ana Ruiz", p_assurance: "asserted", p_source: "manual" }),
      "typed",
    );
    assert.deepEqual(
      [typed.contact_id, typed.outcome, typed.matched_by, typed.email, typed.filled],
      [wa.contact_id, "filled", "phone", "set", ["display_name", "email"]],
    );
    // Email, the address alone: matched by it, and the third identity.
    const mail = ok(await door({ p_channel: "email", p_external: email, p_email: email }), "email");
    assert.deepEqual(
      [mail.contact_id, mail.outcome, mail.matched_by, mail.email],
      [wa.contact_id, "matched", "email", "kept"],
    );

    const rows = await living();
    assert.deepEqual(
      rows.map((r) => [r.phone_e164, r.email, r.display_name, r.wa_profile_name]),
      [[phone, email, "Ana Ruiz", "Ana Ruiz"]],
      "one row, with everything each door brought",
    );
    assert.deepEqual(
      await identitiesOf(wa.contact_id),
      [
        { channel: "email", external_id: email, assurance: "observed" },
        { channel: "sms", external_id: phone, assurance: "observed" },
        { channel: "whatsapp", external_id: "16465550141", assurance: "observed" },
      ],
      "three identities, each as sure as the wire it came on",
    );
    const added = await eventsOf("contact.added", wa.contact_id);
    assert.deepEqual(
      added.map((e) => [e.data.source, e.data.by]),
      [["inbound", null]],
      "one added event, from the door that made them, with no member behind it",
    );
    const resolved = await eventsOf("person.resolved", wa.contact_id);
    assert.deepEqual(
      resolved.map((e) => [e.data.outcome, e.data.matched_by, e.data.channel, e.data.assurance, e.data.filled]),
      [
        ["new", null, "whatsapp", "observed", []],
        ["matched", "phone", "sms", "observed", []],
        ["filled", "phone", null, "asserted", ["display_name", "email"]],
        ["matched", "email", "email", "observed", []],
      ],
      "every call wrote its own row in the ledger",
    );
    for (const e of resolved)
      assert.ok(
        !JSON.stringify(e.data).includes("6465550141") && !JSON.stringify(e.data).includes(email),
        "never the number or the address",
      );
    assert.equal(
      (await eventsOf("contact.email_set", wa.contact_id)).length,
      1,
      "the address was set through its own door",
    );
  },
);

test(
  "a number or an address whose person asked to be forgotten is refused on every path, and nothing is made",
  { skip },
  async () => {
    const phone = "+16465550142";
    const email = `gone-${RUN}@example.com`;
    const gone = await db
      .from("contacts")
      .insert({
        tenant_id: tenantId,
        phone_e164: null,
        erased_at: new Date().toISOString(),
        erased_phone_hash: await legacyErasedPhoneHash(tenantId, phone),
        erased_email_hash: await legacyErasedEmailHash(tenantId, email),
      })
      .select("id")
      .single();
    assert.equal(gone.error, null, gone.error?.message);
    const before = (await living()).length;
    const paths = [
      { p_channel: "whatsapp", p_external: "16465550142", p_phone: phone },
      { p_channel: "voice", p_external: phone, p_phone: phone },
      { p_phone: "(646) 555-0142", p_assurance: "asserted", p_source: "manual" },
      { p_email: email, p_assurance: "asserted", p_source: "import" },
      { p_phone: "+16465550143", p_email: email, p_assurance: "found", p_source: "lead" },
    ];
    for (const path of paths) {
      const r = await door(path);
      assert.equal(r.error?.code, "PE001", `${JSON.stringify(path)}: ${r.error?.message}`);
      assert.match(r.error?.message ?? "", /forgotten/);
    }
    assert.equal((await living()).length, before, "nothing was made on any path");
    assert.deepEqual(await eventsOf("person.resolved", gone.data.id), [], "and the tombstone was not resolved to");
  },
);

test(
  "a name alone is a doubt beside a new person, never a match; the same number with the name is the person",
  { skip },
  async () => {
    const dee = ok(
      await door({ p_phone: "+16465550151", p_name: "Dee Alvarez", p_assurance: "asserted", p_source: "manual" }),
      "dee",
    );
    assert.equal(dee.outcome, "new");
    const again = ok(
      await door({ p_phone: "+16465550152", p_name: "dee alvarez", p_assurance: "asserted", p_source: "manual" }),
      "again",
    );
    assert.deepEqual(
      [again.outcome, again.existed, again.doubt, again.doubt_seen],
      ["new", false, dee.contact_id, "name"],
      "a second record, and the answer names the first as the doubt",
    );
    assert.notEqual(again.contact_id, dee.contact_id);
    const rows = (await living("id, phone_e164, display_name")).filter((r) =>
      /dee alvarez/i.test(r.display_name ?? ""),
    );
    assert.equal(rows.length, 2, "two living records: nothing merged");
    const [resolved] = await eventsOf("person.resolved", again.contact_id);
    assert.deepEqual(
      [resolved.data.doubt, resolved.data.doubt_seen],
      [dee.contact_id, "name"],
      "the ledger says so too",
    );
    const same = ok(
      await door({ p_phone: "+16465550151", p_name: "Dee Alvarez", p_assurance: "asserted", p_source: "manual" }),
      "same",
    );
    assert.deepEqual([same.contact_id, same.outcome, same.doubt], [dee.contact_id, "matched", null]);
  },
);

test(
  "two numbers are two people: an address another number holds is taken, and the pair is a doubt",
  { skip },
  async () => {
    const email = `shared-${RUN}@example.com`;
    const a = ok(
      await door({ p_phone: "+16465550161", p_email: email, p_assurance: "asserted", p_source: "import" }),
      "a",
    );
    assert.deepEqual([a.outcome, a.email], ["new", "set"]);
    const b = ok(
      await door({ p_phone: "+16465550162", p_email: email, p_assurance: "asserted", p_source: "import" }),
      "b",
    );
    assert.deepEqual(
      [b.outcome, b.email, b.doubt, b.doubt_seen],
      ["new", "taken", a.contact_id, "email"],
      "a second person without the address, and the first named as the doubt",
    );
    assert.notEqual(b.contact_id, a.contact_id);
    const rows = await living("id, phone_e164, email");
    assert.deepEqual(rows.find((r) => r.id === a.contact_id).email, email, "the address stays where it was");
    assert.equal(rows.find((r) => r.id === b.contact_id).email, null);
    // An address alone, with no number of its own, is the person whose address it is: the only way in without a number.
    const byMail = ok(
      await door({ p_email: email, p_name: "Shared Address", p_assurance: "asserted", p_source: "import" }),
      "by mail",
    );
    assert.deepEqual([byMail.contact_id, byMail.matched_by, byMail.email], [a.contact_id, "email", "kept"]);
    // The number of one person offered as another's is not moved: theirs stays theirs, and the pair is a doubt.
    const moved = ok(
      await door({ p_email: email, p_phone: "+16465550162", p_assurance: "asserted", p_source: "import" }),
      "moved",
    );
    assert.deepEqual(
      [moved.contact_id, moved.matched_by, moved.doubt, moved.doubt_seen],
      [b.contact_id, "phone", a.contact_id, "email"],
    );
  },
);

test(
  "a found identity never overrides an observed one, and a stronger word replaces a weaker one",
  { skip },
  async () => {
    const phone = "+16465550171";
    const seen = ok(
      await door({ p_channel: "whatsapp", p_external: "16465550171", p_phone: phone, p_name: "Ana Ruiz" }),
      "seen",
    );
    const found = ok(
      await door({
        p_channel: "whatsapp",
        p_external: "16465550171",
        p_phone: phone,
        p_name: "Made-up Salon",
        p_assurance: "found",
        p_source: "lead",
      }),
      "found",
    );
    assert.deepEqual([found.contact_id, found.matched_by, found.identity], [seen.contact_id, "identity", "kept"]);
    assert.deepEqual(await identitiesOf(seen.contact_id), [
      { channel: "whatsapp", external_id: "16465550171", assurance: "observed" },
    ]);
    const [row] = (await living()).filter((r) => r.id === seen.contact_id);
    assert.deepEqual(
      [row.wa_profile_name, row.display_name],
      ["Ana Ruiz", "Made-up Salon"],
      "the profile's name is theirs; the finder's fills the empty column and overwrites nothing",
    );
    // The other way: an identity the finder named, then the person writing on it, is observed from then on.
    const named = ok(
      await door({
        p_channel: "sms",
        p_external: "+16465550172",
        p_phone: "+16465550172",
        p_assurance: "found",
        p_source: "lead",
      }),
      "named",
    );
    assert.deepEqual(
      (await identitiesOf(named.contact_id)).map((i) => i.assurance),
      ["found"],
    );
    const wrote = ok(await door({ p_channel: "sms", p_external: "+16465550172", p_phone: "+16465550172" }), "wrote");
    assert.deepEqual([wrote.contact_id, wrote.identity], [named.contact_id, "kept"]);
    assert.deepEqual(
      (await identitiesOf(named.contact_id)).map((i) => i.assurance),
      ["observed"],
    );
  },
);

test("what it refuses, and how it reads a number and an address", { skip }, async () => {
  for (const [args, code, why] of [
    [{}, "22023", /A number or an address is needed/],
    [{ p_channel: "sms" }, "22023", /channel and its id/],
    [{ p_phone: "+16465550181", p_assurance: "guessed" }, "22023", /observed, asserted or found/],
    [{ p_channel: "fax", p_external: "1", p_phone: "+16465550181" }, "22023", /not a channel/],
    [{ p_phone: "12" }, "22023", /international form/],
    [{ p_email: "not an address" }, "22023", /not an email address/],
  ]) {
    const r = await door(args);
    assert.equal(r.error?.code, code, `${JSON.stringify(args)}: ${r.error?.message}`);
    assert.match(r.error?.message ?? "", why);
  }
  const made = ok(
    await door({
      p_phone: "(646) 555-0182",
      p_email: ` Bo-${RUN}@Example.com `,
      p_name: "  Bo   Lee ",
      p_assurance: "asserted",
      p_source: "manual",
    }),
    "made",
  );
  const [row] = (await living()).filter((r) => r.id === made.contact_id);
  assert.deepEqual(
    [row.phone_e164, row.email, row.display_name],
    ["+16465550182", `bo-${RUN}@example.com`, "Bo Lee"],
    "as contracts normalise them",
  );
  const again = ok(await door({ p_phone: "6465550182", p_assurance: "asserted", p_source: "manual" }), "ten digits");
  assert.deepEqual([again.contact_id, again.matched_by], [made.contact_id, "phone"], "ten digits are North American");
});

test("a session cannot call the door: the member doors call it for them", { skip }, async () => {
  const r = await as.rpc("resolve_person", {
    p_tenant_id: tenantId,
    p_channel: null,
    p_external: null,
    p_phone: "+16465550191",
    p_email: null,
    p_name: null,
    p_assurance: "asserted",
    p_source: "manual",
  });
  assert.equal(r.error?.code, "42501", r.error?.message);
  const byHand = await as.rpc("create_person", {
    p_tenant_id: tenantId,
    p_phone_e164: "+16465550191",
    p_display_name: "By Hand",
    p_source: "manual",
  });
  assert.equal(byHand.error, null, byHand.error?.message);
  assert.equal(byHand.data.existed, false);
  const [resolved] = await eventsOf("person.resolved", byHand.data.contact_id);
  assert.deepEqual(
    [resolved.data.by, resolved.data.assurance, resolved.data.source],
    [userId, "asserted", "manual"],
    "the member's door speaks for them",
  );
});

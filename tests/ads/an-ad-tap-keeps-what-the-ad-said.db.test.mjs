/**
 * 00644 on a real Postgres: an ad tap keeps what the ad said (decision 0049, step P0a).
 *
 * A message whose referral is an ad opens one entry (ad_entries) in its own transaction, whether or not it made the
 * person, and the edge keeps what the ad said on it afterwards (ad_entry_keep), each part alone. The writers are the
 * real ones: ingest_inbound, whose body this change does not restate, and the door the edge calls. What must hold: one
 * entry a message however often it is delivered; the first words stand; a part that is odd is dropped and the rest
 * kept; a person counted for an ad is counted for the first one, and a later tap adds an entry and moves no count; an
 * entry follows two people combined and goes with a person erased; a member reads their workspace's entries and writes
 * none; and a person an ad's own door added is stamped `ad`. Runs against the database `supabase start` builds on this
 * machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { AD_SAID_MAX } from "../../packages/channels/src/whatsapp/first-touch.ts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes people and messages"
      : false;
// Combining and erasing are a member's acts: the cases that do either sign an owner in.
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the owner these cases sign in needs it" : false);

const stamp = Date.now();
const users = [];
let owner;
let db;
let tenantId;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const newPhone = () => `+1555014${1000 + ++seq}`;
const adMeta = (id, kind = "ad") => ({ raw_type: "text", referral: { source_id: id, source_type: kind } });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-ad-entries-${stamp}`, name: "Harbor Ad Entries" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A workspace owner, signed in: made once, for the cases that combine, erase or read as a member. */
async function ownerSession() {
  if (owner) return owner;
  const email = `ad-entries-owner-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "owner" }));
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await session.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
  owner = session;
  return owner;
}

/** An inbound customer message, taken in as the edge takes it in: its meta is what the edge's ingest writes. */
async function arrive({ channel = "whatsapp", meta = { raw_type: "text" }, number = newPhone(), external } = {}) {
  seq += 1;
  // A wire with no number names its person by its own id: an address, or Instagram's id for them.
  const own =
    channel === "email" ? `guest${seq}.${stamp}@example.com` : channel === "instagram" ? `igsid${seq}${stamp}` : null;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: channel,
      p_identity_external_id: own ?? number.slice(1),
      p_phone_e164: own ? null : number,
      p_wa_profile_name: null,
      p_message_external_id: external ?? `ad.${stamp}.${seq}`,
      p_type: "text",
      p_body: "Hi, I saw your ad",
      p_channel_ts: null,
      p_media: null,
      p_meta: meta,
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}
const keep = (messageId, said, as = db) =>
  as.rpc("ad_entry_keep", { p_tenant_id: tenantId, p_message_id: messageId, p_said: said });
const entriesOf = async (contactId) =>
  ok(
    await db
      .from("ad_entries")
      .select("contact_id, message_id, platform, platform_ad_id, kind, new_person, said, said_at, ad_id, external_ref")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .order("created_at"),
  );
const touchOf = async (contactId) => {
  const c = ok(await db.from("contacts").select("acquired_via, acquired_ref").eq("id", contactId).single());
  return [c.acquired_via, c.acquired_ref];
};

test(
  "a message from an ad opens its entry with the message, and the ad's words are kept on it afterwards",
  { skip },
  async () => {
    const adId = `1202${stamp}01`;
    const r = await arrive({ meta: adMeta(adId) });
    assert.deepEqual(await touchOf(r.contact_id), ["ad", adId], "the stamp is as it was (00306)");
    assert.deepEqual(
      await entriesOf(r.contact_id),
      [
        {
          contact_id: r.contact_id,
          message_id: r.message_id,
          platform: "meta",
          platform_ad_id: adId,
          kind: "chat",
          new_person: true,
          said: null,
          said_at: null,
          ad_id: null,
          external_ref: null,
        },
      ],
      "opened by the database, before any word of the ad's is known",
    );

    const said = {
      headline: "Spring colour offer",
      body: "Book a colour this week.\nNew guests welcome.",
      media_type: "image",
      link: "https://fb.example/ad/1",
    };
    assert.equal(ok(await keep(r.message_id, said)), "kept");
    const [entry] = await entriesOf(r.contact_id);
    assert.deepEqual(entry.said, said);
    assert.notEqual(entry.said_at, null);

    assert.equal(
      ok(await keep(r.message_id, { headline: "Another ad's words" })),
      "already",
      "the entry has its words: a second keep changes nothing",
    );
    assert.deepEqual((await entriesOf(r.contact_id))[0].said, said, "the first words stand");
  },
);

test("the same message delivered twice leaves one entry", { skip }, async () => {
  const adId = `1202${stamp}02`;
  const number = newPhone();
  const external = `ad.redelivered.${stamp}`;
  const first = await arrive({ number, external, meta: adMeta(adId) });
  const again = await arrive({ number, external, meta: adMeta(adId) });
  assert.equal(again.is_new, false, "a redelivery");
  assert.equal(again.message_id, first.message_id);
  assert.equal((await entriesOf(first.contact_id)).length, 1);
  assert.equal(ok(await keep(first.message_id, { headline: "Once" })), "kept");
  assert.equal(ok(await keep(first.message_id, { headline: "Once" })), "already");
  assert.equal((await entriesOf(first.contact_id)).length, 1);
});

test(
  "a person is counted for the ad they first got in touch through: a later tap on another ad adds an entry and moves no count",
  { skip },
  async () => {
    const [first, second] = [`1202${stamp}03`, `1202${stamp}04`];
    const number = newPhone();
    const one = await arrive({ number, meta: adMeta(first) });
    const two = await arrive({ number, meta: adMeta(second) });
    assert.equal(two.contact_id, one.contact_id, "the same person");
    assert.deepEqual(await touchOf(one.contact_id), ["ad", first], "counted once, for the first");
    assert.deepEqual(
      (await entriesOf(one.contact_id)).map((e) => [e.platform_ad_id, e.new_person]),
      [
        [first, true],
        [second, false],
      ],
    );
  },
);

test(
  "a person who existed before taps an ad: an entry that made nobody, and their first touch is not the ad",
  { skip },
  async () => {
    const number = newPhone();
    const known = await arrive({ number });
    assert.deepEqual((await touchOf(known.contact_id))[0], "whatsapp");
    const tap = await arrive({ number, meta: adMeta(`1202${stamp}05`) });
    assert.deepEqual((await touchOf(known.contact_id))[0], "whatsapp", "written once");
    assert.deepEqual(
      (await entriesOf(tap.contact_id)).map((e) => [e.platform_ad_id, e.new_person]),
      [[`1202${stamp}05`, false]],
    );
  },
);

test("only an ad is an ad: a post, a link and a message with no referral open no entry", { skip }, async () => {
  const post = await arrive({ meta: adMeta(`post-${stamp}`, "post") });
  const link = await arrive({ channel: "instagram", meta: adMeta(`spring-${stamp}`, "link") });
  const plain = await arrive();
  for (const r of [post, link, plain]) {
    assert.deepEqual(await entriesOf(r.contact_id), []);
    assert.equal(ok(await keep(r.message_id, { headline: "Not an ad" })), "none", "and there is nothing to keep on");
  }
  const dm = await arrive({ channel: "instagram", meta: adMeta(`1202${stamp}06`) });
  assert.deepEqual(
    (await entriesOf(dm.contact_id)).map((e) => [e.platform, e.platform_ad_id, e.kind, e.new_person]),
    [["meta", `1202${stamp}06`, "chat", true]],
    "an ad that opens Instagram is Meta's too",
  );
});

test("each part of what the ad said is kept or dropped alone, at the bounds the edge reads by", { skip }, async () => {
  const kept = async (said) => {
    const r = await arrive({ meta: adMeta(`1202${stamp}${100 + seq}`) });
    assert.equal(ok(await keep(r.message_id, said)), "kept");
    return (await entriesOf(r.contact_id))[0].said;
  };
  const longest = { headline: "h".repeat(AD_SAID_MAX.headline), body: "b".repeat(AD_SAID_MAX.body) };
  assert.deepEqual(await kept(longest), longest, "the longest words the edge sends are kept whole");
  assert.deepEqual(
    await kept({
      headline: "h".repeat(AD_SAID_MAX.headline + 1),
      body: "A sound body",
      media_type: "an image",
      link: "javascript:alert(1)",
    }),
    { body: "A sound body" },
    "a headline past its bound, a kind of media that is not a word and a link that is no web address are dropped alone",
  );
  assert.deepEqual(
    await kept({ headline: 7, body: ["a"], media_type: "video", link: `https://fb.example/${"x".repeat(1990)}` }),
    { media_type: "video" },
    "a part that is not a string is dropped, and a link past its bound is not cut",
  );
  assert.deepEqual(
    await kept({ headline: "Kept", click_id: "never", ctwa_clid: "never" }),
    { headline: "Kept" },
    "nothing but the four parts is kept: no click id",
  );
  for (const odd of [null, 7, ["headline"], {}])
    assert.deepEqual(
      await kept(odd),
      {},
      `what the ad said as ${JSON.stringify(odd)} is nothing said, and the keep still lands`,
    );
});

test("an entry whose words never arrived says so, and that is how a failed keep is counted", { skip }, async () => {
  const lost = await arrive({ meta: adMeta(`1202${stamp}07`) });
  const fine = await arrive({ meta: adMeta(`1202${stamp}08`) });
  ok(await keep(fine.message_id, {}));
  const count = async (ids) =>
    ok(
      await db
        .from("ad_entries")
        .select("message_id")
        .eq("tenant_id", tenantId)
        .in("message_id", ids)
        .is("said_at", null),
    ).map((e) => e.message_id);
  assert.deepEqual(
    await count([lost.message_id, fine.message_id]),
    [lost.message_id],
    "an ad that said nothing is kept as having said nothing; only the one whose keep never came has no said_at",
  );
});

test("two people combined keep their entries: they follow the one who is kept", { skip: skipMember }, async () => {
  const member = await ownerSession();
  const adId = `1202${stamp}09`;
  // The record that is merged away is the one the ad made, known by its address alone (as merge-people.db's own first
  // case merges an email record into a phone one): the trigger reads a referral on any wire.
  const tapped = await arrive({ channel: "email", meta: adMeta(adId) });
  ok(
    await db
      .from("contacts")
      .update({ email: `tapped.${stamp}@example.com` })
      .eq("id", tapped.contact_id),
  );
  ok(await keep(tapped.message_id, { headline: "Follows the person" }));
  const kept = await arrive();
  ok(await member.rpc("merge_people", { p_keep: kept.contact_id, p_merge: tapped.contact_id }));
  assert.deepEqual(await entriesOf(tapped.contact_id), [], "none left on the row that was merged away");
  assert.deepEqual(
    (await entriesOf(kept.contact_id)).map((e) => [e.message_id, e.platform_ad_id, e.said]),
    [[tapped.message_id, adId, { headline: "Follows the person" }]],
  );
});

test("an erased person's entries go with them, and their count stays", { skip: skipMember }, async () => {
  const member = await ownerSession();
  const adId = `1202${stamp}10`;
  const r = await arrive({ meta: adMeta(adId) });
  ok(await keep(r.message_id, { headline: "Goes with the person" }));
  ok(await member.rpc("erase_contact", { p_contact_id: r.contact_id }));
  assert.deepEqual(await entriesOf(r.contact_id), [], "what the ad said to them is gone with their messages");
  assert.deepEqual(await touchOf(r.contact_id), ["ad", adId], "the count of who an ad brought keeps them (00306)");
});

test(
  "a member reads their workspace's entries and writes none; the door is the service role's",
  { skip: skipMember },
  async () => {
    const member = await ownerSession();
    const r = await arrive({ meta: adMeta(`1202${stamp}11`) });
    const read = ok(await member.from("ad_entries").select("message_id").eq("message_id", r.message_id));
    assert.deepEqual(read, [{ message_id: r.message_id }], "a member reads it");
    const written = await member
      .from("ad_entries")
      .update({ said: { headline: "A member's words" }, said_at: new Date().toISOString() })
      .eq("message_id", r.message_id)
      .select("message_id");
    assert.ok(written.error || written.data.length === 0, "a member's update writes nothing");
    assert.equal((await entriesOf(r.contact_id))[0].said, null);
    assert.ok(
      (await keep(r.message_id, { headline: "A member's words" }, member)).error,
      "and the door refuses a session",
    );
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ok((await keep(r.message_id, {}, anon)).error, "and a visitor");
    const visitor = await anon.from("ad_entries").select("message_id").eq("message_id", r.message_id);
    assert.ok(visitor.error || visitor.data.length === 0, "who reads none either");
  },
);

test(
  "a person an ad's own door added is stamped ad with the ad the event names; any other word is still manual",
  { skip },
  async () => {
    const added = async (data) => {
      const person = ok(
        await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: newPhone() }).select("id").single(),
      );
      ok(
        await db.from("events").insert({
          tenant_id: tenantId,
          kind: "contact.added",
          category: "contact",
          subject_type: "contact",
          subject_id: person.id,
          data,
        }),
      );
      return touchOf(person.id);
    };
    assert.deepEqual(await added({ source: "ad", ad_ref: `meta:1202${stamp}12` }), ["ad", `meta:1202${stamp}12`]);
    assert.deepEqual(await added({ source: "ad" }), ["ad", null], "an ad the event does not name is still an ad");
    assert.deepEqual(await added({ source: "billboard", ad_ref: "meta:1" }), ["manual", null]);
  },
);

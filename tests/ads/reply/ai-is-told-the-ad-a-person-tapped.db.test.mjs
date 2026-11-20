/**
 * AI is told which ad a person tapped, on a real Postgres (decision 0049, call 12; the Ads build plan's step 4, item 7).
 *
 * The writers are the real ones: ingest_inbound takes the message in and its first-touch trigger opens the ad's entry
 * (00644), ad_entry_keep keeps what the ad said as the edge does, and erase_contact erases. The reader is the one every
 * reply is written from (db readLeadContext), with the note it is said in (describeLead). What must hold here, where the
 * fakes cannot say: the entry a real message opened is the one read, by its message; ad_named answers inside its own
 * workspace, so the same ad id next door changes nothing; an Instagram message's tap is read by the same rule; a tap of
 * an older conversation is not told again; and an erased person has no ad left to tell. Runs against the database
 * `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { DAY_MS } from "@chanlytics/contracts";
import { describeLead, readLeadContext } from "@chanlytics/db/conversations";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes people and messages"
      : false;
// Erasing is a member's act: the case that erases signs an owner in.
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the owner this case signs in needs it" : false);

const stamp = Date.now();
const TZ = "America/New_York";
const users = [];
let db;
let tenantId;
let nextDoorId;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const newPhone = () => `+1555016${1000 + ++seq}`;
const adMeta = (id) => ({ raw_type: "text", referral: { source_id: id, source_type: "ad" } });
const makeTenant = async (word) =>
  ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-ad-told-${word}-${stamp}`, name: "Harbor Ad Told" })
      .select("id")
      .single(),
  ).id;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = await makeTenant("a");
  nextDoorId = await makeTenant("b");
});

after(async () => {
  if (skip) return;
  for (const id of [tenantId, nextDoorId].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** An inbound customer message, taken in as the edge takes it in: its meta is what the edge's ingest writes. */
async function arrive({ number, meta = { raw_type: "text" }, channel = "whatsapp", tenant = tenantId, sentAt = null }) {
  seq += 1;
  // An Instagram message names its person by Instagram's own id for them, and carries no number.
  const own = channel === "instagram" ? `igsid${seq}${stamp}` : null;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenant,
      p_channel: channel,
      p_identity_external_id: own ?? number.slice(1),
      p_phone_e164: own ? null : number,
      p_wa_profile_name: null,
      p_message_external_id: `adtold.${stamp}.${seq}`,
      p_type: "text",
      p_body: "Hi, I saw your ad",
      p_channel_ts: sentAt,
      p_media: null,
      p_meta: meta,
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}
const keep = (messageId, adSaid, tenant = tenantId) =>
  db.rpc("ad_entry_keep", { p_tenant_id: tenant, p_message_id: messageId, p_said: adSaid });
const noteOf = (lead, wire = "whatsapp") => describeLead(lead, new Date(), TZ, wire);

test(
  "the first reply after a tap is handed the ad the message's own entry kept, and the same ad id next door changes nothing",
  { skip },
  async () => {
    const adId = `1202${stamp}21`;
    const number = newPhone();
    // Next door a person tapped an ad with the same id, and its entry kept other words.
    const other = await arrive({ number: newPhone(), meta: adMeta(adId), tenant: nextDoorId });
    assert.equal(ok(await keep(other.message_id, { headline: "Next door's offer" }, nextDoorId)), "kept");

    const tap = await arrive({ number, meta: adMeta(adId) });
    assert.equal(
      ok(
        await keep(tap.message_id, {
          headline: "Spring colour offer",
          body: "Book a full colour this week.",
          media_type: "video",
          link: "https://fb.me/example-spring-colour",
        }),
      ),
      "kept",
    );
    const lead = await readLeadContext(db, tenantId, number, 1, tap.message_id);
    // An ad Chanlytics does not hold is named by its newest headline (ad_named), which is said once, as the headline.
    assert.deepEqual(lead.ad, {
      name: null,
      headline: "Spring colour offer",
      body: "Book a full colour this week.",
      media: "video",
    });
    const note = noteOf(lead);
    assert.match(note, /They wrote after tapping one of this business's ads\./);
    assert.match(
      note,
      /<ad>\nheadline: Spring colour offer\nwords: Book a full colour this week\.\nmedia: video\n<\/ad>$/,
    );
    assert.ok(!note.includes("Next door") && !note.includes("fb.me"));

    // Their next message, minutes on, is the same conversation: still told. A person no ad brought is told nothing.
    const second = await arrive({ number });
    assert.equal(
      (await readLeadContext(db, tenantId, number, 1, second.message_id)).ad?.headline,
      "Spring colour offer",
    );
    const plainNumber = newPhone();
    const plain = await arrive({ number: plainNumber });
    assert.equal((await readLeadContext(db, tenantId, plainNumber, 1, plain.message_id)).ad, null);
  },
);

test(
  "a tap of an older conversation is not told again: a day's quiet ends the conversation it began",
  { skip },
  async () => {
    const number = newPhone();
    const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const tap = await arrive({ number, meta: adMeta(`1202${stamp}22`), sentAt: twoDaysAgo });
    ok(await keep(tap.message_id, { headline: "Last week's offer" }));
    assert.equal((await readLeadContext(db, tenantId, number, 1, tap.message_id)).ad?.headline, "Last week's offer");
    const today = await arrive({ number });
    assert.equal((await readLeadContext(db, tenantId, number, 1, today.message_id)).ad, null);
  },
);

test(
  "an Instagram message's tap is read by the same rule: its title and its kind of media, for a person with no number",
  { skip },
  async () => {
    const dm = await arrive({ channel: "instagram", meta: adMeta(`1202${stamp}23`) });
    ok(await keep(dm.message_id, { headline: "Walk-ins welcome", media_type: "image" }));
    const lead = await readLeadContext(db, tenantId, { contactId: dm.contact_id }, 1, dm.message_id);
    assert.deepEqual(lead.ad, { name: null, headline: "Walk-ins welcome", body: null, media: "image" });
    assert.match(noteOf(lead, "instagram"), /<ad>\nheadline: Walk-ins welcome\nmedia: image\n<\/ad>$/);
  },
);

test(
  "an erased person has no ad: the entry went with their messages, and nothing is told",
  { skip: skipMember },
  async () => {
    const email = `ad-told-owner-${stamp}@example.com`;
    const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "owner" }));
    const member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await member.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null, signedIn.error?.message);

    const number = newPhone();
    const tap = await arrive({ number, meta: adMeta(`1202${stamp}24`) });
    ok(await keep(tap.message_id, { headline: "Goes with the person" }));
    assert.equal((await readLeadContext(db, tenantId, number, 1, tap.message_id)).ad?.headline, "Goes with the person");

    ok(await member.rpc("erase_contact", { p_contact_id: tap.contact_id }));
    for (const lead of [
      await readLeadContext(db, tenantId, number, 1, tap.message_id),
      await readLeadContext(db, tenantId, { contactId: tap.contact_id }, 1, tap.message_id),
    ]) {
      assert.equal(lead.ad ?? null, null);
      assert.ok(!/tapping|<ad>/.test(noteOf(lead)));
    }
  },
);

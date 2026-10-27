/**
 * An Instagram DM is kept as a message of its own wire -- on a real database (decision 0001, step 8, 00486).
 *
 * What reading the migration cannot prove: a DM is a message (messages.channel takes 'instagram'), its person is made by
 * their Instagram-scoped id alone and never joined to anyone by a name, they first came from Instagram (or from the ad
 * they tapped), their thread keeps its own DM clock and the accessor reads it, People says they came from Instagram, a
 * START by DM lifts a stop and covers no other wire, a DM the person unsends loses its words and is never answered after,
 * and the token sweep's clock is registered. Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
const made = [];
const stamp = Date.now().toString(36);
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

async function workspace(slug) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${stamp}`, name: slug })
      .select("id")
      .single(),
  );
  made.push(t.id);
  return t.id;
}

/** A DM taken in as the edge's door takes one: the person by their Instagram-scoped id, no number, at the DM's time. */
async function dm(tenantId, igsid, at, over = {}) {
  n += 1;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: "instagram",
      p_identity_external_id: igsid,
      p_phone_e164: null,
      p_wa_profile_name: "Dana Ruiz",
      p_message_external_id: `ig.${stamp}.${n}`,
      p_type: "text",
      p_body: "Do you have Saturday?",
      p_channel_ts: at,
      p_media: null,
      p_meta: {},
      p_opt_out: false,
      p_opt_in: false,
      ...over,
    }),
  );
}

const T = (minutes) => new Date(Date.UTC(2026, 9, 27, 12, minutes)).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of made) await db.from("tenants").delete().eq("id", id);
});

test(
  "a DM is a message of its own wire, its person made by their Instagram id alone, first come from Instagram",
  { skip },
  async () => {
    const t = await workspace("ig-dm-kept");
    const igsid = `61${stamp}01`;
    const first = await dm(t, igsid, T(1));
    assert.equal(first.is_new, true);
    const row = ok(
      await db.from("messages").select("channel, direction, sender, body").eq("id", first.message_id).single(),
    );
    assert.deepEqual(row, {
      channel: "instagram",
      direction: "inbound",
      sender: "customer",
      body: "Do you have Saturday?",
    });
    const person = ok(
      await db.from("contacts").select("phone_e164, wa_profile_name, acquired_via").eq("id", first.contact_id).single(),
    );
    assert.deepEqual(person, { phone_e164: null, wa_profile_name: "Dana Ruiz", acquired_via: "instagram" });
    const ids = ok(
      await db.from("contact_identities").select("channel, external_id").eq("contact_id", first.contact_id),
    );
    assert.deepEqual(ids, [{ channel: "instagram", external_id: igsid }]);
    // The same person writes again: found by their id, one thread.
    const again = await dm(t, igsid, T(2));
    assert.equal(again.contact_id, first.contact_id);
    assert.equal(again.conversation_id, first.conversation_id);
    // Someone else of the same name is someone else: a name alone never joins two people.
    const other = await dm(t, `61${stamp}02`, T(3));
    assert.notEqual(other.contact_id, first.contact_id);
  },
);

test("a DM from a click-to-Instagram ad first came from that ad", { skip }, async () => {
  const t = await workspace("ig-dm-ad");
  const ing = await dm(t, `61${stamp}03`, T(1), {
    p_meta: { referral: { source_id: "120200000000000001", source_type: "ad" } },
  });
  const person = ok(await db.from("contacts").select("acquired_via, acquired_ref").eq("id", ing.contact_id).single());
  assert.deepEqual(person, { acquired_via: "ad", acquired_ref: "120200000000000001" });
});

test("the thread keeps its own DM clock, read through its accessor, apart from WhatsApp's", { skip }, async () => {
  const t = await workspace("ig-dm-clock");
  const ing = await dm(t, `61${stamp}04`, T(5));
  const c = ok(
    await db
      .from("conversations")
      .select("last_ig:last_inbound_on_instagram, last_wa:last_inbound_on_whatsapp, last_wa_inbound_at")
      .eq("id", ing.conversation_id)
      .single(),
  );
  assert.equal(new Date(c.last_ig).toISOString(), T(5));
  assert.equal(c.last_wa, null, "a DM never opens WhatsApp's window");
  assert.equal(c.last_wa_inbound_at, null);
  // A late, replayed DM never rewinds it.
  await dm(t, `61${stamp}04`, T(1));
  const after = ok(
    await db.from("conversations").select("last_ig:last_inbound_on_instagram").eq("id", ing.conversation_id).single(),
  );
  assert.equal(new Date(after.last_ig).toISOString(), T(5));
});

test("People says a DM's person came from Instagram, and that they last wrote there", { skip }, async () => {
  const t = await workspace("ig-dm-people");
  const ing = await dm(t, `61${stamp}05`, T(1));
  const [row] = ok(await db.rpc("people_list", { p_tenant_id: t, p_contact_id: ing.contact_id }));
  assert.equal(row.came_from, "instagram");
  assert.equal(row.last_inbound_channel, "instagram");
  assert.ok(row.message_channels.includes("instagram"));
});

test(
  "a stop by DM stops, and a START by DM lifts it while covering no wire a conversation is started on",
  { skip },
  async () => {
    const t = await workspace("ig-dm-consent");
    const igsid = `61${stamp}06`;
    const stop = await dm(t, igsid, T(1), { p_body: "STOP", p_opt_out: true });
    let person = ok(await db.from("contacts").select("consent, dnc").eq("id", stop.contact_id).single());
    assert.deepEqual(person, { consent: "opted_out", dnc: true });
    await dm(t, igsid, T(2), { p_body: "START", p_opt_in: true });
    person = ok(await db.from("contacts").select("consent, dnc, consent_channels").eq("id", stop.contact_id).single());
    assert.equal(person.consent, "opted_in");
    assert.equal(person.dnc, false);
    assert.deepEqual(person.consent_channels, [], "a DM is no yes for WhatsApp, a text or an email");
  },
);

test(
  "a DM the person unsends keeps that it came and loses what it said, and is never answered after",
  { skip },
  async () => {
    const t = await workspace("ig-dm-unsent");
    const ing = await dm(t, `61${stamp}07`, T(1), {
      p_media: { url: "https://lookaside.fbsbx.com/x", fetch_state: "stored", storage_path: "t/c/m.jpg" },
    });
    const id = ok(await db.from("messages").select("external_id").eq("id", ing.message_id).single()).external_id;
    ok(
      await db.from("jobs").insert({
        tenant_id: t,
        kind: "inbound_answer",
        due_at: new Date().toISOString(),
        payload: {
          message_id: ing.message_id,
          ig: { account: "1", item: { message: { mid: id, text: "secret words" } } },
        },
      }),
    );
    const out = ok(await db.rpc("message_unsent", { p_tenant_id: t, p_external_id: id }));
    assert.equal(out.outcome, "forgot");
    assert.equal(out.storage_path, "t/c/m.jpg");
    const m = ok(await db.from("messages").select("body, media, meta").eq("id", ing.message_id).single());
    assert.equal(m.body, null);
    assert.equal(m.media, null);
    assert.ok(m.meta.unsent_at && m.meta.processed_at, "kept as unsent, and finished with");
    const [job] = ok(await db.from("jobs").select("payload").eq("tenant_id", t).eq("kind", "inbound_answer"));
    assert.equal(job.payload.ig.item.message.text, undefined, "its job keeps the words no longer");
    // Anything else is nothing to forget: another wire's message, or an id no DM here holds.
    assert.equal(ok(await db.rpc("message_unsent", { p_tenant_id: t, p_external_id: "nobody" })).outcome, "none");
    // The guard's one exception is that write: a DM's words changed any other way, or blanked without being unsent, are
    // refused as every message's are.
    const kept = await dm(t, `61${stamp}08`, T(2));
    const rewritten = await db.from("messages").update({ body: "other words" }).eq("id", kept.message_id);
    assert.match(rewritten.error?.message ?? "", /immutable/);
    const blanked = await db.from("messages").update({ body: null }).eq("id", kept.message_id);
    assert.match(blanked.error?.message ?? "", /immutable/);
  },
);

test("the token sweep's clock is registered and scheduled", { skip }, async () => {
  const [s] = ok(await db.from("sweep_status").select("jobname, judged_by").eq("sweep", "instagram_tokens"));
  assert.deepEqual(s, { jobname: "instagram-token-sweep", judged_by: "request" });
});

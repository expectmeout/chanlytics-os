/**
 * Their own message is one they sent -- on a real database.
 *
 * 00137 makes both consent doors judge an answer a signed-in member records
 * "in their own message": it must name an inbound message this person sent
 * this workspace, with words in it, and the door copies the message's id, its
 * wire, the provider's id and the words into the event. Whose message it is,
 * which way it travelled and what the event then holds are what reading
 * source cannot prove, so these run against Postgres in the database
 * workflow; skipped without a local database.
 *
 * The edge, holding the service key, records a texted answer with the
 * evidence it hands in (00110), and that is unchanged: its last test says so.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { OWN_MESSAGE_REFUSALS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database, or no anon key to sign in with, in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
const made = { tenants: [], users: [] };
const stamp = Date.now().toString(36);
const PASSWORD = "a-long-test-password-1";
let n = 0;

async function workspace(slug) {
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `${slug}-${stamp}`, name: slug })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  made.tenants.push(data.id);
  return data.id;
}
/** A signed-in member of one workspace, as the dashboard's session client is. */
async function member(tenantId, role) {
  const email = `own-message-${role}-${stamp}-${made.users.length}@example.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  made.users.push(data.user.id);
  const { error: mErr } = await db.from("memberships").insert({ tenant_id: tenantId, user_id: data.user.id, role });
  if (mErr) throw new Error(mErr.message);
  const as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await as.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw new Error(sErr.message);
  return { as, userId: data.user.id };
}
/** A customer's message, taken in the way the edge takes one: the person, their thread and the message. */
async function inbound(tenantId, phone, over = {}) {
  n += 1;
  const { data, error } = await db.rpc("ingest_inbound", {
    p_tenant_id: tenantId,
    p_channel: "whatsapp",
    p_identity_external_id: phone.replace(/\D/g, ""),
    p_phone_e164: phone,
    p_wa_profile_name: null,
    p_message_external_id: `wamid.${stamp}.${n}`,
    p_type: "text",
    p_body: "hello",
    p_channel_ts: new Date().toISOString(),
    p_media: null,
    p_meta: {},
    p_opt_out: false,
    p_opt_in: false,
    ...over,
  });
  if (error) throw new Error(error.message);
  return {
    contactId: data.contact_id,
    conversationId: data.conversation_id,
    messageId: data.message_id,
    externalId: `wamid.${stamp}.${n}`,
  };
}
/** A row written into a thread directly: a reply, a call's note, a message imported from before Postgres. */
async function written(tenantId, into, row) {
  const { data, error } = await db
    .from("messages")
    .insert({
      tenant_id: tenantId,
      conversation_id: into.conversationId,
      contact_id: into.contactId,
      channel: "whatsapp",
      type: "text",
      ...row,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
async function answers(contactId) {
  const { data, error } = await db
    .from("contacts")
    .select("consent, consent_source, dnc, marketing_consent, marketing_consent_source")
    .eq("id", contactId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}
async function consentEvents(tenantId, contactId) {
  const { data, error } = await db
    .from("events")
    .select("data, created_at")
    .eq("tenant_id", tenantId)
    .eq("kind", "contact.consent_changed")
    .eq("subject_id", contactId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data.map((e) => e.data);
}
const visitDoor = (as, contactId, over = {}) =>
  as.rpc("set_contact_consent", {
    p_contact_id: contactId,
    p_consent: "opted_in",
    p_source: "customer_message",
    ...over,
  });
const offersDoor = (as, tenantId, contactId, over = {}) =>
  as.rpc("set_marketing_consent", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_consent: "opted_in",
    p_source: "customer_message",
    ...over,
  });
const UNTOUCHED = {
  consent: "unknown",
  consent_source: null,
  dnc: false,
  marketing_consent: "unknown",
  marketing_consent_source: null,
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of made.tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of made.users) await db.auth.admin.deleteUser(id);
});

test(
  "their own message, recorded at the desk with no message named, is refused by both doors in the owner's words, and nothing is written",
  { skip },
  async () => {
    const t = await workspace("own-none");
    const op = await member(t, "operator");
    const maria = await inbound(t, "+15550137001");
    for (const consent of ["opted_in", "opted_out"]) {
      const { error: visit } = await visitDoor(op.as, maria.contactId, { p_consent: consent });
      assert.deepEqual(
        [visit?.code, visit?.message],
        ["22023", OWN_MESSAGE_REFUSALS.missing],
        `the visit door, ${consent}`,
      );
      const { error: offers } = await offersDoor(op.as, t, maria.contactId, { p_consent: consent });
      assert.deepEqual(
        [offers?.code, offers?.message],
        ["22023", OWN_MESSAGE_REFUSALS.missing],
        `the offers door, ${consent}`,
      );
    }
    assert.deepEqual(await answers(maria.contactId), UNTOUCHED);
    assert.deepEqual(await consentEvents(t, maria.contactId), [], "and the ledger holds no answer");
  },
);

test(
  "a message that is not one this person sent -- somebody else's, one we sent, a call's note, another workspace's -- is refused as not theirs, and one with no words as having none",
  { skip },
  async () => {
    const [t, far] = [await workspace("own-theirs"), await workspace("own-far")];
    const op = await member(t, "operator");
    const maria = await inbound(t, "+15550137011");
    const ana = await inbound(t, "+15550137012");
    const elsewhere = await inbound(far, "+15550137011");
    const ours = await written(t, maria, {
      direction: "outbound",
      sender: "ai",
      status: "sent",
      body: "Would you like our offers?",
    });
    const staff = await written(t, maria, {
      direction: "outbound",
      sender: "human",
      status: "sent",
      body: "Reply YES and we will add you.",
    });
    const call = await written(t, maria, {
      channel: "voice",
      direction: "inbound",
      sender: "system",
      type: "call_summary",
      status: "received",
      body: "Inbound call · 2 min — said yes to offers",
      external_id: `call:${stamp}`,
    });
    const photo = await inbound(t, "+15550137011", {
      p_type: "media",
      p_body: null,
      p_media: { mime_type: "image/jpeg" },
    });

    const notTheirs = [
      ["another person's", ana.messageId],
      ["one we sent", ours],
      ["one staff sent", staff],
      ["a call's note", call],
      ["another workspace's", elsewhere.messageId],
      ["one that never existed", "00000000-0000-4000-8000-000000000137"],
    ];
    for (const [what, id] of notTheirs) {
      const { error: visit } = await visitDoor(op.as, maria.contactId, { p_message_id: id });
      assert.deepEqual(
        [visit?.code, visit?.message],
        ["22023", OWN_MESSAGE_REFUSALS.notTheirs],
        `the visit door, ${what}`,
      );
      const { error: offers } = await offersDoor(op.as, t, maria.contactId, { p_message_id: id });
      assert.deepEqual(
        [offers?.code, offers?.message],
        ["22023", OWN_MESSAGE_REFUSALS.notTheirs],
        `the offers door, ${what}`,
      );
    }
    const { error: visitPhoto } = await visitDoor(op.as, maria.contactId, { p_message_id: photo.messageId });
    assert.deepEqual(
      [visitPhoto?.code, visitPhoto?.message],
      ["22023", OWN_MESSAGE_REFUSALS.wordless],
      "a photo with nothing written on it",
    );
    const { error: offersPhoto } = await offersDoor(op.as, t, maria.contactId, { p_message_id: photo.messageId });
    assert.deepEqual([offersPhoto?.code, offersPhoto?.message], ["22023", OWN_MESSAGE_REFUSALS.wordless]);

    assert.deepEqual(await answers(maria.contactId), UNTOUCHED, "nothing was written for Maria");
    assert.deepEqual(await consentEvents(t, maria.contactId), []);
    assert.deepEqual(await answers(ana.contactId), UNTOUCHED, "nor for Ana, whose message it was");
  },
);

test(
  "a message they sent: both doors record the answer, and the evidence is the message's id, its wire, the provider's id and their words",
  { skip },
  async () => {
    const t = await workspace("own-yes");
    const op = await member(t, "operator");
    const first = await inbound(t, "+15550137021", { p_body: "  Yes, you can\ntext me   about my visits  " });
    const long = "Yes please add me to the offers list, and my sister too if you can, she comes on Fridays";
    const second = await inbound(t, "+15550137021", { p_body: long });

    const { data: visit, error: vErr } = await visitDoor(op.as, first.contactId, { p_message_id: first.messageId });
    assert.equal(vErr, null, vErr?.message);
    assert.deepEqual([visit.consent, visit.source, visit.dnc], ["opted_in", "customer_message", false]);
    const { data: offers, error: oErr } = await offersDoor(op.as, t, first.contactId, {
      p_message_id: second.messageId,
      p_note: "pointed at the message at the desk",
    });
    assert.equal(oErr, null, oErr?.message);
    assert.equal(offers.marketing_consent, "opted_in");

    assert.deepEqual(await answers(first.contactId), {
      consent: "opted_in",
      consent_source: "customer_message",
      dnc: false,
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
    });
    const [v, o] = await consentEvents(t, first.contactId);
    assert.deepEqual(
      [v.consent, v.source, v.by, v.message_id, v.channel, v.message_external_id, v.words],
      [
        "opted_in",
        "customer_message",
        op.userId,
        first.messageId,
        "whatsapp",
        first.externalId,
        "Yes, you can text me about my visits",
      ],
      "who recorded it, and the message it rests on: the words on one line, as the desk was shown them",
    );
    assert.deepEqual(
      [o.purpose, o.consent, o.source, o.note, o.message_id, o.channel, o.message_external_id, o.words],
      [
        "marketing",
        "opted_in",
        "customer_message",
        "pointed at the message at the desk",
        second.messageId,
        "whatsapp",
        second.externalId,
        long.slice(0, 80),
      ],
      "eighty characters of their words, as 00110 keeps a texted answer's",
    );
  },
);

test(
  "a photo's caption is words they wrote; a message from before Postgres has no provider id to keep, and the evidence says none rather than the number it was filed under",
  { skip },
  async () => {
    const t = await workspace("own-kinds");
    const op = await member(t, "operator");
    const photo = await inbound(t, "+15550137031", {
      p_type: "media",
      p_body: null,
      p_media: { mime_type: "image/jpeg", caption: "  my signed slip, yes to offers " },
    });
    const { error: pErr } = await offersDoor(op.as, t, photo.contactId, { p_message_id: photo.messageId });
    assert.equal(pErr, null, pErr?.message);
    const imported = await written(t, photo, {
      direction: "inbound",
      sender: "customer",
      status: "received",
      body: "yes to reminders",
      external_id: `backfill:15550137031:${stamp}`,
      meta: { backfill: true },
    });
    const { error: bErr } = await visitDoor(op.as, photo.contactId, { p_message_id: imported });
    assert.equal(bErr, null, bErr?.message);
    const [o, v] = await consentEvents(t, photo.contactId);
    assert.deepEqual(
      [o.message_id, o.words, o.message_external_id],
      [photo.messageId, "my signed slip, yes to offers", photo.externalId],
    );
    assert.deepEqual(
      [v.message_id, v.words, v.message_external_id],
      [imported, "yes to reminders", null],
      "an import key names the customer's number, and consent evidence outlives an erasure",
    );
  },
);

test(
  "a session hands the door no evidence of its own, and names a message only for an answer given in one",
  { skip },
  async () => {
    const t = await workspace("own-forged");
    const op = await member(t, "operator");
    const maria = await inbound(t, "+15550137041");
    const { error: forged } = await offersDoor(op.as, t, maria.contactId, {
      p_source: "form",
      p_evidence: { channel: "whatsapp", message_external_id: "wamid.made-up", words: "YES OFFERS" },
    });
    assert.equal(forged?.code, "22023", "evidence is read from a message, never written by a member");
    const { error: forgedToo } = await offersDoor(op.as, t, maria.contactId, {
      p_message_id: maria.messageId,
      p_evidence: { words: "YES OFFERS" },
    });
    assert.equal(forgedToo?.code, "22023", "not even beside a real message");
    for (const source of ["form", "in_person"]) {
      const { error: visit } = await visitDoor(op.as, maria.contactId, {
        p_source: source,
        p_message_id: maria.messageId,
      });
      assert.deepEqual(
        [visit?.code, visit?.message],
        ["22023", OWN_MESSAGE_REFUSALS.notOwnMessage],
        `the visit door, ${source}`,
      );
    }
    const { error: offers } = await offersDoor(op.as, t, maria.contactId, {
      p_source: "form",
      p_message_id: maria.messageId,
    });
    assert.deepEqual([offers?.code, offers?.message], ["22023", OWN_MESSAGE_REFUSALS.notOwnMessage]);
    assert.deepEqual(await answers(maria.contactId), UNTOUCHED);

    // A form stays a form: no message, and the note that says which.
    const { error: slip } = await offersDoor(op.as, t, maria.contactId, { p_source: "form", p_note: "slip 12" });
    assert.equal(slip, null, slip?.message);
    const [e] = await consentEvents(t, maria.contactId);
    assert.deepEqual([e.source, e.note, e.message_id ?? null, e.words ?? null], ["form", "slip 12", null, null]);
  },
);

test("the doors still answer only a member who may act here, whatever message is named", { skip }, async () => {
  const [t, far] = [await workspace("own-who"), await workspace("own-who-far")];
  const viewer = await member(t, "viewer");
  const rival = await member(far, "owner");
  const maria = await inbound(t, "+15550137051");
  for (const [who, m] of [
    ["a viewer", viewer],
    ["an owner elsewhere", rival],
  ]) {
    assert.equal(
      (await visitDoor(m.as, maria.contactId, { p_message_id: maria.messageId })).error?.code,
      "P0002",
      `${who}: the visit door reads them as a stranger`,
    );
    assert.equal(
      (await offersDoor(m.as, t, maria.contactId, { p_message_id: maria.messageId })).error?.code,
      "42501",
      `${who}: the offers door refuses them`,
    );
  }
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  assert.ok(
    (await visitDoor(anon, maria.contactId, { p_message_id: maria.messageId })).error,
    "a signed-out caller cannot run the visit door",
  );
  assert.ok(
    (await offersDoor(anon, t, maria.contactId, { p_message_id: maria.messageId })).error,
    "nor the offers door",
  );
  assert.deepEqual(await answers(maria.contactId), UNTOUCHED);
});

test(
  "the edge is unchanged: the service key records a texted YES OFFERS with the evidence it hands in, names no message, and the older call without evidence still resolves",
  { skip },
  async () => {
    const t = await workspace("own-edge");
    const maria = await inbound(t, "+15550137061", { p_body: "YES OFFERS" });
    const texted = { channel: "whatsapp", message_external_id: maria.externalId, words: "YES OFFERS" };
    const { error } = await db.rpc("set_marketing_consent", {
      p_tenant_id: t,
      p_contact_id: maria.contactId,
      p_consent: "opted_in",
      p_source: "customer_message",
      p_note: null,
      p_evidence: texted,
    });
    assert.equal(error, null, error?.message);
    const { error: older } = await db.rpc("set_marketing_consent", {
      p_tenant_id: t,
      p_contact_id: maria.contactId,
      p_consent: "opted_out",
      p_source: "customer_message",
      p_note: null,
    });
    assert.equal(
      older,
      null,
      "the fallback the edge keeps for a schema without p_evidence still resolves, and needs no message",
    );
    const events = await consentEvents(t, maria.contactId);
    assert.deepEqual(
      events,
      [
        { purpose: "marketing", consent: "opted_in", source: "customer_message", note: null, ...texted },
        { purpose: "marketing", consent: "opted_out", source: "customer_message", note: null },
      ],
      "the event is exactly what 00110 wrote: no message id, no member",
    );
    // START by text still keeps its evidence through the ingest (00110).
    const start = await inbound(t, "+15550137061", { p_body: "START", p_opt_in: true });
    const last = (await consentEvents(t, maria.contactId)).at(-1);
    assert.deepEqual(
      [last.consent, last.source, last.channel, last.message_external_id, last.words],
      ["opted_in", "customer_message", "whatsapp", start.externalId, "START"],
    );
  },
);

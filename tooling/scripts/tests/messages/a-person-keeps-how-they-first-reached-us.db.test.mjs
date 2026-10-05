/**
 * 00288 on a real Postgres: a person keeps how they first reached the workspace (the Reports lenses spec, K3), written
 * once, by the message or call that made them. The touch that made a person is told by their own row, written in the
 * same transaction (one now(): their created_at is the message's), so a person who existed before it, a redelivered
 * message and a later touch stamp nothing; a stamp that cannot be written costs nobody their message. The writers are
 * the real ones: ingest_inbound and ingest_call, whose bodies this change does not restate. A call counts as
 * call_connected says (phase A's one predicate), not by a list of its own, at the moment it first does: on its first row,
 * or on the update that first makes it connected (a call whose first row is `registered`). The first message of a person
 * arrives with the channel timestamp the edge always sends, minutes old when a delivery is late, because the rule rests on
 * created_at and never on that. An erased person keeps the first touch. Runs against the database `supabase start`
 * builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { REFERRAL_ID_MAX } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes people, messages and calls"
      : false;

// Erasure is a member's act (00151 erase_contact asks for a session): the case that erases signs an owner in.
const skipErase = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the owner the erasure case signs in needs it" : false);

const stamp = Date.now();
const agent = `agent_first_touch_${stamp}`;
const users = [];
let owner;
let db;
let tenantId;
let waLine;
let voiceLine;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const newPhone = () => `+1555013${9100 + ++seq}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-first-touch-${stamp}`, name: "Harbor First Touch" })
      .select("id")
      .single(),
  ).id;
  waLine = ok(
    await db
      .from("tenant_channels")
      .insert({ tenant_id: tenantId, kind: "whatsapp", external_id: `pn-${stamp}` })
      .select("id")
      .single(),
  ).id;
  voiceLine = ok(
    await db
      .from("tenant_channels")
      .insert({ tenant_id: tenantId, kind: "voice", external_id: agent })
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

/** A workspace owner, signed in: made once, for the one case that erases. */
async function ownerSession() {
  if (owner) return owner;
  const email = `first-touch-owner-${stamp}@example.com`;
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

/**
 * An inbound customer message, taken in as the edge takes it in; its meta is what Task 5's pgIngest writes, and its
 * `channelTs` is the provider's own timestamp of the message, which the edge sends on every real one (null only here, by default).
 */
async function arrive({ channel = "whatsapp", meta, number = newPhone(), external, channelTs = null } = {}) {
  seq += 1;
  const mail = channel === "email";
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: channel,
      p_identity_external_id: mail ? `guest${seq}@example.com` : number.slice(1),
      p_phone_e164: mail ? null : number,
      p_wa_profile_name: null,
      p_message_external_id: external ?? `ft.${stamp}.${seq}`,
      p_type: "text",
      p_body: "hello",
      p_channel_ts: channelTs,
      p_media: null,
      p_meta: meta ?? { raw_type: "text", line: waLine },
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}
/** A call event as the webhook ingests it. */
const call = (id, status, from, durationMs = null, direction = "inbound") =>
  db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: `ft-${id}-${stamp}`,
    p_agent_id: agent,
    p_from_e164: from,
    p_from_raw: from,
    p_to_e164: null,
    p_direction: direction,
    p_call_type: "phone_call",
    p_status: status,
    p_started_at: new Date().toISOString(),
    p_ended_at: null,
    p_duration_ms: durationMs,
    p_disconnection: null,
    p_sentiment: null,
    p_successful: null,
    p_in_voicemail: false,
    p_summary: null,
    p_transcript: null,
    p_transcript_obj: null,
    p_recording: null,
    p_public_log_url: null,
    p_cost: {},
    p_latency: {},
    p_raw: {},
  });
const touchOf = async (contactId) => {
  const c = ok(await db.from("contacts").select("acquired_via, acquired_ref").eq("id", contactId).single());
  return [c.acquired_via, c.acquired_ref];
};
const door = (id, via, ref = null, madeAt = null) =>
  db.rpc("person_set_first_touch", {
    p_tenant_id: tenantId,
    p_contact_id: id,
    p_via: via,
    p_ref: ref,
    p_made_at: madeAt,
  });

test(
  "the message that made the person is their first touch: its wire, and the line it came in on",
  { skip },
  async () => {
    const chat = await arrive();
    assert.deepEqual(await touchOf(chat.contact_id), ["whatsapp", waLine]);
    const text = await arrive({ channel: "sms", meta: { raw_type: "text" } });
    assert.deepEqual(await touchOf(text.contact_id), ["sms", null], "a text names no line unless the edge did");
    const mail = await arrive({ channel: "email", meta: { raw_type: "text" } });
    assert.deepEqual(await touchOf(mail.contact_id), ["email", null], "an email names no line");
  },
);

test(
  "a late delivery is still their first touch: the rule rests on created_at, never on the provider's timestamp of the message",
  { skip },
  async () => {
    // Meta redelivers for days and the edge sends its timestamp on every message, so a person's first message can be
    // minutes old when it arrives. The row's created_at is the instant the database took it in, which is also the
    // person's: the provider's timestamp is its own column and plays no part.
    const sentAt = new Date(Date.now() - 12 * 60_000).toISOString();
    const late = await arrive({ channelTs: sentAt });
    assert.equal(late.is_new, true);
    assert.deepEqual(await touchOf(late.contact_id), ["whatsapp", waLine], "the first touch still lands");
    const message = ok(await db.from("messages").select("channel_ts, created_at").eq("id", late.message_id).single());
    const person = ok(await db.from("contacts").select("created_at").eq("id", late.contact_id).single());
    assert.equal(Date.parse(message.channel_ts), Date.parse(sentAt), "the provider's timestamp is kept as it came");
    assert.ok(
      Date.parse(message.created_at) - Date.parse(message.channel_ts) > 10 * 60_000,
      "and is far from created_at, which is when the database took it in",
    );
    assert.equal(
      person.created_at,
      message.created_at,
      "the person and their first message are one transaction's now()",
    );
  },
);

test(
  "a click-to-chat ad is the first touch of the person it brought, by the ad's id; a referral that names none is not one",
  { skip },
  async () => {
    const ad = await arrive({
      meta: { raw_type: "text", line: waLine, referral: { source_id: "120200000000001", source_type: "ad" } },
    });
    assert.deepEqual(await touchOf(ad.contact_id), ["ad", "120200000000001"]);
    const blank = await arrive({ meta: { raw_type: "text", line: waLine, referral: { source_id: "  " } } });
    assert.deepEqual(await touchOf(blank.contact_id), ["whatsapp", waLine]);
  },
);

test(
  "only an ad is an ad: a post, a referral of no kind and a kind nobody declared are stamped by their wire, as a message with no referral is",
  { skip },
  async () => {
    for (const [what, referral] of [
      ["a post", { source_id: "120200000000010", source_type: "post" }],
      ["a referral of no kind", { source_id: "120200000000011" }],
      ["a referral whose kind is null", { source_id: "120200000000012", source_type: null }],
      ["a kind nobody declared", { source_id: "120200000000013", source_type: "story" }],
    ]) {
      const r = await arrive({ meta: { raw_type: "text", line: waLine, referral } });
      assert.deepEqual(
        await touchOf(r.contact_id),
        ["whatsapp", waLine],
        `${what}: the wire's touch, on the line it came in on`,
      );
    }
  },
);

test(
  "the first value wins: a later touch on another wire changes nothing, and a redelivered first message makes no one",
  { skip },
  async () => {
    const number = newPhone();
    const external = `ft.redelivered.${stamp}`;
    const first = await arrive({ number, external });
    const later = await arrive({ number, channel: "sms", meta: { raw_type: "text" } });
    assert.equal(later.contact_id, first.contact_id, "the same person");
    assert.deepEqual(await touchOf(first.contact_id), ["whatsapp", waLine]);
    const again = await arrive({ number, external });
    assert.equal(again.is_new, false, "a redelivery");
    assert.deepEqual(await touchOf(first.contact_id), ["whatsapp", waLine]);
  },
);

test("a person who existed before the message is not stamped by it: unknown stays unknown", { skip }, async () => {
  const number = newPhone();
  const old = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: number }).select("id").single());
  const r = await arrive({ number });
  assert.equal(r.contact_id, old.id);
  assert.deepEqual(await touchOf(old.id), [null, null]);
});

test(
  "a person a lead names who then writes first: the lead's own event is written before their message, so the lead is their first touch and the message finds it taken, written once",
  { skip },
  async () => {
    // contacts_link_lead (00140) runs inside ingest_inbound, between the person's insert and the message's: it converts
    // the lead onto the person and writes their contact.added event, whose source is `lead`. 00289's trigger
    // (events_note_first_touch) reads that event as it is written, so the order of the writers in that transaction is the
    // lead's event, then the message: the lead stands and the message finds the touch taken (People's came_from reads a
    // lead first, too). That conversion's event names no lead id, so the ref is null.
    const number = newPhone();
    const lead = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: tenantId,
          place_id: `ft-lead-${stamp}-${seq}`,
          business_name: "Made-up Salon",
          phone_e164: number,
        })
        .select("id")
        .single(),
    );
    const first = await arrive({ number });
    const converted = ok(await db.from("leads").select("contact_id, stage").eq("id", lead.id).single());
    assert.deepEqual(
      [converted.contact_id, converted.stage],
      [first.contact_id, "converted"],
      "the lead is this person: the lead conversion did run, in the same transaction as their message",
    );
    const added = ok(
      await db.from("events").select("data").eq("subject_id", first.contact_id).eq("kind", "contact.added"),
    );
    assert.deepEqual(
      added.map((e) => e.data.source),
      ["lead"],
      "and said so, once, in the event 00289 reads",
    );
    assert.deepEqual(
      await touchOf(first.contact_id),
      ["lead", null],
      "the lead's event came first and wrote it; the message, whose own wire would have been whatsapp, found it taken",
    );
    await arrive({ number, channel: "sms", meta: { raw_type: "text" } });
    assert.deepEqual(await touchOf(first.contact_id), ["lead", null], "written once: a second touch changes nothing");
  },
);

test(
  "a stamp that cannot be written costs the person's message nothing: it lands, and the person has no first touch",
  { skip },
  async () => {
    const r = await arrive({ meta: { raw_type: "text", line: "x".repeat(300) } });
    const message = ok(await db.from("messages").select("id, direction").eq("id", r.message_id).single());
    assert.equal(message.direction, "inbound", "the message is on record");
    assert.deepEqual(
      await touchOf(r.contact_id),
      [null, null],
      "an id no line has is no stamp, and a warning in the database's log",
    );
  },
);

test(
  "a call that connected is its caller's first touch, on the line it rang; one that never did, and a person who existed, are not",
  { skip },
  async () => {
    const from = newPhone();
    const rang = ok(await call("a", "ongoing", from));
    assert.deepEqual(await touchOf(rang.contact_id), ["call", voiceLine]);
    ok(await call("a", "ended", from));
    assert.deepEqual(
      await touchOf(rang.contact_id),
      ["call", voiceLine],
      "a later event of the same call changes nothing",
    );

    const missedNumber = newPhone();
    const missed = ok(await call("b", "not_connected", missedNumber));
    assert.deepEqual(await touchOf(missed.contact_id), [null, null], "a call that never connected is no first touch");
    const spoke = await arrive({ number: missedNumber });
    assert.equal(spoke.contact_id, missed.contact_id);
    assert.deepEqual(
      await touchOf(missed.contact_id),
      [null, null],
      "and the message that follows did not make them: unknown stays unknown, read as before",
    );

    const old = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: newPhone() })
        .select("id, phone_e164")
        .single(),
    );
    const ringing = ok(await call("c", "ended", old.phone_e164));
    assert.equal(ringing.contact_id, old.id);
    assert.deepEqual(await touchOf(old.id), [null, null], "a person who existed is not made by a call");
  },
);

test(
  "a call counts as call_connected says: an error after it had a length is a first touch, an error with none is not",
  { skip },
  async () => {
    const spoke = ok(await call("d", "error", newPhone(), 4000));
    assert.deepEqual(await touchOf(spoke.contact_id), ["call", voiceLine], "it errored after someone spoke");
    const nothing = ok(await call("e", "error", newPhone(), 0));
    assert.deepEqual(await touchOf(nothing.contact_id), [null, null], "a duration of nothing is no one speaking");
    const unknown = ok(await call("f", "error", newPhone()));
    assert.deepEqual(await touchOf(unknown.contact_id), [null, null], "a duration nobody knows is no one speaking");
  },
);

/** The stamp taken off a person, so that the next event of their call shows whether the trigger even tries (it must not). */
const clearTouch = async (id) =>
  ok(await db.from("contacts").update({ acquired_via: null, acquired_ref: null }).eq("id", id));

test(
  "a call whose first row is registered is its caller's first touch the moment it connects: on the update, once, and not before",
  { skip },
  async () => {
    const from = newPhone();
    const rang = ok(await call("h", "registered", from));
    assert.equal(rang.is_new, true);
    assert.deepEqual(await touchOf(rang.contact_id), [null, null], "ringing is not a conversation yet");
    ok(await call("h", "ongoing", from));
    assert.deepEqual(
      await touchOf(rang.contact_id),
      ["call", voiceLine],
      "connected: the call made them, on the line it rang",
    );
    // Once: the stamp is taken off, and the turns of the live call and its end find the old row connected and never try.
    await clearTouch(rang.contact_id);
    ok(await call("h", "ongoing", from));
    ok(await call("h", "ended", from, 61_000));
    assert.deepEqual(
      await touchOf(rang.contact_id),
      [null, null],
      "a call that was connected already stamps nothing again",
    );
  },
);

test("a call stamped on its first row is stamped once: its end, an update, tries nothing", { skip }, async () => {
  const from = newPhone();
  const rang = ok(await call("i", "ongoing", from));
  assert.deepEqual(await touchOf(rang.contact_id), ["call", voiceLine]);
  await clearTouch(rang.contact_id);
  ok(await call("i", "ended", from, 30_000));
  assert.deepEqual(
    await touchOf(rang.contact_id),
    [null, null],
    "ongoing to ended was connected before and after: the update trigger does not enter the function",
  );
});

test(
  "a registered call that never connects is no first touch: not connected, an error with no length, and an outbound call",
  { skip },
  async () => {
    const missedFrom = newPhone();
    const missed = ok(await call("j", "registered", missedFrom));
    ok(await call("j", "not_connected", missedFrom));
    assert.deepEqual(await touchOf(missed.contact_id), [null, null], "registered, then not connected");

    const emptyFrom = newPhone();
    const empty = ok(await call("k", "registered", emptyFrom));
    ok(await call("k", "error", emptyFrom, 0));
    assert.deepEqual(await touchOf(empty.contact_id), [null, null], "an error with a duration of nothing");
    const unknownFrom = newPhone();
    const unknown = ok(await call("l", "registered", unknownFrom));
    ok(await call("l", "error", unknownFrom));
    assert.deepEqual(await touchOf(unknown.contact_id), [null, null], "an error with a duration nobody knows");

    const outFrom = newPhone();
    const out = ok(await call("m", "registered", outFrom, null, "outbound"));
    ok(await call("m", "ongoing", outFrom, null, "outbound"));
    assert.deepEqual(
      await touchOf(out.contact_id),
      [null, null],
      "a call the workspace placed is not a touch, connected or not",
    );
  },
);

test(
  "a registered call that errors after it had a length is a first touch, as call_connected says; a person who existed is not made by it",
  { skip },
  async () => {
    const from = newPhone();
    const rang = ok(await call("n", "registered", from));
    ok(await call("n", "error", from, 4000));
    assert.deepEqual(await touchOf(rang.contact_id), ["call", voiceLine], "it errored after someone spoke");

    const old = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: newPhone() })
        .select("id, phone_e164")
        .single(),
    );
    const ringing = ok(await call("o", "registered", old.phone_e164));
    assert.equal(ringing.contact_id, old.id);
    ok(await call("o", "ongoing", old.phone_e164));
    ok(await call("o", "ended", old.phone_e164, 20_000));
    assert.deepEqual(
      await touchOf(old.id),
      [null, null],
      "they were there before the call: not made by it, connected or not",
    );
  },
);

test(
  "a backfilled message and an outbound call make a person no first touch: neither is them reaching the workspace",
  { skip },
  async () => {
    const backfilled = await arrive({ meta: { raw_type: "text", line: waLine, backfill: true } });
    assert.equal(backfilled.is_new, true, "the message is on record, and made this person");
    assert.deepEqual(await touchOf(backfilled.contact_id), [null, null], "history brought in is not a touch");

    const calledOut = ok(await call("g", "ended", newPhone(), null, "outbound"));
    assert.deepEqual(await touchOf(calledOut.contact_id), [null, null], "a call the workspace placed is not a touch");
  },
);

test(
  "the door: the first value wins, a touch that did not make the person stamps nothing, and the set is closed",
  { skip },
  async () => {
    const c = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: newPhone() })
        .select("id, created_at")
        .single(),
    );
    const later = new Date(Date.parse(c.created_at) + 1).toISOString();
    assert.equal(ok(await door(c.id, "import", null, later)), false, "not the row that made them");
    assert.equal(ok(await door(c.id, "import", null, c.created_at)), true);
    assert.equal(ok(await door(c.id, "manual")), false, "the first value wins");
    assert.deepEqual(await touchOf(c.id), ["import", null]);
    const fresh = ok(
      await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: newPhone() }).select("id").single(),
    );
    const bad = await door(fresh.id, "carrier_pigeon");
    assert.match(bad.error?.message ?? "", /contacts_acquired_via_check/, "a way no one declared is refused");
  },
);

test(
  "a ref is kept to REFERRAL_ID_MAX characters and only with a via: contracts' number is the column's",
  { skip },
  async () => {
    const longest = "7".repeat(REFERRAL_ID_MAX);
    const kept = await arrive({
      meta: { raw_type: "text", line: waLine, referral: { source_id: longest, source_type: "ad" } },
    });
    assert.deepEqual(await touchOf(kept.contact_id), ["ad", longest], "an id of the longest length is kept whole");

    const tooLong = await arrive({
      meta: { raw_type: "text", line: waLine, referral: { source_id: `${longest}7`, source_type: "ad" } },
    });
    const message = ok(await db.from("messages").select("direction").eq("id", tooLong.message_id).single());
    assert.equal(message.direction, "inbound", "an id one longer costs the message nothing");
    assert.deepEqual(await touchOf(tooLong.contact_id), [null, null], "and is refused, not cut");

    const c = ok(
      await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: newPhone() }).select("id").single(),
    );
    const refused = await door(c.id, "ad", `${longest}7`);
    assert.match(refused.error?.message ?? "", /contacts_acquired_ref_check/, "the door itself refuses the longer id");
    const blank = await db.from("contacts").update({ acquired_via: "ad", acquired_ref: "" }).eq("id", c.id);
    assert.match(blank.error?.message ?? "", /contacts_acquired_ref_check/, "a ref has at least one character");
    const orphan = await db.from("contacts").update({ acquired_ref: "120200000000001" }).eq("id", c.id);
    assert.match(orphan.error?.message ?? "", /contacts_acquired_ref_check/, "a ref without a via names nothing");
    assert.deepEqual(await touchOf(c.id), [null, null], "none of the three wrote");
  },
);

test(
  "an erased person keeps how they first reached the workspace: the tombstone blanks what names them, and neither column does",
  { skip: skipErase },
  async () => {
    const member = await ownerSession();
    // An ad-made person, by the real writer: the message whose referral is an ad.
    const adId = "120200000000555";
    const ad = await arrive({
      meta: { raw_type: "text", line: waLine, referral: { source_id: adId, source_type: "ad" } },
    });
    assert.deepEqual(await touchOf(ad.contact_id), ["ad", adId]);
    // A lead-made person: the lead is linked to them, and the contact.added event beside them names it, as 00289's trigger reads it.
    const person = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: newPhone(), display_name: "Made-up Person" })
        .select("id")
        .single(),
    );
    const lead = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: tenantId,
          place_id: `ft-erase-${stamp}`,
          business_name: "Made-up Salon",
          stage: "converted",
          contact_id: person.id,
          converted_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
    );
    ok(
      await db.from("events").insert({
        tenant_id: tenantId,
        kind: "contact.added",
        category: "contact",
        subject_type: "contact",
        subject_id: person.id,
        data: { source: "lead", lead_id: lead.id },
      }),
    );
    assert.deepEqual(await touchOf(person.id), ["lead", lead.id]);

    for (const id of [ad.contact_id, person.id]) ok(await member.rpc("erase_contact", { p_contact_id: id }));

    for (const [id, want] of [
      [ad.contact_id, ["ad", adId]],
      [person.id, ["lead", lead.id]],
    ]) {
      const tomb = ok(
        await db
          .from("contacts")
          .select("erased_at, phone_e164, display_name, acquired_via, acquired_ref")
          .eq("id", id)
          .single(),
      );
      assert.notEqual(tomb.erased_at, null, "erased");
      assert.deepEqual([tomb.phone_e164, tomb.display_name], [null, null], "the tombstone blanked what names them");
      assert.deepEqual([tomb.acquired_via, tomb.acquired_ref], want, "and kept how they first reached the workspace");
    }
    const blanked = ok(await db.from("leads").select("business_name, place_id, erased_at").eq("id", lead.id).single());
    assert.deepEqual(
      [blanked.business_name, blanked.place_id, blanked.erased_at !== null],
      ["", null, true],
      "the lead's id that the person kept names a row the erasure blanked",
    );
  },
);

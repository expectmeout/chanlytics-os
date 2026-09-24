/**
 * A note is a record (0007, 00157) -- on a real database.
 *
 * A table, its CHECKs, five definer doors, a trigger on erasure and the old
 * door restated: what reading source cannot prove, so these run against
 * Postgres in the database workflow; skipped without a local database.
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
let tenantId;
const users = [];
const PASSWORD = "a-long-test-password-1";

const person = async (row) => {
  const { data, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, ...row })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
};

/** A member of the workspace, signed in as themselves. */
const member = async (role, tag) => {
  const email = `person-notes-${tag}-${Date.now()}@example.test`;
  const { data: made, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(made.user.id);
  const { error: mErr } = await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.user.id, role });
  if (mErr) throw new Error(mErr.message);
  const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
  const { error: sErr } = await as.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw new Error(sErr.message);
  return { id: made.user.id, as };
};

let owner;
let maria;
let sam;
let viewer;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `person-notes-${Date.now()}`, name: "Person notes" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
  owner = await member("owner", "owner");
  maria = await member("operator", "maria");
  sam = await member("operator", "sam");
  viewer = await member("viewer", "viewer");
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "a member writes a note: trimmed, dated, theirs, for one teammate, team only; the event holds no words",
  { skip },
  async () => {
    const id = await person({ display_name: "Dee", phone_e164: "+15550100301" });
    const { data, error } = await maria.as.rpc("person_note_add", {
      p_contact_id: id,
      p_body: "  Prefers Saturdays.  ",
      p_for_user_id: sam.id,
      p_team_only: true,
    });
    assert.equal(error, null, error?.message);
    const n = data.note;
    assert.equal(n.body, "Prefers Saturdays.");
    assert.equal(n.author_kind, "member");
    assert.equal(n.author_user_id, maria.id);
    assert.equal(n.for_user_id, sam.id);
    assert.equal(n.team_only, true);
    assert.equal(n.state, "kept");
    assert.equal(n.source, "page");

    const { data: ev } = await db
      .from("events")
      .select("kind, data")
      .eq("tenant_id", tenantId)
      .eq("subject_id", id)
      .eq("kind", "contact.noted");
    assert.equal(ev.length, 1);
    assert.ok(!JSON.stringify(ev[0].data).includes("Saturdays"), "the event holds no words");

    const refusals = [
      [{ p_body: "   " }, "empty"],
      [{ p_body: "x".repeat(601) }, "too_long"],
      [{ p_body: "Hi", p_for_user_id: "00000000-0000-4000-8000-000000000000" }, "not_a_member"],
      [{ p_body: "Hi", p_source: "call" }, "bad_source"],
    ];
    for (const [args, want] of refusals) {
      const { data: r } = await maria.as.rpc("person_note_add", { p_contact_id: id, ...args });
      assert.equal(r.error, want, JSON.stringify(args));
    }
    const { data: v } = await viewer.as.rpc("person_note_add", { p_contact_id: id, p_body: "Hi" });
    assert.equal(v.error, "not_found", "a viewer writes nothing");
    const { data: seen } = await viewer.as.from("person_notes").select("body").eq("contact_id", id);
    assert.deepEqual(
      seen.map((r) => r.body),
      ["Prefers Saturdays."],
      "a viewer reads the notes",
    );
  },
);

test(
  "its author changes a note, with the version they saw; nobody else does; an owner or its author takes it away",
  { skip },
  async () => {
    const id = await person({ phone_e164: "+15550100311" });
    const { data: a } = await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Allergic to ammonia." });
    const note = a.note;

    const { data: other } = await sam.as.rpc("person_note_edit", { p_note_id: note.id, p_body: "No.", p_version: 1 });
    assert.equal(other.error, "not_yours");

    const { data: ok, error } = await maria.as.rpc("person_note_edit", {
      p_note_id: note.id,
      p_body: "Allergic to ammonia -- use the gentle line.",
      p_for_user_id: sam.id,
      p_team_only: false,
      p_version: 1,
    });
    assert.equal(error, null, error?.message);
    assert.equal(ok.note.version, 2);
    assert.equal(ok.note.for_user_id, sam.id);

    const { data: stale } = await maria.as.rpc("person_note_edit", {
      p_note_id: note.id,
      p_body: "Stale",
      p_version: 1,
    });
    assert.equal(stale.error, "moved");

    const { data: notHers } = await sam.as.rpc("person_note_remove", { p_note_id: note.id });
    assert.equal(notHers.error, "not_yours", "an operator takes away only their own");
    const { data: gone } = await owner.as.rpc("person_note_remove", { p_note_id: note.id });
    assert.equal(gone.removed, note.id, "an owner takes away any note");
    const { count } = await db.from("person_notes").select("id", { count: "exact", head: true }).eq("id", note.id);
    assert.equal(count, 0, "the words are gone");
  },
);

test(
  "the receptionist suggests: service role only, once per source, three waiting at most; kept it is read, dismissed it is gone",
  { skip },
  async () => {
    const id = await person({ phone_e164: "+15550100321" });
    const call = "11111111-1111-4111-8111-111111111111";
    const { data: asMember } = await maria.as.rpc("person_note_suggest", {
      p_tenant_id: tenantId,
      p_contact_id: id,
      p_body: "Prefers mornings.",
      p_source: "call",
      p_source_id: call,
    });
    assert.equal(asMember, null, "a member cannot call the edge's door");

    const { data: s1, error } = await db.rpc("person_note_suggest", {
      p_tenant_id: tenantId,
      p_contact_id: id,
      p_body: "Prefers mornings.",
      p_source: "call",
      p_source_id: call,
    });
    assert.equal(error, null, error?.message);
    assert.equal(s1.note.state, "suggested");
    assert.equal(s1.note.author_kind, "receptionist");
    const { data: again } = await db.rpc("person_note_suggest", {
      p_tenant_id: tenantId,
      p_contact_id: id,
      p_body: "Prefers mornings.",
      p_source: "call",
      p_source_id: call,
    });
    assert.equal(again.error, "already", "once per call");
    for (const n of [2, 3]) {
      const { data } = await db.rpc("person_note_suggest", {
        p_tenant_id: tenantId,
        p_contact_id: id,
        p_body: `Fact ${n}.`,
        p_source: "thread",
      });
      assert.ok(data.note);
    }
    const { data: full } = await db.rpc("person_note_suggest", {
      p_tenant_id: tenantId,
      p_contact_id: id,
      p_body: "Fact 4.",
      p_source: "thread",
    });
    assert.equal(full.error, "too_many");

    const { data: noEdit } = await maria.as.rpc("person_note_edit", { p_note_id: s1.note.id, p_body: "Mine now" });
    assert.equal(noEdit.error, "not_yours", "a suggestion is changed as it is kept, not edited");

    const { data: kept } = await maria.as.rpc("person_note_decide", {
      p_note_id: s1.note.id,
      p_keep: true,
      p_body: "Prefers early mornings.",
    });
    assert.equal(kept.note.state, "kept");
    assert.equal(kept.note.kept_by, maria.id);
    assert.equal(kept.note.body, "Prefers early mornings.");
    const { data: twice } = await sam.as.rpc("person_note_decide", { p_note_id: s1.note.id, p_keep: false });
    assert.equal(twice.error, "decided");

    const { data: waiting } = await db.from("person_notes").select("id").eq("contact_id", id).eq("state", "suggested");
    const { data: dismissed } = await sam.as.rpc("person_note_decide", { p_note_id: waiting[0].id, p_keep: false });
    assert.equal(dismissed.removed, waiting[0].id);
    const { count } = await db
      .from("person_notes")
      .select("id", { count: "exact", head: true })
      .eq("id", waiting[0].id);
    assert.equal(count, 0, "a dismissed suggestion keeps no words");
  },
);

test("the old door still writes the field and adds a row when the words are new", { skip }, async () => {
  const id = await person({ phone_e164: "+15550100331" });
  const { error } = await maria.as.rpc("set_person_notes", { p_contact_id: id, p_notes: "Old page: likes tea." });
  assert.equal(error, null, error?.message);
  await maria.as.rpc("set_person_notes", { p_contact_id: id, p_notes: "Old page: likes tea." });
  const { data: c } = await db.from("contacts").select("notes").eq("id", id).single();
  assert.equal(c.notes, "Old page: likes tea.");
  const { data: rows } = await db.from("person_notes").select("body, author_user_id").eq("contact_id", id);
  assert.deepEqual(rows, [{ body: "Old page: likes tea.", author_user_id: maria.id }], "one row, not one per save");
});

test("an erasure takes every note and the old field", { skip }, async () => {
  const id = await person({ phone_e164: "+15550100341", notes: "Lives on Elm St." });
  await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Has two kids." });
  await db.rpc("person_note_suggest", {
    p_tenant_id: tenantId,
    p_contact_id: id,
    p_body: "Likes red.",
    p_source: "thread",
  });
  const { error } = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
  assert.equal(error, null, error?.message);
  const { count } = await db.from("person_notes").select("id", { count: "exact", head: true }).eq("contact_id", id);
  assert.equal(count, 0);
  const { data: c } = await db.from("contacts").select("notes").eq("id", id).single();
  assert.equal(c.notes, null, "00054's field was left on the erased row; it is not any more");
  const { data: r } = await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "After" });
  assert.equal(r.error, "not_found", "nothing is written on an erased person");
});

test("a member of another workspace reads none of these notes", { skip }, async () => {
  const id = await person({ phone_e164: "+15550100351" });
  await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Private." });
  const { data: t2 } = await db
    .from("tenants")
    .insert({ slug: `person-notes-other-${Date.now()}`, name: "Other" })
    .select("id")
    .single();
  const email = `person-notes-stranger-${Date.now()}@example.test`;
  const { data: made } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  users.push(made.user.id);
  try {
    await db.from("memberships").insert({ tenant_id: t2.id, user_id: made.user.id, role: "owner" });
    const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
    await as.auth.signInWithPassword({ email, password: PASSWORD });
    const { data } = await as.from("person_notes").select("id").eq("contact_id", id);
    assert.deepEqual(data, []);
    const { data: w } = await as.rpc("person_note_add", { p_contact_id: id, p_body: "Hi" });
    assert.equal(w.error, "not_found");
  } finally {
    await db.from("tenants").delete().eq("id", t2.id);
  }
});

test(
  "a note for a teammate reaches only them (00158): named, never its words; again only when it is addressed to someone new; gone with the person",
  { skip },
  async () => {
    const id = await person({ display_name: "Tom Baker", phone_e164: "+15550100361" });
    const bell = (who) =>
      who.as
        .from("notifications")
        .select("id, kind, title, body, route, recipient_user_id")
        .eq("tenant_id", tenantId)
        .eq("kind", "note_for_you")
        .eq("subject_id", id);

    const { data: a } = await maria.as.rpc("person_note_add", {
      p_contact_id: id,
      p_body: "Call her about the bridal party.",
      p_for_user_id: sam.id,
    });
    const { data: samSees } = await bell(sam);
    assert.equal(samSees.length, 1, "the reader is told");
    assert.equal(samSees[0].recipient_user_id, sam.id);
    assert.match(samSees[0].title, /left you a note on Tom Baker$/);
    assert.equal(samSees[0].route, `clients/${id}`);
    assert.ok(!`${samSees[0].title} ${samSees[0].body}`.includes("bridal"), "the words stay on the page");
    assert.deepEqual((await bell(maria)).data, [], "its writer is not");
    assert.deepEqual((await bell(owner)).data, [], "nor an owner: it is addressed to one member");
    const { error: markErr } = await owner.as.rpc("notification_mark", { p_id: samSees[0].id, p_read: true });
    assert.match(markErr?.message ?? "", /not found/i, "nobody else can mark it");

    await maria.as.rpc("person_note_edit", {
      p_note_id: a.note.id,
      p_body: "Call her about the bridal party on Friday.",
      p_for_user_id: sam.id,
      p_version: 1,
    });
    assert.equal((await bell(sam)).data.length, 1, "changing the words tells nobody again");
    await maria.as.rpc("person_note_edit", {
      p_note_id: a.note.id,
      p_body: "Call her about the bridal party on Friday.",
      p_for_user_id: owner.id,
      p_version: 2,
    });
    assert.equal((await bell(owner)).data.length, 1, "addressed to someone new, they are told");

    await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Reminder to myself.", p_for_user_id: maria.id });
    assert.deepEqual((await bell(maria)).data, [], "a note for its own writer tells nobody");

    await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
    const { count } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("kind", "note_for_you")
      .eq("subject_id", id);
    assert.equal(count, 0, "an erasure takes them: their titles name the person");
  },
);

test(
  "note_candidates (00159): a call is looked at once, after its analysis; a conversation once per quiet spell, reading only what was said since; nothing for an erased person or a paused workspace",
  { skip },
  async () => {
    const H = 3_600_000;
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    const id = await person({ display_name: "Ana", phone_e164: "+15550100371" });
    // Other suites' rows share this database: the batch is read whole and only this test's people are looked at.
    const mine = async () => {
      const { data, error } = await db.rpc("note_candidates", { p_limit: 50 });
      assert.equal(error, null, error?.message);
      return data.filter((r) => r.contact_id === id);
    };

    const { data: call } = await db
      .from("calls")
      .insert({
        tenant_id: tenantId,
        contact_id: id,
        retell_call_id: `rc-notes-${Date.now()}`,
        direction: "inbound",
        status: "ended",
        ended_at: ago(H),
        duration_ms: 120_000,
        transcript_object: [
          { role: "agent", content: "Hi, how can I help?" },
          { role: "user", content: "Saturday mornings suit me best." },
          { role: "injected", content: "Owner whisper: offer Saturday." },
        ],
      })
      .select("id")
      .single();
    assert.deepEqual(await mine(), [], "not before its analysis is in");
    await db
      .from("calls")
      .update({ notified_at: ago(H) })
      .eq("id", call.id);
    const first = await mine();
    assert.equal(first.length, 1);
    assert.equal(first[0].source, "call");
    assert.equal(first[0].source_id, call.id);
    assert.equal(first[0].seconds, 120);
    assert.deepEqual(
      first[0].turns,
      [
        { who: "business", text: "Hi, how can I help?" },
        { who: "customer", text: "Saturday mornings suit me best." },
      ],
      "the caller's words and the receptionist's; an owner's whisper is not the caller",
    );
    assert.deepEqual(await mine(), [], "a call is looked at once");

    const { data: conv } = await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: id })
      .select("id")
      .single();
    const msg = async (sender, body, at) => {
      const { data, error } = await db
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: conv.id,
          contact_id: id,
          channel: "whatsapp",
          direction: sender === "customer" ? "inbound" : "outbound",
          sender,
          type: "text",
          body,
          status: sender === "customer" ? "received" : "sent",
          created_at: at,
        })
        .select("id")
        .single();
      assert.equal(error, null, error?.message);
      return data.id;
    };
    await msg("customer", "Can I bring my daughter along next time?", ago(9 * H));
    const newest = await msg("customer", "She is six.", ago(8 * H));
    await msg("ai", "Of course, she is welcome.", ago(8 * H - 60_000));
    await db
      .from("conversations")
      .update({ last_inbound_at: ago(8 * H) })
      .eq("id", conv.id);
    const t1 = await mine();
    assert.equal(t1.length, 1, "quiet for six hours: read once");
    assert.equal(t1[0].source, "thread");
    assert.equal(t1[0].source_id, newest, "keyed by the newest customer message, not the conversation");
    assert.equal(t1[0].turns.length, 3);
    assert.deepEqual(await mine(), [], "the same spell is not read twice");

    await msg("customer", "Also I prefer texts to calls.", ago(1 * H));
    await db
      .from("conversations")
      .update({ last_inbound_at: ago(1 * H) })
      .eq("id", conv.id);
    assert.deepEqual(await mine(), [], "a spell still going is not read yet");
    const later = await msg("customer", "Thanks again.", ago(7 * H));
    // The last look was eight and a half hours ago: the next read starts there, so the daughter (nine hours ago) is not
    // read again, and what came after is.
    await db
      .from("conversations")
      .update({ last_inbound_at: ago(7 * H), note_checked_at: ago(8.5 * H) })
      .eq("id", conv.id);
    const t2 = await mine();
    assert.equal(t2.length, 1);
    const texts = t2[0].turns.map((t) => t.text);
    assert.ok(!texts.includes("Can I bring my daughter along next time?"), `read again: ${texts}`);
    assert.ok(texts.includes("Thanks again.") && texts.includes("She is six."), `${texts}`);
    assert.equal(
      t2[0].source_id,
      (
        await db
          .from("messages")
          .select("id")
          .eq("conversation_id", conv.id)
          .eq("sender", "customer")
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
      ).data.id,
    );
    assert.ok(later);

    await db.from("tenants").update({ status: "paused" }).eq("id", tenantId);
    await db.from("conversations").update({ note_checked_at: null }).eq("id", conv.id);
    assert.deepEqual(await mine(), [], "a paused workspace is not looked at");
    await db.from("tenants").update({ status: "active" }).eq("id", tenantId);
    await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
    await db.from("conversations").update({ note_checked_at: null }).eq("id", conv.id);
    assert.deepEqual(await mine(), [], "nor an erased person");

    const { data: clock } = await db
      .from("sweep_status")
      .select("sweep, jobname, judged_by")
      .eq("sweep", "notes")
      .single();
    assert.deepEqual(clock, { sweep: "notes", jobname: "notes-sweep", judged_by: "request" });
  },
);

test(
  "a note may have a day (00163): the team's, done by anyone who acts with the version they saw, on the person's own deal, their earliest open one in people_list, gone with them",
  { skip },
  async () => {
    const id = await person({ display_name: "Ivo", phone_e164: "+15550100381" });
    const other = await person({ display_name: "Uma", phone_e164: "+15550100382" });
    const deal = async (contact) =>
      (await maria.as.rpc("deal_record", { p_contact_id: contact, p_stage: "proposed", p_service: "Website" })).data
        .deal.id;
    const dealId = await deal(id);
    const theirs = await deal(other);

    // A day makes the note a step, and a step is the team's whatever the page sent.
    const { data: a, error } = await maria.as.rpc("person_note_add", {
      p_contact_id: id,
      p_body: "Call about the timeline",
      p_for_user_id: sam.id,
      p_team_only: false,
      p_due_on: "2026-10-02",
      p_deal_id: dealId,
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual([a.note.due_on, a.note.team_only, a.note.deal_id], ["2026-10-02", true, dealId]);
    const { data: ev } = await db.from("events").select("data").eq("subject_id", id).eq("kind", "contact.noted");
    assert.deepEqual([ev[0].data.due_on, ev[0].data.deal_id], ["2026-10-02", dealId], "the event names the day");
    assert.ok(!JSON.stringify(ev[0].data).includes("timeline"), "and never the words");
    const { data: bad } = await maria.as.rpc("person_note_add", {
      p_contact_id: id,
      p_body: "Chase it",
      p_due_on: "2026-10-03",
      p_deal_id: theirs,
    });
    assert.equal(bad.error, "bad_deal", "a deal of someone else's");

    // The table holds both rules whoever writes: a step not the team's, and done on a note with no day.
    const { error: notTeams } = await db.from("person_notes").update({ team_only: false }).eq("id", a.note.id);
    assert.match(notTeams?.message ?? "", /person_notes_step_is_the_teams/);
    const { data: plain } = await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Likes oat milk" });
    const { error: doneNote } = await db
      .from("person_notes")
      .update({ done_at: new Date().toISOString() })
      .eq("id", plain.note.id);
    assert.match(doneNote?.message ?? "", /person_notes_done_is_a_step/);
    assert.equal((await maria.as.rpc("person_note_done", { p_note_id: plain.note.id })).data.error, "not_a_step");

    // Sam, whom it is for, does it -- not its author -- with the version the page saw; a stale press moves nothing,
    // a press that changes nothing writes nothing, and a viewer marks nothing.
    const stale = await sam.as.rpc("person_note_done", { p_note_id: a.note.id, p_version: a.note.version + 5 });
    assert.equal(stale.data.error, "moved");
    const { data: done } = await sam.as.rpc("person_note_done", { p_note_id: a.note.id, p_version: a.note.version });
    assert.ok(done.note.done_at);
    assert.deepEqual([done.note.done_by, done.note.version], [sam.id, a.note.version + 1]);
    const { data: again } = await sam.as.rpc("person_note_done", { p_note_id: a.note.id });
    assert.equal(again.note.version, done.note.version, "done twice is done once");
    const { data: kinds } = await db
      .from("events")
      .select("kind")
      .eq("subject_id", id)
      .in("kind", ["contact.note_done", "contact.note_undone"]);
    assert.deepEqual(
      kinds.map((k) => k.kind),
      ["contact.note_done"],
    );
    assert.equal(
      (await viewer.as.rpc("person_note_done", { p_note_id: a.note.id, p_done: false })).data.error,
      "not_found",
    );
    const { data: undone } = await sam.as.rpc("person_note_done", { p_note_id: a.note.id, p_done: false });
    assert.deepEqual([undone.note.done_at, undone.note.done_by], [null, null], "open again");

    // people_list carries the earliest open step: by its day, and a done one is never next.
    const { data: b } = await maria.as.rpc("person_note_add", {
      p_contact_id: id,
      p_body: "Send the revised quote",
      p_due_on: "2026-09-30",
    });
    const next = async () => (await maria.as.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: id })).data[0];
    let row = await next();
    assert.deepEqual(
      [row.step_id, row.step_body, row.step_due_on, row.step_for_user_id, row.step_deal_id],
      [b.note.id, "Send the revised quote", "2026-09-30", null, null],
    );
    await maria.as.rpc("person_note_done", { p_note_id: b.note.id });
    row = await next();
    assert.deepEqual([row.step_id, row.step_for_user_id, row.step_deal_id], [a.note.id, sam.id, dealId]);

    // Its author changes it. A day the page does not send is kept, so a page from before this release cannot take it;
    // a cleared day takes its done with it, and the note is no longer the team's by force.
    const { data: e1 } = await maria.as.rpc("person_note_edit", {
      p_note_id: a.note.id,
      p_body: "Call about the timeline, and the logo",
      p_for_user_id: sam.id,
      p_team_only: false,
      p_version: undone.note.version,
    });
    assert.deepEqual([e1.note.due_on, e1.note.team_only, e1.note.deal_id], ["2026-10-02", true, dealId]);
    const { data: e2 } = await maria.as.rpc("person_note_edit", {
      p_note_id: b.note.id,
      p_body: "Send the revised quote",
      p_team_only: false,
      p_clear_due: true,
    });
    assert.deepEqual([e2.note.due_on, e2.note.done_at, e2.note.done_by, e2.note.team_only], [null, null, null, false]);
    const e3 = await maria.as.rpc("person_note_edit", { p_note_id: a.note.id, p_body: "x", p_deal_id: theirs });
    assert.equal(e3.data.error, "bad_deal");

    // A step for a teammate rings them, as a note does (00158): once, on the new step, not on its change of words.
    const { data: rung } = await db
      .from("notifications")
      .select("recipient_user_id")
      .eq("tenant_id", tenantId)
      .eq("kind", "note_for_you")
      .eq("subject_id", id);
    assert.deepEqual(
      rung.map((x) => x.recipient_user_id),
      [sam.id],
    );

    // A deal that goes leaves the step, without it.
    await db.from("deals").delete().eq("id", dealId);
    const { data: kept } = await db.from("person_notes").select("deal_id, due_on").eq("id", a.note.id).single();
    assert.deepEqual([kept.deal_id, kept.due_on], [null, "2026-10-02"]);

    // An erasure takes every step with every note.
    await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
    const { data: left } = await db.from("person_notes").select("id").eq("contact_id", id);
    assert.deepEqual(left, []);
  },
);

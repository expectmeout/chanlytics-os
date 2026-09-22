/**
 * The edges a state machine keeps (00106, 00116), proved on a real Postgres:
 * a sent broadcast cannot be scheduled again, an escalation resolves once, an
 * answering line is not re-provisioned by a late retry, a marked recipient is
 * not queued again, and a line's texting state never returns to none or
 * enters a path that is not built. Every move a writer in the repo actually
 * makes still passes, and so does a same-state update.
 *
 * Runs the way jobs-outbox.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production.
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
      ? "refusing a database that is not on this machine: this suite writes rows"
      : false;

let db;
let tenantId;
let templateId;
let conversationId;
let phones = 100;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `guards-${Date.now()}`, name: "Guards" })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  tenantId = t.data.id;
  const tpl = await db
    .from("templates")
    .insert({ tenant_id: tenantId, channel: "whatsapp", name: "visit_reminder", language: "en_US" })
    .select("id")
    .single();
  assert.equal(tpl.error, null, tpl.error?.message);
  templateId = tpl.data.id;
  const c = await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: "+15550000001" }).select("id").single();
  assert.equal(c.error, null, c.error?.message);
  const v = await db.from("conversations").insert({ tenant_id: tenantId, contact_id: c.data.id }).select("id").single();
  assert.equal(v.error, null, v.error?.message);
  conversationId = v.data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

async function broadcast(state) {
  const { data, error } = await db
    .from("broadcasts")
    .insert({
      tenant_id: tenantId,
      name: `run ${state}`,
      template_id: templateId,
      template_name: "visit_reminder",
      template_language: "en_US",
      state,
      scheduled_for: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

/** One update keyed on the id alone, exactly as the writers do. */
const move = (table, id, patch) => db.from(table).update(patch).eq("id", id).select("id");

test("a broadcast takes every edge its writers take, and no other", { skip }, async () => {
  const allowed = [
    ["pending_approval", "scheduled"],
    ["pending_approval", "canceled"],
    ["pending_approval", "failed"],
    ["scheduled", "sending"],
    ["scheduled", "canceled"],
    ["scheduled", "failed"],
    ["scheduled", "pending_approval"],
    ["sending", "sent"],
    ["sending", "failed"],
    ["sending", "canceled"],
  ];
  for (const [from, to] of allowed) {
    const r = await move("broadcasts", await broadcast(from), { state: to });
    assert.equal(r.error, null, `${from} -> ${to} is a move a writer makes: ${r.error?.message}`);
  }
  const refused = [
    ["sent", "scheduled"],
    ["sent", "sending"],
    ["canceled", "scheduled"],
    ["failed", "sending"],
    ["failed", "scheduled"],
    ["pending_approval", "sending"],
    ["pending_approval", "sent"],
    ["scheduled", "sent"],
    ["sending", "scheduled"],
    ["sending", "pending_approval"],
  ];
  for (const [from, to] of refused) {
    const r = await move("broadcasts", await broadcast(from), { state: to });
    assert.match(r.error?.message ?? "", /refused/, `${from} -> ${to} must be refused`);
  }
  const same = await broadcast("sent");
  const r = await move("broadcasts", same, { state: "sent", name: "renamed after sending" });
  assert.equal(r.error, null, `a same-state update is not a move: ${r.error?.message}`);
});

test("an escalation resolves once; a new concern is a new row", { skip }, async () => {
  const { data, error } = await db
    .from("escalations")
    .insert({ tenant_id: tenantId, conversation_id: conversationId, reason: "manual", details: "guard test" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  const refreshed = await move("escalations", data.id, { state: "open", details: "the same concern, said again" });
  assert.equal(refreshed.error, null, `refreshing an open row is not a move: ${refreshed.error?.message}`);
  const resolved = await move("escalations", data.id, { state: "resolved" });
  assert.equal(resolved.error, null, resolved.error?.message);
  const reopened = await move("escalations", data.id, { state: "open" });
  assert.match(reopened.error?.message ?? "", /terminal/, "resolved -> open must be refused");
});

test(
  "a line's voice moves forward; an answering line is not re-provisioned, and none is not a destination",
  { skip },
  async () => {
    const { data, error } = await db
      .from("lines")
      .insert({
        tenant_id: tenantId,
        e164: "+15550000099",
        kind: "chanlytics",
        provider: "dry",
        voice_state: "provisioning",
      })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    const id = data.id;
    const step = async (to, ok, why) => {
      const r = await move("lines", id, { voice_state: to });
      if (ok) assert.equal(r.error, null, `${why}: ${r.error?.message}`);
      else assert.match(r.error?.message ?? "", /refused/, why);
    };
    await step("provisioning", true, "a stuck line is taken again with the same state");
    await step("failed", true, "the saga did not finish");
    await step("provisioning", true, "a failed line may be retried");
    await step("answering", true, "the saga finished");
    await step("provisioning", false, "a late retry must not re-provision an answering line");
    await step("none", false, "a line is released, not reset");
    await step("failed", true, "an answering line may still fail");
  },
);

async function contact() {
  phones += 1;
  const { data, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1555${String(phones).padStart(7, "0")}` })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

test(
  "a recipient is marked once: queued -> sent, skipped or failed, then final; a resumed batch may say the same again",
  { skip },
  async () => {
    const broadcastId = await broadcast("sending");
    const recipient = async (state) => {
      const contactId = await contact();
      const { error } = await db
        .from("broadcast_recipients")
        .insert({ tenant_id: tenantId, broadcast_id: broadcastId, contact_id: contactId, state });
      assert.equal(error, null, error?.message);
      return contactId;
    };
    // Keyed the way the handler keys it: the broadcast and the contact, no state filter.
    const mark = (contactId, patch) =>
      db
        .from("broadcast_recipients")
        .update(patch)
        .eq("broadcast_id", broadcastId)
        .eq("contact_id", contactId)
        .select("state");
    for (const to of ["sent", "skipped", "failed"]) {
      const r = await mark(await recipient("queued"), { state: to, reason: to === "sent" ? null : to });
      assert.equal(r.error, null, `queued -> ${to} is the handler's move: ${r.error?.message}`);
    }
    for (const [from, to] of [
      ["sent", "queued"],
      ["skipped", "queued"],
      ["failed", "queued"],
      ["sent", "failed"],
      ["skipped", "sent"],
      ["failed", "sent"],
    ]) {
      const r = await mark(await recipient(from), { state: to });
      assert.match(r.error?.message ?? "", /terminal/, `${from} -> ${to} must be refused`);
    }
    const again = await mark(await recipient("sent"), {
      state: "sent",
      reason: "a resumed batch, marking what it already marked",
    });
    assert.equal(again.error, null, `a same-state update is not a move: ${again.error?.message}`);
  },
);

test(
  "a line's texting state moves as the hourly sync and the refile doors move it, never back to none, never into a path that is not built",
  { skip },
  async () => {
    const line = async (sms_state) => {
      phones += 1;
      const { data, error } = await db
        .from("lines")
        .insert({
          tenant_id: tenantId,
          e164: `+1555${String(phones).padStart(7, "0")}`,
          kind: "chanlytics",
          provider: "dry",
          sms_state,
        })
        .select("id")
        .single();
      assert.equal(error, null, error?.message);
      return data.id;
    };
    const move = (id, sms_state) => db.from("lines").update({ sms_state }).eq("id", id).select("id");
    // Every edge a writer takes (a2p.ts registerLine, syncRegistration, the two
    // refile doors, lines.ts register): forward, and back again when Twilio's
    // answer changes.
    const allowed = [
      ["none", "needs_record"],
      ["none", "registering"],
      ["needs_record", "registering"],
      ["registering", "needs_record"],
      ["registering", "failed"],
      ["registering", "approved"],
      ["registering", "active"],
      ["registering", "rejected"],
      ["approved", "registering"],
      ["approved", "active"],
      ["approved", "rejected"],
      ["approved", "failed"],
      ["active", "approved"],
      ["active", "rejected"],
      ["active", "failed"],
      ["rejected", "registering"],
      ["rejected", "approved"],
      ["rejected", "active"],
      ["failed", "registering"],
      ["failed", "needs_record"],
    ];
    for (const [from, to] of allowed) {
      const r = await move(await line(from), to);
      assert.equal(r.error, null, `${from} -> ${to} is a move a writer makes: ${r.error?.message}`);
    }
    for (const from of ["needs_record", "registering", "approved", "active", "rejected", "failed"]) {
      const r = await move(await line(from), "none");
      assert.match(r.error?.message ?? "", /refused/, `${from} -> none must be refused: a line is released, not reset`);
    }
    for (const to of ["otp_waiting", "hosting"]) {
      const r = await move(await line("registering"), to);
      assert.match(r.error?.message ?? "", /not built/, `registering -> ${to} must be refused until it is built`);
    }
    const same = await move(await line("active"), "active");
    assert.equal(same.error, null, `a same-state update is not a move: ${same.error?.message}`);
  },
);

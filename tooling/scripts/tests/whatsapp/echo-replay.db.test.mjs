/**
 * The owner's own reply, arriving twice -- on a real database.
 *
 * When a business owner answers from the WhatsApp Business app, Meta sends us
 * the echo and the receptionist stands down for the workspace's pause window.
 * Meta also redelivers a webhook it could not deliver, for up to seven days.
 * The pause used to be written BEFORE the message insert could say whether the
 * echo was new, so each redelivery moved `paused_until` another whole window
 * out and the receptionist stayed silent for longer than anyone chose.
 *
 * What makes the second delivery knowable is a unique index -- one wamid, one
 * row -- and an upsert that really does update on conflict. Neither exists in
 * an in-memory double, which is why this lives here and not beside the door.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { recordEchoAndPause } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);
const { WAITING_REASONS } = await import(pathToFileURL(path.join(ROOT, "packages/contracts/dist/index.js")).href);

let db;
let tenantId;
const stamp = Date.now().toString(36);
/** Digits, as the door hands them over: Meta reports a number without its plus. */
const CUSTOMER = `1646555${String(Date.now() % 10000).padStart(4, "0")}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `echo-replay-${stamp}`, name: "echo-replay" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

const threadOf = async () => {
  const { data } = await db.from("conversations").select("id, state, paused_until").eq("tenant_id", tenantId).single();
  return data;
};

test(
  "REGRESSION: a redelivered echo is the same words arriving twice, not a second reason to mute the receptionist",
  { skip },
  async () => {
    const echo = (pausedUntilIso) =>
      recordEchoAndPause(db, {
        tenantId,
        customerPhoneDigits: CUSTOMER,
        body: "On my way.",
        externalId: `wamid.echo.${stamp}`,
        pausedUntilIso,
        settles: [],
      });

    const first = new Date(Date.now() + 6 * 3_600_000).toISOString();
    assert.equal(await echo(first), true, "kept, and the thread paused: the door acknowledges it");
    const opened = await threadOf();
    assert.equal(opened.state, "needs_human");
    assert.equal(
      Date.parse(opened.paused_until),
      Date.parse(first),
      "the owner spoke, so the receptionist stands down for their window",
    );

    // Meta, redelivering. The pause it carries is a fresh one, computed at the
    // moment of THIS delivery -- which is exactly what must not be written.
    const later = new Date(Date.now() + 6 * 3_600_000 + 90_000).toISOString();
    assert.equal(
      await echo(later),
      true,
      "a redelivery of an echo kept whole is kept: acknowledged, nothing more written",
    );
    const after_ = await threadOf();
    assert.equal(
      Date.parse(after_.paused_until),
      Date.parse(opened.paused_until),
      "the same pause: a redelivery is not a second time the owner spoke",
    );

    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("external_id", `wamid.echo.${stamp}`);
    assert.equal(count, 1, "and one wamid is one row, which is what told us it was a redelivery");
  },
);

test(
  "an echo with no id of its own still pauses: its own replay cannot be told apart, and a receptionist talking over the owner is the worse failure",
  { skip },
  async () => {
    const other = `1646555${String((Date.now() + 7777) % 10000).padStart(4, "0")}`;
    const at = (ms) => new Date(Date.now() + ms).toISOString();
    await recordEchoAndPause(db, {
      tenantId,
      customerPhoneDigits: other,
      body: "Anonymous echo.",
      externalId: null,
      pausedUntilIso: at(3_600_000),
      settles: [],
    });
    const second = at(7_200_000);
    await recordEchoAndPause(db, {
      tenantId,
      customerPhoneDigits: other,
      body: "Anonymous echo.",
      externalId: null,
      pausedUntilIso: second,
      settles: [],
    });
    const { data: contact } = await db
      .from("contacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", `+${other}`)
      .single();
    const { data: thread } = await db
      .from("conversations")
      .select("paused_until")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contact.id)
      .single();
    assert.equal(
      Date.parse(thread.paused_until),
      Date.parse(second),
      "nothing here can say 'seen it', so the receptionist stays down",
    );
  },
);

/* ---- S7-5: a reply typed in the Business app settles the hold it answers (00438) ---- */

/** A customer's thread with their message `agoMs` ago and a hold of `reason` opened after it, through its own door. */
async function heldThread(digits, { agoMs, reason = "human_token" }) {
  const { data: contact, error: cerr } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+${digits}` })
    .select("id")
    .single();
  if (cerr) throw new Error(cerr.message);
  const { data: conv, error: verr } = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: contact.id })
    .select("id")
    .single();
  if (verr) throw new Error(verr.message);
  const { error: merr } = await db.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: conv.id,
    contact_id: contact.id,
    channel: "whatsapp",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "Can someone call me?",
    external_id: `wamid.in.${digits}`,
    status: "received",
    created_at: new Date(Date.now() - agoMs).toISOString(),
  });
  if (merr) throw new Error(merr.message);
  const { error: herr } = await db.rpc("escalation_open", {
    p_tenant_id: tenantId,
    p_conversation_id: conv.id,
    p_reason: reason,
    p_details: "asked for a person",
  });
  if (herr) throw new Error(herr.message);
  return conv.id;
}
const holdOf = async (conversationId) =>
  (await db.from("escalations").select("id, state, decision_id").eq("conversation_id", conversationId).single()).data;
/** The deadman's candidates now, whatever their age: whether this thread's hold is among them. */
const deadmanHas = async (conversationId) => {
  const { data, error } = await db.rpc("deadman_candidates", { p_older_than: "0 seconds" });
  if (error) throw new Error(error.message);
  return data.some((c) => c.conversation_id === conversationId);
};
const reply = (digits, body, id) =>
  recordEchoAndPause(db, {
    tenantId,
    customerPhoneDigits: digits,
    body,
    externalId: id,
    pausedUntilIso: new Date(Date.now() + 3_600_000).toISOString(),
    settles: WAITING_REASONS,
  });

test(
  "REGRESSION (S7-5): a reply typed in the WhatsApp Business app settles the hold it answers, once; the deadman leaves it",
  { skip },
  async () => {
    const digits = `1646555${String((Date.now() + 1111) % 10000).padStart(4, "0")}`;
    const conv = await heldThread(digits, { agoMs: 120_000 });
    assert.equal((await holdOf(conv)).state, "open");
    assert.equal(await deadmanHas(conv), true, "a hold nobody answered is the deadman's");
    assert.equal(await reply(digits, "Yes, I'll call you in five minutes.", `wamid.typed.${stamp}`), true);
    const hold = await holdOf(conv);
    assert.equal(hold.state, "resolved", "REGRESSION: the customer stayed in Needs you over the owner's own answer");
    const { data: decision } = await db
      .from("decisions")
      .select("verb, subject_id, actor_user_id, payload")
      .eq("id", hold.decision_id)
      .single();
    assert.deepEqual(
      [decision.verb, decision.subject_id, decision.actor_user_id, decision.payload.via],
      ["resolve", conv, null, "whatsapp_business_app"],
      "one resolve, by no member: the owner answered from their phone",
    );
    assert.equal(await deadmanHas(conv), false);
    // Meta, redelivering: the echo is kept once, and nothing is settled twice.
    assert.equal(await reply(digits, "Yes, I'll call you in five minutes.", `wamid.typed.${stamp}`), true);
    const { count } = await db
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("subject_id", conv)
      .eq("verb", "resolve");
    assert.equal(count, 1);
  },
);

test(
  "S7-5: an automatic reply (within seconds of the customer's message) and a STOP's hold are not settled",
  { skip },
  async () => {
    const quick = `1646555${String((Date.now() + 2222) % 10000).padStart(4, "0")}`;
    const conv = await heldThread(quick, { agoMs: 3_000 });
    assert.equal(
      await reply(quick, "Thanks for your message! We'll reply soon.", `wamid.away.${stamp}`),
      true,
      "kept, and paused",
    );
    assert.equal((await holdOf(conv)).state, "open", "an away message is no answer");
    assert.equal(await deadmanHas(conv), true, "and the deadman still sees the hold");
    const stopped = `1646555${String((Date.now() + 3333) % 10000).padStart(4, "0")}`;
    const stop = await heldThread(stopped, { agoMs: 120_000, reason: "opt_out" });
    assert.equal(await reply(stopped, "Understood, we've removed you.", `wamid.stop.${stamp}`), true);
    assert.equal((await holdOf(stop)).state, "open", "a STOP's hold waits on nobody, and a reply settles none");
  },
);

test(
  "S7-5: the deadman leaves a hold a person answered on the dashboard, however its hold was left",
  { skip },
  async () => {
    const digits = `1646555${String((Date.now() + 4444) % 10000).padStart(4, "0")}`;
    const conv = await heldThread(digits, { agoMs: 120_000 });
    const { data: c } = await db.from("conversations").select("contact_id").eq("id", conv).single();
    const { error } = await db.from("messages").insert({
      tenant_id: tenantId,
      conversation_id: conv,
      contact_id: c.contact_id,
      channel: "whatsapp",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "On it.",
      external_id: `wamid.dash.${stamp}`,
      status: "sent",
    });
    if (error) throw new Error(error.message);
    assert.equal((await holdOf(conv)).state, "open", "the hold left open");
    assert.equal(await deadmanHas(conv), false, "REGRESSION: 'Still waiting' said of a customer a person answered");
  },
);

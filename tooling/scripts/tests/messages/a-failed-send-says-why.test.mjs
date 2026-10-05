/**
 * A failed send says why, in one sentence, to the owner (the 2 Oct 2026 audit, #5 / B1).
 *
 * `messages.error` (the provider's code and words) was written by the send, by the WhatsApp receipt, by the text's status
 * callback and by the ledger, and read by nothing: the thread said "Didn't send" and never why. It now travels in the
 * message DTO (a failed message's, and only that), and contracts' sendFailureWords says it as one sentence: a code whose
 * meaning the provider documents (or this repository already says) in plain words with its number, any other code by the
 * provider and the number, never a guess.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sendFailureWords, toConversationVM, toInboxThreadVM } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { conversations } = await import(at("apps/dashboard/src/server/readers/conversations.ts"));
const { messagesOf } = await import(at("apps/dashboard/src/server/readers/conversation.ts"));
const { failedErrorOf, groupMessages } = await import(at("apps/dashboard/src/server/dto.ts"));

const ZONE = "America/New_York";

/* ------------------------------------------------------------------ the words */

test("a code whose meaning is documented is said in plain words, with its number after it", () => {
  const wa = (code) => sendFailureWords({ errors: [{ code, title: "x" }] }, "whatsapp");
  assert.equal(
    wa(131047),
    "WhatsApp wouldn't send it: more than 24 hours have passed since they last replied, so only a template message can reach them now (WhatsApp error 131047).",
  );
  assert.match(wa(131026), /^WhatsApp couldn't deliver it: their number may not be on WhatsApp/);
  assert.match(wa(131049), /^WhatsApp chose not to deliver it/);

  const sms = (code) => sendFailureWords({ carrier: "undelivered", code: String(code) }, "sms");
  assert.equal(sms(21610), "They've opted out of texts from your number (Twilio error 21610).");
  assert.equal(sms(30007), "The text was filtered as a possible policy violation (Twilio error 30007).");
  assert.match(sms(30003), /^Their phone couldn't be reached/);
  assert.match(sms(30005), /^The carrier says this number is unknown/);
  assert.match(sms(30006), /^This number can't receive texts/);
  assert.match(sms(30034), /^Your texting line isn't registered with the carriers yet/);
});

test("a code nobody here can explain is said by the provider and the number, and never given a meaning", () => {
  assert.equal(
    sendFailureWords({ errors: [{ code: 131000 }] }, "whatsapp"),
    "WhatsApp didn't deliver it (error 131000).",
  );
  assert.equal(
    sendFailureWords({ carrier: "undelivered", code: "30099" }, "sms"),
    "Twilio didn't deliver it (error 30099).",
  );
  // The same number on the other wire is not the other wire's meaning: 30007 is a text's, not WhatsApp's.
  assert.equal(
    sendFailureWords({ errors: [{ code: 30007 }] }, "whatsapp"),
    "WhatsApp didn't deliver it (error 30007).",
  );
  assert.equal(
    sendFailureWords({ carrier: "undelivered", code: "131047" }, "sms"),
    "Twilio didn't deliver it (error 131047).",
  );
});

test("the code is found wherever the writer put it: a receipt, a status callback, or the answer to the send itself", () => {
  // The send's own answer is Graph's JSON cut at two hundred characters, so it is read for its code, not parsed.
  const cut =
    '{"error":{"message":"(#131047) Re-engagement message","type":"OAuthException","code":131047,"error_data":{"messaging_product":"whatsapp","details":"Message failed to send because more than 24 hours have passed s';
  assert.match(sendFailureWords({ http_status: 400, body: cut }, "whatsapp"), /\(WhatsApp error 131047\)\.$/);
  assert.match(
    sendFailureWords(
      { http_status: 400, body: { error: { code: 131026, message: "Message Undeliverable." } } },
      undefined,
    ),
    /\(WhatsApp error 131026\)\.$/,
    "a row that names no wire is WhatsApp's, as every thread draws it",
  );
  // A text's send names Twilio's code in its body.
  assert.match(sendFailureWords({ http_status: 400, body: "Twilio 30034" }, "sms"), /\(Twilio error 30034\)\.$/);
  assert.equal(sendFailureWords({ http_status: 400, body: "Twilio 400" }, "sms"), null, "a status is not a code");
});

test("without a code the words say what the provider's status said, or what the ledger settled it with, or nothing", () => {
  assert.equal(sendFailureWords({ carrier: "undelivered" }, "sms"), "The carrier didn't deliver it.");
  assert.equal(sendFailureWords({ carrier: "failed" }, "sms"), "The text couldn't be sent.");
  assert.equal(
    sendFailureWords({ provider: "bounced", kind: "Permanent", sub_kind: "General", message: null }, "email"),
    "The email bounced: their address didn't accept it.",
  );
  assert.equal(sendFailureWords({ provider: "failed" }, "email"), "The mail provider couldn't send it.");
  assert.match(sendFailureWords({ provider: "suppressed" }, "email"), /^The mail provider has stopped sending/);
  assert.equal(
    sendFailureWords({ reason: "never_delivered", note: "the job that would have sent this never ran" }, "whatsapp"),
    "It was never sent: the job that would have sent it never ran.",
  );
  assert.match(sendFailureWords({ reason: "run_interrupted", outcome: "unknown" }, "email"), /^It may not have gone/);
  assert.match(sendFailureWords({ reason: "orphaned" }, "sms"), /^It was never sent: no job was left/);
  assert.match(sendFailureWords({ http_status: 0, body: "timeout", outcome: "unknown" }, "email"), /may have gone/);
  for (const nothing of [null, undefined, "boom", 7, [], {}, { http_status: 503, body: "no_credentials" }])
    assert.equal(sendFailureWords(nothing, "whatsapp"), null, JSON.stringify(nothing));
});

test("every sentence is one sentence for a person: it ends in a full stop and holds no line break, JSON or raw word of the provider", () => {
  const said = [
    sendFailureWords({ errors: [{ code: 131047 }] }, "whatsapp"),
    sendFailureWords({ errors: [{ code: 131000 }] }, "whatsapp"),
    sendFailureWords({ code: "30007" }, "sms"),
    sendFailureWords({ code: "30099" }, "sms"),
    sendFailureWords({ carrier: "undelivered" }, "sms"),
    sendFailureWords({ provider: "bounced" }, "email"),
    sendFailureWords({ reason: "orphaned" }, "whatsapp"),
  ];
  for (const s of said) {
    assert.ok(s && s.endsWith("."), s);
    assert.ok(!/[\n{}"]/.test(s), s);
    assert.equal(s.split(/[.!?]\s/).length, 1, `one sentence: ${s}`);
  }
});

/* ------------------------------------------------------------ the thread's words */

const msg = (status, over = {}) => ({
  id: `m-${status}`,
  sender: "human",
  direction: "outbound",
  type: "text",
  body: "See you at 3",
  status,
  created_at: "2026-08-27T07:22:00Z",
  channel_ts: null,
  channel: "whatsapp",
  media: null,
  meta: null,
  ...over,
});
const thread = (messages) => ({
  id: "c1",
  state: "done",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: null,
  last_message_at: "2026-08-27T07:22:00Z",
  contact: {
    id: "k",
    display_name: null,
    wa_profile_name: null,
    phone_e164: "+19175550137",
    consent: "opted_in",
    dnc: false,
  },
  messages,
});
const REENGAGE = { errors: [{ code: 131047, title: "Re-engagement message" }] };

test("the failed bubble says why in both panes, and no other bubble says anything of the kind", () => {
  const dto = thread([
    msg("failed", { id: "bad", error: REENGAGE }),
    msg("delivered", { id: "ok", error: REENGAGE }), // a stale error on a message that arrived says nothing
    msg("failed", { id: "unsaid" }), // a failure whose row says nothing readable
    msg("canceled", { id: "off", error: REENGAGE }),
  ]);
  const inbox = toInboxThreadVM(dto, null, ZONE).timeline.filter((e) => e.type === "msg");
  const chat = toConversationVM(dto, null, ZONE).messages;
  for (const [bad, ok, unsaid, off] of [inbox, chat]) {
    assert.match(bad.failedWhy, /^WhatsApp wouldn't send it: more than 24 hours/);
    assert.equal(ok.failedWhy, undefined);
    assert.equal(unsaid.failedWhy, undefined);
    assert.equal(off.failedWhy, undefined);
    assert.equal(bad.statusLabel, "Didn't send", "the label is still the label");
  }
});

test("a text's failure is read as Twilio's, an email's as the mail provider's, on the row's own wire", () => {
  const dto = thread([
    msg("failed", { id: "t", channel: "sms", error: { carrier: "undelivered", code: "30007" } }),
    msg("failed", { id: "e", channel: "email", error: { provider: "bounced", kind: "Permanent" } }),
  ]);
  const [t, e] = toInboxThreadVM(dto, null, ZONE).timeline.filter((x) => x.type === "msg");
  assert.equal(t.failedWhy, "The text was filtered as a possible policy violation (Twilio error 30007).");
  assert.equal(e.failedWhy, "The email bounced: their address didn't accept it.");
});

/* -------------------------------------------------------------- what the server carries */

test("a failed message's error travels in the DTO, and no other message carries one", () => {
  assert.deepEqual(failedErrorOf("failed", REENGAGE), { error: REENGAGE });
  for (const status of ["sent", "delivered", "read", "queued", "canceled", "received"])
    assert.deepEqual(failedErrorOf(status, REENGAGE), {}, status);
  for (const junk of [null, undefined, "x", 3, [REENGAGE]])
    assert.deepEqual(failedErrorOf("failed", junk), {}, String(junk));

  const row = (id, status, error) => ({
    id,
    conversation_id: "c1",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "x",
    media: null,
    meta: {},
    status,
    created_at: `2026-08-27T07:2${id}:00Z`,
    channel_ts: null,
    channel: "whatsapp",
    ...(error === undefined ? {} : { error }),
  });
  // Oldest first: a failure that says nothing, a delivered message with a stale error, a failure that says why.
  const [none, ok, bad] = groupMessages([
    row("3", "failed", REENGAGE),
    row("2", "delivered", REENGAGE),
    row("1", "failed"),
  ]).get("c1");
  assert.deepEqual(bad.error, REENGAGE);
  assert.deepEqual([none.error, ok.error], [undefined, undefined]);
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = (id, conv, over = {}) => ({
  id,
  conversation_id: conv,
  tenant_id: T,
  direction: "outbound",
  sender: "human",
  type: "text",
  body: "See you at 3",
  media: null,
  meta: {},
  status: "sent",
  error: null,
  channel: "whatsapp",
  channel_ts: "2026-10-05T10:00:00Z",
  created_at: "2026-10-05T10:00:00Z",
  ...over,
});
const convo = (id) => ({
  id,
  tenant_id: T,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: null,
  last_message_at: "2026-10-05T10:00:00Z",
  contact_id: "k1",
  contacts: {
    id: "k1",
    display_name: "Ada",
    wa_profile_name: null,
    phone_e164: "+15550000001",
    email: null,
    consent: "opted_in",
    dnc: false,
    marketing_consent: null,
    proposal_url: null,
  },
});
const ctxOf = (tables) => ({ supabase: fakeDb(tables), userId: "u1", email: "ada@example.com", params: {} });
const turn = (ctx) => kernel.readerContext(ctx, { tenantId: T, role: "viewer" });

test("the Inbox's read asks for the errors of its failed messages, and of nothing else, in one read", async () => {
  // newest_messages answers twelve columns and error is not one of them (00258): the failed ones are asked for apart.
  const tables = {
    conversations: [convo("c1"), convo("c2")],
    messages: [
      row("m1", "c1", { status: "failed", error: REENGAGE, created_at: "2026-10-05T10:01:00Z" }),
      row("m2", "c1", { status: "delivered", error: REENGAGE, created_at: "2026-10-05T10:02:00Z" }),
      row("m3", "c2", { status: "failed", error: { carrier: "undelivered", code: "30007" }, channel: "sms" }),
      row("m4", "c2", { status: "sent", created_at: "2026-10-05T10:03:00Z" }),
    ],
  };
  const ctx = ctxOf(tables);
  const read = await kernel.load(turn(ctx), conversations, { ids: null });
  const byId = new Map(read.data.conversations.flatMap((c) => c.messages).map((m) => [m.id, m]));
  assert.deepEqual(byId.get("m1").error, REENGAGE);
  assert.deepEqual(byId.get("m3").error, { carrier: "undelivered", code: "30007" });
  assert.equal(byId.get("m2").error, undefined, "a delivered message carries none");
  assert.equal(byId.get("m4").error, undefined);
  const asked = ctx.supabase.seen.filter((q) => q.table === "messages" && q.op === "select");
  assert.equal(asked.length, 1, "one read for every failed message of the answer");

  // Nothing failed, no read.
  const quiet = ctxOf({ conversations: [convo("c1")], messages: [row("m5", "c1")] });
  await kernel.load(turn(quiet), conversations, { ids: null });
  assert.equal(quiet.supabase.seen.filter((q) => q.table === "messages" && q.op === "select").length, 0);
});

test("a thread read by itself carries a failed message's error too", async () => {
  const ctx = ctxOf({
    conversations: [convo("c1")],
    messages: [row("m1", "c1", { status: "failed", error: REENGAGE }), row("m2", "c1", { status: "sent" })],
  });
  const list = (await kernel.load(turn(ctx), messagesOf, { id: "c1", before: null })).data;
  assert.deepEqual(list.find((m) => m.id === "m1").error, REENGAGE);
  assert.equal(list.find((m) => m.id === "m2").error, undefined);
});

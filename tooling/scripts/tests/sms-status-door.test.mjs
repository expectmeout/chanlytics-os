/**
 * The status door: the carrier's word on a text we sent, proven and recorded.
 *
 * The same world as sms-door.test.mjs: one workspace, one approved texting
 * line whose subaccount token lives in the vault. A status callback signed
 * with that token moves the row by its sid the way a WhatsApp receipt does;
 * one signed with anything else is refused before the row is looked at.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { twilioSignature } from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/sms-status.ts"));
after(() => setPg(null));

const DOOR = "https://chanlytics-messaging.vercel.app/api/sms-status";
const pad = (n, width) => String(n).padStart(width, "0");
let seq = 0;

function world() {
  const i = ++seq;
  const T = `dddddddd-0000-4000-8000-${pad(i, 12)}`;
  const LINE = `+1305555${4000 + i}`;
  const TOKEN = `subaccount-token-${i}`;
  const line = { id: `eeeeeeee-0000-4000-8000-${pad(i, 12)}`, tenant_id: T, e164: LINE, provider: "twilio", subaccount_sid: `AC${pad(i, 32)}`, messaging_service_sid: `MG${pad(i, 32)}`, sms_state: "active", voice_state: "active" };
  const sid = `SM${pad(i, 32)}`;
  const row = { id: `m-${i}`, tenant_id: T, conversation_id: "cv-1", direction: "outbound", sender: "human", channel: "sms", external_id: sid, status: "sent", error: null };
  const tables = { lines: [line], messages: [row] };
  const db = fakeDb(tables, {}, { get_line_credentials: ({ p_line_id }) => (p_line_id === line.id ? { auth_token: TOKEN } : {}) });
  setPg(db);
  const form = (over = {}) => ({ MessageSid: sid, MessageStatus: "delivered", From: LINE, To: "+16465550100", AccountSid: line.subaccount_sid, MessagingServiceSid: line.messaging_service_sid, ...over });
  const post = async (fields, token = TOKEN, url = DOOR) => {
    const headers = { "content-type": "application/x-www-form-urlencoded", ...(token ? { "x-twilio-signature": await twilioSignature(token, url, fields) } : {}) };
    const res = await door.POST(new Request(url, { method: "POST", headers, body: new URLSearchParams(fields).toString() }), { waitUntil: () => {} });
    return res.status;
  };
  return { T, LINE, TOKEN, line, row, tables, form, post };
}

test("delivered, read, and a carrier's refusal each land on the row by its sid; the refusal keeps the carrier's code", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageStatus: "delivered" })), 200);
  assert.equal(w.row.status, "delivered");
  assert.equal(await w.post(w.form({ MessageStatus: "read" })), 200);
  assert.equal(w.row.status, "read");

  const x = world();
  assert.equal(await x.post(x.form({ MessageStatus: "undelivered", ErrorCode: "30007" })), 200);
  assert.equal(x.row.status, "failed");
  assert.deepEqual(x.row.error, { carrier: "undelivered", code: "30007" }, "the Inbox can say why: the carrier filtered it");
});

test("the interim words say nothing the row does not know: queued, accepted and sending are 200 and leave it alone", async () => {
  const w = world();
  for (const status of ["queued", "accepted", "sending"]) {
    assert.equal(await w.post(w.form({ MessageStatus: status })), 200, status);
    assert.equal(w.row.status, "sent", status);
  }
});

test("proven first: a signature over another token is 403 and the row is untouched; no signature at all is 403; a number no line carries is 404", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageStatus: "delivered" }), "not-the-token"), 403);
  assert.equal(w.row.status, "sent");
  assert.equal(await w.post(w.form({ MessageStatus: "delivered" }), null), 403);
  assert.equal(await w.post(w.form({ MessageStatus: "delivered", From: "+13055550000" })), 404, "the line is the From: an unknown one cannot be authenticated");
  assert.equal(w.row.status, "sent");
});

test("a sid no row carries is let go with a 200: Twilio must not retry it; a form that is not a status is 400", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageSid: "SM" + "9".repeat(32), MessageStatus: "delivered" })), 200);
  assert.equal(w.row.status, "sent");
  assert.equal(await w.post({ From: w.LINE, To: "+16465550100" }), 400);
});

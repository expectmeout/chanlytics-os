/**
 * The SMS door, executed.
 *
 * Until now the texting ingress was held by sixteen source scans and nothing
 * had ever run it: a file read as text, with the highest risk on the page.
 * What decides a text's fate is `planSmsIngress`, and it runs here for real
 * over a database in memory — the actual line lookup, the actual credential
 * read, Twilio's actual signature rule, the actual channel resolution.
 * Nothing is injected, because every reader it calls takes its database as
 * an argument.
 *
 * What is asserted is what Twilio and the platform would see: the status the
 * provider hears, whether it will redeliver, and the sentence a person is
 * paged with — or, for the one refusal that must page nobody, that they are
 * not.
 *
 * EVERY CASE USES ITS OWN NUMBER. The channel resolver caches a routing
 * answer for five minutes in module state, so two cases sharing a number
 * would have the second read the first's answer instead of the database, and
 * it would pass while proving nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { twilioSignature, SMS_FOOTER, SMS_HELD_REASON, SMS_HELD_DETAILS } from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { planSmsIngress, carrierFor, smsAfterThrow } = await import(at("apps/edge/lib/sms-ingress.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const URL_ = "https://chanlytics-messaging.vercel.app/api/inbound-sms";
const TOKEN = "subaccount-token-1234";

/** A number nobody else in this file uses, so the resolver's cache cannot answer for us. */
let seq = 0;
const freshNumber = () => `+1305555${1000 + ++seq}`;

const lineRow = (to, over = {}) => ({
  id: "l1", tenant_id: T, e164: to, provider: "dry",
  subaccount_sid: "AC1", messaging_service_sid: "MG1",
  sms_state: "active", voice_state: "active", ...over,
});
const channelRow = (to, over = {}) => ({
  id: "c1", tenant_id: T, kind: "sms", external_id: to, number_e164: to,
  credentials_ref: null, config: {}, status: "active", ...over,
});
const form = (to, over = {}) => ({
  MessageSid: "SM0001", AccountSid: "AC1", From: "+16465550123", To: to,
  Body: "Are you open Saturday?", NumMedia: "0", MessagingServiceSid: "MG1", ...over,
});
const inboundOf = (f) => ({
  messageSid: f.MessageSid, from: f.From, to: f.To, body: f.Body ?? "",
  numMedia: Number(f.NumMedia ?? 0), mediaTypes: [],
  optOutType: f.OptOutType ?? null, messagingServiceSid: f.MessagingServiceSid ?? null, accountSid: f.AccountSid ?? null,
});

/** The world as it is when everything is in order, unless a case says otherwise. */
function world(to, { lines = [lineRow(to)], channels = [channelRow(to)], faults = {}, secrets = { auth_token: TOKEN } } = {}) {
  return fakeDb({ lines, tenant_channels: channels }, faults, { get_line_credentials: () => secrets });
}
const plan = (to, db, over = {}) => {
  const f = over.form ?? form(to);
  return planSmsIngress({ inbound: inboundOf(f), form: f, url: URL_, signature: over.signature ?? null, db });
};

test("a text on a healthy line is accepted, routed to its workspace, and not held", async () => {
  const to = freshNumber();
  const v = await plan(to, world(to));
  assert.equal(v.kind, "accept");
  assert.equal(v.held, false, "an approved line answers");
  assert.equal(v.routed.tenantId, T);
  assert.equal(v.routed.channelId, "c1");
  assert.equal(v.acct.token, TOKEN, "the subaccount's own token, from the vault");
  assert.equal(v.line.e164, to);
});

test("a line the carriers have not approved is accepted and HELD: recorded, never answered", async () => {
  // One number for the whole loop on purpose: only the LINE differs between
  // these cases, and the line is read fresh every time. The routing answer is
  // the thing that gets cached, and it is identical for all four.
  const to = freshNumber();
  for (const state of ["registering", "pending", "failed", null]) {
    const v = await plan(to, world(to, { lines: [lineRow(to, { sms_state: state })] }));
    assert.equal(v.kind, "accept", String(state));
    assert.equal(v.held, true, `sms_state ${state} must hold the text`);
  }
  // And only "active" lets the receptionist speak.
  const open = freshNumber();
  assert.equal((await plan(open, world(open))).held, false);
});

test("a number no line carries is a 404, and the platform is told once for the whole class", async () => {
  const to = freshNumber();
  const v = await plan(to, world(to, { lines: [] }));
  // Twilio signs with the LINE's own subaccount token, so this refusal happens
  // before anything can be authenticated: the `To` is whatever the caller
  // wrote. Suppressing per number meant a POST loop that changed it every
  // request sent one email per request and buried every real alert; the
  // constant key caps the class at one per window, like a known number.
  assert.deepEqual(v, { kind: "refuse", status: 404, log: "sms_unknown_line", level: "warn", alert: "no line row carries this number", alertKey: "unknown-line" });
  const other = await plan(freshNumber(), world(to, { lines: [] }));
  assert.equal(other.alertKey, v.alertKey, "a different To is the same alert");
});

test("a line whose voice provisioning failed is not a line at all", async () => {
  // lineByNumber excludes failed rows, so this is the unknown-line answer
  // rather than a half-provisioned line being trusted.
  const to = freshNumber();
  const v = await plan(to, world(to, { lines: [lineRow(to, { voice_state: "failed" })] }));
  assert.equal(v.status, 404);
});

test("a line with no token in the vault refuses 503, because the signature cannot be checked without one", async () => {
  const to = freshNumber();
  const v = await plan(to, world(to, { secrets: {} }));
  assert.deepEqual(v, { kind: "refuse", status: 503, log: "sms_line_without_account", level: "error", alert: "the line has no subaccount or no token in the vault" });
});

test("a read that throws is a 503 so Twilio's own log carries the trace, never a 500 nobody looks at", async () => {
  const to = freshNumber();
  const v = await plan(to, world(to, { faults: { "lines.select": { message: "connection reset" } } }));
  assert.deepEqual(v, { kind: "refuse", status: 503, log: "sms_line_unreadable", level: "error", alert: "the line or its token could not be read" });
});

test("the signature is Twilio's real rule: a forged one is refused, and it pages nobody", async () => {
  const to = freshNumber();
  const f = form(to);
  const v = await plan(to, world(to, { lines: [lineRow(to, { provider: "twilio" })] }), { form: f, signature: "not-a-signature" });
  assert.equal(v.kind, "refuse");
  assert.equal(v.status, 403);
  assert.equal(v.level, "warn");
  // THE ONE REFUSAL THAT ALERTS NOBODY. An unsigned POST is what a probe of a
  // public URL looks like; paging a person for it is how an alarm stops being
  // read.
  assert.equal(v.alert, null, "a forged signature must not page anyone");
});

test("a correctly signed text on a real provider is accepted", async () => {
  const to = freshNumber();
  const f = form(to);
  const sig = await twilioSignature(TOKEN, URL_, f);
  const v = await plan(to, world(to, { lines: [lineRow(to, { provider: "twilio" })] }), { form: f, signature: sig });
  assert.equal(v.kind, "accept", "the token from the vault verifies the delivery");
});

test("the dry provider signs nothing, and only the dry provider", async () => {
  const to = freshNumber();
  const dry = await plan(to, world(to), { signature: null });
  assert.equal(dry.kind, "accept", "a preview line has no signature to check");
  const to2 = freshNumber();
  const real = await plan(to2, world(to2, { lines: [lineRow(to2, { provider: "twilio" })] }), { signature: null });
  assert.equal(real.status, 403, "a real line with no signature is refused");
});

test("a channel row that is missing or switched off is answered 200: Twilio must stop asking", async () => {
  const off = freshNumber();
  const disabled = await plan(off, world(off, { channels: [channelRow(off, { status: "disabled" })] }));
  assert.deepEqual(disabled, { kind: "refuse", status: 200, log: "sms_unroutable", level: "error", alert: "the sms channel row is missing or not active" });
  const gone = freshNumber();
  const missing = await plan(gone, world(gone, { channels: [] }));
  assert.equal(missing.status, 200, "no row is an answer, not a retry");
});

test("a channel lookup that FAILED is 503, because that one is ours to retry", async () => {
  const to = freshNumber();
  const v = await plan(to, world(to, { faults: { "tenant_channels.select": { message: "timeout" } } }));
  assert.deepEqual(v, { kind: "refuse", status: 503, log: "sms_routing_lookup_failed", level: "error", alert: "the sms channel row could not be read" });
  // The two must never share a status: one asks the provider to send the text
  // again, the other tells it never to.
  assert.notEqual(v.status, 200);
});

test("the carrier is this message's wire: the footer once, the hold's words, the carrier's own STOP", async () => {
  const sent = [];
  const sender = { send: async (to, body) => { sent.push({ to, body }); return { ok: true, wamid: "SM1", status: 201 }; } };

  const open = carrierFor(inboundOf(form("+13055550100")), false, sender);
  assert.equal(open.channel, "sms");
  assert.equal(open.held, null);
  assert.equal(open.body("We open at 9.", true), `We open at 9.\n${SMS_FOOTER}`, "the first reply carries the footer");
  assert.equal(open.body("We open at 9.", false), "We open at 9.");
  await open.send("16465550123", "hello");
  assert.deepEqual(sent, [{ to: "+16465550123", body: "hello" }], "digits become E.164 on the way out");

  // Held: no sender at all, so a send is a refusal with a status rather than a
  // silent success some branch could mistake for a delivery.
  const held = carrierFor(inboundOf(form("+13055550100")), true, null);
  assert.deepEqual(held.held, { reason: SMS_HELD_REASON, details: SMS_HELD_DETAILS });
  assert.deepEqual(await held.send("16465550123", "hello"), { ok: false, wamid: null, status: 503 });

  // The carrier's verdict and the carriers' words both reach the consent gate.
  assert.deepEqual(carrierFor(inboundOf(form("+1", { OptOutType: "STOP" })), false, sender).consent, { optOut: true, optIn: false });
  assert.deepEqual(carrierFor(inboundOf(form("+1", { Body: "CANCEL" })), false, sender).consent, { optOut: true, optIn: false });
  assert.equal(carrierFor(inboundOf(form("+1", { Body: "hello" })), false, sender).consent, null);
});

test("after the handler throws, only an unrecorded text is worth redelivering", async () => {
  assert.deepEqual(smsAfterThrow(true), { status: 503, alert: "the text could not be recorded" });
  // Anything else already happened after the words were kept; asking Twilio to
  // send the same text again would only duplicate it.
  assert.deepEqual(smsAfterThrow(false), { status: 200, alert: null });
});

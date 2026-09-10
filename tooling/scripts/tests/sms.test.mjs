/**
 * Texting, stage one: a text on a Chanlytics line takes the road a WhatsApp
 * message takes. The pure parts executed — Twilio's webhook read into one
 * shape, that shape as the handler's message, the signature rule, the
 * footer rule, the saga's messaging step, the provider's calls pinned to
 * the documented URLs and fields — and the wiring: the signature proven
 * before anything is trusted, the hold before any branch that speaks, the
 * channel carried on every row, a second wire for the job runner and the
 * Inbox reply.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  smsInboundFrom, smsAsWaMessage, smsBody, SMS_FOOTER, SMS_MAX_CHARS, SMS_HELD_REASON, smsInboundUrl,
  twilioSignedString, twilioSignature, verifyTwilioSignature, sameSignature,
  normalizeInbound, runLineSaga, nextLineStep, dryProvider, twilioProvider, twilioUrls,
} from "@chanlytics/channels";
import { ESCALATION_REASONS, LINE_STEP_WORDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const FORM = { MessageSid: "SM0001", AccountSid: "AC1", From: "+16465550123", To: "+13055550100", Body: "Are you open Saturday?", NumMedia: "0", MessagingServiceSid: "MG1" };

test("Twilio's webhook becomes one shape; a picture with words is its words, a picture alone is unsupported; STOP is an opt-out on the way in", () => {
  const s = smsInboundFrom(FORM);
  assert.deepEqual(s, { messageSid: "SM0001", from: "+16465550123", to: "+13055550100", body: "Are you open Saturday?", numMedia: 0, mediaTypes: [], optOutType: null, messagingServiceSid: "MG1", accountSid: "AC1" });
  assert.equal(smsInboundFrom({ Body: "x" }), null, "not a message");
  const m = smsAsWaMessage(s, Date.parse("2026-09-07T15:00:00Z"));
  assert.deepEqual(m, { from: "16465550123", id: "SM0001", timestamp: "1788793200", type: "text", text: { body: "Are you open Saturday?" } });
  const n = normalizeInbound(m, {});
  assert.equal(n.kind, "text");
  assert.equal(n.body, "Are you open Saturday?");
  assert.equal(n.phoneDigits, "16465550123");
  const pic = smsAsWaMessage(smsInboundFrom({ ...FORM, Body: "this one", NumMedia: "1", MediaContentType0: "image/jpeg" }));
  assert.equal(pic.text.body, "this one [with a picture]");
  const alone = normalizeInbound(smsAsWaMessage(smsInboundFrom({ ...FORM, Body: "", NumMedia: "2" })), {});
  assert.equal(alone.kind, "unsupported");
  assert.notEqual(alone.type, "text");
  const stop = normalizeInbound(smsAsWaMessage(smsInboundFrom({ ...FORM, Body: "STOP", OptOutType: "STOP" })), {});
  assert.equal(stop.optOut, true, "the consent gate sees it as it sees a WhatsApp STOP");
  assert.equal(smsInboundFrom({ ...FORM, OptOutType: "start" }).optOutType, "START");
});

test("the footer rides the first reply only, never twice, never over the ceiling", () => {
  assert.equal(smsBody("We open at 9.", true), `We open at 9.\n${SMS_FOOTER}`);
  assert.equal(smsBody("We open at 9.", false), "We open at 9.");
  assert.equal(smsBody("Reply STOP any time.", true), "Reply STOP any time.", "words that already say STOP carry no second footer");
  const long = smsBody("x".repeat(2000), false);
  assert.equal(long.length, SMS_MAX_CHARS);
  assert.ok(long.endsWith("…"));
  assert.equal(smsInboundUrl("https://chanlytics-messaging.vercel.app/api/retell-fn"), "https://chanlytics-messaging.vercel.app/api/inbound-sms");
});

test("the signature: Twilio's exact rule, and a tampered field fails", async () => {
  const url = "https://chanlytics-messaging.vercel.app/api/inbound-sms";
  const token = "secret-token-1234";
  const signed = twilioSignedString(url, FORM);
  assert.equal(signed, url + "AccountSidAC1" + "BodyAre you open Saturday?" + "From+16465550123" + "MessageSidSM0001" + "MessagingServiceSidMG1" + "NumMedia0" + "To+13055550100", "URL, then every field sorted by name with its value appended");
  const expected = crypto.createHmac("sha1", token).update(signed).digest("base64");
  assert.equal(await twilioSignature(token, url, FORM), expected);
  assert.equal(await verifyTwilioSignature(token, url, FORM, expected), true);
  assert.equal(await verifyTwilioSignature(token, url, { ...FORM, Body: "Are you open Sunday?" }, expected), false);
  assert.equal(await verifyTwilioSignature(token, `${url}?x=1`, FORM, expected), false, "the query string is part of the URL");
  assert.equal(await verifyTwilioSignature(token, url, FORM, null), false);
  assert.equal(sameSignature("abc", "abd"), false);
  assert.equal(sameSignature("abc", "abc"), true);
});

const LINE_ID = "0f3c2a1e-1111-4222-8333-444455556666";
const line = (over = {}) => ({
  id: LINE_ID, tenant_id: "t1", e164: "+13055550100", provider: "dry", area_code: 305,
  subaccount_sid: "AC1", number_sid: "PN1", trunk_sid: "TK1", credential_list_sid: "CL1", termination_uri: "x.pstn.twilio.com", messaging_service_sid: null, retell_agent_id: "agent_x",
  voice_state: "provisioning", step: null, last_error: null, state_since: "2026-09-07T00:00:00Z",
  facts: { trunk_ready: true, retell_imported: true },
  ...over,
});

test("the saga's messaging step: the service, the number in it, then both routing rows; each part idempotent", async () => {
  const provider = dryProvider(3);
  const saves = [];
  const rows = { voice: [], sms: [] };
  const ports = {
    provider, master: { sid: "ACmaster", token: "m" }, tenant: { id: "t1", name: "Harbor Moving Co." }, now: () => "2026-09-07T12:00:00Z",
    store: { save: async (p) => { saves.push(p); }, getSecrets: async () => ({ auth_token: "sub-token" }), putSecrets: async () => {} },
    agent: { ensure: async () => ({ agentId: "agent_x", llmId: null, pinned: true }) },
    retell: { importNumber: async () => ({ ok: true, status: 201, body: {} }) },
    channel: { ensure: async (o) => { rows.voice.push(o); return { channelId: "ch1", created: true }; } },
    smsChannel: { ensure: async (o) => { rows.sms.push(o); return { channelId: "chs1", created: true }; } },
    inboundWebhookUrl: "https://edge/api/retell-inbound?key=s", smsInboundUrl: "https://edge/api/inbound-sms", nickname: "n",
  };
  assert.equal(nextLineStep(line()), "messaging");
  const r = await runLineSaga(line(), ports);
  assert.equal(r.ok, true);
  assert.deepEqual(provider.calls.map((c) => c.op), ["createMessagingService", "addNumberToService"]);
  assert.deepEqual(provider.calls[0].args, ["AC1", { friendlyName: "Harbor Moving Co. · Chanlytics", inboundUrl: "https://edge/api/inbound-sms" }], "the subaccount, and our webhook");
  assert.equal(provider.calls[1].args[2], "PN1");
  assert.match(r.line.messaging_service_sid, /^MG/);
  assert.equal(r.line.facts.number_in_service, true);
  assert.deepEqual(rows.sms, [{ e164: "+13055550100", lineId: LINE_ID, serviceSid: r.line.messaging_service_sid }]);
  assert.equal(r.line.facts.sms_channel_id, "chs1");
  assert.equal(r.line.facts.channel_id, "ch1");
  // Resumed with the service made but the number not yet in it: only that call.
  const half = line({ messaging_service_sid: "MG9" });
  const p2 = dryProvider(9);
  await runLineSaga(half, { ...ports, provider: p2 });
  assert.deepEqual(p2.calls.map((c) => c.op), ["addNumberToService"]);
  assert.equal(LINE_STEP_WORDS.messaging, "setting up texting");
});

test("Twilio's calls, pinned: the Messaging Service, the sender pool, the message; a refusal is an answer with its code", async () => {
  const calls = [];
  const http = async (acct, method, url, form) => {
    calls.push({ acct: acct.sid, method, url, form });
    if (url.endsWith("/Messages.json") && form.To === "+10000000000") return { status: 400, body: { code: 21610, message: "opted out" } };
    return { status: 201, body: { sid: url.includes("/Services/") ? "PH1" : url.includes("/Services") ? "MG1" : "SM1" } };
  };
  const p = twilioProvider(http);
  const acct = { sid: "ACsub", token: "t" };
  assert.deepEqual(await p.createMessagingService(acct, { friendlyName: "Harbor · Chanlytics", inboundUrl: "https://edge/api/inbound-sms" }), { sid: "MG1" });
  assert.deepEqual(calls[0], { acct: "ACsub", method: "POST", url: "https://messaging.twilio.com/v1/Services", form: { FriendlyName: "Harbor · Chanlytics", InboundRequestUrl: "https://edge/api/inbound-sms", InboundMethod: "POST", UseInboundWebhookOnNumber: "false", StickySender: "true", SmartEncoding: "true" } });
  assert.deepEqual(await p.addNumberToService(acct, "MG1", "PN1"), { sid: "PH1" });
  assert.deepEqual(calls[1], { acct: "ACsub", method: "POST", url: "https://messaging.twilio.com/v1/Services/MG1/PhoneNumbers", form: { PhoneNumberSid: "PN1" } });
  assert.deepEqual(await p.sendSms(acct, { serviceSid: "MG1", to: "+16465550123", body: "hi" }), { ok: true, sid: "SM1", status: 201, code: null });
  assert.deepEqual(calls[2], { acct: "ACsub", method: "POST", url: "https://api.twilio.com/2010-04-01/Accounts/ACsub/Messages.json", form: { MessagingServiceSid: "MG1", To: "+16465550123", Body: "hi" } });
  assert.deepEqual(await p.sendSms(acct, { serviceSid: "MG1", to: "+10000000000", body: "hi" }), { ok: false, sid: null, status: 400, code: 21610 });
  assert.equal(twilioUrls.messages("AC1"), "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
});

test("the pilot allowlist gates the deployment's own number, never a tenant that brought its own", () => {
  const code = readCode("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(
    code.includes("if (isEnvDefault && allow.length && !allow.includes(from)) {"),
    "REGRESSION: the pilot allowlist muted every tenant on every channel — a business that connected its own number had its customers persisted, marked processed and never answered",
  );
  const raw = readRaw("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(raw.includes("THE PILOT ALLOWLIST, scoped to the number it was made for."), "and the reason it is scoped stays written down");
  // A text never arrives on the deployment's own WhatsApp number, so the
  // allowlist can never gate one; the endpoint says so by passing false.
  assert.ok(readCode("apps/edge/api/inbound-sms.ts").includes("handleInbound(smsAsWaMessage(inbound), {}, routed.tenantId, routed, false, false, carrier)"));
});

test("the wiring: proven before trusted, held before spoken, the channel on every row, a second wire", () => {
  assert.ok(ESCALATION_REASONS.includes(SMS_HELD_REASON));
  const hook = readCode("apps/edge/api/inbound-sms.ts");
  assert.ok(hook.indexOf("verifyTwilioSignature(acct.token, request.url, form, request.headers.get(\"x-twilio-signature\"))") < hook.indexOf('resolveChannelDetailed(db, "sms", inbound.to)'), "the signature before the routing");
  assert.ok(hook.includes('if (line.provider !== "dry") {'), "only the dry provider signs nothing");
  assert.ok(hook.includes('const held = line.sms_state !== "active";') && hook.includes("held: held ? { reason: SMS_HELD_REASON, details: SMS_HELD_DETAILS } : null,"));
  assert.ok(hook.includes("handleInbound(smsAsWaMessage(inbound), {}, routed.tenantId, routed, false, false, carrier)"));
  assert.ok(hook.includes('text(status, EMPTY_TWIML, { "content-type": "text/xml" })'), "Twilio hears an empty TwiML, never words from here");
  const road = readRaw("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(road.indexOf("if (carrier?.held) {") > road.indexOf("if (optedOut) {") && road.indexOf("if (carrier?.held) {") < road.indexOf("// Routing is on the NORMALIZED type"), "after consent, before any branch that speaks");
  const code = readCode("apps/edge/lib/whatsapp/inbound.ts");
  // EVERY ingest, not three of them: a count breaks whenever a legitimate new
  // ingest is added (the unreachable-sender guard was the fourth) and says
  // nothing about the one that might have dropped the channel.
  assert.equal(
    (code.match(/pgIngest\(/g) ?? []).length,
    (code.match(/pgIngest\(tenantId, n, channel\)/g) ?? []).length,
    "every ingest carries the channel",
  );
  assert.ok(code.includes("const send = (text: string) => (carrier ? carrier.send(from, wire(text)) : sendText(from, text, rt));") && !code.includes("await sendText(from, replyText, rt)"), "one door out");
  assert.ok(code.includes("queueReply(db, tenantId, ing, from, wire(replyText), delayMs, L, plan.source, brainMeta, channel)"), "a held draft is written for its wire");
  const persist = readCode("apps/edge/lib/whatsapp/persist.ts");
  assert.ok(persist.includes('channel: "whatsapp" | "sms" = "whatsapp"') && persist.includes("sender: \"ai\", body, externalId: wamid, channel,"));
  assert.ok(readCode("packages/db/src/repositories/ingest.ts").includes('channel: p.channel ?? "whatsapp",'), "an outbound row says its wire");
  const jobs = readCode("packages/jobs/src/handlers.ts");
  assert.ok(jobs.includes("sms: (ctx, to, p) =>") && jobs.includes('errorBody: "no texting line"'), "no line = a loud failure, never the other wire");
  assert.ok(readCode("apps/edge/api/jobs/tick.ts").includes("sms: await smsSenderForTenant(db, job.tenant_id),"));
  const reply = readCode("apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts");
  // The channel and the window are rules that return values now (replyChannelOf
  // in verbs, replyWindow in contracts), and reply-window.test.mjs runs both.
  // What is left to pin here is the wiring: the route sends on the channel it
  // read, under that channel's window.
  assert.ok(reply.includes("const replyChannel = await replyChannelOf(ctx, conv);") && reply.includes("channel: replyChannel,") && reply.includes("const window = replyWindow(replyChannel, conv.last_wa_inbound_at);"), "a person replies where the customer last wrote, with no window on a text");
  const sql = readRaw("supabase/migrations/00074_texting.sql");
  assert.ok(sql.includes("'messaging'") && sql.includes("'carriers'"));
  assert.ok(readRaw("apps/edge/vercel.json").includes('"api/inbound-sms.ts"'));
  const edge = readCode("apps/edge/lib/lines.ts");
  assert.ok(edge.includes("smsInboundUrl: smsInboundUrl(edgeFnUrl()),") && edge.includes('.eq("kind", "sms").eq("external_id", e164)'), "the sms row is keyed on the number the text was sent to");
  // One value says where this deployment answers, so a provider is never
  // told an address baked into a shared package.
  assert.ok(edge.includes("export function edgeFnUrl(): string {") && edge.includes("process.env.EDGE_ORIGIN"));
  assert.ok(edge.includes("inboundWebhookUrl: withKey(voiceEndpoints(edgeFnUrl()).inbound"), "the voice webhook is built from the same value");
  assert.ok(readCode("apps/edge/api/admin/voice-provision.ts").includes("voiceEndpoints(edgeFnUrl())"), "and so is the one the provisioner sends");
  assert.ok(readCode("apps/edge/lib/lines.ts").includes("export function lineForClient(r: Row): LineDto {"), "REGRESSION: the page's line shape was a loose object, so a field added on one side and forgotten on the other compiled and arrived undefined");
});

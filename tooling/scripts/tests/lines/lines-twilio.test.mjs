/**
 * Twilio as a LineProvider, method by method, over a scripted `http` and no network. lines-saga.test.mjs pins each
 * request's URL and parameters and the answers when all goes well, sms.test.mjs the messaging calls. This pins the
 * rest of what each method answers: the sid a create must come back with, the statuses a delete takes as done, what
 * the answer falls back to when Twilio leaves a field out, Twilio's 64-character names, the search's page size, a
 * text's callback, and a port that fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { twilioProvider, TwilioError } from "@chanlytics/channels";

const master = { sid: "ACmaster", token: "t" };
const acct = { sid: "ACsub", token: "s" };

/** A provider whose every call is answered by `answer` (an answer, or one made from the verb and URL), and its calls. */
function over(answer) {
  const calls = [];
  const provider = twilioProvider(async (a, method, url, form) => {
    calls.push({ acct: a.sid, method, url, form });
    return typeof answer === "function" ? answer(method, url) : answer;
  });
  return { provider, calls };
}

/** Every method, as the saga and the sender call it, in the provider's order. */
const CALLS = {
  createSubaccount: (p) => p.createSubaccount(master, "Harbor"),
  findSubaccount: (p) => p.findSubaccount(master, "Harbor"),
  findTrunk: (p) => p.findTrunk(acct, "chanlytics-abc.pstn.twilio.com"),
  findCredentialList: (p) => p.findCredentialList(acct, "Harbor"),
  findCredential: (p) => p.findCredential(acct, "CL1", "line-abc"),
  deleteCredential: (p) => p.deleteCredential(acct, "CL1", "CR1"),
  findOrigination: (p) => p.findOrigination(acct, "TK1", "sip:sip.retellai.com"),
  searchLocal: (p) => p.searchLocal(acct, { areaCode: 305, limit: 8 }),
  buyNumber: (p) => p.buyNumber(acct, "+13055550100", "Harbor"),
  ownedNumber: (p) => p.ownedNumber(acct, "+13055550100"),
  releaseNumber: (p) => p.releaseNumber(acct, "PN1"),
  createTrunk: (p) => p.createTrunk(acct, { friendlyName: "Harbor", domainName: "chanlytics-abc.pstn.twilio.com" }),
  deleteTrunk: (p) => p.deleteTrunk(acct, "TK1"),
  createCredentialList: (p) => p.createCredentialList(acct, "Harbor"),
  addCredential: (p) => p.addCredential(acct, "CL1", "line-abc", "x"),
  attachCredentialList: (p) => p.attachCredentialList(acct, "TK1", "CL1"),
  addOrigination: (p) => p.addOrigination(acct, "TK1", { sipUrl: "sip:sip.retellai.com", friendlyName: "Retell" }),
  attachNumber: (p) => p.attachNumber(acct, "TK1", "PN1"),
  createMessagingService: (p) =>
    p.createMessagingService(acct, { friendlyName: "Harbor", inboundUrl: "https://edge.example.com/api/inbound-sms" }),
  addNumberToService: (p) => p.addNumberToService(acct, "MG1", "PN1"),
  sendSms: (p) => p.sendSms(acct, { serviceSid: "MG1", to: "+16465550123", body: "hi" }),
};

test("Twilio: the provider is every method of a line provider, each one call as the account it is handed", async () => {
  assert.deepEqual(Object.keys(twilioProvider()), ["name", ...Object.keys(CALLS)]);
  assert.equal(twilioProvider().name, "twilio");
  for (const [name, call] of Object.entries(CALLS)) {
    const { provider, calls } = over({ status: 204, body: null });
    await call(provider).catch(() => {});
    assert.equal(calls.length, 1, name);
    assert.equal(calls[0].acct, name.endsWith("Subaccount") ? "ACmaster" : "ACsub", name);
  }
  const down = new Error("socket hang up");
  const failing = twilioProvider(async () => {
    throw down;
  });
  for (const [name, call] of Object.entries(CALLS)) {
    await assert.rejects(call(failing), (e) => e === down, `${name}: the port's own error, never an answer`);
  }
});

test("Twilio: a create answered without its sid is a refusal, never a thing half made", async () => {
  const words = {
    createSubaccount: "create subaccount answered without sid/auth_token",
    buyNumber: "buy number answered without a sid",
    createTrunk: "create trunk answered without a sid",
    createCredentialList: "create credential list answered without a sid",
    addCredential: "add credential answered without a sid",
    addOrigination: "add origination answered without a sid",
    createMessagingService: "create messaging service answered without a sid",
    addNumberToService: "add number to messaging service answered without a sid",
  };
  for (const [name, what] of Object.entries(words)) {
    for (const body of [{}, { sid: "" }, { sid: 7 }]) {
      await assert.rejects(
        CALLS[name](over({ status: 201, body }).provider),
        (e) => e instanceof TwilioError && e.status === 200 && e.message.startsWith(what),
        `${name} ${JSON.stringify(body)}`,
      );
    }
  }
  await assert.rejects(
    CALLS.createSubaccount(over({ status: 201, body: { sid: "ACsub" } }).provider),
    /without sid\/auth_token/,
    "a subaccount without its token is no subaccount",
  );
});

test("Twilio: a delete is done at 204 and at 404 (already gone); any other answer throws with its status", async () => {
  for (const [name, what] of [
    ["deleteCredential", "delete credential"],
    ["releaseNumber", "release number"],
    ["deleteTrunk", "delete trunk"],
  ]) {
    assert.equal(await CALLS[name](over({ status: 204, body: null }).provider), undefined, `${name} 204`);
    assert.equal(await CALLS[name](over({ status: 404, body: { code: 20404 } }).provider), undefined, `${name} 404`);
    for (const status of [200, 409, 500]) {
      await assert.rejects(
        CALLS[name](over({ status, body: { code: 20500, message: "internal error" } }).provider),
        (e) =>
          e instanceof TwilioError && e.status === status && e.message === `${what}: internal error (Twilio 20500)`,
        `${name} ${status}`,
      );
    }
  }
  for (const name of ["attachCredentialList", "attachNumber"]) {
    assert.equal(await CALLS[name](over({ status: 201, body: {} }).provider), undefined, name);
    await assert.rejects(CALLS[name](over({ status: 400, body: { code: 21212 } }).provider), TwilioError, name);
  }
});

test("Twilio: where Twilio leaves a field out, the answer is what was asked for", async () => {
  const answered = (body, name) => CALLS[name](over({ status: 201, body }).provider);
  assert.deepEqual(await answered({ sid: "ACsub", auth_token: "s" }, "createSubaccount"), {
    sid: "ACsub",
    token: "s",
    status: "active",
  });
  assert.deepEqual(await answered({ sid: "PN1" }, "buyNumber"), { sid: "PN1", e164: "+13055550100" });
  assert.deepEqual(await answered({ sid: "TK1" }, "createTrunk"), {
    sid: "TK1",
    domainName: "chanlytics-abc.pstn.twilio.com",
  });
  const owned = { incoming_phone_numbers: [null, "PN0", { sid: "" }, { sid: "PN1" }] };
  assert.deepEqual(await answered(owned, "ownedNumber"), { sid: "PN1", e164: "+13055550100" });
  const available = {
    available_phone_numbers: [
      null,
      { phone_number: "" },
      { phone_number: "+13055550101" },
      {
        phone_number: "+13055550102",
        friendly_name: "(305) 555-0102",
        locality: "Miami",
        region: "FL",
        capabilities: { voice: "true", sms: 1, mms: true },
      },
    ],
  };
  const none = { voice: false, sms: false, mms: false };
  assert.deepEqual(
    await answered(available, "searchLocal"),
    [
      { e164: "+13055550101", friendly: "+13055550101", locality: null, region: null, capabilities: none },
      {
        e164: "+13055550102",
        friendly: "(305) 555-0102",
        locality: "Miami",
        region: "FL",
        capabilities: { ...none, mms: true },
      },
    ],
    "a row without a number is dropped; a capability is there only when Twilio says true",
  );
});

test("Twilio: a name is cut at Twilio's 64 characters wherever one is sent, and a list is found by the cut name", async () => {
  const long = `Harbor Moving Co. · ${"x".repeat(60)}`;
  const cut = long.slice(0, 64);
  const { provider, calls } = over({
    status: 201,
    body: { sid: "X1", auth_token: "t", credential_lists: [{ sid: "CL9", friendly_name: cut }] },
  });
  await provider.createSubaccount(master, long);
  await provider.findSubaccount(master, long);
  await provider.buyNumber(acct, "+13055550100", long);
  await provider.createTrunk(acct, { friendlyName: long, domainName: "chanlytics-abc.pstn.twilio.com" });
  await provider.createCredentialList(acct, long);
  await provider.addOrigination(acct, "TK1", { sipUrl: "sip:sip.retellai.com", friendlyName: long });
  await provider.createMessagingService(acct, { friendlyName: long, inboundUrl: "https://edge.example.com/x" });
  assert.deepEqual(
    calls.map((c) => c.form?.FriendlyName ?? new URL(c.url).searchParams.get("FriendlyName")),
    Array(7).fill(cut),
  );
  assert.deepEqual(await provider.findCredentialList(acct, long), { sid: "CL9" });
});

test("Twilio: a search asks for between 1 and 30 numbers", async () => {
  const { provider, calls } = over({ status: 200, body: { available_phone_numbers: [] } });
  for (const limit of [0, 1, 8, 30, 31]) await provider.searchLocal(acct, { areaCode: 305, limit });
  assert.deepEqual(
    calls.map((c) => new URL(c.url).searchParams.get("PageSize")),
    ["1", "1", "8", "30", "30"],
  );
});

test("Twilio: a text carries its status callback only when it has one, and is ok only on a 2xx with a sid", async () => {
  const { provider, calls } = over({ status: 201, body: { sid: "SM1" } });
  const text = { serviceSid: "MG1", to: "+16465550123", body: "hi" };
  await provider.sendSms(acct, { ...text, statusCallback: "https://edge.example.com/api/sms-status" });
  await provider.sendSms(acct, { ...text, statusCallback: "" });
  assert.deepEqual(Object.keys(calls[0].form), ["MessagingServiceSid", "To", "Body", "StatusCallback"]);
  assert.equal(calls[0].form.StatusCallback, "https://edge.example.com/api/sms-status");
  assert.deepEqual(Object.keys(calls[1].form), ["MessagingServiceSid", "To", "Body"]);
  const sent = (status, body) => CALLS.sendSms(over({ status, body }).provider);
  assert.deepEqual(await sent(201, {}), { ok: false, sid: null, status: 201, code: null }, "no sid, no text");
  assert.deepEqual(await sent(300, { sid: "SM1" }), { ok: false, sid: "SM1", status: 300, code: null });
  assert.deepEqual(await sent(400, { code: "21610" }), { ok: false, sid: null, status: 400, code: null });
  assert.deepEqual(await sent(500, null), { ok: false, sid: null, status: 500, code: null });
});

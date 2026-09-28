/**
 * Twilio as a LineProvider. Field and URL names verified against Twilio's
 * REST docs (Subaccounts, AvailablePhoneNumbers Local, IncomingPhoneNumbers,
 * Elastic SIP Trunking: Trunk, CredentialList, OriginationUrl, PhoneNumber;
 * SIP Credential) on 2026-09-07.
 *
 * Every call goes through one `TwilioHttp` port — basic auth as the account
 * given, form-encoded bodies, JSON answers — so a test can pin every URL
 * and parameter without a network, and the edge supplies fetch.
 */
import type { AvailableNumber, LineProvider, ProviderAccount } from "./lines";

export interface TwilioAnswer {
  status: number;
  body: Record<string, unknown> | null;
}

export type TwilioHttp = (
  acct: ProviderAccount,
  method: "GET" | "POST" | "DELETE",
  url: string,
  form?: Record<string, string>,
) => Promise<TwilioAnswer>;

const API = "https://api.twilio.com/2010-04-01";
const TRUNKING = "https://trunking.twilio.com/v1";
const MESSAGING = "https://messaging.twilio.com/v1";
const TWILIO_TIMEOUT_MS = 15000;

export const twilioUrls = {
  subaccounts: `${API}/Accounts.json`,
  availableLocal: (sid: string, country = "US") => `${API}/Accounts/${sid}/AvailablePhoneNumbers/${country}/Local.json`,
  incomingNumbers: (sid: string) => `${API}/Accounts/${sid}/IncomingPhoneNumbers.json`,
  incomingNumber: (sid: string, numberSid: string) => `${API}/Accounts/${sid}/IncomingPhoneNumbers/${numberSid}.json`,
  credentialLists: (sid: string) => `${API}/Accounts/${sid}/SIP/CredentialLists.json`,
  credentials: (sid: string, listSid: string) =>
    `${API}/Accounts/${sid}/SIP/CredentialLists/${listSid}/Credentials.json`,
  credential: (sid: string, listSid: string, credentialSid: string) =>
    `${API}/Accounts/${sid}/SIP/CredentialLists/${listSid}/Credentials/${credentialSid}.json`,
  trunks: `${TRUNKING}/Trunks`,
  trunk: (trunkSid: string) => `${TRUNKING}/Trunks/${trunkSid}`,
  trunkCredentialLists: (trunkSid: string) => `${TRUNKING}/Trunks/${trunkSid}/CredentialLists`,
  trunkOriginationUrls: (trunkSid: string) => `${TRUNKING}/Trunks/${trunkSid}/OriginationUrls`,
  trunkPhoneNumbers: (trunkSid: string) => `${TRUNKING}/Trunks/${trunkSid}/PhoneNumbers`,
  messagingServices: `${MESSAGING}/Services`,
  serviceNumbers: (serviceSid: string) => `${MESSAGING}/Services/${serviceSid}/PhoneNumbers`,
  messages: (sid: string) => `${API}/Accounts/${sid}/Messages.json`,
};

/** A provider refusal as an error the saga records: status, Twilio's code, its message. */
export class TwilioError extends Error {
  readonly status: number;
  readonly code: number | null;
  constructor(status: number, body: Record<string, unknown> | null, what: string) {
    const code = typeof body?.code === "number" ? body.code : null;
    const msg = typeof body?.message === "string" ? body.message : `HTTP ${status}`;
    super(`${what}: ${msg}${code ? ` (Twilio ${code})` : ""}`);
    this.name = "TwilioError";
    this.status = status;
    this.code = code;
  }
}

/** The fetch-backed port: basic auth as `acct`, 15 s per call. */
export const fetchTwilio: TwilioHttp = async (acct, method, url, form) => {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${acct.sid}:${acct.token}`).toString("base64")}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
  });
  const text = await r.text();
  let body: Record<string, unknown> | null;
  try {
    const parsed = JSON.parse(text) as unknown;
    body = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = text ? { text: text.slice(0, 300) } : null;
  }
  return { status: r.status, body };
};

const str = (o: Record<string, unknown> | null, k: string): string | null =>
  typeof o?.[k] === "string" ? (o[k] as string) : null;

function need(a: TwilioAnswer, what: string): Record<string, unknown> {
  if (a.status < 200 || a.status >= 300 || !a.body) throw new TwilioError(a.status, a.body, what);
  return a.body;
}

/** A list answer's rows under `key`, each an object; anything else is no rows. */
function rowsOf(b: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const rows = b[key];
  return Array.isArray(rows)
    ? rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
    : [];
}

/*
 * The provider's methods, each a function over the `http` it is handed, in the order the provider lists them;
 * twilioProvider(http) only assembles them. Each is one Twilio call.
 */

async function createSubaccount(http: TwilioHttp, master: ProviderAccount, friendlyName: string) {
  const b = need(
    await http(master, "POST", twilioUrls.subaccounts, { FriendlyName: friendlyName.slice(0, 64) }),
    "create subaccount",
  );
  const sid = str(b, "sid");
  const token = str(b, "auth_token");
  if (!sid || !token) throw new TwilioError(200, b, "create subaccount answered without sid/auth_token");
  return { sid, token, status: str(b, "status") ?? "active" };
}

async function findSubaccount(http: TwilioHttp, master: ProviderAccount, friendlyName: string) {
  const url = `${twilioUrls.subaccounts}?${new URLSearchParams({ FriendlyName: friendlyName.slice(0, 64), PageSize: "20" })}`;
  for (const a of rowsOf(need(await http(master, "GET", url), "list subaccounts"), "accounts")) {
    const sid = str(a, "sid");
    const token = str(a, "auth_token");
    if (sid && token && str(a, "status") !== "closed") return { sid, token };
  }
  return null;
}

async function findTrunk(http: TwilioHttp, acct: ProviderAccount, domainName: string) {
  for (const t of rowsOf(need(await http(acct, "GET", `${twilioUrls.trunks}?PageSize=50`), "list trunks"), "trunks")) {
    const sid = str(t, "sid");
    if (sid && str(t, "domain_name") === domainName) return { sid, domainName };
  }
  return null;
}

async function findCredentialList(http: TwilioHttp, acct: ProviderAccount, friendlyName: string) {
  const b = need(
    await http(acct, "GET", `${twilioUrls.credentialLists(acct.sid)}?PageSize=50`),
    "list credential lists",
  );
  for (const l of rowsOf(b, "credential_lists")) {
    const sid = str(l, "sid");
    if (sid && str(l, "friendly_name") === friendlyName.slice(0, 64)) return { sid };
  }
  return null;
}

async function findCredential(http: TwilioHttp, acct: ProviderAccount, listSid: string, username: string) {
  const b = need(
    await http(acct, "GET", `${twilioUrls.credentials(acct.sid, listSid)}?PageSize=50`),
    "list credentials",
  );
  for (const c of rowsOf(b, "credentials")) {
    const sid = str(c, "sid");
    if (sid && str(c, "username") === username) return { sid };
  }
  return null;
}

async function deleteCredential(http: TwilioHttp, acct: ProviderAccount, listSid: string, credentialSid: string) {
  const a = await http(acct, "DELETE", twilioUrls.credential(acct.sid, listSid, credentialSid));
  if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "delete credential");
}

async function findOrigination(http: TwilioHttp, acct: ProviderAccount, trunkSid: string, sipUrl: string) {
  const b = need(
    await http(acct, "GET", `${twilioUrls.trunkOriginationUrls(trunkSid)}?PageSize=50`),
    "list origination urls",
  );
  for (const o of rowsOf(b, "origination_urls")) {
    const sid = str(o, "sid");
    if (sid && str(o, "sip_url") === sipUrl) return { sid };
  }
  return null;
}

async function searchLocal(http: TwilioHttp, acct: ProviderAccount, q: { areaCode: number; limit: number }) {
  const url = `${twilioUrls.availableLocal(acct.sid)}?${new URLSearchParams({
    AreaCode: String(q.areaCode),
    VoiceEnabled: "true",
    SmsEnabled: "true",
    PageSize: String(Math.min(Math.max(q.limit, 1), 30)),
  }).toString()}`;
  const b = need(await http(acct, "GET", url), "search numbers");
  const rows = Array.isArray(b.available_phone_numbers) ? (b.available_phone_numbers as Record<string, unknown>[]) : [];
  return rows
    .map((n): AvailableNumber | null => {
      const e164 = str(n, "phone_number");
      if (!e164) return null;
      const caps = (n.capabilities ?? {}) as Record<string, unknown>;
      return {
        e164,
        friendly: str(n, "friendly_name") ?? e164,
        locality: str(n, "locality"),
        region: str(n, "region"),
        capabilities: { voice: caps.voice === true, sms: caps.sms === true, mms: caps.mms === true },
      };
    })
    .filter((n): n is AvailableNumber => n !== null);
}

async function buyNumber(http: TwilioHttp, acct: ProviderAccount, e164: string, friendlyName: string) {
  const b = need(
    await http(acct, "POST", twilioUrls.incomingNumbers(acct.sid), {
      PhoneNumber: e164,
      FriendlyName: friendlyName.slice(0, 64),
    }),
    "buy number",
  );
  const sid = str(b, "sid");
  if (!sid) throw new TwilioError(200, b, "buy number answered without a sid");
  return { sid, e164: str(b, "phone_number") ?? e164 };
}

// A number this subaccount already holds. Twilio filters IncomingPhoneNumbers by
// exact E.164, so this is one GET and no guessing.
//
// A read that FAILS must not be reported as "we do not own it": that answer sends
// the saga on to buy a second number. So a non-200 throws, and the step retries
// rather than spending.
async function ownedNumber(http: TwilioHttp, acct: ProviderAccount, e164: string) {
  const a = await http(
    acct,
    "GET",
    `${twilioUrls.incomingNumbers(acct.sid)}?PhoneNumber=${encodeURIComponent(e164)}&PageSize=1`,
  );
  if (a.status === 404) return null;
  const b = need(a, "list owned numbers");
  const list = Array.isArray((b as { incoming_phone_numbers?: unknown }).incoming_phone_numbers)
    ? (b as { incoming_phone_numbers: unknown[] }).incoming_phone_numbers
    : [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const sid = str(row as Record<string, unknown>, "sid");
    if (sid) return { sid, e164: str(row as Record<string, unknown>, "phone_number") ?? e164 };
  }
  return null;
}

async function releaseNumber(http: TwilioHttp, acct: ProviderAccount, numberSid: string) {
  const a = await http(acct, "DELETE", twilioUrls.incomingNumber(acct.sid, numberSid));
  if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "release number");
}

async function createTrunk(http: TwilioHttp, acct: ProviderAccount, o: { friendlyName: string; domainName: string }) {
  const b = need(
    await http(acct, "POST", twilioUrls.trunks, {
      FriendlyName: o.friendlyName.slice(0, 64),
      DomainName: o.domainName,
    }),
    "create trunk",
  );
  const sid = str(b, "sid");
  if (!sid) throw new TwilioError(200, b, "create trunk answered without a sid");
  return { sid, domainName: str(b, "domain_name") ?? o.domainName };
}

async function deleteTrunk(http: TwilioHttp, acct: ProviderAccount, trunkSid: string) {
  const a = await http(acct, "DELETE", twilioUrls.trunk(trunkSid));
  if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "delete trunk");
}

async function createCredentialList(http: TwilioHttp, acct: ProviderAccount, friendlyName: string) {
  const b = need(
    await http(acct, "POST", twilioUrls.credentialLists(acct.sid), { FriendlyName: friendlyName.slice(0, 64) }),
    "create credential list",
  );
  const sid = str(b, "sid");
  if (!sid) throw new TwilioError(200, b, "create credential list answered without a sid");
  return { sid };
}

async function addCredential(
  http: TwilioHttp,
  acct: ProviderAccount,
  listSid: string,
  username: string,
  password: string,
) {
  const b = need(
    await http(acct, "POST", twilioUrls.credentials(acct.sid, listSid), { Username: username, Password: password }),
    "add credential",
  );
  const sid = str(b, "sid");
  if (!sid) throw new TwilioError(200, b, "add credential answered without a sid");
  return { sid };
}

async function attachCredentialList(http: TwilioHttp, acct: ProviderAccount, trunkSid: string, listSid: string) {
  need(
    await http(acct, "POST", twilioUrls.trunkCredentialLists(trunkSid), { CredentialListSid: listSid }),
    "attach credential list",
  );
}

async function addOrigination(
  http: TwilioHttp,
  acct: ProviderAccount,
  trunkSid: string,
  o: { sipUrl: string; friendlyName: string },
) {
  const b = need(
    await http(acct, "POST", twilioUrls.trunkOriginationUrls(trunkSid), {
      SipUrl: o.sipUrl,
      FriendlyName: o.friendlyName.slice(0, 64),
      Weight: "10",
      Priority: "10",
      Enabled: "true",
    }),
    "add origination",
  );
  const sid = str(b, "sid");
  if (!sid) throw new TwilioError(200, b, "add origination answered without a sid");
  return { sid };
}

async function attachNumber(http: TwilioHttp, acct: ProviderAccount, trunkSid: string, numberSid: string) {
  need(
    await http(acct, "POST", twilioUrls.trunkPhoneNumbers(trunkSid), { PhoneNumberSid: numberSid }),
    "attach number to trunk",
  );
}

// Messaging Services API (verified 2026-09-07): the service's own inbound
// URL wins over the number's; sticky sender and smart encoding on.
async function createMessagingService(
  http: TwilioHttp,
  acct: ProviderAccount,
  o: { friendlyName: string; inboundUrl: string },
) {
  const b = need(
    await http(acct, "POST", twilioUrls.messagingServices, {
      FriendlyName: o.friendlyName.slice(0, 64),
      InboundRequestUrl: o.inboundUrl,
      InboundMethod: "POST",
      UseInboundWebhookOnNumber: "false",
      StickySender: "true",
      SmartEncoding: "true",
    }),
    "create messaging service",
  );
  const sid = str(b, "sid");
  if (!sid) throw new TwilioError(200, b, "create messaging service answered without a sid");
  return { sid };
}

async function addNumberToService(http: TwilioHttp, acct: ProviderAccount, serviceSid: string, numberSid: string) {
  const b = need(
    await http(acct, "POST", twilioUrls.serviceNumbers(serviceSid), { PhoneNumberSid: numberSid }),
    "add number to messaging service",
  );
  const sid = str(b, "sid");
  if (!sid) throw new TwilioError(200, b, "add number to messaging service answered without a sid");
  return { sid };
}

async function sendSms(
  http: TwilioHttp,
  acct: ProviderAccount,
  o: { serviceSid: string; to: string; body: string; statusCallback?: string },
) {
  const a = await http(acct, "POST", twilioUrls.messages(acct.sid), {
    MessagingServiceSid: o.serviceSid,
    To: o.to,
    Body: o.body,
    ...(o.statusCallback ? { StatusCallback: o.statusCallback } : {}),
  });
  const ok = a.status >= 200 && a.status < 300 && !!str(a.body, "sid");
  return {
    ok,
    sid: str(a.body, "sid"),
    status: a.status,
    code: typeof a.body?.code === "number" ? (a.body.code as number) : null,
  };
}

export function twilioProvider(http: TwilioHttp = fetchTwilio): LineProvider {
  return {
    name: "twilio",
    createSubaccount: (master, friendlyName) => createSubaccount(http, master, friendlyName),
    findSubaccount: (master, friendlyName) => findSubaccount(http, master, friendlyName),
    findTrunk: (acct, domainName) => findTrunk(http, acct, domainName),
    findCredentialList: (acct, friendlyName) => findCredentialList(http, acct, friendlyName),
    findCredential: (acct, listSid, username) => findCredential(http, acct, listSid, username),
    deleteCredential: (acct, listSid, credentialSid) => deleteCredential(http, acct, listSid, credentialSid),
    findOrigination: (acct, trunkSid, sipUrl) => findOrigination(http, acct, trunkSid, sipUrl),
    searchLocal: (acct, q) => searchLocal(http, acct, q),
    buyNumber: (acct, e164, friendlyName) => buyNumber(http, acct, e164, friendlyName),
    ownedNumber: (acct, e164) => ownedNumber(http, acct, e164),
    releaseNumber: (acct, numberSid) => releaseNumber(http, acct, numberSid),
    createTrunk: (acct, o) => createTrunk(http, acct, o),
    deleteTrunk: (acct, trunkSid) => deleteTrunk(http, acct, trunkSid),
    createCredentialList: (acct, friendlyName) => createCredentialList(http, acct, friendlyName),
    addCredential: (acct, listSid, username, password) => addCredential(http, acct, listSid, username, password),
    attachCredentialList: (acct, trunkSid, listSid) => attachCredentialList(http, acct, trunkSid, listSid),
    addOrigination: (acct, trunkSid, o) => addOrigination(http, acct, trunkSid, o),
    attachNumber: (acct, trunkSid, numberSid) => attachNumber(http, acct, trunkSid, numberSid),
    createMessagingService: (acct, o) => createMessagingService(http, acct, o),
    addNumberToService: (acct, serviceSid, numberSid) => addNumberToService(http, acct, serviceSid, numberSid),
    sendSms: (acct, o) => sendSms(http, acct, o),
  };
}

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
import { answerObject, fetchFromProvider, type ProviderReply, type SendOutcome } from "../shared/provider-fetch";
import { deleteCampaignRequest } from "./a2p/brand-campaign";
import type { AvailableNumber, LineProvider, ProviderAccount, ReceivedText } from "./lines";

export interface TwilioAnswer {
  /** The HTTP status, or 0 when no answer came (the body then says why, as `error`). */
  status: number;
  body: Record<string, unknown> | null;
  /** What the call came to (provider-fetch SendOutcome); absent from a test double that does not say. */
  outcome?: SendOutcome;
}

export type TwilioHttp = (
  acct: ProviderAccount,
  method: "GET" | "POST" | "DELETE",
  url: string,
  form?: Record<string, string>,
) => Promise<TwilioAnswer>;

const API = "https://api.twilio.com/2010-04-01";
const LOOKUPS = "https://lookups.twilio.com/v2";
const TRUNKING = "https://trunking.twilio.com/v1";
const MESSAGING = "https://messaging.twilio.com/v1";
/**
 * The longest one call to Twilio waits unless its caller says: a text's send is one try under it, and the job runner
 * starts one only while it still ends inside its function (jobs ledger startByAt).
 */
export const TWILIO_TIMEOUT_MS = 15000;

export const twilioUrls = {
  subaccounts: `${API}/Accounts.json`,
  subaccount: (sid: string) => `${API}/Accounts/${sid}.json`,
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
  lookup: (e164: string) => `${LOOKUPS}/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`,
};

/** What Twilio Lookup said of a number's line (line type intelligence): its type and its carrier, as Twilio words them. */
export interface LineTypeAnswer {
  type: string | null;
  carrier: string | null;
}

/**
 * A number's line, by the carrier's own records (decision 0073, R11: Twilio Lookup v2, line_type_intelligence): mobile,
 * landline, fixed or non-fixed VoIP and the rest, and the carrier. A few cents a number, asked once at step 4. Null when
 * Twilio could not say (no answer, a refusal, or a number it has no record of); never throws.
 */
export async function lookupLineType(acct: ProviderAccount, e164: string): Promise<LineTypeAnswer | null> {
  const result = await requestTwilio(acct, "GET", twilioUrls.lookup(e164));
  if (result.outcome !== "ok") return null;
  const lti = answerObject(result)?.line_type_intelligence;
  if (!lti || typeof lti !== "object" || Array.isArray(lti)) return null;
  const value = lti as Record<string, unknown>;
  return {
    type: typeof value.type === "string" ? value.type : null,
    carrier: typeof value.carrier_name === "string" ? value.carrier_name : null,
  };
}

/** A provider refusal as an error the saga records: status, Twilio's code, its message. */
export class TwilioError extends Error {
  readonly status: number;
  readonly code: number | null;
  constructor(status: number, body: Record<string, unknown> | null, text: string) {
    const code = typeof body?.code === "number" ? body.code : null;
    const msg = typeof body?.message === "string" ? body.message : `HTTP ${status}`;
    super(`${text}: ${msg}${code ? ` (Twilio ${code})` : ""}`);
    this.name = "TwilioError";
    this.status = status;
    this.code = code;
  }
}

/**
 * One call to Twilio as `acct`, through providerFetch: basic auth, a form body already encoded (the port's, or A2P's
 * own encoder), 15 s unless said. A read is asked twice when the first got no answer quickly.
 */
export function requestTwilio(
  acct: ProviderAccount,
  method: "GET" | "POST" | "DELETE",
  url: string,
  options: { form?: string; timeoutMs?: number; breaker?: "hold" | "count" } = {},
): Promise<ProviderReply> {
  return fetchFromProvider("twilio", url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${acct.sid}:${acct.token}`).toString("base64")}`,
      ...(options.form !== undefined ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: options.form,
    timeoutMs: options.timeoutMs ?? TWILIO_TIMEOUT_MS,
    breaker: options.breaker ?? "hold",
    ...(method === "GET" ? { idempotent: true, tries: 2 } : {}),
  });
}

/**
 * The fetch-backed port: basic auth as `acct`, 15 s per call, through requestTwilio. It never throws: a call that got
 * no answer is status 0 with the network's words as `error` (a text's send said "never throws" while this threw),
 * which a saga step's `need` refuses as any other failure.
 */
export const fetchTwilio: TwilioHttp = async (acct, method, url, form) => {
  // A text to a person is always sent: another call's timeouts never fail it (provider-fetch's breaker).
  const text = method === "POST" && url.endsWith("/Messages.json");
  const first = await requestTwilio(acct, method, url, {
    ...(form ? { form: new URLSearchParams(form).toString() } : {}),
    ...(text ? { breaker: "count" as const } : {}),
  });
  const body =
    first.status === 0
      ? { error: first.error ?? "no answer" }
      : (answerObject(first) ?? (first.json === null && first.text ? { text: first.text.slice(0, 300) } : null));
  return { status: first.status, body, outcome: first.outcome };
};

const str = (o: Record<string, unknown> | null, k: string): string | null => (typeof o?.[k] === "string" ? o[k] : null);

function need(a: TwilioAnswer, text: string): Record<string, unknown> {
  if (a.status < 200 || a.status >= 300 || !a.body) throw new TwilioError(a.status, a.body, text);
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

async function readSubaccount(http: TwilioHttp, master: ProviderAccount, sid: string) {
  const a = await http(master, "GET", twilioUrls.subaccount(sid));
  if (a.status === 404) return null;
  const b = need(a, "read subaccount");
  if (str(b, "status") === "closed") return null;
  const token = str(b, "auth_token");
  if (!token) throw new TwilioError(200, b, "read subaccount answered without auth_token");
  return { sid, token };
}

// Twilio does not say what closing a closed subaccount answers, so a refusal is read before it is believed.
async function closeSubaccount(http: TwilioHttp, master: ProviderAccount, sid: string) {
  const a = await http(master, "POST", twilioUrls.subaccount(sid), { Status: "closed" });
  if ((a.status >= 200 && a.status < 300) || a.status === 404) return;
  if ((await readSubaccount(http, master, sid)) === null) return;
  throw new TwilioError(a.status, a.body, "close subaccount");
}

async function findTrunk(http: TwilioHttp, acct: ProviderAccount, domainName: string) {
  for (const t of rowsOf(need(await http(acct, "GET", `${twilioUrls.trunks}?PageSize=50`), "list trunks"), "trunks")) {
    const sid = str(t, "sid");
    if (sid && str(t, "domain_name") === domainName) return { sid, domainName };
  }
  return null;
}

async function findCredentialList(http: TwilioHttp, acct: ProviderAccount, friendlyName: string) {
  const reply = need(
    await http(acct, "GET", `${twilioUrls.credentialLists(acct.sid)}?PageSize=50`),
    "list credential lists",
  );
  for (const l of rowsOf(reply, "credential_lists")) {
    const sid = str(l, "sid");
    if (sid && str(l, "friendly_name") === friendlyName.slice(0, 64)) return { sid };
  }
  return null;
}

async function findCredential(http: TwilioHttp, acct: ProviderAccount, listSid: string, username: string) {
  const reply = need(
    await http(acct, "GET", `${twilioUrls.credentials(acct.sid, listSid)}?PageSize=50`),
    "list credentials",
  );
  for (const c of rowsOf(reply, "credentials")) {
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
  const reply = need(
    await http(acct, "GET", `${twilioUrls.trunkOriginationUrls(trunkSid)}?PageSize=50`),
    "list origination urls",
  );
  for (const o of rowsOf(reply, "origination_urls")) {
    const sid = str(o, "sid");
    if (sid && str(o, "sip_url") === sipUrl) return { sid };
  }
  return null;
}

async function searchLocal(http: TwilioHttp, acct: ProviderAccount, input: { areaCode: number; limit: number }) {
  const url = `${twilioUrls.availableLocal(acct.sid)}?${new URLSearchParams({
    AreaCode: String(input.areaCode),
    VoiceEnabled: "true",
    SmsEnabled: "true",
    PageSize: String(Math.min(Math.max(input.limit, 1), 30)),
  }).toString()}`;
  const reply = need(await http(acct, "GET", url), "search numbers");
  const rows = Array.isArray(reply.available_phone_numbers)
    ? (reply.available_phone_numbers as Record<string, unknown>[])
    : [];
  return rows
    .map((row): AvailableNumber | null => {
      const e164 = str(row, "phone_number");
      if (!e164) return null;
      const caps = (row.capabilities ?? {}) as Record<string, unknown>;
      return {
        e164,
        friendly: str(row, "friendly_name") ?? e164,
        locality: str(row, "locality"),
        region: str(row, "region"),
        capabilities: { voice: caps.voice === true, sms: caps.sms === true, mms: caps.mms === true },
      };
    })
    .filter((n): n is AvailableNumber => n !== null);
}

async function buyNumber(http: TwilioHttp, acct: ProviderAccount, e164: string, friendlyName: string) {
  const reply = need(
    await http(acct, "POST", twilioUrls.incomingNumbers(acct.sid), {
      PhoneNumber: e164,
      FriendlyName: friendlyName.slice(0, 64),
    }),
    "buy number",
  );
  const sid = str(reply, "sid");
  if (!sid) throw new TwilioError(200, reply, "buy number answered without a sid");
  return { sid, e164: str(reply, "phone_number") ?? e164 };
}

// A number this subaccount already holds. Twilio filters IncomingPhoneNumbers by
// exact E.164, so this is one GET and no guessing.
//
// A read that FAILS must not be reported as "we do not own it": that answer sends
// the saga on to buy a second number. So a non-200 throws, and the step retries
// rather than spending.
async function ownedNumber(http: TwilioHttp, acct: ProviderAccount, e164: string) {
  const result = await http(
    acct,
    "GET",
    `${twilioUrls.incomingNumbers(acct.sid)}?PhoneNumber=${encodeURIComponent(e164)}&PageSize=1`,
  );
  if (result.status === 404) return null;
  const reply = need(result, "list owned numbers");
  const list = Array.isArray((reply as { incoming_phone_numbers?: unknown }).incoming_phone_numbers)
    ? (reply as { incoming_phone_numbers: unknown[] }).incoming_phone_numbers
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

async function createTrunk(
  http: TwilioHttp,
  acct: ProviderAccount,
  options: { friendlyName: string; domainName: string },
) {
  const reply = need(
    await http(acct, "POST", twilioUrls.trunks, {
      FriendlyName: options.friendlyName.slice(0, 64),
      DomainName: options.domainName,
    }),
    "create trunk",
  );
  const sid = str(reply, "sid");
  if (!sid) throw new TwilioError(200, reply, "create trunk answered without a sid");
  return { sid, domainName: str(reply, "domain_name") ?? options.domainName };
}

async function deleteTrunk(http: TwilioHttp, acct: ProviderAccount, trunkSid: string) {
  const a = await http(acct, "DELETE", twilioUrls.trunk(trunkSid));
  if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "delete trunk");
}

async function deleteCampaign(http: TwilioHttp, acct: ProviderAccount, serviceSid: string, campaignSid: string) {
  const a = await http(acct, "DELETE", deleteCampaignRequest(serviceSid, campaignSid).url);
  if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "delete campaign");
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
  options: { sipUrl: string; friendlyName: string },
) {
  const reply = need(
    await http(acct, "POST", twilioUrls.trunkOriginationUrls(trunkSid), {
      SipUrl: options.sipUrl,
      FriendlyName: options.friendlyName.slice(0, 64),
      Weight: "10",
      Priority: "10",
      Enabled: "true",
    }),
    "add origination",
  );
  const sid = str(reply, "sid");
  if (!sid) throw new TwilioError(200, reply, "add origination answered without a sid");
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
  options: { friendlyName: string; inboundUrl: string },
) {
  const reply = need(
    await http(acct, "POST", twilioUrls.messagingServices, {
      FriendlyName: options.friendlyName.slice(0, 64),
      InboundRequestUrl: options.inboundUrl,
      InboundMethod: "POST",
      UseInboundWebhookOnNumber: "false",
      StickySender: "true",
      SmartEncoding: "true",
    }),
    "create messaging service",
  );
  const sid = str(reply, "sid");
  if (!sid) throw new TwilioError(200, reply, "create messaging service answered without a sid");
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
  options: { serviceSid: string; to: string; body: string; statusCallback?: string },
) {
  const first = await http(acct, "POST", twilioUrls.messages(acct.sid), {
    MessagingServiceSid: options.serviceSid,
    To: options.to,
    Body: options.body,
    ...(options.statusCallback ? { StatusCallback: options.statusCallback } : {}),
  });
  const ok = first.status >= 200 && first.status < 300 && !!str(first.body, "sid");
  return {
    ok,
    sid: str(first.body, "sid"),
    status: first.status,
    code: typeof first.body?.code === "number" ? first.body.code : null,
    ...(first.outcome
      ? { outcome: ok ? ("ok" as const) : first.outcome === "ok" ? ("unknown" as const) : first.outcome }
      : {}),
  };
}

/** How many of a number's latest texts one read asks for: Twilio lists them newest first. */
const RECENT_TEXTS_PAGE = "20";

/**
 * The texts that arrived on a number (Twilio's Messages, filtered by `To`), since a moment: the inbound ones with a sid, a
 * sender and a time (`date_sent`, RFC 2822). The filter by date is ours: Twilio's own takes a day, and a code is wanted
 * within minutes.
 */
async function recentTexts(http: TwilioHttp, acct: ProviderAccount, to: string, sinceMs: number) {
  const url = `${twilioUrls.messages(acct.sid)}?${new URLSearchParams({ To: to, PageSize: RECENT_TEXTS_PAGE })}`;
  const reply = need(await http(acct, "GET", url), "list received texts");
  return rowsOf(reply, "messages").flatMap((m): ReceivedText[] => {
    const sid = str(m, "sid");
    const from = str(m, "from");
    const body = str(m, "body");
    const atMs = Date.parse(str(m, "date_sent") ?? "");
    if (str(m, "direction") !== "inbound" || !sid || !from || body === null || Number.isNaN(atMs) || atMs < sinceMs)
      return [];
    return [{ sid, from, body, atMs }];
  });
}

export function twilioProvider(http: TwilioHttp = fetchTwilio): LineProvider {
  return {
    name: "twilio",
    createSubaccount: (master, friendlyName) => createSubaccount(http, master, friendlyName),
    findSubaccount: (master, friendlyName) => findSubaccount(http, master, friendlyName),
    readSubaccount: (master, sid) => readSubaccount(http, master, sid),
    closeSubaccount: (master, sid) => closeSubaccount(http, master, sid),
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
    deleteCampaign: (acct, serviceSid, campaignSid) => deleteCampaign(http, acct, serviceSid, campaignSid),
    createCredentialList: (acct, friendlyName) => createCredentialList(http, acct, friendlyName),
    addCredential: (acct, listSid, username, password) => addCredential(http, acct, listSid, username, password),
    attachCredentialList: (acct, trunkSid, listSid) => attachCredentialList(http, acct, trunkSid, listSid),
    addOrigination: (acct, trunkSid, o) => addOrigination(http, acct, trunkSid, o),
    attachNumber: (acct, trunkSid, numberSid) => attachNumber(http, acct, trunkSid, numberSid),
    createMessagingService: (acct, o) => createMessagingService(http, acct, o),
    addNumberToService: (acct, serviceSid, numberSid) => addNumberToService(http, acct, serviceSid, numberSid),
    sendSms: (acct, o) => sendSms(http, acct, o),
    recentTexts: (acct, to, sinceMs) => recentTexts(http, acct, to, sinceMs),
  };
}

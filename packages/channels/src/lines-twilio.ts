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

export const twilioUrls = {
  subaccounts: `${API}/Accounts.json`,
  availableLocal: (sid: string, country = "US") => `${API}/Accounts/${sid}/AvailablePhoneNumbers/${country}/Local.json`,
  incomingNumbers: (sid: string) => `${API}/Accounts/${sid}/IncomingPhoneNumbers.json`,
  incomingNumber: (sid: string, numberSid: string) => `${API}/Accounts/${sid}/IncomingPhoneNumbers/${numberSid}.json`,
  credentialLists: (sid: string) => `${API}/Accounts/${sid}/SIP/CredentialLists.json`,
  credentials: (sid: string, listSid: string) => `${API}/Accounts/${sid}/SIP/CredentialLists/${listSid}/Credentials.json`,
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
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let body: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(text) as unknown;
    body = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = text ? { text: text.slice(0, 300) } : null;
  }
  return { status: r.status, body };
};

const str = (o: Record<string, unknown> | null, k: string): string | null => (typeof o?.[k] === "string" ? (o[k] as string) : null);

function need(a: TwilioAnswer, what: string): Record<string, unknown> {
  if (a.status < 200 || a.status >= 300 || !a.body) throw new TwilioError(a.status, a.body, what);
  return a.body;
}

export function twilioProvider(http: TwilioHttp = fetchTwilio): LineProvider {
  return {
    name: "twilio",

    async createSubaccount(master, friendlyName) {
      const b = need(await http(master, "POST", twilioUrls.subaccounts, { FriendlyName: friendlyName.slice(0, 64) }), "create subaccount");
      const sid = str(b, "sid");
      const token = str(b, "auth_token");
      if (!sid || !token) throw new TwilioError(200, b, "create subaccount answered without sid/auth_token");
      return { sid, token, status: str(b, "status") ?? "active" };
    },

    async searchLocal(acct, q) {
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
    },

    async buyNumber(acct, e164, friendlyName) {
      const b = need(await http(acct, "POST", twilioUrls.incomingNumbers(acct.sid), { PhoneNumber: e164, FriendlyName: friendlyName.slice(0, 64) }), "buy number");
      const sid = str(b, "sid");
      if (!sid) throw new TwilioError(200, b, "buy number answered without a sid");
      return { sid, e164: str(b, "phone_number") ?? e164 };
    },

    async releaseNumber(acct, numberSid) {
      const a = await http(acct, "DELETE", twilioUrls.incomingNumber(acct.sid, numberSid));
      if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "release number");
    },

    async createTrunk(acct, o) {
      const b = need(await http(acct, "POST", twilioUrls.trunks, { FriendlyName: o.friendlyName.slice(0, 64), DomainName: o.domainName }), "create trunk");
      const sid = str(b, "sid");
      if (!sid) throw new TwilioError(200, b, "create trunk answered without a sid");
      return { sid, domainName: str(b, "domain_name") ?? o.domainName };
    },

    async deleteTrunk(acct, trunkSid) {
      const a = await http(acct, "DELETE", twilioUrls.trunk(trunkSid));
      if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "delete trunk");
    },

    async createCredentialList(acct, friendlyName) {
      const b = need(await http(acct, "POST", twilioUrls.credentialLists(acct.sid), { FriendlyName: friendlyName.slice(0, 64) }), "create credential list");
      const sid = str(b, "sid");
      if (!sid) throw new TwilioError(200, b, "create credential list answered without a sid");
      return { sid };
    },

    async addCredential(acct, listSid, username, password) {
      const b = need(await http(acct, "POST", twilioUrls.credentials(acct.sid, listSid), { Username: username, Password: password }), "add credential");
      const sid = str(b, "sid");
      if (!sid) throw new TwilioError(200, b, "add credential answered without a sid");
      return { sid };
    },

    async attachCredentialList(acct, trunkSid, listSid) {
      need(await http(acct, "POST", twilioUrls.trunkCredentialLists(trunkSid), { CredentialListSid: listSid }), "attach credential list");
    },

    async addOrigination(acct, trunkSid, o) {
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
    },

    async attachNumber(acct, trunkSid, numberSid) {
      need(await http(acct, "POST", twilioUrls.trunkPhoneNumbers(trunkSid), { PhoneNumberSid: numberSid }), "attach number to trunk");
    },

    // Messaging Services API (verified 2026-09-07): the service's own inbound
    // URL wins over the number's; sticky sender and smart encoding on.
    async createMessagingService(acct, o) {
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
    },

    async addNumberToService(acct, serviceSid, numberSid) {
      const b = need(await http(acct, "POST", twilioUrls.serviceNumbers(serviceSid), { PhoneNumberSid: numberSid }), "add number to messaging service");
      const sid = str(b, "sid");
      if (!sid) throw new TwilioError(200, b, "add number to messaging service answered without a sid");
      return { sid };
    },

    async sendSms(acct, o) {
      const a = await http(acct, "POST", twilioUrls.messages(acct.sid), { MessagingServiceSid: o.serviceSid, To: o.to, Body: o.body });
      const ok = a.status >= 200 && a.status < 300 && !!str(a.body, "sid");
      return { ok, sid: str(a.body, "sid"), status: a.status, code: typeof a.body?.code === "number" ? (a.body.code as number) : null };
    },
  };
}

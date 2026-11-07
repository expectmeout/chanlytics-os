/**
 * The dry LineProvider: fake SIDs, no network, the shape of every answer a
 * real provider gives. It is the provider on laptops and previews
 * (LINES_DRY_RUN=1) and in the saga's tests; production never uses it
 * (chooseLineProvider). It keeps a ledger of calls so a test can prove a
 * resumed saga repeats nothing.
 */
import type { AvailableNumber, LineProvider, ProviderAccount, ReceivedText } from "./lines";

export interface DryCall {
  op: string;
  args: unknown[];
}

export interface DryProvider extends LineProvider {
  readonly calls: DryCall[];
  /** Numbers bought and not released, by SID. */
  readonly owned: Map<string, string>;
  /** A text that "arrived" on `to`, for recentTexts to answer: the dry provider has no carrier to receive one. */
  plantText(to: string, text: ReceivedText): void;
}

const hex = (n: number, width = 32) => n.toString(16).padStart(width, "0");

/** The page a read of a number's texts is: twenty, as the real provider's. */
const DRY_TEXTS_PAGE = 20;

/** The numbers a search finds: up to eight in the area code asked for, each able to call and text. */
function dryNumbers(input: { areaCode: number; limit: number }): AvailableNumber[] {
  const out: AvailableNumber[] = [];
  for (let i = 0; i < Math.min(input.limit, 8); i++) {
    const local = `555${String(100 + i).padStart(4, "0")}`;
    out.push({
      e164: `+1${input.areaCode}${local}`,
      friendly: `(${input.areaCode}) ${local.slice(0, 3)}-${local.slice(3)}`,
      locality: "Dry Run",
      region: "XX",
      capabilities: { voice: true, sms: true, mms: false },
    });
  }
  return out;
}

export function dryProvider(seed = 1): DryProvider {
  let count = seed;
  const next = (prefix: string) => `${prefix}${hex(count++)}`;
  const calls: DryCall[] = [];
  const owned = new Map<string, string>();
  // What it "made", so a look after a lost receipt finds it, as the carrier's own lists would.
  const subaccounts = new Map<string, ProviderAccount>();
  const trunks = new Map<string, string>();
  const lists = new Map<string, string>();
  const credentials = new Map<string, string>();
  const originations = new Map<string, string>();
  const received = new Map<string, ReceivedText[]>();
  const rec = (op: string, ...args: unknown[]) => calls.push({ op, args });
  const acctOf = (a: ProviderAccount) => a.sid;
  return {
    name: "dry",
    calls,
    owned,
    createSubaccount(master, friendlyName) {
      rec("createSubaccount", acctOf(master), friendlyName);
      const acct = { sid: next("AC"), token: next("tok") };
      subaccounts.set(friendlyName, acct);
      return Promise.resolve({ ...acct, status: "active" });
    },
    findSubaccount(master, friendlyName) {
      rec("findSubaccount", acctOf(master), friendlyName);
      return Promise.resolve(subaccounts.get(friendlyName) ?? null);
    },
    readSubaccount: (_master, sid) => Promise.resolve([...subaccounts.values()].find((a) => a.sid === sid) ?? null),
    closeSubaccount(master, sid) {
      rec("closeSubaccount", acctOf(master), sid);
      return Promise.resolve();
    },
    findTrunk(acct, domainName) {
      rec("findTrunk", acctOf(acct), domainName);
      const sid = trunks.get(`${acctOf(acct)} ${domainName}`);
      return Promise.resolve(sid ? { sid, domainName } : null);
    },
    findCredentialList(acct, friendlyName) {
      rec("findCredentialList", acctOf(acct), friendlyName);
      const sid = lists.get(`${acctOf(acct)} ${friendlyName}`);
      return Promise.resolve(sid ? { sid } : null);
    },
    findCredential(acct, listSid, username) {
      rec("findCredential", acctOf(acct), listSid, username);
      const sid = credentials.get(`${listSid} ${username}`);
      return Promise.resolve(sid ? { sid } : null);
    },
    deleteCredential(acct, listSid, credentialSid) {
      rec("deleteCredential", acctOf(acct), listSid, credentialSid);
      for (const [k, v] of credentials) if (v === credentialSid) credentials.delete(k);
      return Promise.resolve();
    },
    findOrigination(acct, trunkSid, sipUrl) {
      rec("findOrigination", acctOf(acct), trunkSid, sipUrl);
      const sid = originations.get(`${trunkSid} ${sipUrl}`);
      return Promise.resolve(sid ? { sid } : null);
    },
    searchLocal(acct, q) {
      rec("searchLocal", acctOf(acct), q);
      return Promise.resolve(dryNumbers(q));
    },
    buyNumber(acct, e164, friendlyName) {
      rec("buyNumber", acctOf(acct), e164, friendlyName);
      const sid = next("PN");
      owned.set(sid, e164);
      return Promise.resolve({ sid, e164 });
    },
    // The dry provider already keeps what it "sold", so it can answer honestly --
    // which is what makes the saga's lookup-before-buy testable without a carrier.
    ownedNumber(acct, e164) {
      rec("ownedNumber", acctOf(acct), e164);
      for (const [sid, held] of owned) if (held === e164) return Promise.resolve({ sid, e164 });
      return Promise.resolve(null);
    },
    releaseNumber(acct, numberSid) {
      rec("releaseNumber", acctOf(acct), numberSid);
      owned.delete(numberSid);
      return Promise.resolve();
    },
    createTrunk(acct, o) {
      rec("createTrunk", acctOf(acct), o);
      const sid = next("TK");
      trunks.set(`${acctOf(acct)} ${o.domainName}`, sid);
      return Promise.resolve({ sid, domainName: o.domainName });
    },
    deleteTrunk(acct, trunkSid) {
      rec("deleteTrunk", acctOf(acct), trunkSid);
      return Promise.resolve();
    },
    deleteCampaign: () => Promise.resolve(),
    createCredentialList(acct, friendlyName) {
      rec("createCredentialList", acctOf(acct), friendlyName);
      const sid = next("CL");
      lists.set(`${acctOf(acct)} ${friendlyName}`, sid);
      return Promise.resolve({ sid });
    },
    addCredential(acct, listSid, username) {
      // The password is deliberately not recorded: a ledger is not a vault.
      rec("addCredential", acctOf(acct), listSid, username);
      // A list holds a username once, as Twilio's does: the second is refused.
      if (credentials.has(`${listSid} ${username}`))
        return Promise.reject(new Error(`add credential: ${username} already exists`));
      const sid = next("CR");
      credentials.set(`${listSid} ${username}`, sid);
      return Promise.resolve({ sid });
    },
    attachCredentialList(acct, trunkSid, listSid) {
      rec("attachCredentialList", acctOf(acct), trunkSid, listSid);
      return Promise.resolve();
    },
    addOrigination(acct, trunkSid, o) {
      rec("addOrigination", acctOf(acct), trunkSid, o);
      const sid = next("OU");
      originations.set(`${trunkSid} ${o.sipUrl}`, sid);
      return Promise.resolve({ sid });
    },
    attachNumber(acct, trunkSid, numberSid) {
      rec("attachNumber", acctOf(acct), trunkSid, numberSid);
      return Promise.resolve();
    },
    createMessagingService(acct, o) {
      rec("createMessagingService", acctOf(acct), o);
      return Promise.resolve({ sid: next("MG") });
    },
    addNumberToService(acct, serviceSid, numberSid) {
      rec("addNumberToService", acctOf(acct), serviceSid, numberSid);
      return Promise.resolve({ sid: next("PH") });
    },
    sendSms(acct, o) {
      // Recorded, never delivered: the dry provider is for previews and tests.
      rec("sendSms", acctOf(acct), o.serviceSid, o.to);
      return Promise.resolve({ ok: true, sid: next("SM"), status: 201, code: null });
    },
    plantText(to, text) {
      received.set(to, [...(received.get(to) ?? []), text]);
    },
    // Not `async`: nothing here waits, and lint's `require-await` warnings in this file are a count that may only fall.
    recentTexts(acct, to, sinceMs) {
      rec("recentTexts", acctOf(acct), to, sinceMs);
      return Promise.resolve(
        (received.get(to) ?? [])
          .filter((t) => t.atMs >= sinceMs)
          .sort((a, b) => b.atMs - a.atMs)
          .slice(0, DRY_TEXTS_PAGE),
      );
    },
  };
}

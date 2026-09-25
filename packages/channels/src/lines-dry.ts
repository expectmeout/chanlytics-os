/**
 * The dry LineProvider: fake SIDs, no network, the shape of every answer a
 * real provider gives. It is the provider on laptops and previews
 * (LINES_DRY_RUN=1) and in the saga's tests; production never uses it
 * (chooseLineProvider). It keeps a ledger of calls so a test can prove a
 * resumed saga repeats nothing.
 */
import type { AvailableNumber, LineProvider, ProviderAccount } from "./lines";

export interface DryCall {
  op: string;
  args: unknown[];
}

export interface DryProvider extends LineProvider {
  readonly calls: DryCall[];
  /** Numbers bought and not released, by SID. */
  readonly owned: Map<string, string>;
}

const hex = (n: number, width = 32) => n.toString(16).padStart(width, "0");

export function dryProvider(seed = 1): DryProvider {
  let n = seed;
  const next = (prefix: string) => `${prefix}${hex(n++)}`;
  const calls: DryCall[] = [];
  const owned = new Map<string, string>();
  // What it "made", so a look after a lost receipt finds it, as the carrier's own lists would.
  const subaccounts = new Map<string, ProviderAccount>();
  const trunks = new Map<string, string>();
  const lists = new Map<string, string>();
  const credentials = new Map<string, string>();
  const originations = new Map<string, string>();
  const rec = (op: string, ...args: unknown[]) => calls.push({ op, args });
  const acctOf = (a: ProviderAccount) => a.sid;
  return {
    name: "dry",
    calls,
    owned,
    async createSubaccount(master, friendlyName) {
      rec("createSubaccount", acctOf(master), friendlyName);
      const acct = { sid: next("AC"), token: next("tok") };
      subaccounts.set(friendlyName, acct);
      return { ...acct, status: "active" };
    },
    async findSubaccount(master, friendlyName) {
      rec("findSubaccount", acctOf(master), friendlyName);
      return subaccounts.get(friendlyName) ?? null;
    },
    async findTrunk(acct, domainName) {
      rec("findTrunk", acctOf(acct), domainName);
      const sid = trunks.get(`${acctOf(acct)} ${domainName}`);
      return sid ? { sid, domainName } : null;
    },
    async findCredentialList(acct, friendlyName) {
      rec("findCredentialList", acctOf(acct), friendlyName);
      const sid = lists.get(`${acctOf(acct)} ${friendlyName}`);
      return sid ? { sid } : null;
    },
    async findCredential(acct, listSid, username) {
      rec("findCredential", acctOf(acct), listSid, username);
      const sid = credentials.get(`${listSid} ${username}`);
      return sid ? { sid } : null;
    },
    async deleteCredential(acct, listSid, credentialSid) {
      rec("deleteCredential", acctOf(acct), listSid, credentialSid);
      for (const [k, v] of credentials) if (v === credentialSid) credentials.delete(k);
    },
    async findOrigination(acct, trunkSid, sipUrl) {
      rec("findOrigination", acctOf(acct), trunkSid, sipUrl);
      const sid = originations.get(`${trunkSid} ${sipUrl}`);
      return sid ? { sid } : null;
    },
    async searchLocal(acct, q) {
      rec("searchLocal", acctOf(acct), q);
      const out: AvailableNumber[] = [];
      for (let i = 0; i < Math.min(q.limit, 8); i++) {
        const local = `555${String(100 + i).padStart(4, "0")}`;
        out.push({
          e164: `+1${q.areaCode}${local}`,
          friendly: `(${q.areaCode}) ${local.slice(0, 3)}-${local.slice(3)}`,
          locality: "Dry Run",
          region: "XX",
          capabilities: { voice: true, sms: true, mms: false },
        });
      }
      return out;
    },
    async buyNumber(acct, e164, friendlyName) {
      rec("buyNumber", acctOf(acct), e164, friendlyName);
      const sid = next("PN");
      owned.set(sid, e164);
      return { sid, e164 };
    },
    // The dry provider already keeps what it "sold", so it can answer honestly --
    // which is what makes the saga's lookup-before-buy testable without a carrier.
    async ownedNumber(acct, e164) {
      rec("ownedNumber", acctOf(acct), e164);
      for (const [sid, held] of owned) if (held === e164) return { sid, e164 };
      return null;
    },
    async releaseNumber(acct, numberSid) {
      rec("releaseNumber", acctOf(acct), numberSid);
      owned.delete(numberSid);
    },
    async createTrunk(acct, o) {
      rec("createTrunk", acctOf(acct), o);
      const sid = next("TK");
      trunks.set(`${acctOf(acct)} ${o.domainName}`, sid);
      return { sid, domainName: o.domainName };
    },
    async deleteTrunk(acct, trunkSid) {
      rec("deleteTrunk", acctOf(acct), trunkSid);
    },
    async createCredentialList(acct, friendlyName) {
      rec("createCredentialList", acctOf(acct), friendlyName);
      const sid = next("CL");
      lists.set(`${acctOf(acct)} ${friendlyName}`, sid);
      return { sid };
    },
    async addCredential(acct, listSid, username) {
      // The password is deliberately not recorded: a ledger is not a vault.
      rec("addCredential", acctOf(acct), listSid, username);
      // A list holds a username once, as Twilio's does: the second is refused.
      if (credentials.has(`${listSid} ${username}`)) throw new Error(`add credential: ${username} already exists`);
      const sid = next("CR");
      credentials.set(`${listSid} ${username}`, sid);
      return { sid };
    },
    async attachCredentialList(acct, trunkSid, listSid) {
      rec("attachCredentialList", acctOf(acct), trunkSid, listSid);
    },
    async addOrigination(acct, trunkSid, o) {
      rec("addOrigination", acctOf(acct), trunkSid, o);
      const sid = next("OU");
      originations.set(`${trunkSid} ${o.sipUrl}`, sid);
      return { sid };
    },
    async attachNumber(acct, trunkSid, numberSid) {
      rec("attachNumber", acctOf(acct), trunkSid, numberSid);
    },
    async createMessagingService(acct, o) {
      rec("createMessagingService", acctOf(acct), o);
      return { sid: next("MG") };
    },
    async addNumberToService(acct, serviceSid, numberSid) {
      rec("addNumberToService", acctOf(acct), serviceSid, numberSid);
      return { sid: next("PH") };
    },
    async sendSms(acct, o) {
      // Recorded, never delivered: the dry provider is for previews and tests.
      rec("sendSms", acctOf(acct), o.serviceSid, o.to);
      return { ok: true, sid: next("SM"), status: 201, code: null };
    },
  };
}

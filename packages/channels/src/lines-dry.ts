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
  const rec = (op: string, ...args: unknown[]) => calls.push({ op, args });
  const acctOf = (a: ProviderAccount) => a.sid;
  return {
    name: "dry",
    calls,
    owned,
    async createSubaccount(master, friendlyName) {
      rec("createSubaccount", acctOf(master), friendlyName);
      return { sid: next("AC"), token: next("tok"), status: "active" };
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
      return { sid: next("TK"), domainName: o.domainName };
    },
    async deleteTrunk(acct, trunkSid) {
      rec("deleteTrunk", acctOf(acct), trunkSid);
    },
    async createCredentialList(acct, friendlyName) {
      rec("createCredentialList", acctOf(acct), friendlyName);
      return { sid: next("CL") };
    },
    async addCredential(acct, listSid, username) {
      // The password is deliberately not recorded: a ledger is not a vault.
      rec("addCredential", acctOf(acct), listSid, username);
      return { sid: next("CR") };
    },
    async attachCredentialList(acct, trunkSid, listSid) {
      rec("attachCredentialList", acctOf(acct), trunkSid, listSid);
    },
    async addOrigination(acct, trunkSid, o) {
      rec("addOrigination", acctOf(acct), trunkSid, o);
      return { sid: next("OU") };
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

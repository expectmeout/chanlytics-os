/**
 * Lines — a workspace's own phone number, behind a provider interface.
 *
 * The plan (docs/plans/2026-09-07-onboarding-and-lines.md §5): the product
 * owns lines through a provider, Twilio first, one subaccount per
 * workspace, and a `dry` provider outside production so the whole path
 * runs with fake SIDs. Nothing here touches the network: this file is the
 * interface, the words the product needs from a provider, and the small
 * pure helpers the saga and the endpoint share.
 */
import { randomInt } from "node:crypto";
import { E164 } from "@chanlytics/contracts";
import type { SendOutcome } from "../provider-fetch";

export type LineProviderName = "twilio" | "dry";

/** Credentials to act as — the master account, or a workspace's subaccount. */
export interface ProviderAccount {
  sid: string;
  token: string;
}

export interface AvailableNumber {
  e164: string;
  /** The provider's display form, e.g. "(305) 555-0100". */
  friendly: string;
  locality: string | null;
  region: string | null;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

/**
 * What a line needs from a provider, in the order the saga uses it. Every
 * method is one provider call; idempotency is the saga's job (it records
 * each SID before the next call and skips what exists).
 */
export interface LineProvider {
  readonly name: LineProviderName;
  createSubaccount(master: ProviderAccount, friendlyName: string): Promise<ProviderAccount & { status: string }>;
  searchLocal(acct: ProviderAccount, q: { areaCode: number; limit: number }): Promise<AvailableNumber[]>;
  buyNumber(acct: ProviderAccount, e164: string, friendlyName: string): Promise<{ sid: string; e164: string }>;
  /**
   * The number this account ALREADY owns, if it owns it. Null when it does not.
   *
   * Buying is the one step of the saga that spends money and the only one whose
   * effect was not checked before it ran. Every other step reads its own receipt --
   * `nextLineStep` derives the whole plan from SIDs and facts on the row -- but a
   * receipt is only written AFTER the provider answers, and the saga's worst case is
   * three times its own lambda ceiling. Killed in that window, the number is bought
   * and the row does not know: we pay for it every month, `release` skips releasing
   * it (`if (line.number_sid)`), `number_drift()` never asks the provider, and a
   * retry can never succeed because a carrier will not sell you a number you
   * already hold.
   *
   * One lookup before the purchase closes all four.
   */
  ownedNumber(acct: ProviderAccount, e164: string): Promise<{ sid: string; e164: string } | null>;
  releaseNumber(acct: ProviderAccount, numberSid: string): Promise<void>;
  createTrunk(
    acct: ProviderAccount,
    o: { friendlyName: string; domainName: string },
  ): Promise<{ sid: string; domainName: string }>;
  deleteTrunk(acct: ProviderAccount, trunkSid: string): Promise<void>;
  createCredentialList(acct: ProviderAccount, friendlyName: string): Promise<{ sid: string }>;
  addCredential(acct: ProviderAccount, listSid: string, username: string, password: string): Promise<{ sid: string }>;
  attachCredentialList(acct: ProviderAccount, trunkSid: string, listSid: string): Promise<void>;
  addOrigination(
    acct: ProviderAccount,
    trunkSid: string,
    o: { sipUrl: string; friendlyName: string },
  ): Promise<{ sid: string }>;
  attachNumber(acct: ProviderAccount, trunkSid: string, numberSid: string): Promise<void>;
  /*
   * LOOK BEFORE CREATING AGAIN. Each create's receipt is written after the provider answers, so a run killed in that
   * window left the thing made and the row silent. The saga marks a create as asked before it asks, and a later run
   * that finds the mark looks with these before asking again (lines-saga.ts `once`). Each is one read in the line's own
   * subaccount (the subaccount's, as the master, by a name that carries the line), and a read that FAILS throws: "not
   * found" sends the saga on to create a second one.
   */
  findSubaccount(master: ProviderAccount, friendlyName: string): Promise<ProviderAccount | null>;
  findTrunk(acct: ProviderAccount, domainName: string): Promise<{ sid: string; domainName: string } | null>;
  findCredentialList(acct: ProviderAccount, friendlyName: string): Promise<{ sid: string } | null>;
  findCredential(acct: ProviderAccount, listSid: string, username: string): Promise<{ sid: string } | null>;
  /** A credential whose password was lost with the run that made it: removed, so it can be made again. */
  deleteCredential(acct: ProviderAccount, listSid: string, credentialSid: string): Promise<void>;
  findOrigination(acct: ProviderAccount, trunkSid: string, sipUrl: string): Promise<{ sid: string } | null>;
  /** The Messaging Service a line texts through: inbound to our webhook, the number in its sender pool. */
  createMessagingService(
    acct: ProviderAccount,
    o: { friendlyName: string; inboundUrl: string },
  ): Promise<{ sid: string }>;
  addNumberToService(acct: ProviderAccount, serviceSid: string, numberSid: string): Promise<{ sid: string }>;
  /** One text out through the service. Never throws: a refusal is an answer with the provider's code. */
  /** `statusCallback`: where the carrier's word on this text is posted (sms-status); without it a text is "sent" forever. */
  sendSms(
    acct: ProviderAccount,
    o: { serviceSid: string; to: string; body: string; statusCallback?: string },
  ): Promise<SmsSendResult>;
}

export interface SmsSendResult {
  ok: boolean;
  /** The provider's message id (SM…), for the row. */
  sid: string | null;
  status: number;
  /** The provider's error code when refused: 21610 = the person opted out at the carrier, 30034 = the line is not registered yet. */
  code: number | null;
  /** What the send came to (provider-fetch SendOutcome), when the provider's port said. */
  outcome?: SendOutcome;
}

/** Where Twilio sends a line's calls: Retell's SIP front door (Retell's Twilio guide). */
export const RETELL_ORIGINATION = "sip:sip.retellai.com";

/** What the page states as fact before billing exists (plan §8). */
export const LINE_COSTS = {
  local_number_month_usd: 1.15,
  toll_free_month_usd: 2.15,
} as const;

/**
 * Which provider this deployment may use. Real credentials win; the dry
 * provider is for previews and laptops only — production never fakes a
 * line, so with no credentials there is no provider and the Setup page
 * keeps "we set it up with you".
 */
export function chooseLineProvider(env: {
  sid?: string | null;
  token?: string | null;
  dryRun?: string | null;
  vercelEnv?: string | null;
}): LineProviderName | null {
  if (env.sid && env.token) return "twilio";
  if (env.dryRun === "1" && env.vercelEnv !== "production") return "dry";
  return null;
}

/** The trunk's SIP domain: unique per line, letters, digits and dashes, on Twilio's suffix. */
export function trunkDomain(lineId: string): string {
  return `chanlytics-${lineId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 12)
    .toLowerCase()}.pstn.twilio.com`;
}

/** The SIP username Retell presents on the trunk (≤ 32 characters at Twilio). */
/**
 * The line's subaccount's name: the workspace's, and the line's own tag, so a look for it by name can only find this
 * line's (Twilio's names are not unique, and two workspaces may share one). Within Twilio's 64 characters.
 */
export function subaccountName(tenantName: string, lineId: string): string {
  const tag = lineId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 12)
    .toLowerCase();
  const suffix = ` · Chanlytics · ${tag}`;
  return `${tenantName.slice(0, 64 - suffix.length)}${suffix}`;
}

export function sipUsername(lineId: string): string {
  return `line-${lineId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 12)
    .toLowerCase()}`;
}

const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";

/**
 * A SIP password Twilio accepts: at least 12 characters, a digit, mixed
 * case (SIP Credential docs). 24 characters here, from node:crypto -- the
 * source the edge token's nonce is minted from (edge-token.ts), never
 * Math.random, which nothing in production seeds; `random` is injectable so
 * a test can pin one.
 */
export function sipPassword(random?: () => number): string {
  /** An index below `n`: the injected source's, or an unbiased draw from the system's. */
  const below = random ? (n: number) => Math.floor(random() * n) : (n: number) => randomInt(n);
  const pick = (s: string) => s[below(s.length)];
  const all = LOWER + UPPER + DIGIT;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT)];
  while (chars.length < 24) chars.push(pick(all));
  // Shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = below(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Twilio's rule, checked before a password is sent. */
export function isValidSipPassword(p: string): boolean {
  return p.length >= 12 && /\d/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p);
}

export const isE164 = (s: unknown): s is string => typeof s === "string" && E164.test(s);
export const isAreaCode = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 200 && n <= 999;

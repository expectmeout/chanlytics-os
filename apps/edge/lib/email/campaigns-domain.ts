/**
 * The campaigns domain: where OFFERS by email leave from (One message, every channel, step 4; the campaigns-on-every-
 * channel spec, 4.6). Replies and visit messages leave from the mail domain (EMAIL_DOMAIN); an offer a customer marks as
 * spam must not touch that reputation, so offers leave from a domain of their own (EMAIL_CAMPAIGNS_DOMAIN,
 * campaigns.chanlytics.com), a second sending domain on the platform's Resend account, with its records published once.
 *
 * Offers by email go only while this deployment has ALL of it: the domain named, the mail domain and the provider's key (the
 * mailbox and the wire), the secret that seals every offer's unsubscribe link, and the provider saying the domain is
 * verified for SENDING (the check the mail domain's health sweep makes, asked now and kept five minutes). Until then
 * nothing changes: the readiness door says offers are not on, the composers offer no tick, and the send door refuses
 * `email_marketing_disabled`. Never a switch to another domain: an offer that cannot leave from here does not leave.
 *
 * The answer is kept per instance, a "yes" five minutes and a "no" one, so a record published a minute ago does not hide
 * offers for five, and a provider that could not be asked is not an answer (null, noted for half a minute so a down
 * provider is not asked by every job at once). A failed ask never takes the place of a good answer: the last yes or no
 * the provider gave stays kept, a yes still stands in for a refresh that failed for half an hour (a provider that stopped
 * answering the domains read has not unverified the domain), and a no does not (a run waits, never stops, on a guess).
 *
 * What a broadcast's batch is told of it (campaignsBinding) is three things, not one. Open: the lane the offers leave by.
 * Closed: a domain this deployment names that the provider does NOT verify, so the run stops and says so. Unread: the
 * provider could not be asked, so the email wire is bound unavailable and the run waits (core wireIsUnbound), as it does
 * when the workspace's own domains cannot be read. Never "no lane": that was the unread domain's old answer, and it held
 * each offer's person as having no channel, a skip that is final, for as long as a provider was slow.
 */
import { fetchMailDomains, type MailDomainFacts } from "../packages/channels.js";
import { emailDomainOf, MIN_MS } from "../packages/contracts.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";
import { unsubscribeOrigin } from "../dashboard-origin.js";
import { judgeMailDomain } from "./mail-domain.js";

/** Where an offer leaves from and what seals its link: what a job that sends one is bound with (jobs JobContext.email). */
export interface CampaignsLane {
  domain: string;
  unsubscribeSecret: string;
  unsubscribeOrigin: string;
}

const VERIFIED_TTL_MS = 5 * MIN_MS;
const UNVERIFIED_TTL_MS = MIN_MS;
const UNREAD_TTL_MS = MIN_MS / 2;
/** How long the last yes stands in for a refresh that failed: a provider that cannot answer is not one that unverified the domain. */
const STALE_YES_MS = 30 * MIN_MS;

/**
 * The campaigns domain as named, lower-cased; null when it is unset, is not a domain name, or is the mail domain itself
 * (an offer then leaves from the domain replies use, which this exists to prevent).
 */
export function campaignsDomain(): string | null {
  const d = emailDomainOf(env.EMAIL_CAMPAIGNS_DOMAIN);
  return d && d !== emailDomainOf(env.EMAIL_DOMAIN) ? d : null;
}

/** The last answer the provider GAVE, yes or no: a failed ask never takes its place. */
let keptAnswer: { domain: string; at: number; verified: boolean } | null = null;
/** When the provider was last asked and could not answer, so a down provider is not asked again by every job at once. */
let unreadAt: { domain: string; at: number } | null = null;

/** Whether this instance has said that the secret every offer's unsubscribe link is sealed with is missing: once, not on every ask. */
let saidNoSecret = false;

/**
 * Said once per instance, in the log, when the campaigns domain is named and everything else an offer needs is here but the
 * secret that seals its unsubscribe link: offers by email then stay closed ("not set up") with nothing to say why, which is
 * the one missing piece an operator can set. Never the secret's value, which is not there.
 */
function saySecretMissing(domain: string): void {
  if (saidNoSecret) return;
  saidNoSecret = true;
  logger().error("campaigns_secret_missing", { domain, name: "UNSUBSCRIBE_SECRET" });
}

/** What the provider last said, kept; it said something, so the last failed ask no longer counts. */
function remember(domain: string, at: number, verified: boolean): void {
  keptAnswer = { domain, at, verified };
  unreadAt = null;
}

/** What a refresh that failed answers in place of the provider: the last yes while it is under STALE_YES_MS old, else nothing (null). */
function standingIn(kept: { at: number; verified: boolean } | null, now: number): true | null {
  return kept?.verified === true && now - kept.at < STALE_YES_MS ? true : null;
}

interface Asking {
  /** The clock; a test's steps it past the minutes. */
  now?: number;
  /** Ask the provider now, whatever is kept, and keep the answer: for a caller that must not read a stale one. */
  fresh?: boolean;
  /** The provider's answer; a test's, which holds none. */
  domains?: (cfg: { apiKey: string }) => Promise<MailDomainFacts[]>;
}

/**
 * Whether the provider says the campaigns domain is verified for sending: true or false as it said (false too where this
 * deployment names none, or lacks the mail domain, the key or the secret an offer needs); null when it could not be
 * asked, which is not an answer. A `fresh` ask is the provider's word or null, never a kept answer in its place.
 */
export async function campaignsDomainVerified(o: Asking = {}): Promise<boolean | null> {
  const domain = campaignsDomain();
  const apiKey = env.RESEND_API_KEY;
  if (domain && !env.UNSUBSCRIBE_SECRET) saySecretMissing(domain);
  if (!domain || !apiKey || !emailDomainOf(env.EMAIL_DOMAIN) || !env.UNSUBSCRIBE_SECRET) return false;
  const now = o.now ?? Date.now();
  const kept = keptAnswer && keptAnswer.domain === domain ? keptAnswer : null;
  if (!o.fresh) {
    if (kept && now - kept.at < (kept.verified ? VERIFIED_TTL_MS : UNVERIFIED_TTL_MS)) return kept.verified;
    if (unreadAt && unreadAt.domain === domain && now - unreadAt.at < UNREAD_TTL_MS) return standingIn(kept, now);
  }
  try {
    const domains = await (o.domains ?? fetchMailDomains)({ apiKey });
    const verified = judgeMailDomain(domains, domain, { sendOnly: true }) === null;
    remember(domain, now, verified);
    return verified;
  } catch (e) {
    logger().warn("campaigns_domain_unchecked", { domain, error: errField(e) });
    unreadAt = { domain, at: now };
    return o.fresh ? null : standingIn(kept, now);
  }
}

/**
 * What a broadcast's batch is told of the campaigns domain (see the head of this file). `none`: this deployment names none,
 * and nothing changes for it: its offers by email are refused at enrolment, and a run that somehow holds one holds the person
 * as it always did. `open`: the lane the offers leave by, with the seal and where their page answers. `closed`: it names one the
 * provider does not verify (or lacks the key or the secret an offer needs), `why` for the platform. `unread`: the provider
 * could not be asked, `why` being the wire's own reason for waiting.
 */
export type CampaignsBinding =
  | { state: "none" }
  | { state: "open"; lane: CampaignsLane }
  | { state: "closed"; why: string }
  | { state: "unread"; why: string };

export async function campaignsBinding(o: Asking = {}): Promise<CampaignsBinding> {
  const domain = campaignsDomain();
  if (!domain) return { state: "none" };
  const verified = await campaignsDomainVerified(o);
  if (verified === null)
    return {
      state: "unread",
      why: `the campaigns domain ${domain} could not be checked with the mail provider just now`,
    };
  const secret = env.UNSUBSCRIBE_SECRET;
  if (!verified || !secret)
    return {
      state: "closed",
      why: `the campaigns domain ${domain} is not verified for sending (or this deployment lacks the key or the secret an offer needs)`,
    };
  return { state: "open", lane: { domain, unsubscribeSecret: secret, unsubscribeOrigin: unsubscribeOrigin() } };
}

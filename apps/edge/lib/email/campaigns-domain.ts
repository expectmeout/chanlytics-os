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
 * offers for five, and a provider that could not be asked is not an answer (null, kept briefly so a down provider is not
 * asked by every job at once).
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

/**
 * The campaigns domain as named, lower-cased; null when it is unset, is not a domain name, or is the mail domain itself
 * (an offer then leaves from the domain replies use, which this exists to prevent).
 */
export function campaignsDomain(): string | null {
  const d = emailDomainOf(env.EMAIL_CAMPAIGNS_DOMAIN);
  return d && d !== emailDomainOf(env.EMAIL_DOMAIN) ? d : null;
}

let keptAnswer: { domain: string; at: number; verified: boolean | null } | null = null;

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

/** What was last asked, kept. */
function remember(domain: string, at: number, verified: boolean | null): void {
  keptAnswer = { domain, at, verified };
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
 * asked, which is not an answer.
 */
export async function campaignsDomainVerified(o: Asking = {}): Promise<boolean | null> {
  const domain = campaignsDomain();
  const apiKey = env.RESEND_API_KEY;
  if (domain && !env.UNSUBSCRIBE_SECRET) saySecretMissing(domain);
  if (!domain || !apiKey || !emailDomainOf(env.EMAIL_DOMAIN) || !env.UNSUBSCRIBE_SECRET) return false;
  const now = o.now ?? Date.now();
  if (!o.fresh && keptAnswer && keptAnswer.domain === domain) {
    const ttl =
      keptAnswer.verified === true
        ? VERIFIED_TTL_MS
        : keptAnswer.verified === false
          ? UNVERIFIED_TTL_MS
          : UNREAD_TTL_MS;
    if (now - keptAnswer.at < ttl) return keptAnswer.verified;
  }
  let verified: boolean | null;
  try {
    const domains = await (o.domains ?? fetchMailDomains)({ apiKey });
    verified = judgeMailDomain(domains, domain, { sendOnly: true }) === null;
  } catch (e) {
    logger().warn("campaigns_domain_unchecked", { domain, error: errField(e) });
    verified = null;
  }
  remember(domain, now, verified);
  return verified;
}

/**
 * What a job that sends an offer is bound with: the domain, the seal and where its page answers, while the domain is
 * verified; null otherwise (the door then refuses every offer), and null where the provider could not be asked.
 */
export async function campaignsLane(o: Asking = {}): Promise<CampaignsLane | null> {
  const domain = campaignsDomain();
  const secret = env.UNSUBSCRIBE_SECRET;
  if (domain && !secret) saySecretMissing(domain);
  if (!domain || !secret || (await campaignsDomainVerified(o)) !== true) return null;
  return { domain, unsubscribeSecret: secret, unsubscribeOrigin: unsubscribeOrigin() };
}

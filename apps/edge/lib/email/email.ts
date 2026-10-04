/**
 * The email channel's switch, its wire and its intake, as this deployment holds them.
 *
 * Email is on for a deployment when it names a mail domain (EMAIL_DOMAIN, the
 * subdomain that sends and receives: mail.chanlytics.com). Absent, the channel
 * does not exist here: no wire is bound, the webhook door answers 404, nothing
 * is drawn, and a delivery that names the channel fails as "no sender for
 * channel", the way any channel a runtime does not have fails (deliver.ts
 * Wire). Present with no provider key, the channel exists and cannot send:
 * null, a refusal at the door, never a guess.
 *
 * A workspace's own switch is its mailbox row (00126): without one it has no
 * address to be written to, so nothing arrives and nothing is answered.
 *
 * The cold reply domains (D17) are the domain cold emails' replies come back on and the one before it while it winds
 * down; a switch set to something that is not a domain is ignored and said once. A workspace's wire (emailWireFor)
 * sends as its mailbox on the platform's account and as each verified own domain on the cold account, never as another
 * workspace's address; a held domain has no route, and a domains read that fails is a wire not bound, so a send waits.
 * The intake (emailIntake) hands the job runner the fetch, the erasure check and the owner's note, and
 * emailWaitingMessage is that note's words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailboxOfTenant, sendingDomainsOf, type Database } from "../packages/db.js";
import { emailSender, wireUnavailable, type EmailRoute, type Sender, type WireUnavailable } from "../packages/core.js";
import { fetchReceivedEmail, sendsAs, sendsAsCampaigns, sendsAsOwnDomain } from "../packages/channels.js";
import { emailDomainOf } from "../packages/contracts.js";
import type { JobContext } from "../packages/jobs.js";
import { erasedBeforeEmail } from "../erased.js";
import { notify, type NotifyMessage } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import type { CampaignsBinding, CampaignsLane } from "./campaigns-domain.js";
import { logger, errField, type Logger } from "../log.js";
import { env } from "../env.js";

type Db = SupabaseClient<Database>;

/** The deployment's mail domain, lower-cased; null when email is off here (contracts emailDomainOf, as the dashboard reads it). */
export function emailDomain(): string | null {
  return emailDomainOf(env.EMAIL_DOMAIN);
}

/**
 * Whether this deployment's email wire can send at all: it has a mail domain AND the provider's key (emailWireFor,
 * emailIntake: the job runner's email context exists under the same two, and a broadcast's email request port needs
 * it). A run that counted email ready on the domain alone would enrol people the send then holds, `no_channel`.
 */
export function emailCanSend(): boolean {
  return !!emailDomain() && !!env.RESEND_API_KEY;
}

/** A switch's value that was set and could not be read is said once per instance: it falls back, and must not do so unseen. */
const rejected = new Set<string>();
function readDomainSwitch(
  name: "COLD_REPLY_DOMAIN" | "COLD_REPLY_DOMAIN_PREVIOUS",
  raw: string | undefined,
): string | null {
  const d = emailDomainOf(raw);
  if (raw && !d && !rejected.has(name)) {
    rejected.add(name);
    logger().warn("email_switch_rejected", { name, why: "not a domain name: it is ignored" });
  }
  return d && d !== emailDomain() ? d : null;
}

/**
 * The domain cold emails' replies come back on (D17), lower-cased, when it is set apart from the mail domain; null when
 * it is not, and they come back on EMAIL_DOMAIN as every other reply does.
 */
export function coldReplyDomain(): string | null {
  return readDomainSwitch("COLD_REPLY_DOMAIN", env.COLD_REPLY_DOMAIN);
}

/**
 * Every cold reply domain a reply may still come back on, the one set now first: it and the one before it
 * (COLD_REPLY_DOMAIN_PREVIOUS), while that winds down. What the intake routes, and what an own domain's email may
 * still be answered at; never a domain that is the mail domain.
 */
export function coldReplyDomains(): string[] {
  const now = coldReplyDomain();
  const before = readDomainSwitch("COLD_REPLY_DOMAIN_PREVIOUS", env.COLD_REPLY_DOMAIN_PREVIOUS);
  return [...new Set([now, before].filter((d): d is string => !!d))];
}

/**
 * One workspace's email wire. undefined: no email on this runtime. null: email
 * is on and this workspace cannot send, because the deployment holds no
 * provider key or the workspace has no mailbox. A WireUnavailable: the
 * workspace's own domains could not be read just now, so which routes it has is
 * not known; a send waits for the next try (core deliver) rather than meet a
 * wire built without its routes. Otherwise a wire that sends
 * only as that workspace's addresses: the provider keys are shared by every
 * workspace, so what keeps one business's email from leaving as another's is
 * this binding, the way the WhatsApp wire is bound to the tenant's own
 * credentials. The hosted mailbox leaves on the platform's account; each own
 * domain the workspace has verified leaves on the cold account (Reach out),
 * when this deployment holds its key. Replies to either come back to the
 * mailbox, so a workspace with no mailbox has no email line at all. With `campaigns` (the job sends offers and the
 * deployment's campaigns domain is verified: campaigns-domain.ts) the same mailbox may also send OFFERS, from the campaigns
 * domain, on the platform's account; it is the only route an offer may take, and no other send may take it.
 */
export async function emailWireFor(
  db: Db,
  tenantId: string,
  campaigns: CampaignsLane | null = null,
): Promise<Sender | null | undefined | WireUnavailable> {
  const domain = emailDomain();
  if (!domain) return undefined;
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return null;
  const mailbox = await mailboxOfTenant(db, tenantId);
  if (!mailbox) return null;
  const routes: EmailRoute[] = [{ lane: "hosted", cfg: { apiKey }, as: sendsAs(mailbox, domain) }];
  if (campaigns)
    routes.push({ lane: "campaigns", cfg: { apiKey }, as: sendsAsCampaigns(mailbox, campaigns.domain, domain) });
  // A held domain has no route, but a person's reply frozen with it says so when it goes as the mailbox (left_as_why).
  const held: string[] = [];
  const coldKey = env.RESEND_COLD_API_KEY;
  // Cold mail leaves only while its receipts can be read: without the cold account's webhook secret every bounce and
  // complaint would be refused at the door (email-ingress.ts), and no domain would ever be held for them.
  if (coldKey && env.RESEND_COLD_WEBHOOK_SECRET) {
    // A domains read that fails is the wire not bound (WireUnavailable), never a wire built without the workspace's
    // own routes: a cold email frozen with its domain's address would be refused at such a wire as leaving as another
    // sender, recorded failed, and its lead's step lost for the run although nothing left. The send waits instead.
    // The tick binds each channel's wire on its own (api/jobs/tick.ts), so a text's and a WhatsApp's are not held.
    try {
      for (const d of await sendingDomainsOf(db, tenantId)) {
        // Answered on the cold reply domains when they are set (D17), and on the mail domain still: an email
        // frozen before a switch leaves as it was frozen.
        const as = sendsAsOwnDomain(d, mailbox, domain, coldReplyDomains());
        if (d.state === "verified") routes.push({ lane: "own", cfg: { apiKey: coldKey }, as });
        else if (d.state === "held") held.push(as.address);
      }
    } catch (e) {
      logger({ tenant_id: tenantId }).error("email_own_domains_unread", { error: errField(e) });
      return wireUnavailable(errField(e));
    }
  }
  return emailSender(routes, held);
}

type EmailWaiting = Parameters<NonNullable<JobContext["email"]>["tell"]>[1];

/**
 * "An email is waiting", as words: pure, so what a workspace reads is tested
 * rather than read back off this file (alerts.ts handoffMessage is the same
 * split). The subject line and the first words are the customer's, so they go
 * only to an address that is this workspace's; what the platform may be told
 * about a workspace it cannot address names nobody.
 */
export function emailWaitingMessage(n: EmailWaiting): NotifyMessage {
  const who = n.fromName?.trim() || n.from;
  const kind = n.claim === "automated" ? "An automated email arrived" : `${who} wrote by email`;
  return {
    kind: "handoff",
    route: `inbox/th-${n.conversationId}`,
    about: { type: "conversation", id: n.conversationId },
    subject: n.subject?.trim() ? `${kind}: ${n.subject.trim()}` : kind,
    body:
      `${n.preview?.trim() ? `They wrote: “${n.preview.trim()}”\n\n` : ""}` +
      `Email · ${n.from}\n` +
      "The receptionist does not answer email yet, so nothing was sent. Reply from the Inbox.",
    redactedBody: "An email arrived for a workspace and nobody could be told.",
  };
}

/**
 * Email's intake as the job runner is handed it; undefined when email is off here or there is no provider key to fetch
 * with. `campaigns` is bound for a job that sends offers, while the campaigns domain is verified (campaigns-domain.ts); `closed`
 * is why offers cannot leave when the deployment names a campaigns domain the provider does not verify. `authservId` is the
 * name the provider's receiving side writes into the header that proves a sender (EMAIL_AUTHSERV_ID): none, no yes by email.
 */
export function emailIntake(
  db: Db,
  campaigns: CampaignsLane | null = null,
  closed: string | null = null,
  unread: string | null = null,
): JobContext["email"] | undefined {
  const domain = emailDomain();
  const apiKey = env.RESEND_API_KEY;
  if (!domain || !apiKey) return undefined;
  return {
    domain,
    ...(campaigns ? { campaigns } : {}),
    ...(closed ? { campaignsClosed: closed } : {}),
    ...(unread ? { campaignsUnread: unread } : {}),
    authservId: env.EMAIL_AUTHSERV_ID ?? null,
    fetch: (receivedId) => fetchReceivedEmail({ apiKey }, receivedId),
    erasedBefore: (tenantId, address, receivedAtIso) => erasedBeforeEmail(db, tenantId, address, receivedAtIso),
    // Best-effort by contract: the thread is already flagged, which is the
    // durable half. A notification that could not be sent is logged, and the
    // deadman's sweep still names a thread nobody has opened.
    tell: async (tenantId, note) => {
      try {
        const addressing = await loadTenantNotifications(db, tenantId);
        await notify({ tenantId, ...addressing }, emailWaitingMessage(note));
      } catch (e) {
        logger({ tenant_id: tenantId }).error("email_tell_failed", { error: errField(e) });
      }
    },
  };
}

/**
 * The email wire one job is bound with, and what its intake is told of the campaigns domain (`campaigns`, `closed`: the
 * arguments of emailIntake), from what the domain came to for the job (campaigns-domain.ts campaignsBinding; `none` for
 * every job that sends no offer). Open: the wire gains the campaigns route and the intake the lane. Closed: the deployment
 * names a domain the provider does not verify, so the intake says why and the run stops (core offersClosed). Unread: the
 * provider could not be asked about it, so the email wire is bound as ever (without the campaigns route) and the intake says
 * so: a run of offers WAITS and asks again (core offersUnread), and a visit's email, which leaves from the mail domain, goes.
 * Without a lane the batch held each of its offers as having no channel, a skip that is final; binding the whole wire
 * unavailable held every email of the batch, a visit reminder's too.
 */
export async function emailBoundFor(
  db: Db,
  tenantId: string,
  offers: CampaignsBinding,
  L: Logger,
): Promise<{
  email: Awaited<ReturnType<typeof emailWireFor>>;
  campaigns: CampaignsLane | null;
  closed: string | null;
  unread: string | null;
}> {
  const campaigns = offers.state === "open" ? offers.lane : null;
  const email = await emailWireFor(db, tenantId, campaigns).catch((e: unknown) => {
    L.error("email_wire_unavailable", { tenant_id: tenantId, error: errField(e) });
    return wireUnavailable(errField(e));
  });
  return {
    email,
    campaigns,
    closed: offers.state === "closed" ? offers.why : null,
    unread: offers.state === "unread" ? offers.why : null,
  };
}

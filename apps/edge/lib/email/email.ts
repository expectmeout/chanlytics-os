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
 * A workspace's wire (emailWireFor) sends as its hosted mailbox on the platform's account and as each mailbox the
 * business connected through that mailbox's own provider (decision 0056, mailbox/mailbox-wire.ts), never as another
 * workspace's address; a connected mailbox that does not send now has no route, and a read of them that fails is a
 * wire not bound, so a send waits. The intake (emailIntake) hands the job runner the fetch, the erasure check and the
 * owner's note, and emailWaitingMessage is that note's words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailboxOfTenant, type Database } from "../packages/db.js";
import { emailSender, wireUnavailable, type EmailRoute, type Sender, type WireUnavailable } from "../packages/core.js";
import { fetchReceivedEmail, sendsAs, sendsAsCampaigns } from "../packages/channels.js";
import { emailDomainOf } from "../packages/contracts.js";
import type { JobContext } from "../packages/jobs.js";
import { erasedBeforeEmail } from "../erased.js";
import { notify, type NotifyMessage } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import type { CampaignsBinding, CampaignsLane } from "./campaigns-domain.js";
import { ownRoutesFor } from "./mailbox/mailbox-wire.js";
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

/**
 * One workspace's email wire. undefined: no email on this runtime (no mail domain, and no mailbox connected). null:
 * email is on and this workspace cannot send: no hosted mailbox it may send as, and no mailbox it connected. A
 * WireUnavailable: its connected mailboxes could not be read just now, so which routes it has is not known; a send
 * waits for the next try (core deliver) rather than meet a wire built without its routes. Otherwise a wire that sends
 * only as that workspace's addresses: the hosted mailbox on the platform's account (the provider key is shared by
 * every workspace, so what keeps one business's email from leaving as another's is this binding, the way the WhatsApp
 * wire is bound to the tenant's own credentials), and each mailbox the business connected through its own provider and
 * grant (decision 0056), whose replies come back to that mailbox and are read from it. With `campaigns` (the job sends
 * offers and the deployment's campaigns domain is verified: campaigns-domain.ts) the hosted mailbox may also send
 * OFFERS, from the campaigns domain, on the platform's account; it is the only route an offer may take, and no other
 * send may take it.
 */
export async function emailWireFor(
  db: Db,
  tenantId: string,
  campaigns: CampaignsLane | null = null,
): Promise<Sender | null | undefined | WireUnavailable> {
  const domain = emailDomain();
  const apiKey = env.RESEND_API_KEY;
  const routes: EmailRoute[] = [];
  if (domain && apiKey) {
    const mailbox = await mailboxOfTenant(db, tenantId);
    if (mailbox) {
      routes.push({ lane: "hosted", cfg: { apiKey }, as: sendsAs(mailbox, domain) });
      if (campaigns)
        routes.push({ lane: "campaigns", cfg: { apiKey }, as: sendsAsCampaigns(mailbox, campaigns.domain, domain) });
    }
  }
  // A connected mailbox that does not send now has no route, but a person's reply frozen with it says so when it goes
  // as the hosted mailbox (left_as_why). A read that fails is the wire not bound (WireUnavailable), never a wire built
  // without the workspace's own routes: a reach-out's email frozen with its mailbox's address would be refused at such
  // a wire as leaving as another sender, and its lead's step lost although nothing left. The send waits instead. The
  // tick binds each channel's wire on its own (api/jobs/tick.ts), so a text's and a WhatsApp's are not held.
  let own: Awaited<ReturnType<typeof ownRoutesFor>>;
  try {
    own = await ownRoutesFor(db, tenantId);
  } catch (e) {
    logger({ tenant_id: tenantId }).error("email_own_mailboxes_unread", { error: errField(e) });
    return wireUnavailable(errField(e));
  }
  routes.push(...own.routes);
  if (routes.length === 0 && own.held.length === 0) return domain ? null : undefined;
  return emailSender(routes, own.held);
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
      "Nothing was sent: a reply is drafted for you in Need you, to change or send from the Inbox.",
    redactedBody: "An email arrived for a workspace and nobody could be told.",
  };
}

/**
 * Email's intake as the job runner is handed it; undefined when email is off here or there is no provider key to fetch
 * with. `campaigns` is bound for a job that sends offers, while the campaigns domain is verified (campaigns-domain.ts); `closed`
 * is why offers cannot leave when the deployment names a campaigns domain the provider does not verify.
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

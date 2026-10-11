import "server-only";
import {
  type ChannelsReady,
  channelsReady,
  type NumberHealth,
  numberHealth,
  numberHealthWithStanding,
  offerPauseOf,
  parseTenantConfig,
  standingFromConfig,
} from "@chanlytics/contracts";
import { mailboxOfTenant, textLineFacts, whatsappChannelFacts, workspacePaused } from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import { emailWire } from "../connections/email-readiness";
import { log } from "../log";
import { configRowOf } from "../workspace/config-row";

/**
 * Whether this workspace can send a campaign on each channel now (One message, every channel, step 3; contracts
 * reach-for.ts channelsReady): WhatsApp by its number's health, a text by its line, an email by its mailbox and whether
 * the deployment's email wire can send, which the EDGE says (connections/email-readiness.ts: a mail domain AND the
 * provider's key, the one answer its own run reads too), since the dashboard may never hold the key. An edge that could
 * not be asked leaves email "This could not be checked just now", never ready. Email also says whether OFFERS can go
 * (contracts email-offers.ts): the edge's verdict on the campaigns domain, whether the business has its postal address on
 * file (the foot of every offer names it), and whether the mailbox's offers are paused by a gate. The address is read only
 * once the edge says the domain is verified: until then offers are closed for the deployment's reason, which comes first,
 * and nothing about the workspace's configuration is asked. And whether the workspace is paused (`paused`, tenants.status):
 * the composers say so where Send would be (contracts CAMPAIGNS_PAUSED_WORDS) and a broadcast made under it is refused. The
 * composers draw a channel's tick from it, the routes refuse a tick it says no to, and the edge's run reads the same rows
 * (packages/db campaign-channels.ts).
 */
export async function channelsReadyOf(
  ctx: RouteContext,
  tenantId: string,
  o: { fresh: boolean; withPause: boolean },
): Promise<ChannelsReady> {
  // Asked first, so the edge's answer (kept five minutes while all is well, a short while otherwise) overlaps the reads
  // below. A send that is about to be committed asks fresh: it must not go on a "ready" the edge has since taken back.
  const wire = emailWire({ fresh: o.fresh });
  // Whether the workspace is paused (billing) rides with the channels where a campaign is made or composed (`withPause`): the
  // door refuses every message of a campaign under it, so the composers say so where Send would be and a broadcast made under
  // it is refused (core campaignHowOf). A page that only counts who can be reached (People's rows, an export) never asks: a
  // pause changes what is sent, not who can hear the business, and the read is one more query on a page that did not need it.
  const [whatsapp, textLine, paused] = await Promise.all([
    whatsappHealthOf(ctx, tenantId),
    textLineFacts(ctx.supabase, tenantId),
    o.withPause ? workspacePaused(ctx.supabase, tenantId) : Promise.resolve(false),
  ]);
  const { ready: domain, offers } = await wire;
  // The mailbox is read only where the wire says it can send: with no wire, or none known, there is nothing to offer.
  const mailbox = domain === true ? await mailboxOfTenant(ctx.supabase, tenantId) : null;
  // The address, only where offers could go at all. A configuration that could not be read says offers by email "could not
  // be checked", never "add your address", and costs the page nothing else.
  let configUnread = false;
  const config =
    domain === true && offers === true
      ? await configRowOf(ctx.supabase, tenantId).catch(() => {
          configUnread = true;
          return null;
        })
      : null;
  const address = parseTenantConfig(config?.config ?? null)?.brain?.profile?.address?.trim();
  return channelsReady({
    whatsapp,
    textLine,
    paused,
    email: {
      mailbox: !!mailbox,
      domain,
      offers: {
        campaigns: configUnread ? null : offers,
        address: !!address,
        paused: offerPauseOf(mailbox?.offers_paused_at, mailbox?.offers_paused_reason),
      },
    },
  });
}

/**
 * The same for a page that draws it beside other things: a read that fails is said in the log and is null, and the page
 * counts as it did before the channels were (WhatsApp, which its own number banner judges) and says the others could
 * not be checked, rather than losing the campaigns it was reading for a line about email.
 */
export async function channelsReadyOrNull(
  ctx: RouteContext,
  tenantId: string,
  o: { withPause: boolean },
): Promise<ChannelsReady | null> {
  try {
    // A page that draws it reads what is kept: it commits nothing, and the routes that do ask fresh (campaign-ports.ts).
    return await channelsReadyOf(ctx, tenantId, { fresh: false, withPause: o.withPause });
  } catch (e) {
    log.error("campaign_channels_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** The WhatsApp number's health, with the number itself (E.164), which the pause on offers to US numbers is judged by. */
type WhatsappHealth = NumberHealth & { number: string | null };

/**
 * The WhatsApp number's health (contracts numberHealth), with what Meta holds against the number (its kept standing, 00338:
 * a number Meta has stopped, or whose account has no payment method, carries no campaign, in the sentence the Connections
 * row says) and the number itself; null with no active number. A read that fails throws.
 */
export async function whatsappHealthOf(ctx: RouteContext, tenantId: string): Promise<WhatsappHealth | null> {
  const wa = await whatsappChannelFacts(ctx.supabase, tenantId);
  if (!wa) return null;
  const s = (k: string) => (typeof wa.config[k] === "string" ? wa.config[k] : null);
  const health = numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });
  return { ...numberHealthWithStanding(health, standingFromConfig(wa.config.standing)), number: wa.number };
}

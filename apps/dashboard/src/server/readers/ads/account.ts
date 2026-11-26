import "server-only";
import {
  ROLE_PERMS,
  adCardChecksOf,
  adStandingOf,
  metaAdConfigOf,
  samePhone,
  DbFailure,
  type AdAccountCard,
  type AdAccountDto,
  type MetaAdConfig,
} from "@chanlytics/contracts";
import { findAdAccountForPage, type AdAccountRow } from "@chanlytics/db/ads";
import { findChannelNumber } from "@chanlytics/db/channels";
import { readAdsOffered } from "../../connections/ads-ready";
import { readerStamp, type Reader } from "../../shared/reader";

/**
 * The Page's link to the number AI answers, as far as Chanlytics can know it (AdAccountCard.whatsapp_link). Meta names
 * a Page's WhatsApp number only to an app with its Page Public Content or Metadata Access, and one at most of the fifty
 * a Page may hold: so only AI's own number named says it is linked, and a number named that is not AI's says nothing of
 * AI's, which may be linked beside it.
 */
function whatsAppLinkOf(config: Pick<MetaAdConfig, "page_whatsapp">, aiNumber: string | null) {
  if (aiNumber === null) return "no_number" as const;
  return samePhone(config.page_whatsapp, aiNumber) ? ("ai_number" as const) : ("unsaid" as const);
}

/** One account's card, from its row and the number AI answers: the checks are read here, once, for every page. */
function accountCardOf(row: AdAccountRow, aiNumber: string | null): AdAccountCard {
  const config = metaAdConfigOf(row.config);
  const standing = adStandingOf(row.standing);
  return {
    id: row.id,
    external_id: row.external_id,
    business_id: config.business_id,
    standing: standing.account ?? null,
    status:
      row.status === "choosing" || row.status === "revoked" || row.status === "disconnected" ? row.status : "connected",
    name: row.name,
    currency: row.currency,
    timezone: row.timezone,
    page_name: config.page_name,
    connected_at: row.connected_at,
    revoked_at: row.revoked_at,
    disconnected_at: row.disconnected_at,
    read_at: row.read_at,
    read_failed: row.read_error !== null,
    spend_limit_minor: config.spend_limit_minor,
    instagram_handle: config.instagram_handle,
    ai_number: aiNumber,
    checks: adCardChecksOf({ standing, config }),
    whatsapp_link: whatsAppLinkOf(config, aiNumber),
    can_pause: config.scopes.includes("ads_management"),
    reads_instagram: config.scopes.includes("instagram_basic"),
    choices: config.choices,
  };
}

/**
 * GET ads/account, as the route answers it (decision 0049's adAccounts and adChecks): the workspace's ad account on
 * Facebook and Instagram as its card draws it, with its checks read in one place, whether Connect is offered in
 * this workspace here, and whether this member may press it. The Ads page and Settings › Connections read the same
 * answer, so the two cards cannot disagree, and AI reads it too. An account is not a row a citation names.
 */
export const adAccount: Reader<undefined, AdAccountDto> = {
  name: "ad-account",
  async read(rc) {
    const { supabase } = rc.ctx;
    const [offered, row, number] = await Promise.all([
      readAdsOffered(rc.tenantId),
      findAdAccountForPage(supabase, rc.tenantId, "meta"),
      findChannelNumber(supabase, rc.tenantId, "whatsapp"),
    ]);
    if (number.error) throw new DbFailure(number.error, "the number AI answers");
    const data: AdAccountDto = {
      offered,
      can_connect: offered && ROLE_PERMS[rc.role].ads,
      meta: row ? accountCardOf(row, number.data?.number_e164 ?? null) : null,
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

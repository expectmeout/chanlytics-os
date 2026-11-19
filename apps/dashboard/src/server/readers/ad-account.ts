import "server-only";
import {
  ROLE_PERMS,
  adCardChecksOf,
  adStandingOf,
  metaAdConfigOf,
  DbFailure,
  type AdAccountCard,
  type AdAccountDto,
} from "@chanlytics/contracts";
import { findAdAccountForPage, type AdAccountRow } from "@chanlytics/db/ads";
import { findChannelNumber } from "@chanlytics/db/channels";
import { adsOffered } from "../ads/account";
import { readerStamp, type Reader } from "../shared/reader";

/** One account's card, from its row and the number AI answers: the checks are read here, once, for every page. */
function cardOf(row: AdAccountRow, aiNumber: string | null): AdAccountCard {
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
    checks: adCardChecksOf({ standing, config, aiNumber }),
    can_pause: config.scopes.includes("ads_management"),
    reads_instagram: config.scopes.includes("instagram_basic"),
    choices: config.choices,
  };
}

/**
 * GET ads/account, as the route answers it (decision 0049's adAccounts and adChecks): the workspace's ad account on
 * Facebook and Instagram as its card draws it, with the five checks read in one place, whether Connect is offered in
 * this workspace here, and whether this member may press it. The Ads page and Settings › Connections read the same
 * answer, so the two cards cannot disagree, and AI reads it too. An account is not a row a citation names.
 */
export const adAccount: Reader<undefined, AdAccountDto> = {
  name: "ad-account",
  async read(rc) {
    const { supabase } = rc.ctx;
    const [offered, row, number] = await Promise.all([
      adsOffered(rc.tenantId),
      findAdAccountForPage(supabase, rc.tenantId, "meta"),
      findChannelNumber(supabase, rc.tenantId, "whatsapp"),
    ]);
    if (number.error) throw new DbFailure(number.error, "the number AI answers");
    const data: AdAccountDto = {
      offered,
      can_connect: offered && ROLE_PERMS[rc.role].ads,
      meta: row ? cardOf(row, number.data?.number_e164 ?? null) : null,
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

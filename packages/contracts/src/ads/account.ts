/**
 * An owner's ad account as it is kept (`ad_accounts`, 00648; decision 0049): the two parts of its row that hold a
 * platform's facts, in the shape both apps read. The edge writes them from what the platform answered; the dashboard's
 * reader draws the card and its checks from them. Neither part is ever a token.
 *
 *   standing   what the platform says the account itself stands on, in typed words only, never a platform's sentence
 *   config     the platform's own ids and facts beside the account, one shape a platform. Meta's is here
 *
 * Both are read defensively: a part that is odd is left out alone, so one bad value never empties the card.
 */
import { samePhone } from "../shared/phone";
import { isOneOf, recordOrEmpty } from "../shared/unknown";

/** Where an ad account stands at its platform, in Chanlytics' words. */
export const AD_ACCOUNT_STANDINGS = [
  "active",
  "disabled",
  "unsettled",
  "review",
  "grace",
  "closing",
  "closed",
] as const;
export type AdAccountStanding = (typeof AD_ACCOUNT_STANDINGS)[number];

/** `ad_accounts.standing`: a key for each thing the account can stand on. A key not read yet is absent. */
export interface AdStanding {
  /** The account itself: only `active` (and `grace`, where the platform still runs its ads) may show an ad. */
  account?: AdAccountStanding;
  /** Whether the platform holds a payment method for it. With none an ad can be made, and is never shown. */
  funding?: "ok" | "none";
}

/**
 * An account the owner could mean, while one is to be chosen: what the one question draws. A type and not an
 * interface, since it is kept as JSON on the account's row, and JSON's own type takes a literal's shape alone.
 */
export type AdAccountChoice = {
  external_id: string;
  name: string;
  currency: string;
  timezone: string;
  /** Whether the Page's own ads have run from it: what makes it the likelier of two. */
  runs_page: boolean;
};

/** `ad_accounts.config` for Meta: the ids and facts beside the account. Each is null where Meta gave none. */
export interface MetaAdConfig {
  /** The business portfolio the sign-in belongs to. */
  business_id: string | null;
  /** The Page the ads run as, and its name. */
  page_id: string | null;
  page_name: string | null;
  /**
   * A WhatsApp number that Page is linked to, digits only, where Meta names one. Meta answers it only to an app with its
   * Page Public Content or Metadata Access, and names one number of the fifty a Page may hold, so null is "not named",
   * never "none linked".
   */
  page_whatsapp: string | null;
  /** The Instagram account that Page is linked to. Not a check: a quiet line. */
  instagram_handle: string | null;
  /** The account's own spending limit at Meta, in ISO minor units of its currency. Null where it has none. */
  spend_limit_minor: number | null;
  /** The least Meta lets the account spend a day, in ISO minor units. */
  min_daily_minor: number | null;
  /** The accounts to choose from, likelier first, while one is to be chosen. Empty once one is. */
  choices: AdAccountChoice[];
  /** What the sign-in was granted. Pause and Resume need `ads_management`. */
  scopes: string[];
  /** Meta's id for who the sign-in is: what Meta names when a business removes Chanlytics there. */
  user_id: string | null;
}

const text = (value: unknown, max = 500): string | null =>
  typeof value === "string" && value.trim() !== "" && value.length <= max ? value : null;
const whole = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const FUNDINGS = ["ok", "none"] as const;

/** `ad_accounts.standing`, read: each key kept only where it is one of its words. */
export function adStandingOf(json: unknown): AdStanding {
  const kept = recordOrEmpty(json);
  const { account, funding } = kept;
  return {
    ...(isOneOf(AD_ACCOUNT_STANDINGS, account) ? { account } : {}),
    ...(isOneOf(FUNDINGS, funding) ? { funding } : {}),
  };
}

function choiceOf(json: unknown): AdAccountChoice[] {
  const kept = recordOrEmpty(json);
  const externalId = text(kept.external_id, 200);
  const name = text(kept.name);
  const currency = text(kept.currency, 3);
  const timezone = text(kept.timezone, 100);
  return externalId && name && currency && timezone
    ? [{ external_id: externalId, name, currency, timezone, runs_page: kept.runs_page === true }]
    : [];
}

/** `ad_accounts.config` of a Meta account, read: each part kept alone, null or empty where it is absent or odd. */
export function metaAdConfigOf(json: unknown): MetaAdConfig {
  const kept = recordOrEmpty(json);
  return {
    business_id: text(kept.business_id, 200),
    page_id: text(kept.page_id, 200),
    page_name: text(kept.page_name),
    page_whatsapp: text(kept.page_whatsapp, 32)?.replace(/\D/g, "") || null,
    instagram_handle: text(kept.instagram_handle, 200),
    spend_limit_minor: whole(kept.spend_limit_minor),
    min_daily_minor: whole(kept.min_daily_minor),
    choices: Array.isArray(kept.choices) ? kept.choices.flatMap(choiceOf) : [],
    scopes: Array.isArray(kept.scopes) ? kept.scopes.flatMap((scope) => text(scope, 100) ?? []) : [],
    user_id: text(kept.user_id, 200),
  };
}

/**
 * An owner's ad account as its card draws it (GET ads/account): what the Ads page and Settings › Connections both read,
 * so the two cannot disagree. `null` under `meta` is a workspace that never connected one.
 */
export interface AdAccountDto {
  /** Whether Connect is offered in this workspace here (the Ads plan's D7), and whether this member may press it. */
  offered: boolean;
  can_connect: boolean;
  meta: AdAccountCard | null;
}

/** One account's card. Dates are ISO moments; money is whole minor units of `currency`. */
export interface AdAccountCard {
  id: string;
  status: "choosing" | "connected" | "revoked" | "disconnected";
  /** The platform's own id for the account, bare: what a door to the platform's page for it is built from. */
  external_id: string | null;
  /** The business portfolio the sign-in belongs to, at the platform; with `external_id`, the door to the account's own standing. */
  business_id: string | null;
  /** Where the account stands at its platform; null where it has not said, or said a word Chanlytics does not know. */
  standing: AdAccountStanding | null;
  /** The account's name at its platform, and its currency (ISO 4217); null while one is to be chosen. */
  name: string | null;
  currency: string | null;
  /** The account's own zone (IANA): its days are said in it. */
  timezone: string | null;
  /** The Page the ads run as. */
  page_name: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  disconnected_at: string | null;
  /** When the account was last brought up to date, and whether the newest try failed. */
  read_at: string | null;
  read_failed: boolean;
  /** The account's own spending limit at its platform; null where it has none. */
  spend_limit_minor: number | null;
  /** The Instagram account the Page is linked to; null where none. Never a check. */
  instagram_handle: string | null;
  /** The number AI answers on WhatsApp, as dialled; null where the workspace has none. */
  ai_number: string | null;
  /** The five checks, in the card's order. `ok` is null where the platform has not said yet. */
  checks: { id: AdCardCheckId; ok: boolean | null }[];
  /** Whether the sign-in may pause and resume an ad. */
  can_pause: boolean;
  /** Whether the sign-in may read the Page's Instagram account: where not, the card says nothing of one. */
  reads_instagram: boolean;
  /** The accounts to choose from, the likelier first, while one is to be chosen. */
  choices: AdAccountChoice[];
}

/** The five checks an account's card draws (the Ads plan's G2), in its order. */
export const AD_CARD_CHECKS = [
  "account-active",
  "payment",
  "page-linked",
  "whatsapp-linked",
  "chanlytics-whatsapp",
] as const;
export type AdCardCheckId = (typeof AD_CARD_CHECKS)[number];

/**
 * The five checks, read from what is kept of an account and the number AI answers. An account that still shows ads
 * while a payment settles is active; a Page with no number, and a number that is not AI's, are each their own line.
 */
export function adCardChecksOf(kept: {
  standing: AdStanding;
  config: Pick<MetaAdConfig, "page_id" | "page_whatsapp">;
  aiNumber: string | null;
}): AdAccountCard["checks"] {
  const { standing, config, aiNumber } = kept;
  const linked = config.page_whatsapp;
  // Meta names a Page's WhatsApp number only to an app with its Page Public Content or Metadata Access, and one at most
  // of the fifty a Page may hold. So a number named settles both checks; none named settles neither (null, "Meta doesn't
  // share this"), and a number named that is not AI's leaves AI's own unknown: it may be linked beside it. Only a
  // workspace whose AI answers no WhatsApp number is known to miss the last.
  const answers: Record<AdCardCheckId, boolean | null> = {
    "account-active":
      standing.account === undefined ? null : standing.account === "active" || standing.account === "grace",
    payment: standing.funding === undefined ? null : standing.funding === "ok",
    "page-linked": config.page_id !== null,
    "whatsapp-linked": linked !== null ? true : null,
    "chanlytics-whatsapp": aiNumber === null ? false : samePhone(linked, aiNumber) ? true : null,
  };
  return AD_CARD_CHECKS.map((id) => ({ id, ok: answers[id] }));
}

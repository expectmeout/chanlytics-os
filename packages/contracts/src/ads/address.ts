/**
 * Ads' addresses (`campaigns/ads…`), the second of Campaigns' two views (Messages | Ads): the page, an ad open in its drawer,
 * the New ad composer and the Results sheet. One param holds them, as Leads' does under People (`clients/leads:…`):
 *
 *   campaigns/ads                     the page
 *   campaigns/ads:ad:<id>             an ad open in its drawer, pushed so Back closes it
 *   campaigns/ads:new                 the New ad composer, on the door it opens on (WhatsApp)
 *   campaigns/ads:new:<door>          the same, on a door: `whatsapp`, `call` or `form`
 *   campaigns/ads:new:copy:<id>       New ad filled from an ad, as a copy               (Make a copy)
 *   campaigns/ads:new:again:<id>      New ad filled to run an ended ad again            (Run it again)
 *   campaigns/ads:new:google:<id>     New ad on Google's Call door, with this ad's offer (Also run on Google)
 *   campaigns/ads:results             the Results sheet over the page
 *
 * A word the view does not know is the page (a link must never land on nothing). A root module of the package: Reports,
 * People and Campaigns' routes link here, and the frame's route chunk reads `ADS_WORDS`, so none of it is page-only.
 */
import type { AdDoor, AdPlatform } from "./ads";

/** The route the Ads view is spelled as. */
export const ADS_ROUTE = "campaigns/ads";

const DOORS: readonly AdDoor[] = ["whatsapp", "call", "form"];

/** How New ad starts from an ad: a copy of it, to run it again once it has ended, or the same offer on Google's Call door. */
export type AdStart = "copy" | "again" | "google";

const STARTS: readonly AdStart[] = ["copy", "again", "google"];

/** What the address asks of the Ads view. */
export interface AdsAddress {
  /** The ad open in its drawer. */
  ad: string | null;
  /**
   * The New ad composer. `door` is the door it opens on; with `from` it is a placeholder until the ad it starts from is read
   * (a copy keeps that ad's door, Google's is Call).
   */
  compose: null | { door: AdDoor; from: null | { how: AdStart; id: string } };
  /** The Results sheet. */
  results: boolean;
}

const NONE: AdsAddress = { ad: null, compose: null, results: false };

/** Whether a param of `campaigns` is the Ads view's: `ads`, or `ads:` and more. */
export const isAdsParam = (param: string): boolean => /^ads(:|$)/.test(param);

const adStartOf = (word: string): AdStart | undefined => STARTS.find((s) => s === word);

/** What the composer's words say: a door, or an ad to start from. */
function composeOf(rest: string): NonNullable<AdsAddress["compose"]> {
  const [first = "", ...more] = rest.split(":");
  const how = adStartOf(first);
  const id = more.join(":");
  if (how && id) return { door: how === "google" ? "call" : "whatsapp", from: { how, id } };
  return { door: DOORS.find((d) => d === first) ?? "whatsapp", from: null };
}

/** What an Ads param says. */
export function parseAds(param: string): AdsAddress {
  const rest = param.replace(/^ads:?/, "");
  if (rest.startsWith("ad:")) {
    const id = rest.slice("ad:".length);
    return id ? { ...NONE, ad: id } : NONE;
  }
  if (rest === "results") return { ...NONE, results: true };
  if (rest === "new") return { ...NONE, compose: composeOf("") };
  if (rest.startsWith("new:")) return { ...NONE, compose: composeOf(rest.slice("new:".length)) };
  return NONE;
}

/** An ad open in its drawer. */
export const adRoute = (id: string): string => `${ADS_ROUTE}:ad:${id}`;

/** The New ad composer, on a door. */
export const newAdRoute = (door: AdDoor = "whatsapp"): string =>
  door === "whatsapp" ? `${ADS_ROUTE}:new` : `${ADS_ROUTE}:new:${door}`;

/** The New ad composer, started from an ad: its copy, to run it again, or its offer on Google. */
export const newAdFromRoute = (how: AdStart, id: string): string => `${ADS_ROUTE}:new:${how}:${id}`;

/** The Results sheet over the page. */
export const adsResultsRoute = (): string => `${ADS_ROUTE}:results`;

// ---------------------------------------------------------------------------------------------------------------------
// What a set of results is of: the Results sheet and Reports › Ads read the same three scopes, and Reports' address says one

/** What results are narrowed to: every ad, the ads of one platform, or one ad. */
export type AdsScope = { kind: "all" } | { kind: "platform"; platform: AdPlatform } | { kind: "ad"; id: string };

export const ADS_SCOPE_ALL: AdsScope = { kind: "all" };

const SCOPE_PLATFORMS: readonly AdPlatform[] = ["meta", "google", "tiktok"];

/** A scope as one word, for an address and a list's value: `all`, `platform:meta`, `ad:<id>`. */
export function adsScopeKey(scope: AdsScope): string {
  if (scope.kind === "all") return "all";
  return scope.kind === "platform" ? `platform:${scope.platform}` : `ad:${scope.id}`;
}

/** The scope a word names; null for a word that is none (a platform we do not run on, an ad with no id). */
export function adsScopeOfKey(key: string): AdsScope | null {
  if (key === "all") return ADS_SCOPE_ALL;
  if (key.startsWith("platform:")) {
    const platform = SCOPE_PLATFORMS.find((p) => p === key.slice("platform:".length));
    return platform ? { kind: "platform", platform } : null;
  }
  const id = key.startsWith("ad:") ? key.slice("ad:".length) : "";
  return id ? { kind: "ad", id } : null;
}

/** The strip's and the crumbs' words for the two views. */
export const ADS_WORDS = {
  viewsLabel: "Which campaigns",
  messagesTab: "Messages",
  adsTab: "Ads",
  newAd: "New ad",
} as const;

/**
 * What Campaigns › Ads opens on: the ad account (`GET ads/account`) and, with it, the page's own read (`GET ads/page`,
 * null where no account was ever connected). Which page Ads is (its ads, or the page with nothing connected) waits on both,
 * and asked only once the page's code was in they drew it in three shapes on a cold load: the page with nothing
 * connected, then a line that loads, then the ads (110, 780 and 1,100 ms on a live account, 21 Nov 2026).
 *
 * So the document's head starts both with the settings read (contracts PREFETCH_READS), the boot takes them as it asks for
 * the settings read (./settings.ts), before it lets go of what nobody took, and the view's first draw waits for them as it
 * waits for its own surface (surface-status firstDrawWaitsFor), as New's first draw waits for its searches
 * (surfaces/campaigns/reach-out/sources.ts). The page's hooks start from the answer (surfaces/campaigns/ads/connect/use-account.ts,
 * live/use-live.ts) and read again themselves after it, on a press, a return to the tab and Meta's window: these are the
 * page's own reads, and no surface's, so nothing here hears the feed.
 *
 * The boot hands it its read and the tab's address: nothing here imports the boot's own modules, which the settings read
 * runs in a circle with, and nothing of the page is in it, so Ads' page stays the chunk it is.
 */
import type { AdAccountDto, AdsLiveDto } from "@chanlytics/contracts";
import { SECOND_MS } from "@chanlytics/contracts";
import type { Output } from "../../client/api";
import { firstDrawWaitsFor } from "../surface-status";

/** The boot's read (bridge/api read), for the two routes Ads opens on. */
type AdsReader = <K extends "GET ads/account" | "GET ads/page">(route: K) => Promise<Output<K>>;

/** What the first reads are asked through, as the boot holds it. */
interface AdsOpeningIo {
  read: AdsReader;
  /** The route on screen as the boot asks (bridge/workspace routeOnScreen). */
  route: string;
  /** The workspace the address names (bridge/workspace getActiveWorkspace). */
  workspace: string | null;
}

/** The two answers, read together, and when, for the workspace they were read in. */
interface AdsFirstRead {
  account: AdAccountDto;
  page: AdsLiveDto | null;
  fetchedAt: number;
  /** The workspace the address named as they were read: they are its answers, and no other's. */
  workspace: string | null;
}

/**
 * How long the first answer stands for a hook mounting: one read this recently is the page's first answer, and the hook
 * asks nothing more; older, it is drawn at once and read again behind it.
 */
const FIRST_ANSWER_STANDS_MS = 30 * SECOND_MS;

/** Campaigns › Ads, at any of its addresses (an ad open, New ad, its results). */
const ADS_ROUTE = /^campaigns\/ads(:|\/|$)/;

let adsOpenedOn: AdsFirstRead | null = null;

/** Both reads, together, kept for the page's hooks. A read that fails keeps nothing: the hooks then ask for themselves. */
async function readAdsFirst(io: AdsOpeningIo): Promise<void> {
  const [account, page] = await Promise.all([io.read("GET ads/account"), io.read("GET ads/page")]);
  adsOpenedOn = { account, page, fetchedAt: Date.now(), workspace: io.workspace };
}

/**
 * Where the tab is on Ads, its first draw waits for both reads, which take what the document's head started: the wait,
 * or null where the tab is elsewhere. A wait that failed is over, and the page asks for itself.
 */
export function readAdsOpening(io: AdsOpeningIo): Promise<void> | null {
  if (!ADS_ROUTE.test(io.route)) return null;
  // A read that failed keeps nothing and ends the wait: the page's hooks then ask for themselves, and say a refusal.
  const wait = readAdsFirst(io).catch(() => undefined);
  firstDrawWaitsFor("campaigns", wait);
  return wait;
}

/**
 * The first answer as a hook starts from it, and whether it is recent enough to stand without a read behind it; none in
 * a workspace other than the one it was read in (a switch loads the page again today, and this holds if one ever does not).
 */
export function adsFirstAnswer(
  nowMs: number,
  workspace: string | null,
): { held: AdsFirstRead; recent: boolean } | null {
  if (!adsOpenedOn || adsOpenedOn.workspace !== workspace) return null;
  return { held: adsOpenedOn, recent: nowMs - adsOpenedOn.fetchedAt < FIRST_ANSWER_STANDS_MS };
}

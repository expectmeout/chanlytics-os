/**
 * Where Content was left (Campaigns in three tabs, 23 Nov 2026, call 6). Content's tab on the strip reopens the list and view
 * of Made that were on screen, Ads among them, with the piece or ad left open, as Back would: the view is kept drawn while
 * hidden (route.tsx), so its search and scroll are as they were. On a phone the list and view are kept on the device too, as
 * Grid or List is (content/views.tsx), and the next visit's first press opens there; a piece or an ad left open is not, since
 * a later visit may not hold it. Only the tab's own press is filled in: a link or a notice opens the place it names, and the
 * tab pressed while Content or Ads is on screen goes to Content as it opens, a way out of Ads.
 */
import {
  ADS_ROUTE,
  CONTENT_ROUTE,
  contentPlaceOf,
  contentRouteOf,
  isAdsParam,
  isContentParam,
} from "@chanlytics/contracts";
import { cmPhoneNow } from "../parts/phone-query";

/** Where this device keeps the list and view of Made last shown on a phone. */
const LEFT_KEY = "chanlytics.content.left";

/** The address Content or Ads was last shown at in this visit; null before either has been. */
let leftAt: string | null = null;

const campaignsParamOf = (route: string): string | null => route.split("/")[1] || null;

/** What a device keeps of an address: its list and view of Made, or Ads; null for another view's. */
function placeKeptOf(route: string): string | null {
  const param = campaignsParamOf(route);
  if (param && isAdsParam(param)) return ADS_ROUTE;
  const place = contentPlaceOf(param);
  return place ? contentRouteOf({ list: place.list, view: place.view, open: null }) : null;
}

/** The place this device kept on a phone; null on a desk, where none was kept, or where storage is refused. */
function deviceKept(): string | null {
  if (!cmPhoneNow()) return null;
  try {
    const kept = localStorage.getItem(LEFT_KEY);
    return kept ? placeKeptOf(kept) : null;
  } catch {
    // Storage refused (a private window): Content opens as it opens.
    return null;
  }
}

/** Content or Ads shown at this address: kept for the visit, and its list and view on a phone's device. */
export function noteContentLeft(route: string): void {
  const param = campaignsParamOf(route);
  if (!param || !(isContentParam(param) || isAdsParam(param))) return;
  leftAt = route;
  if (!cmPhoneNow()) return;
  const kept = placeKeptOf(route);
  try {
    if (kept) localStorage.setItem(LEFT_KEY, kept);
  } catch {
    // Storage refused: kept for this visit alone.
  }
}

/**
 * Where Content's tab goes from another view: the place left in this visit, else the one a phone kept, else Content as it
 * opens. An Ads place where Ads is not drawn is Content as it opens.
 */
export function contentTabRoute(adsShown: boolean): string {
  const left = leftAt ?? deviceKept();
  if (!left) return CONTENT_ROUTE;
  const param = campaignsParamOf(left);
  return param && isAdsParam(param) && !adsShown ? CONTENT_ROUTE : left;
}

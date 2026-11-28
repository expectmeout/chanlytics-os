/**
 * Ads, readied while Content is shown (campaigns/home/route.tsx), as the Library is readied while Made is: the two reads the
 * page opens on, the ad account and its ads (bridge/surfaces/ads-first-reads.ts), made once the frame is idle, so the route
 * draws Ads hidden beside Made and the Library and a press on its tab shows the page whole. Pressed cold, the page under the
 * bar stood empty, then said it was loading beside the account's card, then the page replaced both (Ruben, 26 Nov 2026).
 *
 * The tab's figure and its amber dot are noted from the same read, as the page notes them once it is shown (live/live-ads.tsx),
 * so the tab says them before its first press rather than as it is pressed. Its own chunk, with the page's: nothing of it
 * rides the route.
 */
import { read } from "@/bridge/api";
import { readAdsAhead } from "@/bridge/surfaces/ads-first-reads";
import { getActiveWorkspace } from "@/bridge/workspace";
import { adsListedOf } from "./live/listed";
import { adsNeedingOf, noteAdsListed, noteAdsNeeding, noteAdsUnlisted } from "./needs-you";

/**
 * Ads' first reads, made ahead of its press: whether they are held, so the route draws the page from them. Where they say
 * no figure (they could not be made, or no account was ever connected) the tab is told, and keeps no room for one.
 */
export async function warmAds(): Promise<boolean> {
  const held = await readAdsAhead({ read, workspace: getActiveWorkspace() });
  if (!held?.page) {
    noteAdsUnlisted();
    return !!held;
  }
  noteAdsListed(adsListedOf(held.page));
  noteAdsNeeding(adsNeedingOf(held.page));
  return true;
}

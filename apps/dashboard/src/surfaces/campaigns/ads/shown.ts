/**
 * Whether Campaigns › Ads is drawn here: the one answer every page asks (the Ads plan's 6.2), the server's `ads` on the
 * settings read (server/connections/ads-ready.ts readAdsShown: the edge offers Ads in this workspace, or it holds an ad
 * account). Where it is not, Campaigns has no Ads view, Reports no Ads lens, Connections no ad account's card and the
 * roles no line for running ads. The answer is read off the settings surface, which an Ads address, Campaigns and
 * Settings open on and wait for (route-prefetch, surface-registry routeSurfaceFor), so a cold load of an Ads address
 * draws the page first and nothing before it (e2e/campaigns/ads.spec.ts). `useAdsShown` draws again when that read moves.
 */
import { adsShownIn } from "@/bridge/surfaces/ads-shown";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";

/** Whether Ads is drawn, as a chrome or a gate asks it as it draws. */
export function adsShown(): boolean {
  if (typeof window === "undefined") return false;
  return adsShownIn(surfaceValue("settings"));
}

/** The same, for a component: it draws again when the settings surface lands or moves. */
export function useAdsShown(): boolean {
  const settings = useSurface("settings");
  if (typeof window === "undefined") return false;
  return adsShownIn(settings);
}

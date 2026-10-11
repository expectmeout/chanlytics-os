/**
 * Whether Campaigns › Ads is drawn here (MOCKUP): in a demo session, or in a workspace whose config turns its Ads preview
 * on (`features.ads_preview`, contracts `adsPreviewOf`: Ruben's to set, per workspace, until the Ads read is wired, 0049).
 * Everywhere else, Campaigns is Messages alone, Reports has no Ads lens and Connections no Ad accounts card. The preview is
 * read off the settings surface, which Campaigns and Settings open on (route-prefetch); `useAdsShown` draws again when it
 * lands, so a cold load of an Ads address shows the home for that beat and then the page.
 */
import { adsPreviewOf } from "@chanlytics/contracts";
import { demoSession } from "../../legacy-verbs";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";

/** Whether Ads is drawn, as a chrome or a gate asks it as it draws. */
export function adsShown(): boolean {
  if (typeof window === "undefined") return false;
  return demoSession() || adsPreviewOf(surfaceValue("settings")?.settings?.config);
}

/** The same, for a component: it draws again when the settings surface lands or moves. */
export function useAdsShown(): boolean {
  const settings = useSurface("settings");
  if (typeof window === "undefined") return false;
  return demoSession() || adsPreviewOf(settings?.settings?.config);
}

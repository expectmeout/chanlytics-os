/**
 * Whether Campaigns › Content is drawn here: in a workspace whose config turns Content on (`features.content_preview`,
 * contracts `contentPreviewOf`: Ruben's to set, per workspace). Everywhere else Campaigns has no Content tab and its address
 * is Sequences. Read off the settings surface, which Campaigns' addresses open on and wait for, so a cold load of the address
 * draws the page first and nothing before it. `useContentShown` draws again when that read moves. No demo session draws it:
 * the page is real data or nothing.
 */
import { contentPreviewOf } from "@chanlytics/contracts";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";

/** Whether Content is drawn, as a chrome or a gate asks it as it draws. */
export function contentShown(): boolean {
  if (typeof window === "undefined") return false;
  return contentPreviewOf(surfaceValue("settings")?.settings?.config);
}

/** The same, for a component: it draws again when the settings surface lands or moves. */
export function useContentShown(): boolean {
  const settings = useSurface("settings");
  if (typeof window === "undefined") return false;
  return contentPreviewOf(settings?.settings?.config);
}

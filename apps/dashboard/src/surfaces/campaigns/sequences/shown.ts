/**
 * Whether Campaigns › Sequences is drawn here (decision 0060): in a workspace whose config turns its preview on
 * (`features.sequences_preview`, contracts `sequencesPreviewOf`: Ruben's to set, per workspace, until the page replaces
 * the home, Sent and the Library in the plan's S6). Everywhere else a Sequences address is Campaigns' home. Read off the
 * settings surface, which Campaigns opens on (route-prefetch), so a cold load of a Sequences address shows the home for
 * that beat and then the page.
 */
import { sequencesPreviewOf } from "@chanlytics/contracts";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";

/** Whether the page is drawn, as a chrome or a gate asks it as it draws. */
export function sequencesShown(): boolean {
  if (typeof window === "undefined") return false;
  return sequencesPreviewOf(surfaceValue("settings")?.settings?.config);
}

/** The same, for a component: it draws again when the settings surface lands or moves. */
export function useSequencesShown(): boolean {
  const settings = useSurface("settings");
  if (typeof window === "undefined") return false;
  return sequencesPreviewOf(settings?.settings?.config);
}

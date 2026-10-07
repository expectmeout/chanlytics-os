/**
 * Where a link into the app lands (Expo Router's native intent, read before any screen). The site's app-links files
 * claim `/w/...`, but the app's own routes are its tabs, so a link that arrived as the site's path opened on
 * "Unmatched Route". A workspace link becomes the tab its page route belongs to, with the route left for that tab's
 * page to open (Surface.tsx pendingRoute); anything else is left to the router as it came. Nothing here may throw.
 */
import { workspaceLinkOf } from "@/site";
import { tabHrefOf } from "@/shell/notifications-pure";
import { setState } from "@/shell/state";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    const link = workspaceLinkOf(path);
    if (!link) return null;
    setState({ pendingRoute: link.route });
    return tabHrefOf(link.route);
  } catch {
    return null;
  }
}

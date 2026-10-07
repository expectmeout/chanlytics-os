/**
 * What the frame says around Live (moved from the row `drawLive` of legacy/pages/app-routes.jsx, decision 0015, step 8):
 * `live/<callId>` is the call a door names, opened on Live and named in the crumbs once the surface holds it. Live is a view of
 * the Inbox, so the trail starts where the sidebar's item is. The frame asks this as it draws (src/surfaces/routes.ts).
 */
import { surfaceValue } from "../surface-values";

/** Live's crumbs: the Inbox, Live, and the caller's name where the address names a call the surface holds. */
export function liveChrome({ param }: { param: string | null }): {
  crumbs: Array<string | { label: string; to: string }>;
  mount: string;
} {
  const live = surfaceValue("live");
  const call = param && live ? [...(live.now || []), ...(live.recent || [])].find((c) => c.callId === param) : null;
  const inbox = { label: "Inbox", to: "inbox" };
  return {
    mount: "live",
    crumbs: call ? [inbox, { label: "Live", to: "live" }, call.who] : [inbox, "Live"],
  };
}

/**
 * The Campaigns lens's own chunk (lenses/campaigns-one.tsx: the scope's row over the lens, one campaign's cards, their reads), fetched
 * once for the tab where the lens is drawn (lenses/campaigns-scope.ts), and beside the frame's own code where a load opens on the lens,
 * its first draw held for it (FrameApp). Asked only once the lens was drawn, the scope's row came after the lens's figures on a
 * slow phone and pushed them 38 px down, and on a reopen it narrowed the strip of lenses beside it, which slid 14 px (the phone
 * sweep of 22 Nov 2026). Nothing of the lens is in this module, so the Reports page every workspace loads carries none of it.
 */
import { lensOfRoute } from "@chanlytics/contracts";
import { firstDrawWaitsFor } from "@/bridge/surface-status";
import { codeOnce } from "@/lib/code-once";

export const campaignsOneCode = codeOnce(() => import("./lenses/campaigns-one"));

/** A load's address, where it is the Campaigns lens: its chunk fetched now, and the page's first draw held for it. */
export function campaignsLensOpensOn(route: string): void {
  if (lensOfRoute(route) === "campaigns") firstDrawWaitsFor("reports", campaignsOneCode());
}

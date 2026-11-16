/** Sender: the preview an email's words carry. Apart from the lanes, which are at their length. */

import { previewSlotOf, type LeadPreviewSlot } from "@chanlytics/contracts";
import { findLeadPreview, type ReachOutSendRow } from "@chanlytics/db/campaigns";
import { previewDidMarkOf } from "../../../previews/for-opening.js";
import { askPreview } from "../../../previews/make.js";
import { dashboardOrigin } from "../../../shared/dashboard-origin.js";
import { env } from "../../../shared/env.js";
import type { Tick } from "./lanes.js";

/**
 * The lead's own receptionist, for words that name {{their preview}} (decision 0079): open, with its link; being made,
 * and asked for where none is (askPreview, its build scheduled once), or held with the switch off and nothing made; or
 * gone, its door refusing one for this lead for good (not a business that takes bookings, a lead closed), which skips
 * the send as a failed or ended one does. With the day's previews all made (contracts PREVIEW_LIMITS.aDay) none is
 * asked for: the send is held and waits the hour, until the day turns.
 */
export async function previewForWords(
  tick: Tick,
  send: ReachOutSendRow,
): Promise<{ slot: LeadPreviewSlot; id: string | null; did: string | null }> {
  const row = await findLeadPreview(tick.db, send.tenant_id, send.lead_id);
  const slot = previewSlotOf(row, tick.now, dashboardOrigin());
  if (slot.state !== "building" || row?.state === "building" || env.LEAD_PREVIEWS !== "on") {
    // An open one says how far they have used it (previews/for-opening.ts): the mark a line written from it was stamped with.
    const open = slot.state === "open" && row ? row : null;
    return { slot, id: open ? open.id : null, did: open ? previewDidMarkOf(open) : null };
  }
  // The day's are all made (askPreview's limit): the email is held as one being made is, never skipped, and waits the
  // hour; tomorrow's first tick makes it. A workspace found full is not asked again this tick.
  const waits = () => {
    tick.cappedSends.add(send.id);
    return { slot, id: null, did: null };
  };
  if (tick.capped.has(send.tenant_id)) return waits();
  const otherAskPreview = await askPreview(
    tick.db,
    { tenantId: send.tenant_id, leadId: send.lead_id, by: null, none: !row },
    tick.now,
  );
  if (!otherAskPreview.ok && otherAskPreview.reason === "limit") {
    tick.capped.add(send.tenant_id);
    return waits();
  }
  return { slot: otherAskPreview.ok ? slot : { state: "gone" }, id: null, did: null };
}

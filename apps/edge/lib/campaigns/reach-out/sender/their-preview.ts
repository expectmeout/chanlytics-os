/** Sender: the preview an email's words carry. Apart from the lanes, which are at their length. */

import { previewSlotOf, type LeadPreviewSlot } from "@chanlytics/contracts";
import { findLeadPreview, type ReachOutSendRow } from "@chanlytics/db/campaigns";
import { lineMarkOf, previewDidMarkOf } from "../../../previews/for-opening.js";
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
  pass: Tick,
  send: ReachOutSendRow,
): Promise<{ slot: LeadPreviewSlot; id: string | null; did: string | null }> {
  const row = await findLeadPreview(pass.db, send.tenant_id, send.lead_id);
  const slot = previewSlotOf(row, pass.now, dashboardOrigin());
  if (slot.state !== "building" || row?.state === "building" || env.LEAD_PREVIEWS !== "on") {
    // An open one says how far they have used it (previews/for-opening.ts): the mark a line written from it was stamped with.
    const open = slot.state === "open" && row ? row : null;
    return { slot, id: open ? open.id : null, did: open ? previewDidMarkOf(open) : null };
  }
  // The day's are all made (askPreview's limit): the email is held as one being made is, never skipped, and waits the
  // hour; tomorrow's first tick makes it. A workspace found full is not asked again this pass.
  const waits = () => {
    pass.cappedSends.add(send.id);
    return { slot, id: null, did: null };
  };
  if (pass.capped.has(send.tenant_id)) return waits();
  const otherAskPreview = await askPreview(
    pass.db,
    { tenantId: send.tenant_id, leadId: send.lead_id, by: null, none: !row },
    pass.now,
  );
  if (!otherAskPreview.ok && otherAskPreview.reason === "limit") {
    pass.capped.add(send.tenant_id);
    return waits();
  }
  return { slot: otherAskPreview.ok ? slot : { state: "gone" }, id: null, did: null };
}

/**
 * Whether the email's line still stands for the preview it goes with (previews/for-opening.ts lineMarkOf): stamped with
 * the preview as it is now, or, where its owner read the line before it went, with which preview alone, so what the
 * lead did with it after their OK never writes the line they approved again. A line written before the preview stood,
 * or for another preview, stands for neither. `stampOf` is these words stamped with a mark (channels checkedWordsOf).
 */
export function lineStands(
  checked: string | null,
  words: { subject: string | null; body: string },
  preview: { id: string | null; did: string | null } | null,
  stampOf: (mark: string | null) => string,
): boolean {
  const open = preview?.id && preview.did ? { id: preview.id, mark: preview.did } : null;
  return checked === stampOf(lineMarkOf(words, open, false)) || checked === stampOf(lineMarkOf(words, open, true));
}

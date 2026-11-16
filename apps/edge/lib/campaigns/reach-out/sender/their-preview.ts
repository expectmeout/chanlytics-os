/** Sender: the preview an email's words carry. Apart from the lanes, which are at their length. */

import { previewSlotOf, wordsNeedOpening, type LeadPreviewSlot } from "@chanlytics/contracts";
import { findLeadPreview, type ReachOutSendRow } from "@chanlytics/db/campaigns";
import { lineMarkOf, previewDidMarkOf, sequenceModeOf } from "../../../previews/for-opening.js";
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
 * The mark the email's line is read against before it goes, as the check stamped it (previews/for-opening.ts
 * lineMarkOf): none where its sequence asks first, so the line its owner approved goes as approved. The sequence is read
 * only where there is a mark to keep.
 */
export async function lineMarkFor(
  pass: Pick<Tick, "db">,
  send: Pick<ReachOutSendRow, "tenant_id" | "sequence_id">,
  words: { subject: string | null; body: string },
  preview: { did: string | null } | null,
): Promise<string | null> {
  if (!preview?.did || !wordsNeedOpening(words)) return null;
  return lineMarkOf(words, preview.did, await sequenceModeOf(pass.db, send.tenant_id, send.sequence_id));
}

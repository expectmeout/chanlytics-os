/**
 * WhatsApp's own list of the workspace's messages, asked quietly as Campaigns opens (the Messages redesign's step 5: no
 * sync button). Its answer on a message written in Chanlytics comes by itself (edge waba-events), so this reads only what
 * was made or changed in WhatsApp's own tools, where the list was last read over an hour ago, for whoever may. Nothing is
 * said: what changed is in the reads once they come again. It was the Messages page's own, and ran only while that page
 * was open; with Messages folded into Campaigns, Campaigns' route asks it, whichever view is on screen (call C11), and
 * only once the page is idle: Campaigns opens far more often than Messages did, and what the check moves (the settings
 * read and three more, read again after it) must never stand beside the reads the list opens on.
 */
import { useEffect } from "react";
import { HOUR_MS } from "@chanlytics/contracts";
import { syncWhatsAppList } from "@/bridge/verbs/templates";
import { aheadWhenIdle, getActiveWorkspace } from "@/bridge/workspace";
import { canDo } from "../../frame-verbs";
import { useSurface } from "../../use-surface";

/** How long WhatsApp's own list is left before it is asked again as Campaigns opens. */
const QUIET_CHECK_MS = HOUR_MS;
/** Asked once a visit at most: Campaigns opened again in it reads what that asking brought. */
let checkedThisVisit = false;
/** The tab's note of the workspace WhatsApp's list was last asked for, and when: kept across its loads, gone with the tab. */
const ASKED_SLOT = "chanlytics-whatsapp-list-asked";

/**
 * Whether this tab asked WhatsApp's list for this workspace within the hour. The rows' own time says so where WhatsApp has
 * messages to stamp; a number with none stamps nothing, and every load of Campaigns asked again (seen on production, 24 Nov
 * 2026: Forms, Content and the rest each sent POST templates/sync).
 */
function askedWithinTheHour(workspace: string | null): boolean {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(ASKED_SLOT) ?? "[]");
    return Array.isArray(kept) && kept[0] === workspace && Date.now() - Number(kept[1]) < QUIET_CHECK_MS;
  } catch {
    // Storage refused, or a note this tab cannot read: asked as before, once a visit.
    return false;
  }
}

function noteAsked(workspace: string | null): void {
  try {
    sessionStorage.setItem(ASKED_SLOT, JSON.stringify([workspace, Date.now()]));
  } catch {
    // Storage refused: the next load asks again, as before.
  }
}

/** Ask WhatsApp's list where a number is connected, this member may, and the rows were last read past the hour. */
export function useWhatsAppListAsked(): void {
  const templates = useSurface("settings")?.templatesAll;
  const hasWhatsApp = (useSurface("channels")?.rows ?? []).some((c) => c.kind === "whatsapp");
  const may = hasWhatsApp && !!canDo("approve") && !!templates;
  const synced = (templates ?? []).reduce<string | null>(
    (m, t) => (t.synced_at && (!m || t.synced_at > m) ? t.synced_at : m),
    null,
  );
  useEffect(() => {
    if (!may || checkedThisVisit || askedWithinTheHour(getActiveWorkspace())) return undefined;
    if (synced && Date.now() - Date.parse(synced) < QUIET_CHECK_MS) return undefined;
    // Once the boot is in and the page is idle; let go where Campaigns is left before then, and asked on the next visit.
    return aheadWhenIdle(
      () => {
        if (checkedThisVisit) return;
        checkedThisVisit = true;
        const workspace = getActiveWorkspace();
        // A check that did not answer leaves the rows as they were read, and no note: the next visit asks again.
        void syncWhatsAppList().then((answer) => {
          if (answer.ok) noteAsked(workspace);
        });
      },
      undefined,
      { everyLine: true },
    );
  }, [may, synced]);
}

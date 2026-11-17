/**
 * WhatsApp's own list of the workspace's messages, asked quietly as Campaigns opens (the Messages redesign's step 5: no
 * sync button). Its answer on a message written in Chanlytics comes by itself (edge waba-events), so this reads only what
 * was made or changed in WhatsApp's own tools, where the list was last read over an hour ago, for whoever may. Nothing is
 * said: what changed is in the reads once they come again. It was the Messages page's own, and ran only while that page
 * was open; with Messages folded into Campaigns, Campaigns' route asks it, whichever view is on screen (call C11).
 */
import { useEffect } from "react";
import { HOUR_MS } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { canDo } from "../../frame-verbs";
import { useSurface } from "../../use-surface";

/** WhatsApp's list asked again: what it holds that the workspace's rows do not, filed. */
export const syncWhatsAppList = () => api()("POST templates/sync");

/** How long WhatsApp's own list is left before it is asked again as Campaigns opens. */
const QUIET_CHECK_MS = HOUR_MS;
/** Asked once a visit at most: Campaigns opened again in it reads what that asking brought. */
let checkedThisVisit = false;

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
    if (!may || checkedThisVisit) return;
    if (synced && Date.now() - Date.parse(synced) < QUIET_CHECK_MS) return;
    checkedThisVisit = true;
    // A check that did not answer leaves the rows as they were read: the next visit asks again.
    void syncWhatsAppList();
  }, [may, synced]);
}

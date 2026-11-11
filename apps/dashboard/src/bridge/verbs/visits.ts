/**
 * Many visits said kept at once (Today's Mark all kept, decision 0123): through the door that says each as one press would
 * (POST calendar/visits/kept), so each keeps its rules, its decision and the event the thank-you waits for. The readers of a
 * visit are read again behind it (the refresh map's `visits`), as behind a single press.
 */
import type { Api } from "../../client/api";
import { apiFor } from "../api";

/** How many moved, were kept already or were refused with the first one's sentence, and the thank-you that follows. */
export function markVisitsKept(ids: readonly string[], client: Api = apiFor(window)) {
  return client("POST calendar/visits/kept", { body: { ids: [...ids] } });
}

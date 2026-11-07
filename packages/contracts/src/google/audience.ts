/** Google's consent screen for Chanlytics' app, as the person about to press Connect needs to hear it. */
import type { GoogleAudience } from "./listing";

/** What Google's audience means for the person about to press Connect. */
export function googleAudienceWords(googleAudience: GoogleAudience | null | undefined): string | null {
  if (googleAudience === "testing")
    return "Google is reviewing Chanlytics; until then Connect works for invited Google accounts only.";
  if (googleAudience === "unverified")
    return "Google shows a warning until its review of Chanlytics is done — choose Advanced, then Go to Chanlytics.";
  return null;
}

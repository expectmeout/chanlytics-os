/**
 * When this member last looked at Today (Working for you, W2): kept in their own saved views as they put Today away (the
 * tab hidden, another page opened), so the next look's head can say what AI did since. GET today reads it back
 * (contracts today/ai.ts lookedAtOf). A save that fails keeps the older look, and the next head says since then: a longer
 * "since" is still true.
 */
import { useEffect } from "react";
import { TODAY_LOOKED_PAGE } from "@chanlytics/contracts";
import { apiFor } from "@/bridge/api";

/** Keep now as this member's last look at Today. Nothing refreshes: the page already shows what it read. */
function keepTheLook(): void {
  void apiFor(window)("PUT views/[page]", {
    params: { page: TODAY_LOOKED_PAGE },
    body: { view: { at: new Date().toISOString() } },
    refresh: false,
    // A save that fails keeps the older look: the next head's "since" is longer, and still true.
  }).catch(() => undefined);
}

/** While Today is open: its look is kept as the tab is hidden, and as the page is left. */
export function useKeepsTheLook(): void {
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") keepTheLook();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      keepTheLook();
    };
  }, []);
}

/**
 * How the Ads view moves (MOCKUP): the address, which opens an ad in its drawer or the New ad composer. Opening pushes an
 * entry, so Back closes it (a peek's rule: Leads', the Pipeline's, Messages'); changing one thing for another replaces it. A
 * sheet that opened over the page stood on has the page behind it, whoever pushed it: closing goes back. One a link arrived at,
 * or the page swapped in, has no entry of the page's behind it: closing replaces the address with the Ads page itself. The
 * example the page draws is the store's (store.ts), not the address's.
 */
import { useEffect, useRef, useState } from "react";
import { ADS_ROUTE } from "@chanlytics/contracts";
import type { AdsAddress } from "@chanlytics/contracts";
import type { AdsGroupBy } from "@chanlytics/contracts/ads-page";
import { navigate, replaceRoute } from "../../legacy-verbs";

/** Opening and closing what the address names: an ad's drawer, the composer or the Results sheet. */
export function useAdsNav(address: AdsAddress) {
  // How many entries stand over the page: the drawer, and a composer opened over it.
  const pushed = useRef(0);
  const swapped = useRef(false);
  const open = address.ad !== null || address.compose !== null || address.results;
  const wasOpen = useRef(open);
  useEffect(() => {
    if (!open) pushed.current = 0;
    else if (!wasOpen.current && pushed.current === 0 && !swapped.current) pushed.current = 1;
    swapped.current = false;
    wasOpen.current = open;
  }, [open]);
  const push = (route: string) => {
    pushed.current += 1;
    navigate(route);
  };
  const swap = (route: string) => {
    swapped.current = true;
    replaceRoute(route);
  };
  const close = () => {
    if (pushed.current > 0 && typeof window !== "undefined" && window.history) {
      pushed.current -= 1;
      window.history.back();
    } else replaceRoute(ADS_ROUTE);
  };
  return { push, swap, close };
}

/** How the ledger groups its ads, kept for the tab, as the example is. */
const GROUP_KEY = "ads-mock-group";

/**
 * How the ledger groups its ads (by what they ask, or by platform), kept in the tab's session storage and read after the
 * page mounts, so a server render and the first client render agree. Storage can be blocked (a private window): then the
 * choice still holds, for this page.
 */
export function useGroupBy(): [AdsGroupBy, (next: AdsGroupBy) => void] {
  const [by, setBy] = useState<AdsGroupBy>("door");
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(GROUP_KEY);
      if (saved === "door" || saved === "platform") setBy(saved);
    } catch {
      // Storage can be blocked: the ledger stays grouped by what its ads ask.
    }
  }, []);
  const choose = (next: AdsGroupBy) => {
    setBy(next);
    try {
      window.sessionStorage.setItem(GROUP_KEY, next);
    } catch {
      // The choice holds for this page.
    }
  };
  return [by, choose];
}

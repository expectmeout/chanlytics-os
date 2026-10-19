/**
 * What Campaigns' parts read and how its sheet moves (the home they stood over went with decision 0060's S6): the
 * broadcasts the send screen is made of, read through the seam while New's Send once stands (new-message.tsx, the
 * Campaigns wiring review's lane 6); and the address, which opens a message's drawer (sheets.tsx).
 *
 * A real workspace draws its own; a demo session draws the sample the Broadcasts page drew. Not read yet is undefined, and
 * one that could not be read is null and says so (the seam's own status, `useSurfaceFailed`, which the shell's route gate
 * reads).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SEQUENCES_ROUTE } from "@chanlytics/contracts";
import { demoSession, navigate, replaceRoute } from "../../legacy-verbs";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { broadcastsSample } from "../broadcasts/sample";
import type { BcWhole } from "../broadcasts/page/types";
import type { HomeAddress } from "./address";

/**
 * What the send screen is made of: Sent's surface and who each audience reaches (broadcasts/audiences-surface.ts), both read.
 * Undefined while either is out, null where either could not be read.
 */
export function useComposerData(open: boolean): { broadcasts: BcWhole | null | undefined } {
  const live = useSurface("broadcasts");
  const audiences = useSurface("audiences");
  const failed = useSurfaceFailed("broadcasts");
  const unreached = useSurfaceFailed("audiences");
  const whole = useMemo(() => (live && audiences ? { ...audiences, ...live } : null), [live, audiences]);
  // A demo session's sample, made once for the page's life, and only once the composer is asked for.
  const [sample] = useState(() => (open && demoSession() ? broadcastsSample() : null));
  return { broadcasts: whole ?? sample ?? (failed || unreached ? null : undefined) };
}

/**
 * Opening and closing what the address names. Opening pushes an entry, so Back closes it (a peek's rule: Leads', the
 * Pipeline's); changing one thing for another replaces it. A sheet that opened over the page it stood on has that page
 * behind it, whoever pushed it (a bell row, Ask's card, a door the page drew): closing goes back. One the page swapped in,
 * or a link arrived at, has no entry of the page's behind it: closing replaces the address with Sequences.
 */
export function useHomeNav(address: HomeAddress) {
  // How many entries stand over the page: a message's drawer, and a composer opened over it.
  const pushed = useRef(0);
  const swapped = useRef(false);
  const open = address.moment !== null || address.message !== null;
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
    } else replaceRoute(SEQUENCES_ROUTE);
  };
  return { push, swap, close };
}

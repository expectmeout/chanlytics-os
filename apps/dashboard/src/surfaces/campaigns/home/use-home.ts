/**
 * What Campaigns' sheets read and how they move (sheets.tsx; the home they stood over went with decision 0060's S6): the
 * broadcasts the send screen is made of, read through the seam while the composer stands; and the address, which opens
 * the composer or a message. A moment's sequence is made in New sequence (the closed-loop audit of 17 Oct 2026, G), so
 * the composer no longer reads the playbooks or Campaigns' own 30 days; the reach-outs' chains it reads for a change to one.
 *
 * A real workspace draws its own; a demo session draws the sample the Broadcasts page drew. Not read yet is undefined, and
 * one that could not be read is null and says so (the seam's own status, `useSurfaceFailed`, which the shell's route gate
 * reads).
 */
import { useEffect, useRef, useState } from "react";
import { SEQUENCES_ROUTE } from "@chanlytics/contracts";
import { demoSession, navigate, replaceRoute } from "../../legacy-verbs";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { broadcastsSample } from "../broadcasts/sample";
import type { BroadcastsSurface } from "../broadcasts/surface";
import type { ReachOutsSurface } from "../reach-out/surface";
import type { HomeAddress } from "./address";

/** The broadcasts the send screen is made of: undefined before they are read, null where they could not be. */
export function useComposerData(open: boolean): { broadcasts: BroadcastsSurface | null | undefined } {
  const live = useSurface("broadcasts");
  const failed = useSurfaceFailed("broadcasts");
  // A demo session's sample, made once for the page's life, and only once the composer is asked for.
  const [sample] = useState(() => (open && demoSession() ? broadcastsSample() : null));
  return { broadcasts: live ?? sample ?? (failed ? null : undefined) };
}

/**
 * The reach-outs' chains, for a change to one: undefined before they are read, null where they could not be (the surface
 * publishes its failure as null: reach-out/surface.ts).
 */
export function useChains(): ReachOutsSurface | undefined {
  return useSurface("reach_outs");
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
  const open = address.moment !== null || address.message !== null || address.compose !== null;
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

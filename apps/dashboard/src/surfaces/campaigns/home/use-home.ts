/**
 * What Campaigns' parts read (the home they stood over went with decision 0060's S6): the broadcasts the send screen is
 * made of, read through the seam while New's Send once stands (new-message.tsx, the Campaigns wiring review's lane 6). The
 * message's drawer the address opened went into its home (the framework's rating, 19 Oct 2026), and its moves with it.
 *
 * A real workspace draws its own; a demo session draws the sample the Broadcasts page drew. Not read yet is undefined, and
 * one that could not be read is null and says so (the seam's own status, `useSurfaceFailed`, which the shell's route gate
 * reads).
 */
import { useEffect, useMemo, useState } from "react";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { useBroadcastsDemo } from "../broadcasts/demo";
import type { BcWhole } from "../broadcasts/page/types";

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
  // A demo session's sample, made once for the page's life, and only once the composer is asked for (its code fetched then).
  const demo = useBroadcastsDemo(open);
  const [made, setMade] = useState<BcWhole | null>(() => (open && demo ? demo.broadcastsSample() : null));
  useEffect(() => {
    if (open && demo && !made) setMade(demo.broadcastsSample());
  }, [open, demo, made]);
  const sample = made;
  return { broadcasts: whole ?? sample ?? (failed || unreached ? null : undefined) };
}

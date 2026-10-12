/**
 * A link is a read of one record by its id (wiring/records-not-pages, task 4.1; finding A2c), never a look in the window a
 * page holds. A page holds the newest hundred threads and calls; a bell row from last week, an Activity line, a person's
 * "Open the thread", an Ask citation or a tapped push names an older one, and the page said "That conversation isn't among
 * the newest shown here" of a record the server had all along. The surfaces read the record the address names when they are
 * read (inbox/surface.ts, inbox/conversations-surface.ts, by `namedByRoute`); this is for the address that moves after they
 * were: the page is already read, a link carries the person to a record it does not hold, and the surfaces are asked once to
 * read again with that address on screen.
 *
 * The record is named by the address (addresses.ts recordNamedBy, the page's own parse), held or not by the page's own look
 * (the caller says), and asked for once for each id: a record the server will not give (another workspace's, one that is
 * gone) is not asked again, and the page goes on saying it is not here.
 */
import { useEffect, useRef, useState } from "react";
import type { RecordRef } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { opensRoute } from "./addresses";
import type { SurfaceKey } from "./surface-values";
import { useSurfaceSettled } from "./use-surface";

/** The record an address names, by the page's own parse of it (addresses.ts); null where it names none (a view, or an address no page opens). */
export function recordNamedBy(route: string): RecordRef | null {
  const opened = opensRoute(route);
  return opened !== null && "ref" in opened ? opened.ref : null;
}

/**
 * Read the surfaces again, once for each `named` id, when the record the address names is not among those the page holds.
 * `surface` is the one whose first read the page waits for (a page that follows its own address asks for nothing meanwhile:
 * that read is of the address it opened on). `overrides` must be one list for the page's life (a constant), since the effect
 * is keyed on it.
 *
 * Answers whether the record is being read for: the page says it is opening it, not that it is not here, until the read has
 * come back. That includes the draw before the read is asked for, so the notice never flashes ahead of the record.
 */
export function useReadNamedRecord(
  surface: SurfaceKey,
  overrides: readonly SurfaceOverride[],
  named: string | null,
  held: boolean,
): boolean {
  const settled = useSurfaceSettled(surface);
  const asked = useRef<string | null>(null);
  // The id whose read has come back (found or not): from then the page may say what it holds.
  const [back, setBack] = useState<string | null>(null);
  useEffect(() => {
    if (named === null || held || !settled || asked.current === named) return;
    asked.current = named;
    const done = () => setBack(named);
    refreshSurfaces([...overrides]).then(done, done);
  }, [named, held, settled, overrides]);
  return named !== null && !held && settled && back !== named;
}

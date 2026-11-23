/**
 * What the business's posts brought in the last seven days, as Today's weekly card says it (00696; the content loop
 * PRD's 9.3 and 12.5; the journey canvas's Today board, cell 4, approved by Ruben on 23 Nov 2026): GET content/week, the
 * same count Reports' content section makes. Asked only where the card can be said (week.tsx), once the page has
 * drawn, and kept in the tab by workspace (read-cache.ts `tab`), so a return draws it at once and reads again behind it.
 * A read that fails or is refused is no posts' line: the card says AI's week, and claims nothing it could not read.
 */
import { useEffect, useState } from "react";
import type { ContentWeekDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { readCache } from "@/bridge/read-cache";
import { getActiveWorkspace } from "@/bridge/workspace";

/** The answer as it is kept: a week with nothing to say holds `value: null`, which is not the same as holding nothing. */
interface Held {
  value: ContentWeekDto | null;
}

const weekHeld = readCache<Held>("content_week", () => true, { tab: true });

/** The week's posts as the card reads them: read while `asked`; null before it lands, where it failed, and while not asked. */
export function useContentWeek(wanted: boolean): ContentWeekDto | null {
  const workspace = getActiveWorkspace() ?? "";
  const [got, setGot] = useState<Held | null>(() => weekHeld.peek(workspace));
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    weekHeld
      .through(workspace, async () => ({ value: await read("GET content/week") }))
      .then(
        (kept) => live && setGot(kept),
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [workspace, wanted]);
  return wanted ? (got?.value ?? null) : null;
}

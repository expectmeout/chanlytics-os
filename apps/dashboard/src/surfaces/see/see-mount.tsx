/**
 * Where the frame keeps a thing open over the page (`?see=<kind>:<id>`, see-over.ts; the Campaigns wiring
 * review's rule C, lane 3): nothing until one is asked for, then the sheet's own chunk, loaded on demand (see-sheet.tsx),
 * so a page that never opens one pays nothing for it. The toast host stays here, at the frame, whatever page is under the
 * sheet: what an Approve says, with its Stop, outlives the sheet that closed over it (the run review's item 6).
 */
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { seeValueOf, type SeeRef } from "@chanlytics/contracts";
import { useLegacyToast } from "../legacy-verbs";
import { hearSeeOver, seeOverNow } from "./see-over";

const SeeSheet = lazy(() => import("./see-sheet").then((m) => ({ default: m.SeeSheet })));

/** The thing open over the page, followed as the address moves: a Back, a page's own move, the sheet's own verbs. */
function useSeeOver(): SeeRef | null {
  const [ref, setRef] = useState<SeeRef | null>(() => (typeof window === "undefined" ? null : seeOverNow()));
  useEffect(() => {
    const follow = () => {
      const now = seeOverNow();
      setRef((was) => (was && now && seeValueOf(was) === seeValueOf(now) ? was : now));
    };
    return hearSeeOver(follow);
  }, []);
  return ref;
}

export function SeeOverMount() {
  const ref = useSeeOver();
  const [toastNode, flash] = useLegacyToast();
  // The thing last open, kept while its sheet leaves: the sheet closes as it goes, not as it vanishes.
  const kept = useRef<SeeRef | null>(ref);
  if (ref) kept.current = ref;
  const shown = ref ?? kept.current;
  return (
    <>
      {shown ? (
        <Suspense fallback={null}>
          <SeeSheet seeRef={shown} open={ref !== null} flash={flash} />
        </Suspense>
      ) : null}
      {toastNode}
    </>
  );
}

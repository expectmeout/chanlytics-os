/**
 * What the lenses share: the props every lens body takes, and the card a period nobody wrote or called in draws.
 */
import { lensEmpty, type LensId, type ReportRange, type ReportVM } from "@chanlytics/contracts";
import { EmptyState } from "../../kit/empty/empty";
import type { ReportsSurface } from "../surface";

/** What a lens body draws from: the one read the surface holds, the page's own pick of another range, and whether the page is a phone's. */
export interface LensProps {
  R: ReportsSurface;
  pick: (range: ReportRange) => Promise<void>;
  phone: boolean;
}

/** Nothing came in: the range said so, and a door to the longest period, where the page is not on it already. */
export function nothingCameIn(vm: ReportVM, range: ReportRange, pick: (range: ReportRange) => Promise<void>) {
  const words = lensEmpty("overview", { since: vm.since, until: vm.until });
  return (
    <EmptyState
      kind="card"
      glyph="wave"
      title={words.title}
      testid="reports-empty"
      body={words.body}
      action={range !== "90d" ? { label: "Look at 90 days", onClick: () => void pick("90d") } : null}
    />
  );
}

/** What a lens says where it has nothing to draw: the registry's words, a door where it has one. */
export function LensEmpty({ lens, vm, testid = "lens-empty" }: { lens: LensId; vm: ReportVM; testid?: string }) {
  const words = lensEmpty(lens, { since: vm.since, until: vm.until });
  return (
    <EmptyState
      kind="card"
      glyph="wave"
      title={words.title}
      body={words.body}
      testid={testid}
      action={words.door ? { label: words.door.label, to: words.door.to } : null}
    />
  );
}

/**
 * Campaigns' parts, a read still out: the shell's quiet "Reading…", said where its data would be, which waits its beat before
 * it shows, so a read that lands fast is never said.
 */
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";

/** One read still out, in a tile or in a sheet that waits on it. */
export function HomeReading({ testid }: { testid: string }) {
  return (
    <p className="route-reading cmh-reading" role="status" data-testid={testid}>
      {LIFECYCLE_WORDS.reading}
    </p>
  );
}

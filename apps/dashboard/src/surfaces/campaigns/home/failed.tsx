/**
 * Campaigns' home, a read that failed or is still out: said where its data would be. A failed read is the kit's failed read in
 * its line kind, with the Retry that reads its surface again (the Playbooks page said it so, over its cards); a read still out
 * is the shell's quiet "Reading…", which waits its beat before it shows, so a read that lands fast is never said. The sentence
 * and the surface are the view model's (contracts campaignsHomeOf, `failed`); a read that failed is its own state, never a
 * tile that is not there, a count drawn as a dash or a zero that was not counted, nor a week that "has nothing" it could not see.
 */
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { LifecycleFailedRead } from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";

/** One failed read, in the rail, a line under it or a tile; `testid` is what an end-to-end spec and a test find it by. */
export function HomeFailed({ failed, testid }: { failed: LifecycleFailedRead; testid: string }) {
  return (
    <FailedRead
      kind="line"
      what={failed.what}
      body={failed.body}
      surface={failed.surface}
      className="cmh-failed"
      testid={testid}
    />
  );
}

/** One read still out, in a tile or in a sheet that waits on it. */
export function HomeReading({ testid }: { testid: string }) {
  return (
    <p className="route-reading cmh-reading" role="status" data-testid={testid}>
      {LIFECYCLE_WORDS.reading}
    </p>
  );
}

/**
 * The kit's components that the shell's pages still draw, under the names they read (decision 0015, step 3).
 *
 * What is shared moves once. The icons, the empty state and the failed read, and the segmented bar were written for
 * the shell (`components/icons.jsx`, `data-bits.jsx`, `chart-core.jsx`); Reports needed them in TSX, so they moved into
 * the kit (`src/surfaces/kit`), where they are the one implementation. The pages that have not moved read them as they
 * always did, as `Icon`, `EmptyState`, `FailedRead` and `SegmentBar` on `window`: this is that line, and it is deleted
 * with the last page that reads a name. The app publishes it from seed-globals.ts, before any page loads; the standalone
 * mockup gets the same object from a bundle its server builds (tooling/scripts/serve-legacy.mjs, `data/kit-globals.js`).
 * The state pill, the confirm, the more menu, the policy chip and a thread's media (`StatePill`, `Confirm`, `MoreMenu`,
 * `PolicyChip`, `TlMedia`: data-bits.jsx's too) moved when the Inbox needed them in TSX, and are published the same way.
 *
 * Nothing here is behaviour: it is the kit's own components, and a page draws them exactly as it drew the old ones.
 */
import { SegmentBar } from "./charts/card";
import { Confirm } from "./confirm/confirm";
import { EmptyState, FailedRead } from "./empty/empty";
import { Icon } from "./icon/icon";
import { TlMedia } from "./media/tl-media";
import { MoreMenu } from "./more-menu/more-menu";
import { StatePill } from "./pill/state-pill";
import { PolicyChip } from "./policy-chip/policy-chip";

export const KIT_GLOBALS = {
  Icon,
  EmptyState,
  FailedRead,
  SegmentBar,
  StatePill,
  Confirm,
  MoreMenu,
  PolicyChip,
  TlMedia,
};

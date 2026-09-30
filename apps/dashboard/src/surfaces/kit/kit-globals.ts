/**
 * The kit's components that the shell's pages still draw, under the names they read (decision 0015, step 3).
 *
 * What is shared moves once. The icons, the empty state and the failed read, and the segmented bar were written for
 * the shell (`components/icons.jsx`, `data-bits.jsx`, `chart-core.jsx`); Reports needed them in TSX, so they moved into
 * the kit (`src/surfaces/kit`), where they are the one implementation. The pages that have not moved read them as they
 * always did, as `Icon`, `EmptyState`, `FailedRead` and `SegmentBar` on `window`: this is that line, and it is deleted
 * with the last page that reads a name. The app publishes it from seed-globals.ts, before any page loads; the standalone
 * mockup gets the same object from a bundle its server builds (tooling/scripts/serve-legacy.mjs, `data/kit-globals.js`).
 *
 * Nothing here is behaviour: it is the kit's own components, and a page draws them exactly as it drew the old ones.
 */
import { SegmentBar } from "./charts/card";
import { EmptyState, FailedRead } from "./empty/empty";
import { Icon } from "./icon/icon";

export const KIT_GLOBALS = { Icon, EmptyState, FailedRead, SegmentBar };

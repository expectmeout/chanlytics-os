/**
 * The kit's components that the shell's pages still draw, under the names they read (decision 0015, step 3).
 *
 * What is shared moves once. The icons, the failed read and the segmented bar were written for the shell
 * (`components/icons.jsx`, `data-bits.jsx`, `chart-core.jsx`); Reports needed them in TSX, so they moved into the kit
 * (`src/surfaces/kit`), where they are the one implementation. The pages that have not moved read them as they always did, as
 * `Icon` and `FailedRead` on `window`: this is that line, and it is deleted with the last page that reads a name. The parts
 * only Ask's Line draws (the segmented bar, the answer's charts, the hold to talk) come with the Line (legacy-bridge/ask/line-globals.ts).
 * The app publishes it from seed-globals.ts, before any page loads; the standalone mockup gets the same object from a bundle
 * its server builds (tooling/scripts/serve-legacy.mjs, `data/kit-globals.js`). The state pill, the confirm, the more menu and
 * the policy chip (`StatePill`, `Confirm`, `MoreMenu`, `PolicyChip`: data-bits.jsx's too) moved when the Inbox needed them in
 * TSX, and are published the same way.
 *
 * Only a name a page still READS is published here. Everything else that moved with them (the empty state, the field error,
 * a thread's media, the attention row, the agenda's rows, and the record kit: the row, the fields, the fold, the inline
 * editor, the sheet, the registry that keeps one fold open and the unsaved-work rule) is imported by the TSX that draws it,
 * and was published for pages that moved long ago: eighty names nothing read were taken down in one sweep (O4b, 11 October
 * 2026). `RecordSwitch` stays, for the bell's alert switch (frame/topbar/notif-popover.tsx).
 *
 * Nothing here is behaviour: it is the kit's own components, and a page draws them exactly as it drew the old ones.
 *
 * The strip of views and what moves a view are the frame's to draw and to ask until the frame itself moves (decision 0015,
 * step 13): the strip (`ViewTabs`, which the shell's SurfaceTabs draws), the page a swipe walks (`viewPager`, which it
 * hands kit/motion/swipe.ts `touchSwipe`), and the deck the frame's `main` registers with (`viewDeck`). Settings and Reports
 * import them. So is the phone's tab bar (`TabBar`), which the frame draws at a phone's foot (frame/phone-tabs.tsx PhoneTabs).
 */
import { Confirm } from "./confirm/confirm";
import { FailedRead } from "./empty/empty";
import { Icon } from "./icon/icon";
import { MoreMenu } from "./more-menu/more-menu";
import { viewDeck } from "./motion/view-deck";
import { StatePill } from "./pill/state-pill";
import { PolicyChip } from "./policy-chip/policy-chip";
import { RecordSwitch } from "./record/field";
import { TabBar } from "./tab-bar/tab-bar";
import { viewPager } from "./view-tabs/pager";
import { ViewTabs } from "./view-tabs/view-tabs";

export const KIT_GLOBALS = {
  Icon,
  FailedRead,
  StatePill,
  Confirm,
  MoreMenu,
  PolicyChip,
  RecordSwitch,
  ViewTabs,
  viewPager,
  viewDeck,
  TabBar,
};

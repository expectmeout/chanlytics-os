/**
 * What the Inbox and Conversations still publish for the pages that have not moved (decision 0015, step 3), under the
 * names they read: the session's decisions (`IX_STORE`, which the bell, Today and the demo's pages read), the one rule of
 * what waits on you (`ixWaitsOnYou`, which only the standalone mockup's stub counts its seeded badge by: the app's badge is
 * the selector in needs-you.ts, `useNeedsYou`). Conversations' two rules (`cvRoute`, `inChannel`) are imported from
 * cv-rules.ts by whoever reads them.
 *
 * What is shared moves once: these were the mockup's globals, written by `data/inbox-data.jsx`,
 * `data/conversations-data.jsx`, `pages/inbox.jsx` and `pages/conversations.jsx`, and this is the one line that says them
 * now, deleted name by name as the last page that reads each moves. The app publishes them from seed-globals.ts before any
 * page loads; the standalone mockup gets them from a bundle its server builds (tooling/scripts/serve-legacy.mjs,
 * `data/inbox-globals.js`, from e2e-harness/inbox-src.ts).
 *
 * A demo's seeded rows (`INBOX_DATA`, `CONVERSATIONS_DATA`, which a real read replaces) are not here: the app fetches them
 * only in a demo session (shell.ts demoCode), so no workspace's first load carries them (the loadability review, 19 Oct 2026), and
 * the mockup's bundle adds them itself.
 *
 * Nothing here is behaviour: it is the surface's own modules, said under the old names.
 */
import { ixWaitsOnYou } from "./rules";
import { hearPresence, IX_STORE } from "./store";

export const INBOX_GLOBALS = {
  IX_STORE,
  ixWaitsOnYou,
};

/** The countdowns freeze while the member is Away and thaw when they come back, from the day the surfaces start. */
export { hearPresence };

/**
 * What the Inbox and Conversations still publish for the pages that have not moved (decision 0015, step 3), under the
 * names they read: the seeded rows of a demo (`INBOX_DATA`, `CONVERSATIONS_DATA`, which a real read replaces), the
 * session's decisions (`IX_STORE`, which the sidebar's badge, the bell, Today and the demo's pages read), the one rule of
 * what waits on you (`ixWaitsOnYou`, the sidebar's and the surface tabs' badge), and the two rules Ask reads a tab and a
 * row by (`CV_ROUTE`, `CV_IN_CHANNEL`).
 *
 * What is shared moves once: these were the mockup's globals, written by `data/inbox-data.jsx`,
 * `data/conversations-data.jsx`, `pages/inbox.jsx` and `pages/conversations.jsx`, and this is the one line that says them
 * now, deleted name by name as the last page that reads each moves. The app publishes the object from seed-globals.ts before
 * any page loads; the standalone mockup gets it from a bundle its server builds (tooling/scripts/serve-legacy.mjs,
 * `data/inbox-globals.js`).
 *
 * Nothing here is behaviour: it is the surface's own modules, said under the old names.
 */
import { cvRoute, inChannel } from "./cv-rules";
import { ixWaitsOnYou } from "./rules";
import { conversationsSample, inboxSample } from "./sample";
import { hearPresence, IX_STORE } from "./store";

export const INBOX_GLOBALS = {
  INBOX_DATA: inboxSample,
  CONVERSATIONS_DATA: conversationsSample,
  IX_STORE,
  ixWaitsOnYou,
  CV_ROUTE: cvRoute,
  CV_IN_CHANNEL: inChannel,
};

/** The countdowns freeze while the member is Away and thaw when they come back, from the day the surfaces start. */
export { hearPresence };

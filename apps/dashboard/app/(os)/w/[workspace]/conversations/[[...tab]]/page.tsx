"use client";

import { ConversationsRoute } from "@/surfaces/inbox/conversations-route";

/**
 * /w/<slug>/conversations, /w/<slug>/conversations/<tab> and /w/<slug>/conversations/<tab>:<row>: every chat and call,
 * newest first, and the one open beside them. Left the shell with the Inbox (decision 0015, step 3): its code is
 * `src/surfaces/inbox/`. The tab and the row are the address's; the page follows them and stays mounted across them.
 */
export default function Page() {
  return <ConversationsRoute />;
}

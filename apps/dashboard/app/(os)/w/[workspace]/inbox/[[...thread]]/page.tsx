"use client";

import { InboxRoute } from "@/surfaces/inbox/inbox-route";

/**
 * /w/<slug>/inbox and /w/<slug>/inbox/<thread>: the threads that need a person, and the one open beside them. The
 * second surface to leave the shell (decision 0015, step 3): its code is `src/surfaces/inbox/`, and the frame in the
 * layout draws its chrome around this page. The thread is the address's; the page follows it and stays mounted across it.
 */
export default function Page() {
  return <InboxRoute />;
}

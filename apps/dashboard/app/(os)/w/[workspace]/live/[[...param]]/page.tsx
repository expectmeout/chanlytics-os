"use client";

import { LiveRoute } from "@/surfaces/live/route";

/**
 * /w/<slug>/live and /w/<slug>/live/<call>: the phone line right now, and the call a door named (decision 0015, step 8):
 * its code is `src/surfaces/live/`, and the frame in the layout draws its chrome around this page. The call is the
 * address's; the page follows it and writes the call it opens back to it (replaced, never pushed).
 */
export default function Page() {
  return <LiveRoute />;
}

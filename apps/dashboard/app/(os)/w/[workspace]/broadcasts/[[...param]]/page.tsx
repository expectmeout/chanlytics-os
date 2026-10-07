"use client";

import { BroadcastsRoute } from "@/surfaces/campaigns/broadcasts/route";

/**
 * /w/<slug>/broadcasts, /w/<slug>/broadcasts/run:<run>, /w/<slug>/broadcasts/get-yes and /w/<slug>/broadcasts/<list>: one
 * approved template to the people who said yes, the runs so far, and the one a link opened (decision 0015, step 7): its
 * code is `src/surfaces/campaigns/broadcasts/`, and the frame in the layout draws its chrome around this page.
 */
export default function Page() {
  return <BroadcastsRoute />;
}

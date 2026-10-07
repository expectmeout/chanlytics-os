"use client";

import { TodayRoute } from "@/surfaces/today/today-route";

/**
 * /w/<slug>/today: the day, its queue, and what is worth a look. The third surface to leave the shell (decision 0015,
 * step 4): its code is `src/surfaces/today/`, and the frame in the layout draws its chrome around this page. The home,
 * `/w/<slug>` itself, is this route too: the catch-all beside this folder draws it there.
 */
export default function Page() {
  return <TodayRoute />;
}

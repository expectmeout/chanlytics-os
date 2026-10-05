"use client";

import { usePathname } from "next/navigation";
import { SettingsRoute } from "@/surfaces/settings/frame/route";

/**
 * /w/<slug>/settings, and its panes (`settings/billing`, `settings/team`, …): Settings, which left the shell as the last
 * part of decision 0015's step 11. Its code is `src/surfaces/settings/`, and the frame in the layout draws its chrome
 * (`src/surfaces/routes.ts`). The shell's own word for the route is `admin`, which an old address still says and the
 * frame moves here on load (contracts ROUTE_WORDS).
 */
export default function Page() {
  // A tab's move is a pushed entry, which usePathname follows: the page reads its pane from the path.
  return <SettingsRoute pathname={usePathname()} />;
}

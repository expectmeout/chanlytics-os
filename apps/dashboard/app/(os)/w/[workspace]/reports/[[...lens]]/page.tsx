"use client";

import { usePathname } from "next/navigation";
import { ReportsPage } from "@/surfaces/reports/reports-page";

/**
 * /w/<slug>/reports, and the lens addresses under it (`reports/receptionist`, `people`, `pipeline`, `campaigns`, `reviews`: the
 * lens registry, contracts `REPORT_LENSES`): one page draws every address it takes (`takes` in `src/surfaces/routes.ts`), the frame's
 * strip of views is the lens strip (`src/surfaces/reports/chrome.ts`), and the page follows its own address, so a move between two
 * of them is a pushed or replaced entry, never a request for a page. Reports was the first surface to leave the shell (decision
 * 0015, step 3): its code is `src/surfaces/reports/`, and the frame in the layout draws its chrome around this page.
 */
export default function Page() {
  // A move between two of the page's addresses is a pushed or replaced entry, which usePathname follows and a router request
  // would not: the page reads its lens from the path (src/surfaces/reports/reports-page.tsx).
  return <ReportsPage pathname={usePathname()} />;
}

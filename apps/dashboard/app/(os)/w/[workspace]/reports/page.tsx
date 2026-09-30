"use client";

import { ReportsPage } from "@/surfaces/reports/reports-page";

/**
 * /w/<slug>/reports: what the receptionist answered, who reached the workspace, and what its campaigns sent. The
 * first surface to leave the shell (decision 0015, step 3): its code is `src/surfaces/reports/`, and the frame in the
 * layout draws its chrome around this page.
 */
export default function Page() {
  return <ReportsPage />;
}

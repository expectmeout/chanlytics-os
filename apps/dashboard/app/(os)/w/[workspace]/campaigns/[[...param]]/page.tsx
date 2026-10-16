"use client";

import { CampaignsRoute } from "@/surfaces/campaigns/home/route";

/**
 * /w/<slug>/campaigns and every address under it: Campaigns › Sequences (decision 0060), everything the workspace sends on
 * its own, with the sheets Campaigns opens over it (`campaigns/new…`, `campaigns/message:<name>`) and the Ads view where
 * it is drawn. Its code is `src/surfaces/campaigns/home/route.tsx`, and the frame in the layout draws its chrome around
 * this page. The old addresses (`/w/<slug>/playbooks`, the shell's `outbound`, the home's own and a campaign's) land on
 * Sequences for ever (contracts doorOf, sequenceLandingOf).
 */
export default function Page() {
  return <CampaignsRoute />;
}

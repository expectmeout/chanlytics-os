"use client";

import { CampaignsRoute } from "@/surfaces/campaigns/home/route";

/**
 * /w/<slug>/campaigns, /w/<slug>/campaigns/moment:<playbook> and /w/<slug>/campaigns/new: what goes out on its own as a
 * customer reaches a moment, and what you send yourself. The home of Campaigns (canvas A, "Lifecycle"): its code is
 * `src/surfaces/campaigns/home/`, and the frame in the layout draws its chrome around this page. The old Playbooks list,
 * `/w/<slug>/playbooks` and the shell's `outbound`, lands here for ever (contracts doorOf); Broadcasts and Templates are its
 * rooms, Sent and the Library.
 */
export default function Page() {
  return <CampaignsRoute />;
}

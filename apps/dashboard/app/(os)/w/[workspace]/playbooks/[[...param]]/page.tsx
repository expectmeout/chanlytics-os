"use client";

import { PlaybooksRoute } from "@/surfaces/campaigns/playbooks/route";

/**
 * /w/<slug>/playbooks and /w/<slug>/playbooks/<playbook>: the standing rules the receptionist runs, and the one a link
 * opened. Campaigns' first page to leave the shell (decision 0015, step 7): its code is `src/surfaces/campaigns/playbooks/`,
 * and the frame in the layout draws its chrome around this page. The shell's route is still `outbound`; the path says the
 * product's word, and `/w/<slug>/outbound` and `#/outbound` move to it for ever.
 */
export default function Page() {
  return <PlaybooksRoute />;
}

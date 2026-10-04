"use client";

import { usePathname } from "next/navigation";
import { PlaybooksDoor } from "@/surfaces/campaigns/home/door";

/**
 * /w/<slug>/playbooks and /w/<slug>/playbooks/<playbook>: the old Playbooks list, which is Campaigns' home now (3 Oct 2026).
 * An address is moved to the home as the frame loads (contracts movedAddress), so this page is only the door for one that
 * arrives otherwise: it replaces itself with `campaigns`, or with `campaigns/moment:<playbook>` for a playbook's own
 * address, which every bell row, email link and bookmark that says `outbound/<id>` still opens.
 */
export default function Page() {
  return <PlaybooksDoor pathname={usePathname()} />;
}

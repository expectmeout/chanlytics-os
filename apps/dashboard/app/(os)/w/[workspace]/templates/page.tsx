"use client";

import { usePathname } from "next/navigation";
import { RetiredRouteDoor } from "@/surfaces/campaigns/home/door";

/**
 * /w/<slug>/templates: the Library's old address. Messages is a view of Campaigns beside Sequences now, at
 * `campaigns/messages` (19 Oct 2026), kept drawn under Campaigns' one mount so a switch between the two loads nothing. An
 * address is moved there as the frame loads (contracts movedAddress, doorOf), and every move the app makes to `messages`
 * lands there too (workspace.ts goToRoute), so this page is only the door for one that arrives otherwise.
 */
export default function Page() {
  return <RetiredRouteDoor pathname={usePathname()} />;
}

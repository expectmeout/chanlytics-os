"use client";

import { usePathname } from "next/navigation";
import { PeopleRoute } from "@/surfaces/people/people-route";

/**
 * /w/<slug>/people, and the addresses under it the page takes: the list, its views (`seg:<id>`, `list:<id>`, `state:<x>`),
 * the New list door, the Pipeline (`pipeline:...`) and a person's page (`<id>`). People left the shell as decision 0015's
 * step 5: its code is `src/surfaces/people/`, and the frame in the layout draws its chrome around this page. Leads is still
 * the frame's table's (`src/surfaces/routes.ts` says which addresses the page takes). The shell's own name for the route is
 * `clients`, and the old name in a path or a hash lands here for ever.
 */
export default function Page() {
  // A move between two of the page's addresses is a pushed or replaced entry, which usePathname follows and a router request
  // would not: the page reads its param from the path (src/surfaces/people/people-route.tsx).
  return <PeopleRoute pathname={usePathname()} />;
}

"use client";

import { usePathname } from "next/navigation";
import { ListsRoute } from "@/surfaces/people/lists-route";

/**
 * /w/<slug>/lists/<id>: a list's own address, which on a real workspace is People with that list picked. The page replaces
 * itself with People's own address for the list once People is read (`src/surfaces/people/lists-route.tsx`). The shell's own
 * name for the route is `segments`, and the old name in a path or a hash lands here for ever.
 */
export default function Page() {
  return <ListsRoute pathname={usePathname()} />;
}

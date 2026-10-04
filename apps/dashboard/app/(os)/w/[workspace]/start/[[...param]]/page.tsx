"use client";

import { usePathname } from "next/navigation";
import { FirstRunRoute } from "@/surfaces/setup/first-run/route";

/**
 * /w/<slug>/start, and its steps (`start/business`, `start/find`, `start/phone`, `start/try`, `start/live`): the first
 * run, Setup's own rows a step to a screen. It left the shell as decision 0015's step 10: its code is
 * `src/surfaces/setup/first-run/`, and the frame in the layout draws it full screen, without its chrome
 * (`src/surfaces/routes.ts`).
 */
export default function Page() {
  // A step's move is a replaced entry, which usePathname follows and a router request would not: the page reads its step
  // from the path (src/surfaces/setup/first-run/route.tsx).
  return <FirstRunRoute pathname={usePathname()} />;
}

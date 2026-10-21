"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

/**
 * The Console's frame, loaded in the browser alone and in a chunk of its own: no customer's page carries it, and it
 * reads the window (its toast, its address) the server has none of.
 */
const ConsoleRoute = dynamic(() => import("@/surfaces/console/frame").then((m) => m.ConsoleRoute), { ssr: false });

/** The address, read where it is known: in the browser, under the boundary the prerender stops at. */
function ConsoleAtItsAddress() {
  return <ConsoleRoute pathname={usePathname()} />;
}

/**
 * /console, and every address under it (decision 0066): the platform's own place. One page draws them all: the frame
 * follows its own address, so a move between two screens is a pushed entry, never a request for a page. It reads no
 * request, as every page of the OS (decision 0053, step 5): the build prerenders the boundary, the browser fills it,
 * and who may look is the routes' to say, each time.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConsoleAtItsAddress />
    </Suspense>
  );
}

import LegacyHost from "@/legacy-bridge/LegacyHost";

/**
 * /w/<slug>/<route> — the OS shell for one workspace, named in the address (plan 3.5).
 *
 * The frame lives here, in the layout, so it stays mounted across a navigation: the route is a path, `/w/acme/inbox`,
 * and a move from one route to the next keeps the frame, its surfaces and their state (decision 0015, "The address
 * first"). The bridge reads the slug from the path and names it on every request; `/w/acme#/inbox`, the address
 * emails and the phone app's links still say, is moved to its path when the frame loads. The segment is not read
 * here: the (os) layout gates the session, and the server validates membership on each call.
 *
 * `children` is the route's page. Until a surface has a page of its own it is the catch-all's, which draws nothing:
 * the route is the frame's legacy table's to draw.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <LegacyHost>{children}</LegacyHost>;
}

import FrameHost from "@/bridge/FrameHost";
import { SheetsAlone } from "@/styles/sheet-links";

/**
 * /w/<slug>/<route> — the OS shell for one workspace, named in the address (plan 3.5).
 *
 * The frame lives here, in the layout, so it stays mounted across a navigation: the route is a path, `/w/acme/inbox`,
 * and a move from one route to the next keeps the frame, its surfaces and their state (decision 0015, "The address
 * first"). The bridge reads the slug from the path and names it on every request; `/w/acme#/inbox`, the address
 * emails and the phone app's links still say, is moved to its path when the frame loads. The segment is not read
 * here, nor is anything else of the request: the proxy gates every address, and the server validates membership on
 * each call, so every workspace's frame is the one prerendered for all (decision 0053, step 5).
 *
 * `children` is the route's page, in its own layout, which links the page's own stylesheets around it
 * (styles/sheets-layout.tsx). Until a surface has a page of its own it is the catch-all's, which draws
 * nothing: the route is the frame's route table's to draw.
 *
 * It is drawn twice. Inside the frame, which only a browser draws (FrameHost), and beside it for its links alone
 * (SheetsAlone): so they are in the prerendered document's head, where a browser finds them before any script and
 * holds the first paint for them, and the outline is drawn in the page's own styles.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SheetsAlone>{children}</SheetsAlone>
      <FrameHost>{children}</FrameHost>
    </>
  );
}

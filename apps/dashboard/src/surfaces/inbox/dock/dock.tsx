/**
 * The dock over a real thread's reply box, and its one line (moved from thread/status.tsx, 17 Nov 2026, as that module
 * reached its length): what the thread's status draws its bars with, and what a thread set aside draws its own with
 * (set-aside.tsx).
 */
import type { ReactNode } from "react";
import { Notice } from "../../kit/notice/notice";

// What a real thread asks of you, said one way whatever the state: the dock over the reply box (the phone canvas, B1),
// the kit's notice. The one line of what is owed, one fact the page does not already show after it in the dim ink (never
// the bar's wait, never their last bubble, which is right above it), and at most two acts, the lead a capsule and the
// other words. The state's name -- the pill its row wears, and its wait -- is the header's, under the name (who.tsx
// whereItStands). It was a sentence at 600 over their last message quoted again over the acts: three blocks for what the
// bar named.
interface DockLine {
  fact: ReactNode;
  source?: ReactNode;
  acts?: ReactNode;
  line?: boolean;
  label: string;
  testid: string;
}

export const Dock = ({ fact, source = null, acts = null, line = false, label, testid }: DockLine) => (
  <Notice fact={fact} source={source} act={acts} line={line} label={label} className="ix-dock" testid={testid} />
);

/** The dock's one line, as the canvas draws it: a dot in the coral, what is owed at 600, the clause after it muted. */
export function dockLine({ lead, rest }: { lead: string; rest: string | null }) {
  return (
    <span className="ix-dock-line">
      <span className="ix-dock-dot" aria-hidden="true" />
      <b>{lead}</b>
      {rest ? <span className="ix-dock-rest"> · {rest}</span> : null}
    </span>
  );
}

/**
 * The question asked before a page, and the change not saved on it, are left: one question, in one place, whatever leaves
 * the page (the sidebar, a menu, a key, a link, Settings' rail, Back and Forward; held-move.ts holds the move). Settings'
 * rail had it alone, drawn inside its pane, until 13 Nov 2026; the rest of the app left a change behind without a word.
 *
 * A band across the top of the page, over the page as it scrolls (shell-chrome.tsx draws it between the frame's top and the
 * page, components.css `.leave-ask`), so it is in view wherever the person was, and taking focus where it stands (`docked`):
 * the page is not moved to it, and Stay leaves the person where they were. A save that is out is never asked about: the
 * move waits for it instead (held-move.ts).
 */
import { useEffect, useSyncExternalStore } from "react";
import { guardLeaving } from "@/bridge/workspace";
import { Confirm } from "../confirm/confirm";
import { answerLeave, hearHeldMove, holdMove, leaveAsking } from "./held-move";

/**
 * The frame's question, while a move off the page is held. As it mounts it hands the address the ask
 * (bridge/workspace.ts guardLeaving): every move off the page, and Back and Forward, are asked from then on, and no longer
 * once it goes.
 */
export function LeaveHost() {
  useEffect(() => guardLeaving(holdMove), []);
  const asking = useSyncExternalStore(hearHeldMove, leaveAsking, () => false);
  if (!asking) return null;
  return (
    <div className="leave-ask">
      <Confirm
        question="Leave without saving?"
        detail="Nothing you changed on this tab has been saved."
        yes="Yes, leave"
        no="Stay"
        discard
        docked
        onYes={() => answerLeave(true)}
        onNo={() => answerLeave(false)}
        testid="leave"
      />
    </div>
  );
}

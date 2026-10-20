/**
 * The campaign runs waiting for your word, in Needs you above its threads (the wiring's second audit, S7-2): the whole
 * list of what waits for you, of which Today's queue is a part (the Campaigns wiring review's rule D, lane 4, 19 Oct 2026).
 * The rows are the one builder's (surfaces/waits/wait-rows.tsx), Today's own: the same row with the same act, Approve in
 * place where an OK alone sends a run, Open where its screen answers it, two or more waiting for an OK one row whose first
 * opens and walks the rest. They used to be rows of the Inbox's own, which only opened. A run opens over the Inbox (rule
 * C), so Back comes back here.
 *
 * To send's row is one of them (Ruben's call 3): it opens the list as a sheet over the Inbox, as a run's row opens its
 * run (Ruben, 20 Oct 2026: it unfolded under its row). Each run's read is begun as its row is drawn, so its screen paints
 * at once. Outside the threads' list, whose keys walk threads alone.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { surfaceHook } from "@/legacy-bridge/surface-status";
import type { Flash } from "../../shell-doors";
import { warmRunDetail } from "../../campaigns/broadcasts/detail-read";
import { useNeedsYouParts } from "../../needs-you";
import { runsPending, useRunsActing } from "../../waits/run-acts";
import { waitRows } from "../../waits/wait-rows";
import { appNavigate } from "../shell";

// Drawn again when Sent's runs move (a run approved and another made keeps the count, and changes the rows).
const useMoved = surfaceHook({ useCallback, useSyncExternalStore });

export function InboxRunsWaiting({ flash }: { flash: (flash: Flash) => void }) {
  useMoved(["broadcasts"]);
  const parts = useNeedsYouParts();
  const acting = useRunsActing();
  // The runs the badge counts (contracts runWaitsOnYou), once the Inbox is read: the rows' own list.
  const ids = parts?.runs
    ? runsPending()
        .waiting.map((r) => r.id)
        .join(",")
    : "";
  // Each run's read, begun before the press (one small read a run, held for the tab until a write): a row opens its run
  // over the Inbox (the Campaigns wiring review's rule C), so no page of its own is warmed for it.
  useEffect(() => {
    if (!ids) return;
    ids.split(",").forEach((id) => warmRunDetail(id));
  }, [ids]);
  if (!ids) return null;
  // The Inbox's verbs are quiet beside its threads: no row of a run is the page's one primary verb.
  const { drawn } = waitRows({
    nav: (to) => appNavigate(to),
    flash,
    verbKind: () => "ghost",
    acting,
    late: false,
  });
  return (
    <div className="ix-runs" data-testid="inbox-runs-waiting">
      {drawn}
    </div>
  );
}

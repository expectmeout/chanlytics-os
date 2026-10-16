/**
 * Campaigns › a reach-out's pane (moved from legacy/pages/reach-out/reach-out-row.jsx, decision 0015; Reach out, Part 4
 * PR 8; canvas board 07). A chain of emails to a search's leads is one thing to its owner: a quiet line under the moments
 * on Campaigns' home (surfaces/campaigns/home, from contracts' campaignsHomeOf), its steps in the pane it opens. Its
 * report -- each step counted once from the database, its last runs, whether it may be removed -- is read when the pane
 * opens (`reachOuts.report`), never before and never invented (R23). Every sentence
 * is contracts' (`reachOuts.words`, reach-out-sheet.ts); every act goes through `reachOuts`, and the surfaces are read
 * again behind it. Who may press is the role store's answer (gate / canDo "approve": owner, operator, partner). Edit
 * opens the reach-out sheet (sheet.tsx, PR 6) over the chain as read, for a role that may change it: where the pane is a sheet's
 * own (Campaigns' home drawer, whose modal holds the page behind it, the record sheet included) the host takes the press
 * (`onEdit`) and opens the sheet at an address of its own, in the drawer's place; with no host the pane draws it itself.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import type { ReachOutChainReportDto, ReachOutReachDto } from "@chanlytics/contracts";
import { reachOuts } from "./surface";
import { useReadAgain } from "./read-again";

/** A chain's report and its search's reach as read, or why they could not be. */
type ReportRead =
  | { state: "reading" }
  | { state: "ok"; report: ReachOutChainReportDto; reach: ReachOutReachDto | null }
  | { state: "failed" };

/**
 * A chain's report and its search's reach, read when a row of it opens (this one, or a Templates email row), or why they
 * could not be read; and the retry that reads them again. While it is open it follows the chain: a reply read, a run made
 * or sent, a lead's stage (read-again.ts; the wiring's second audit, W-campaign-run-template-reachout-8), read behind the
 * report it shows, which a read again that fails leaves standing.
 */
export function useReachOutReport(rootId: string, open: boolean): [ReportRead | null, () => void] {
  const [read, setRead] = useState<ReportRead | null>(null);
  const [tries, retry] = useReducer((n: number) => n + 1, 0);
  const moved = useReadAgain(open ? rootId : null);
  // The chain whose report is on screen: read again behind it, where any other read says it is reading.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const behind = shown.current === rootId;
    if (!behind) setRead({ state: "reading" });
    reachOuts.report(rootId).then(
      (r) => {
        if (!live) return;
        if (r && r.ok) {
          shown.current = rootId;
          setRead({ state: "ok", report: r.data.report, reach: r.data.reach });
        } else if (!behind) setRead({ state: "failed" });
      },
      () => {
        if (live && !behind) setRead({ state: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [rootId, open, tries, moved]);
  return [read, retry];
}

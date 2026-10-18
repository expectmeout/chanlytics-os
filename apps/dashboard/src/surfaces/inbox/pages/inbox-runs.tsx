/**
 * The campaign runs waiting for your word, said where the badge counts them (the wiring's second audit, S7-2): rows of
 * Needs you, above its threads, one a run (the Inbox's run review, 18 Oct 2026). The Needs-you badge counts the runs
 * waiting for your say (an approval, or the emails a going run's check holds or hands to you: contracts runWaitsOnYou), and
 * the band that stood here was a line at the list's edge, said after the threads were in, whose door went to Sent's page,
 * on to the run's sequence, and back to the run. A row is a thread's, in its words and its place: the run's name, what it
 * waits for, in Today's words for the same run (contracts todayRunWords), and its door, the run's own page, where it is
 * decided; its page and its read are begun as the row is drawn, so the press paints at once. A row opens; it never sends
 * (Today's queue is where a run is approved in one press). Outside the threads' list, whose keys walk threads alone.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  RUN_WAITING_SHORT,
  runDraftedEmails,
  runHeldEmails,
  runSheetRoute,
  runTitleOf,
  todayRunWords,
  type BroadcastVM,
} from "@chanlytics/contracts";
import { warmSoon } from "@/legacy-bridge/workspace";
import { surfaceHook } from "@/legacy-bridge/surface-status";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { routeDoor } from "../../legacy-verbs";
import { warmRunDetail } from "../../campaigns/broadcasts/detail-read";
import { useNeedsYouParts, waitingRunsNow } from "../../needs-you";

// Drawn again when Sent's runs move (a run approved and another made keeps the count, and changes the rows).
const useMoved = surfaceHook({ useCallback, useSyncExternalStore });

const NO_RUNS: BroadcastVM[] = [];

/** What a waiting run's row says: what it waits for, in Today's words, and the pill beside its name. */
function runRowWords(r: BroadcastVM): { sentence: string; meta: string; pill: string } {
  const words = todayRunWords(r);
  if (runHeldEmails(r) > 0) return { ...words.held, pill: words.held.status[0] ?? RUN_WAITING_SHORT };
  if (runDraftedEmails(r) > 0) return { ...words.drafted, pill: words.drafted.status[0] ?? RUN_WAITING_SHORT };
  return { ...words.waiting, pill: RUN_WAITING_SHORT };
}

function RunRow({ r }: { r: BroadcastVM }) {
  const said = runRowWords(r);
  return (
    <a className="ix-thread ix-run" {...routeDoor(runSheetRoute(r.id))} data-testid="inbox-run-row">
      <span className="ix-thread-lead">
        <Face glyph={<Icon name="bolt" size={14} />} className="ix-thread-pic" />
      </span>
      <div className="ix-thread-body">
        <div className="ix-thread-line1">
          <span className="ix-thread-who">{runTitleOf(r)}</span>
          <div className="ix-thread-meta">
            <StatePill kind="tone" value="warn" label={said.pill} className="ix-state-pill" />
          </div>
        </div>
        <div className="ix-thread-subject">{said.sentence}</div>
        <div className="ix-thread-line3">
          <span className="ix-thread-preview">{said.meta}</span>
        </div>
      </div>
    </a>
  );
}

export function InboxRunsWaiting() {
  useMoved(["broadcasts"]);
  const parts = useNeedsYouParts();
  const runs = parts?.runs ? waitingRunsNow() : NO_RUNS;
  const ids = runs.map((r) => r.id).join(",");
  // Each run's page and its read, begun before the press: the page when the tab is idle, the read now (one small read a
  // run, held for the tab until a write).
  useEffect(() => {
    if (!ids) return;
    const each = ids.split(",");
    each.forEach((id) => warmRunDetail(id));
    warmSoon(each.map((id) => runSheetRoute(id)));
  }, [ids]);
  if (runs.length === 0) return null;
  return (
    <div className="ix-runs" data-testid="inbox-runs-waiting">
      {runs.map((r) => (
        <RunRow key={r.id} r={r} />
      ))}
    </div>
  );
}

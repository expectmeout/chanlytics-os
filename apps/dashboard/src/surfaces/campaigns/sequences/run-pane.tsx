/**
 * A run open at its home under its sequence (`campaigns/sequences/<sequence>/runs/<run>`, the Campaigns wiring review's
 * lane 2, 19 Oct 2026): the run's one screen, drawn where the record stands, over its History, whose days it is one of.
 * The screen is Sent's run pane (broadcasts/broadcasts-page.tsx BroadcastRun), a chunk of its own fetched as a run opens,
 * so the list and a record carry none of the run's acts. A link that named the run in its sequence's place (a writer that
 * did not know it) is replaced by the sequence's own once the run is read, as a record's address that named a part is.
 */
import { Suspense, lazy, useEffect } from "react";
import { LIFECYCLE_WORDS, RUN_UNNAMED_WORDS, SEQUENCES_ROUTE, runRoute } from "@chanlytics/contracts";
import { backFrom, replaceRoute } from "../../legacy-verbs";
import type { SurfaceKey } from "../../surface-values";
import { useReadsHere } from "../../use-surface";
import { hearRunDetail, peekRunDetail } from "../broadcasts/detail-read";
import { CmPane } from "../parts/split";

// The run's screen and its acts are their own chunk: fetched as a run opens, never with the list.
const BroadcastRun = lazy(() => import("../broadcasts/broadcasts-page").then((m) => ({ default: m.BroadcastRun })));

/**
 * What a run's screen is made of beyond Sequences' list, which its address opens on: Sent's runs (where it sits among those
 * waiting, its acts), the playbook it is a day of, the channels its sheet names the number by, and who each audience
 * reaches (Send it again), last and never waited for.
 */
const RUN_READS: readonly SurfaceKey[] = ["broadcasts", "playbooks", "channels", "audiences"];

/** What stands where the run will be while its chunk is fetched: its pane, saying it is reading. */
function RunReading() {
  return (
    <CmPane
      title={RUN_UNNAMED_WORDS}
      onClose={() => backFrom(SEQUENCES_ROUTE, { replace: true })}
      testid="bc-run-solo"
      className="bc-pane"
    >
      <div className="route-reading sq-reading" role="status" aria-busy="true">
        {LIFECYCLE_WORDS.reading}
      </div>
    </CmPane>
  );
}

export function SequenceRun({ sequenceId, runId }: { sequenceId: string; runId: string }) {
  useReadsHere(RUN_READS);
  // The sequence the run says it is a day of, once read: an address that named another id is written as its own.
  useEffect(() => {
    const own = (seq: string | null | undefined) => {
      if (seq && seq !== sequenceId) replaceRoute(runRoute(runId, seq));
    };
    const held = peekRunDetail(runId);
    if (held && held.ok) own(held.data.broadcast.sequence_id);
    return hearRunDetail(runId, (r) => {
      if (r.ok) own(r.data.broadcast.sequence_id);
    });
  }, [sequenceId, runId]);
  // One screen follows the run open, unkeyed: an Approve that opens the next run waiting keeps its toast (its Stop) on
  // screen, as Sent's page did; the run's own state (its filter, who it shows) is keyed by the run inside it.
  return (
    <Suspense fallback={<RunReading />}>
      <BroadcastRun id={runId} />
    </Suspense>
  );
}

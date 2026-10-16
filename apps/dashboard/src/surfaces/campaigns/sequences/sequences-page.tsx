/**
 * Campaigns › Sequences (decision 0060): everything the workspace sends on its own, as one list, and a sequence's record
 * beside it -- Campaigns' one layout (parts/split.tsx), the list narrowing to the Inbox's column while a record is open,
 * the record taking the screen over on a phone. It is Campaigns (the plan's S6: the home, Sent's list and the Library
 * went, their addresses landing here and on Messages). Its list is the `sequences` surface; a record reads
 * its own (verbs.ts), each following the list. The address says what is open (contracts parseSequencesRoute), so Back
 * walks the list, a record and its tabs. The list's pane is drawn by Sent's sheets too, a run's, To send and Get their
 * yes standing beside it at their own addresses (broadcasts/broadcasts-page.tsx).
 */
import { SEQUENCES_ROUTE, SEQUENCE_WORDS, parseSequencesRoute } from "@chanlytics/contracts";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { gate } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { CmSplit } from "../parts/split";
import { SequencesList } from "./list";
import { NewSequence } from "./new";
import { SequenceRecord } from "./record";
import "./sequences.css";

/** The list's pane: reading, failed, empty, or the sequences, `openId` the one open beside it. */
export function SequencesListPane({ openId = null }: { openId?: string | null }) {
  const page = useSurface("sequences");
  if (page === null)
    return <FailedRead what="the sequences" title={SEQUENCE_WORDS.failed} surface="sequences" testid="sq-failed" />;
  if (page === undefined) return <div className="sq-reading" aria-busy="true" />;
  return page.sequences.length === 0 ? (
    <EmptyState
      kind="card"
      glyph="send"
      title={SEQUENCE_WORDS.title}
      body={SEQUENCE_WORDS.empty}
      action={{
        label: SEQUENCE_WORDS.newSequence,
        to: `${SEQUENCES_ROUTE}/new`,
        testid: "sq-empty-new",
        gate: gate("approve"),
      }}
      testid="sq-empty"
    />
  ) : (
    <SequencesList page={page} openId={openId} />
  );
}

export function SequencesPage({ route }: { route: string }) {
  const place = parseSequencesRoute(route) ?? { view: "list" as const };
  const open =
    place.view === "record" ? (
      <SequenceRecord id={place.id} tab={place.tab} day={place.day ?? null} />
    ) : place.view === "new" ? (
      <NewSequence />
    ) : null;
  return (
    <CmSplit
      testid="sq-page"
      className="sq-page"
      list={<SequencesListPane openId={place.view === "record" ? place.id : null} />}
      open={open}
    />
  );
}

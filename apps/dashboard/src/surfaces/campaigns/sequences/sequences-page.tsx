/**
 * Campaigns › Sequences (decision 0060): everything the workspace sends on its own, as one list, and a sequence's record
 * beside it -- Campaigns' one layout (parts/split.tsx), the list narrowing to the Inbox's column while a record is open,
 * the record taking the screen over on a phone. Drawn in a workspace whose preview is on (`features.sequences_preview`)
 * until it replaces the home, Sent and the Library (the plan's S6). Its list is the `sequences` surface; a record reads
 * its own (verbs.ts), each following the list. The address says what is open (contracts parseSequencesRoute), so Back
 * walks the list, a record and its tabs.
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

export function SequencesPage({ route }: { route: string }) {
  const page = useSurface("sequences");
  const place = parseSequencesRoute(route) ?? { view: "list" as const };
  const open =
    place.view === "record" ? (
      <SequenceRecord id={place.id} tab={place.tab} />
    ) : place.view === "new" ? (
      <NewSequence />
    ) : null;
  if (page === null) {
    return (
      <CmSplit
        testid="sq-page"
        className="sq-page"
        list={<FailedRead what="the sequences" title={SEQUENCE_WORDS.failed} surface="sequences" testid="sq-failed" />}
        open={open}
      />
    );
  }
  if (page === undefined) {
    return (
      <CmSplit
        testid="sq-page"
        className="sq-page"
        list={<div className="sq-reading" aria-busy="true" />}
        open={open}
      />
    );
  }
  return (
    <CmSplit
      testid="sq-page"
      className="sq-page"
      list={
        page.sequences.length === 0 ? (
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
          <SequencesList page={page} openId={place.view === "record" ? place.id : null} />
        )
      }
      open={open}
    />
  );
}

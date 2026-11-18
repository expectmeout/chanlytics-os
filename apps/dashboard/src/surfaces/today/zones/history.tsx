/**
 * The business's history on Today (decision 0073, R23; 18 Nov 2026, Ruben: "Your history · All in" was a card with
 * nothing to do beside the queue, and a website read again brought it back): rows in the setting-up card, drawn as Setup's
 * own rows are, and only while they help. One line while any of it is still coming in; a row for each source that
 * stopped where Try again can bring it in, the press answering at once. Nothing once it is all in: what came in is
 * People's, the Inbox's, the Calendar's and Reviews' own, and Connections says each source on its row. Every word is
 * contracts' (imports/ledger.ts historyOnTodayOf).
 */
import { historyOnTodayOf, type HistoryStoppedVM } from "@chanlytics/contracts";
import { FIRST_RUN_HELPERS } from "@/surfaces/setup/first-run/model/first-run-helpers";
import { useImportAgain } from "../../setup/first-run/channels/import-again";
import { SetupCardRow } from "../../setup/rows/card-row";
import type { FrameFlash } from "../../frame-verbs";
import { useSurface } from "../../use-surface";
import { useToast } from "../shell";

const IW = FIRST_RUN_HELPERS.importWords;

/** A source that stopped: what happened, why or what it kept, and Try again (Starting, and still, once pressed). */
function StoppedRow({ row, flash }: { row: HistoryStoppedVM; flash: (f: FrameFlash) => void }) {
  const { starting, again } = useImportAgain(row.source, flash);
  return (
    <SetupCardRow
      tone="danger"
      stateWords={IW.stopped}
      name={row.name}
      sentence={row.says}
      cta={{ label: starting ? IW.starting : IW.retry, busy: starting, onClick: () => void again() }}
      testid={`today-history-stopped-${row.source}`}
      ctaTestid={`today-history-again-${row.source}`}
    />
  );
}

export const TodayHistory = () => {
  const S = useSurface("setup");
  const [toastNode, flash] = useToast();
  const history = S ? historyOnTodayOf(S.dto.imports) : null;
  // The toast outlives its row: a Try again heard starting takes the row away while a refusal may still be up.
  if (!history) return toastNode;
  return (
    <section className="tq today-history" data-testid="today-history">
      {history.coming ? (
        <SetupCardRow
          tone=""
          stateWords={IW.comingIn}
          name={history.coming.name}
          sentence={history.coming.says}
          testid="today-history-coming"
        />
      ) : null}
      {history.stopped.map((row) => (
        <StoppedRow key={row.source} row={row} flash={flash} />
      ))}
      {toastNode}
    </section>
  );
};

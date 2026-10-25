/**
 * What is coming in (decision 0073, R23, canvas 4 "Your dashboard, filling in" and 4·k "Bringing it in"): beside Where it
 * answers on a desk, People, the Inbox, the Calendar and Reviews as what came in counts them, and one press to the
 * sources one by one, each as the imports ledger says it stands (in, a share, parts, waiting for Go live, stopped with
 * its Try again). Today's Brought in draws the same lines (today/pages/brought-in.tsx).
 */
import type { ReactNode } from "react";
import { FIRST_RUN_HELPERS, type FirstRunChannelsVM, type ImportLineVM } from "@chanlytics/contracts";
import { Sheet } from "../../../kit/sheet/sheet";
import { refusalToast, type LegacyFlash } from "../../../legacy-verbs";
import { setupVerbs } from "../../surface";

const IW = FIRST_RUN_HELPERS.importWords;

/** One source's line: what it is, what came, where it stands, and Try again where it stopped. */
function ImportLine({ line, flash }: { line: ImportLineVM; flash: (f: LegacyFlash) => void }): ReactNode {
  const again = async () => {
    const r = await setupVerbs.importAgain(line.source);
    if (!r.ok) flash(refusalToast(r, IW.stopped));
  };
  return (
    <li className="fr-import" data-state={line.state} data-testid={`fr-import-${line.source}`}>
      <span className="fr-import-words">
        <b>{line.title}</b>
        <span className="fr-detail">{line.says}</span>
      </span>
      {line.retry ? (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void again()}
          data-testid={`fr-import-again-${line.source}`}
        >
          {IW.retry}
        </button>
      ) : (
        <span className="fr-import-stand">{line.stand}</span>
      )}
    </li>
  );
}

/** The sources one by one, in a sheet over the step. */
export function FrBringing({
  open,
  onClose,
  lines,
  flash,
  title = IW.heading,
  foot = IW.foot,
}: {
  open: boolean;
  onClose: () => void;
  lines: ImportLineVM[];
  flash: (f: LegacyFlash) => void;
  /** Today's says what came in before Chanlytics; the first run's, what is coming in while the owner goes on. */
  title?: string;
  foot?: string;
}) {
  return (
    <Sheet
      shape="job"
      close={{ word: FIRST_RUN_HELPERS.words.back }}
      open={open}
      onClose={onClose}
      title={title}
      testid="fr-bringing"
    >
      <ul className="fr-imports" data-testid="fr-bringing-lines">
        {lines.map((l) => (
          <ImportLine key={l.source} line={l} flash={flash} />
        ))}
      </ul>
      <p className="fr-detail">{foot}</p>
      <p className="fr-detail">{IW.keepsGoing}</p>
    </Sheet>
  );
}

/** Your dashboard, filling in: the four counts, and the press to what is coming in. */
export function FrFilling({ filling, onOpen }: { filling: FirstRunChannelsVM["filling"]; onOpen: () => void }) {
  return (
    <aside className="panel fr-pane fr-filling" aria-label={filling.title} data-testid="fr-filling">
      <h2 className="fr-sub">{filling.title}</h2>
      <dl className="fr-filling-rows">
        {filling.rows.map((r) => (
          <div key={r.key} className="fr-filling-row" data-testid={`fr-filling-${r.key}`}>
            <dt>
              <b>{r.label}</b>
              <span className="fr-detail">{r.sub}</span>
            </dt>
            <dd className="tabular">{r.value}</dd>
          </div>
        ))}
      </dl>
      {filling.bringing ? (
        <button type="button" className="btn btn-sm" onClick={onOpen} data-testid="fr-filling-open">
          <span className="fr-pulse" aria-hidden="true" />
          {IW.bringing(filling.bringing.done, filling.bringing.of)}
        </button>
      ) : null}
    </aside>
  );
}

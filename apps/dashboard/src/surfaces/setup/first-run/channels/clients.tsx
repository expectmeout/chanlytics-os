/**
 * Bring your clients (decision 0073, R22, canvas 4·j): the booking tool's client list, from Where it answers' bookings
 * tile and Today's row. The named tool's own export steps where they are known (Vagaro gives Excel, Booksy a CSV), the
 * file read as it comes (People's own import: a CSV or an Excel workbook, its columns found, the counts before anything
 * is written), and the people added through the owner's door in parts, the record of what was brought in kept as they
 * go. Nobody is messaged because of it: they come in with no yes (D16).
 */
import type { ReactNode } from "react";
import { FIRST_RUN_HELPERS, type FirstRunChannelsVM } from "@chanlytics/contracts";
import { Sheet } from "../../../kit/sheet/sheet";
import type { LegacyFlash } from "../../../legacy-verbs";
import { listBody, useImport } from "../../../people/import/add-list";
import { plImportFoundWords } from "../../../people/import/plan";
import { setupVerbs } from "../../surface";

const CL = FIRST_RUN_HELPERS.channelsWords.clients;

/** The sheet's foot: Add N people, or Done once it went in. */
function clientsFoot(o: { list: ReturnType<typeof useImport>; onClose: () => void }): ReactNode {
  const { list, onClose } = o;
  const n = list.readable.length;
  const done = !!list.result && !list.stopped;
  return (
    <div className="fr-clients-foot">
      <button type="button" className="btn btn-ghost" onClick={onClose} data-testid="fr-clients-not-now">
        {done ? FIRST_RUN_HELPERS.words.continue : CL.notNow}
      </button>
      {done ? null : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void list.run()}
          disabled={!list.plan || !n || list.busy}
          aria-busy={list.busy || undefined}
          data-testid="fr-clients-add"
        >
          {CL.add(n)}
        </button>
      )}
    </div>
  );
}

export function FrClients({
  open,
  onClose,
  clients,
  tool,
  flash,
}: {
  open: boolean;
  onClose: () => void;
  clients: FirstRunChannelsVM["clients"];
  /** The tool's word as the ledger keeps it (vagaro), for each person's "before" and the record of what came in. */
  tool: string | null;
  flash: (f: LegacyFlash) => void;
}) {
  const list = useImport({ flash, via: tool });
  const close = () => {
    // What came in shows on Where it answers and Today as soon as Setup is read again.
    if (list.result) void setupVerbs.peek();
    onClose();
  };
  return (
    <Sheet
      shape="job"
      close={{ word: CL.notNow }}
      open={open}
      onClose={close}
      title={clients.heading}
      testid="fr-clients"
    >
      <div className="fr-clients" data-testid="fr-clients-body">
        <ol className="fr-steps" data-testid="fr-clients-steps">
          {clients.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {listBody(list)}
        {list.plan ? (
          <p className="fr-detail" data-testid="fr-clients-columns">
            <span className="fr-label">{CL.columnsFound}</span> {plImportFoundWords(list.plan)}
          </p>
        ) : null}
        <p className="fr-detail">{clients.noYes}</p>
        {clientsFoot({ list, onClose: close })}
      </div>
    </Sheet>
  );
}

/**
 * What is coming in (decision 0073, R23, canvas 4 "Your dashboard, filling in" and 4·k "Bringing it in"): beside Where it
 * answers on a desk, People, the Inbox, the Calendar and Reviews as what came in counts them, and one press to the
 * sources one by one, each as the imports ledger says it stands: in (a tick), how far it has come (a bar, or its
 * parts), waiting for Go live, stopped with its Try again. Today's Brought in opens the same lines in place
 * (today/pages/brought-in.tsx, `ImportLines`).
 */
import { useState, type ReactNode } from "react";
import {
  FIRST_RUN_HELPERS,
  type FirstRunChannelsVM,
  type ImportLineVM,
  type ImportSource,
} from "@chanlytics/contracts";
import { Button, Meter } from "../../../kit";
import { Icon } from "../../../kit/icon/icon";
import { Sheet } from "../../../kit/sheet/sheet";
import { refusalToast, type LegacyFlash } from "../../../legacy-verbs";
import { setupVerbs } from "../../surface";

const IW = FIRST_RUN_HELPERS.importWords;

/** Each source's glyph, beside its title. */
const GLYPH: Record<ImportSource, string> = {
  google_reviews: "star",
  calendar: "calendar",
  clients_file: "users",
  mailbox: "mail",
  contacts: "users",
  whatsapp_contacts: "users",
  whatsapp_history: "chat",
};

/**
 * How long a pressed Try again says Starting while the run is not yet heard starting: the setup read hears the ledger's
 * row within ten seconds (setup/override.ts), so a press still unheard after this is offered again.
 */
const STARTING_HOLD_MS = 30_000;

/**
 * Where a line stands, at its end: Try again where it stopped (Starting, and still, once pressed), a tick once in, the
 * live dot while it reads with no bar to say how far, and otherwise its word ("Starting", "2 of 3", "At Go live").
 */
function LineStand({ line, flash }: { line: ImportLineVM; flash: (f: LegacyFlash) => void }): ReactNode {
  const [pressedAt, setPressedAt] = useState<number | null>(null);
  const starting = pressedAt !== null && Date.now() - pressedAt < STARTING_HOLD_MS;
  const again = async () => {
    setPressedAt(Date.now());
    const r = await setupVerbs.importAgain(line.source);
    if (r.ok) return;
    setPressedAt(null);
    flash(refusalToast(r, IW.stopped));
  };
  if (line.retry)
    return (
      <Button
        size="sm"
        onClick={() => void again()}
        disabled={starting}
        aria-busy={starting || undefined}
        data-testid={`fr-import-again-${line.source}`}
      >
        {starting ? (
          <>
            <span className="fr-pulse" aria-hidden="true" />
            {IW.starting}
          </>
        ) : (
          IW.retry
        )}
      </Button>
    );
  if (line.state === "done")
    return (
      <span className="fr-import-stand" role="img" aria-label={line.stand}>
        <Icon name="check" size={16} />
      </span>
    );
  if (line.state === "running" && line.share !== null && line.source !== "whatsapp_history") return null;
  if (line.state === "running" && line.stand === "…")
    return (
      <span className="fr-import-stand" role="img" aria-label={line.title}>
        <span className="fr-pulse" />
      </span>
    );
  return <span className="fr-import-stand">{line.stand}</span>;
}

/** One source's line: its glyph, what it is, what came, how far it has come, what was set aside, and where it stands. */
function ImportLine({ line, flash }: { line: ImportLineVM; flash: (f: LegacyFlash) => void }): ReactNode {
  return (
    <li className="fr-import fr-source" data-state={line.state} data-testid={`fr-import-${line.source}`}>
      <span className="fr-import-glyph" aria-hidden="true">
        <Icon name={GLYPH[line.source]} size={16} />
      </span>
      <span className="fr-import-words">
        <b>{line.title}</b>
        <span className="fr-detail">{line.says}</span>
        {line.share !== null ? (
          <Meter
            className="fr-import-bar"
            size="sm"
            parts={[
              { share: Math.max(0.001, line.share), color: "var(--accent)" },
              { share: 1 - line.share, tone: "rest" },
            ]}
            aria-label={line.stand}
          />
        ) : null}
        {line.aside ? <span className="fr-import-aside">{line.aside}</span> : null}
      </span>
      <LineStand line={line} flash={flash} />
    </li>
  );
}

/** The sources one by one, a line each: the first run's sheet and Today's card opened draw the same list. */
export function ImportLines({ lines, flash }: { lines: ImportLineVM[]; flash: (f: LegacyFlash) => void }) {
  return (
    <ul className="fr-imports" data-testid="fr-bringing-lines">
      {lines.map((l) => (
        <ImportLine key={l.source} line={l} flash={flash} />
      ))}
    </ul>
  );
}

/** What it says under the sources: history on each person, never answered; and, while anything is coming, that it goes on. */
export function ImportFoot({ running, className }: { running: boolean; className: string }) {
  return (
    <p className={className}>
      {running ? `${IW.keepsGoing} ` : ""}
      {IW.foot}
    </p>
  );
}

/** The sources one by one, in a sheet over the step. */
export function FrBringing({
  open,
  onClose,
  lines,
  flash,
}: {
  open: boolean;
  onClose: () => void;
  lines: ImportLineVM[];
  flash: (f: LegacyFlash) => void;
}) {
  const running = lines.some((l) => l.state === "running" || l.state === "queued");
  return (
    <Sheet
      shape="job"
      close={{ word: FIRST_RUN_HELPERS.words.back }}
      open={open}
      onClose={onClose}
      title={IW.heading}
      testid="fr-bringing"
    >
      <ImportLines lines={lines} flash={flash} />
      <ImportFoot running={running} className="fr-detail" />
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

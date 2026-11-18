/**
 * What is coming in (decision 0073, R23, canvas 4 "Your dashboard, filling in" and 4·k "Bringing it in"): beside Where it
 * answers on a desk, People, the Inbox, the Calendar and Reviews as what came in counts them, and one press to the
 * sources one by one, each as the imports ledger says it stands: in (a tick), how far it has come (a bar, or its
 * parts), waiting for Go live, stopped with its Try again. With `doors`, each line is a door to the page what it brought
 * is on, and what the mailbox set aside a door to where it is listed; the first run's sheet keeps its owner on the step.
 */
import type { ReactNode } from "react";
import type { FirstRunChannelsVM, ImportLineVM, ImportSource } from "@chanlytics/contracts";
import { FIRST_RUN_HELPERS } from "../model/first-run-helpers";
import { useImportAgain } from "./import-again";
// Each part from its own module, never the kit's index: the index brings every part on Base UI into the first run's
// and Today's pages (+21 KB and +10 KB gzipped, #1854's first build), and the first run draws its buttons by class.
import { Meter } from "../../../kit/meter/meter";
import { Icon } from "../../../kit/icon/icon";
import { useCountGlide } from "../../../kit/motion/use-count-glide";
import { Sheet } from "../../../kit/sheet/sheet";
import type { FrameFlash } from "../../../frame-verbs";

const IW = FIRST_RUN_HELPERS.importWords;

/** Each source's glyph, beside its title. */
const SOURCE_GLYPH: Record<ImportSource, string> = {
  google_reviews: "star",
  calendar: "calendar",
  clients_file: "users",
  mailbox: "mail",
  contacts: "users",
  whatsapp_contacts: "users",
  whatsapp_history: "chat",
  google_photos: "image",
  website_media: "image",
  instagram: "image",
};

/**
 * Where a line stands, at its end: Try again where it stopped (Starting, and still, once pressed), a tick once in, the
 * live dot while it reads with no bar to say how far, and otherwise its word ("Starting", "2 of 3", "At Go live").
 */
function LineStand({ line, flash }: { line: ImportLineVM; flash: (f: FrameFlash) => void }): ReactNode {
  const { starting, again } = useImportAgain(line.source, flash);
  if (line.retry)
    return (
      <button
        type="button"
        className="btn btn-sm"
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
      </button>
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

/** What came, its count gliding as a read finds more ("214 emails so far" counting up to 298, not leaping to it). */
function LineSays({ line }: { line: ImportLineVM }): ReactNode {
  const shown = useCountGlide(line.count ?? 0);
  const lead = line.count === null ? null : line.count.toLocaleString("en-US");
  if (lead === null || !line.says.startsWith(`${lead} `)) return <span className="fr-detail">{line.says}</span>;
  return (
    <span className="fr-detail">
      {shown.toLocaleString("en-US")}
      {line.says.slice(lead.length)}
    </span>
  );
}

/**
 * One source's line: its glyph, what it is, what came, how far it has come, and where it stands; and under it what was
 * set aside. The line is no door: the first run keeps its owner on the step.
 */
function ImportLine({ line, flash }: { line: ImportLineVM; flash: (f: FrameFlash) => void }): ReactNode {
  return (
    <li className="fr-import fr-source" data-state={line.state} data-testid={`fr-import-${line.source}`}>
      <span className="fr-import-door">
        <span className="fr-import-glyph" aria-hidden="true">
          <Icon name={SOURCE_GLYPH[line.source]} size={16} />
        </span>
        <span className="fr-import-words">
          <b className="fr-import-title">{line.title}</b>
          <LineSays line={line} />
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
        </span>
      </span>
      <LineStand line={line} flash={flash} />
      {line.aside ? <span className="fr-import-aside">{line.aside}</span> : null}
    </li>
  );
}

/** The sources one by one, a line each. */
function ImportLines({ lines, flash }: { lines: ImportLineVM[]; flash: (f: FrameFlash) => void }) {
  return (
    <ul className="fr-imports" data-testid="fr-bringing-lines">
      {lines.map((l) => (
        <ImportLine key={l.source} line={l} flash={flash} />
      ))}
    </ul>
  );
}

/** What it says under the sources: history on each person, never answered; and, while anything is coming, that it goes on. */
function ImportFoot({ running, className }: { running: boolean; className: string }) {
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
  flash: (f: FrameFlash) => void;
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

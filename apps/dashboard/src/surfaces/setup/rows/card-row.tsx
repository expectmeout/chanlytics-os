/**
 * One of Setup's rows as Today's card draws it (canvas R10; moved from legacy/pages/setup.jsx, decision 0015): its state
 * as a dot (the word is the dot's name), its name and sentence, and its acts at the right: the next one coral, the others
 * outlined, putting it off a quiet link. Hookless; the acts are the caller's, gate spreads included. `left` is how many
 * are left, beside the words, for canvas P9's phone of one row with no head; every width now draws the head's count over
 * every row, and hides this. `note` rides beside the name, at every width, where a phone hides the sentence: a row back
 * from a week put off says so there; its shorter words on a phone, as a button's. `menu` is the caller's control in the
 * second act's place (Today's Skip, a menu of a week or for good), drawn as it comes.
 */
import type { ReactNode } from "react";

/** One act of the row: its words (a shorter pair for a narrow card), what it does, and the gate's props. */
export interface SetupCardAct {
  label: ReactNode;
  short?: ReactNode;
  kind?: string;
  onClick?: () => void;
  gate?: Record<string, unknown>;
  busy?: boolean;
  testid?: string;
}

interface SetupCardRowProps {
  tone: string;
  stateWords: string;
  name: ReactNode;
  note?: { long: ReactNode; short: ReactNode } | null;
  sentence: ReactNode;
  left?: ReactNode;
  cta?: SetupCardAct | null;
  also?: SetupCardAct | null;
  menu?: ReactNode;
  testid?: string;
  ctaTestid?: string;
}

export const SetupCardRow = ({
  tone,
  stateWords,
  name,
  note = null,
  sentence,
  left = null,
  cta = null,
  also = null,
  menu = null,
  testid,
  ctaTestid = "setup-verb",
}: SetupCardRowProps) => (
  <div className="setup-card-row" data-testid={testid}>
    <span className="setup-card-dot" data-tone={tone} role="img" aria-label={stateWords} title={stateWords} />
    <div className="setup-card-body">
      <span className="setup-card-name">
        {name}
        {note ? (
          <span className="setup-back" data-testid={testid ? `${testid}-back` : undefined}>
            <span aria-hidden="true"> · </span>
            <span className="setup-card-long">{note.long}</span>
            <span className="setup-card-short">{note.short}</span>
          </span>
        ) : null}
      </span>
      <span className="setup-card-said">
        <span className="setup-card-words">{sentence}</span>
        {left ? (
          <span className="setup-card-aside">
            <span aria-hidden="true"> · </span>
            {left}
          </span>
        ) : null}
      </span>
    </div>
    {cta || also || menu ? (
      <div className="setup-card-acts">
        {cta ? (
          <button
            type="button"
            className={cta.kind === "primary" ? "setup-card-btn primary" : "setup-card-btn"}
            onClick={cta.onClick}
            disabled={!!cta.busy}
            aria-busy={cta.busy ? true : undefined}
            {...(cta.gate || {})}
            data-testid={ctaTestid}
          >
            {cta.short ? (
              <>
                <span className="setup-card-long">{cta.label}</span>
                <span className="setup-card-short">{cta.short}</span>
              </>
            ) : (
              cta.label
            )}
          </button>
        ) : null}
        {also ? (
          <button
            type="button"
            className="setup-card-skip"
            onClick={also.onClick}
            disabled={!!also.busy}
            aria-busy={also.busy ? true : undefined}
            {...(also.gate || {})}
            data-testid={also.testid}
          >
            {also.label}
          </button>
        ) : (
          menu
        )}
      </div>
    ) : null}
  </div>
);

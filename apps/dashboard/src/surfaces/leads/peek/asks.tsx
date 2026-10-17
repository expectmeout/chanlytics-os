/**
 * What the lead's panel asks (moved from legacy/pages/leads-peek.jsx, decision 0015), drawn now by the lead sheet
 * (sheet/sheet.tsx) over its card: Not a fit's five whys for a selection, whether to erase, "Did you send it?" once the
 * owner is back at the tab, and "How did the call go?". Hookless: every answer goes out through the acts (`on.<name>`)
 * the page's factory built.
 */
import { LEAD_WORDS as W } from "@chanlytics/contracts";
import { Field } from "../../kit/field/field";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { confirmPart } from "../../legacy-parts";
import { PhoneSheetRow } from "../../people/sheets/phone-sheet";
import type { Armed, Deck, PeekActs, PeekMode } from "./types";

/**
 * "What makes it not a fit?" -- five whys, one tap each (PRD 9.5). It teaches nothing in this release. The one drawing
 * of them, for one lead or a selection (the sheets as verbs, 14 Oct 2026: a phone's selection drew its own rows): a pop
 * under the press on a desk and in the peek, or a phone sheet's rows (`rows`), its title the sheet's.
 */
export const LeadNotFitWhy = ({
  busy,
  on,
  rows = false,
  testid = "peek-why",
}: {
  busy?: boolean;
  on: Pick<PeekActs, "onWhy">;
  rows?: boolean;
  testid?: string;
}) =>
  rows ? (
    <div className="pp-sheet-rows">
      {W.whys.map((w) => (
        <PhoneSheetRow
          key={w.id}
          label={w.label}
          disabled={busy}
          onClick={() => on.onWhy(w.id)}
          testid={`${testid}-${w.id}`}
        />
      ))}
    </div>
  ) : (
    <div className="pk-nf pl-peek panel panel-pop" role="menu" aria-label={W.notFitTitle} data-testid={testid}>
      <div className="pop-h">{W.notFitTitle}</div>
      {W.whys.map((w) => (
        <button
          key={w.id}
          type="button"
          role="menuitem"
          className="pop-row"
          disabled={busy}
          data-testid={`${testid}-${w.id}`}
          onClick={() => on.onWhy(w.id)}
        >
          {w.label}
        </button>
      ))}
    </div>
  );

interface AskProps {
  vm: LeadPeekVM;
  mode: PeekMode | null;
  busy: boolean;
  on: PeekActs;
}

/** What the peek asks under its top row: Not a fit's five whys, or whether to erase (PR 9), each in its own mode. */
export const LeadPeekAsk = ({ vm, mode, busy, on }: AskProps) => {
  const Confirm = confirmPart();
  if (mode === "why") return <LeadNotFitWhy busy={busy} on={on} />;
  if (mode !== "erase" && mode !== "erasing") return null;
  return (
    <Confirm
      question={W.erase.ask(vm.name)}
      yes={W.erase.yes}
      no={W.erase.no}
      danger
      block
      busy={busy || mode === "erasing"}
      busyLabel={W.erase.busy}
      onYes={on.onErase}
      onNo={on.onBack}
      testid="peek-erase"
    />
  );
};

/** "Did you send it?" -- asked when the owner comes back to the tab, never before (PRD 9.3). */
export const LeadSentAsk = ({ busy, on }: { busy: boolean; on: PeekActs }) => (
  <div className="pk-ask" role="group" aria-label={W.sentQuestion} data-testid="peek-sent-ask">
    <div className="t">{W.sentQuestion}</div>
    <div className="row">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy}
        data-testid="peek-sent-yes"
        onClick={on.onSaidSent}
      >
        {W.sentYes}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-sent-no" onClick={on.onNotYet}>
        {W.sentNo}
      </button>
    </div>
  </div>
);

/** "How did the call go?" -- the six outcomes, a note, and Save (PRD 9.4). On a phone they are a 2 x 3 grid. */
export const LeadCallAsk = ({
  armed,
  busy,
  on,
  deck,
}: {
  armed: Armed;
  busy: boolean;
  on: PeekActs;
  deck?: Deck | null;
}) => {
  const note = (armed && armed.note) || "";
  const left = W.noteMax - note.length;
  return (
    <div className="pk-ask" role="group" aria-label={W.callQuestion} data-testid="peek-call-ask">
      <div className="t">{W.callQuestion}</div>
      <div className="pk-chips" role="radiogroup" aria-label={W.callQuestion}>
        {W.outcomes.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={armed && armed.outcome === o.id}
            className={`pk-chip tone-${o.tone || "plain"}${armed && armed.outcome === o.id ? " on" : ""}`}
            data-testid={`peek-outcome-${o.id}`}
            onClick={() => on.onOutcome(o.id)}
          >
            <span className="dot" aria-hidden="true" />
            {o.label}
          </button>
        ))}
      </div>
      {/* Under Interested (0052): who the call reached, the name their page takes. */}
      {armed && armed.outcome === "interested" ? (
        <Field
          label={W.spokeWith}
          value={armed.spokeWith ?? ""}
          onValueChange={on.onSpokeWith}
          maxLength={80}
          placeholder={W.spokeWithPlaceholder}
          spellCheck={false}
          data-testid="peek-spoke-with"
        />
      ) : null}
      <input
        className="pk-input"
        type="text"
        value={note}
        maxLength={W.noteMax}
        placeholder={W.notePlaceholder}
        aria-label={W.noteLabel}
        aria-describedby="peek-note-left"
        data-testid="peek-note"
        onChange={(e) => on.onNote(e.target.value)}
      />
      <div className="pk-note-left" id="peek-note-left" data-testid="peek-note-left">
        {W.noteLeft(left, W.noteMax)}
      </div>
      <div className="pk-note-left">{W.callSavedNote}</div>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !(armed && armed.outcome)}
          data-testid="peek-call-save"
          onClick={on.onSaveCall}
        >
          {W.callSave}
        </button>
        {/* On a phone the pile is the work: save this one and move on in one press (D5). */}
        {deck && deck.at < deck.of ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || !(armed && armed.outcome)}
            data-testid="peek-call-save-next"
            onClick={async () => {
              await on.onSaveCall();
              deck.onNext();
            }}
          >
            {W.callSaveNext}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-call-cancel" onClick={on.onCancelCall}>
          {W.callCancel}
        </button>
      </div>
    </div>
  );
};

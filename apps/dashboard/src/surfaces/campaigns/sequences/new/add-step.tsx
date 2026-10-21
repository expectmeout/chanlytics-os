/**
 * A step added (decision 0065, the New canvas's C6): a message, a call for you, or a note for the team, a call or a note
 * always the last step. New draws the three in a sheet of their own over the draft; a sequence's record draws the same
 * three as its step sheet's first face (step-sheet.tsx, step 6), where the editor for the one picked then opens. Its styles
 * are New's rows (new.css), imported here so the record has them however New is loaded. Every word is contracts'.
 */
import { NEW_WORDS as W, type NewStepDoes } from "@chanlytics/contracts";
import { Choice, PickSheet } from "./new-sheets";
import "./new.css";

/** The three a step may do, and the line that says a call or a note closes it. */
export function AddStepChoices(p: {
  onAdd: (does: NewStepDoes) => void;
  /** What a message step is, where it is added: New's own or Ask's, or one of the workspace's on a record. */
  messageSaid: string;
  /** A message can't be added (nothing in Messages to pick): its row said, and not pressed. */
  messageOff?: boolean;
  /** The rows' test ids' stem: `<testid>-message`, `-call`, `-note`. */
  testid: string;
}) {
  return (
    <>
      <div className="sq-nw-rows">
        <Choice
          glyph="chat"
          name={W.does.message}
          said={p.messageSaid}
          off={p.messageOff}
          onPick={() => p.onAdd("message")}
          testid={`${p.testid}-message`}
        />
        <Choice
          glyph="phone"
          name={W.sheets.addCall}
          said={W.hand.call}
          onPick={() => p.onAdd("call")}
          testid={`${p.testid}-call`}
        />
        <Choice
          glyph="note"
          name={W.hand.noteTitle}
          said={W.hand.note}
          onPick={() => p.onAdd("note")}
          testid={`${p.testid}-note`}
        />
      </div>
      <p className="sq-nw-note">{W.hand.last}</p>
    </>
  );
}

/** A step added after the last (step `after`), in New's own sheet: a message, or a call or a note (always the last). */
export function AddStepSheet(p: {
  open: boolean;
  after: number;
  onAdd: (does: NewStepDoes) => void;
  onClose: () => void;
}) {
  return (
    <PickSheet
      open={p.open}
      title={W.draft.addStep}
      sub={W.sheets.addSub(p.after)}
      onClose={p.onClose}
      testid="sq-nw-add"
    >
      <AddStepChoices onAdd={p.onAdd} messageSaid={W.sheets.addMessage} testid="sq-nw-add" />
    </PickSheet>
  );
}

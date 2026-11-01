/**
 * The record kit: the folding row. A line that opens onto what it holds and closes again, for what a sheet keeps one
 * press away rather than on show: what saving writes (RecordSays, folded in a sheet), and a sheet's own "how it works"
 * where one sentence will not do (Ruben, 10 Oct 2026: "too wordy, too explanatory, too cluttered").
 *
 *   <RecordDisclosure id="rules-how" label="How price checking works">…two lines…</RecordDisclosure>
 *
 * A button that says whether it is open (aria-expanded) and names the region it opens (aria-controls); the region is
 * named by the button. Closed, the region is on the page with no height and out of sight (kit.css: its rows grow from
 * nothing, and `visibility` takes it out of the tab order and the accessibility tree once it has closed), so it opens as
 * it grows rather than appearing. `mark` is a short word beside the label, with the kit's quiet dot before it: what is
 * worth knowing without opening it ("Changed"). Open or closed is the row's own, and starts closed, so a draft that
 * changes what it holds never pushes the sheet's fields up; `forceOpen` holds it open while what it holds must be seen
 * (a sentence that stops the save, under a box inside it), and it is the row's own again after. `remember` (opt-in) keeps
 * the member's choice in the tab, by `id` (record/remember.ts): a fold a page wants left as it was across the walk from
 * person to person and a phone's tab switches; a fold held open by `forceOpen` is not a choice, and writes nothing.
 *
 * Not Base UI's Collapsible: the record kit's parts ride every page's route (kit-globals.ts), where no Base UI part
 * does, and a button and a region are all this needs.
 *
 * `look="group"` is a group of a page's rail (a person's Messages and receptionist, canvas A's "fold with a summary"):
 * no inset of its own, its name a group's heading, and `summary` one line under it saying what it holds, which fades
 * while it is open, so nothing is said twice.
 *
 * `look="row"` is one row of a list of properties (the lead sheet's five lines): no inset, a hairline between rows, its
 * label in a column, and `value` beside it saying the row's answer closed. A list that keeps one row open holds it
 * itself: `open` says whether it is, and `onToggle` asks to turn it.
 */
import type { ReactNode } from "react";
import { useRememberedOpen } from "./remember";
import { Icon } from "../icon/icon";

interface RecordDisclosureProps {
  id: string;
  label: ReactNode;
  mark?: ReactNode;
  /** One line under the press while it is closed: what it holds, said short. */
  summary?: ReactNode;
  /** What a row says closed, beside its label (`look="row"`). */
  value?: ReactNode;
  /** A sheet's folded line (the default), a group of a page's rail, or a row of a list of properties. */
  look?: "line" | "group" | "row";
  /** Held by the page, which keeps one row of a list open: whether this one is, and the press that asks to turn it. */
  open?: boolean;
  onToggle?: () => void;
  forceOpen?: boolean;
  /** The tab remembers that the member left it open, by `id`; off, it starts closed every time it is drawn. */
  remember?: boolean;
  testid?: string | null;
  children?: ReactNode;
}

/** A line that opens onto what it holds. */
export function RecordDisclosure(props: RecordDisclosureProps) {
  const { id, label, mark = null, summary = null, look = "line", forceOpen = false, testid = null } = props;
  const { children = null, remember = false, value = null, onToggle } = props;
  const [chosen, choose] = useRememberedOpen(remember ? id : null);
  const open = props.open ?? (chosen || forceOpen);
  const pressId = `${id}-press`;
  const panelId = `${id}-panel`;
  return (
    <div
      className="rec-disclosure"
      data-open={open ? "true" : "false"}
      data-look={look === "line" ? undefined : look}
      data-testid={testid || undefined}
    >
      <button
        type="button"
        className="rec-disclosure-press"
        id={pressId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (onToggle) onToggle();
          else if (!(remember && forceOpen)) choose(!chosen);
        }}
        data-testid={testid ? `${testid}-press` : undefined}
      >
        <span className="rec-disclosure-label">{label}</span>
        {value ? <span className="rec-disclosure-value">{value}</span> : null}
        {mark ? <span className="rec-disclosure-mark">{mark}</span> : null}
        <Icon name="chevron" size={12} />
      </button>
      {summary ? (
        <p className="rec-disclosure-sum" aria-hidden={open || undefined}>
          {summary}
        </p>
      ) : null}
      <div className="rec-disclosure-panel" id={panelId} role="region" aria-labelledby={pressId}>
        <div className="rec-disclosure-inner">{children}</div>
      </div>
    </div>
  );
}

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
 * (a sentence that stops the save, under a box inside it), and it is the row's own again after.
 *
 * Not Base UI's Collapsible: the record kit's parts ride every page's route (kit-globals.ts), where no Base UI part
 * does, and a button and a region are all this needs.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../icon/icon";

interface RecordDisclosureProps {
  id: string;
  label: ReactNode;
  mark?: ReactNode;
  forceOpen?: boolean;
  testid?: string | null;
  children?: ReactNode;
}

/** A line that opens onto what it holds. */
export function RecordDisclosure(props: RecordDisclosureProps) {
  const { id, label, mark = null, forceOpen = false, testid = null, children = null } = props;
  const [chosen, setOpen] = useState(false);
  const open = chosen || forceOpen;
  const pressId = `${id}-press`;
  const panelId = `${id}-panel`;
  return (
    <div className="rec-disclosure" data-open={open ? "true" : "false"} data-testid={testid || undefined}>
      <button
        type="button"
        className="rec-disclosure-press"
        id={pressId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        data-testid={testid ? `${testid}-press` : undefined}
      >
        <span className="rec-disclosure-label">{label}</span>
        {mark ? <span className="rec-disclosure-mark">{mark}</span> : null}
        <Icon name="chevron" size={12} />
      </button>
      <div className="rec-disclosure-panel" id={panelId} role="region" aria-labelledby={pressId}>
        <div className="rec-disclosure-inner">{children}</div>
      </div>
    </div>
  );
}

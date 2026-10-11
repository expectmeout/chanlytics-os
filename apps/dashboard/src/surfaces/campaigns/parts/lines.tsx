/**
 * A drawer's facts as lines (Ruben, 11 Oct 2026: Campaigns' drawers "too cluttered", to be made "like we did with
 * others", Settings' sheets): one inset of lines, each its word at the left in the dim ink and what it holds beside it, a
 * hairline between them, as Settings' sheets draw a list of settings (settings.css `.bt-lines`). What was a paragraph
 * ("The day before an appointment on the calendar — 7 people on the list said yes. Daily 9:00 AM · everyone with an
 * appointment tomorrow · up to 25. Next run today 9:00 AM. Last ran Oct 10.") is read down a column, a fact a line.
 * The surface is the kit's (Panel, inset and flush); the page lays the lines out.
 */
import type { ReactNode } from "react";
import { Panel } from "../../kit/panel/panel";

/** The lines' inset. */
export function CmLines({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <Panel variant="inset" size="flush" className="cm-lines" data-testid={testid}>
      {children}
    </Panel>
  );
}

/** Whether a line holds anything to draw: a word, an element, or a list with one of them in it. */
const linesHold = (held: ReactNode): boolean =>
  Array.isArray(held)
    ? held.some(linesHold)
    : held !== null && held !== undefined && typeof held !== "boolean" && held !== "";

/** One line: its word, and what it holds; nothing where it holds nothing. */
export function CmLine({ word, children, testid }: { word: string; children: ReactNode; testid?: string }) {
  if (!linesHold(children)) return null;
  return (
    <div className="cm-line" data-testid={testid}>
      <span className="cm-line-k">{word}</span>
      <div className="cm-line-v">{children}</div>
    </div>
  );
}

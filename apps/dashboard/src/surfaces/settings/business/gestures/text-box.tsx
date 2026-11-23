// Chanlytics — Settings › Business: the box for a row whose value is one line of text.
//
// Written once for every card's rows: Who you are's (who.tsx) and the review link's (review-link/row.tsx), which was
// the row that took who.tsx past what a module holds. What a row's box is handed is here too, for a row that draws a
// box of its own (the number it gives out). Hookless.

import type { ReactNode } from "react";
import { RecordField } from "../../../kit/record/field";

/** What a row's box is handed to draw: the draft, its setter, what stops it, the field's own props, the row's gate. */
export interface BoxProps<D> {
  draft: D;
  set: (next: D) => void;
  problem: ReactNode;
  field: { id: string; label: ReactNode; "aria-labelledby"?: string; readOnly?: boolean };
  gate?: Record<string, unknown> | null;
  readOnly?: boolean;
}

/** What a text box says beside the field: only the words it has. */
interface TextWords {
  hint?: string;
  placeholder: string;
  inputMode?: "url" | "tel";
  autoComplete?: string;
}

/**
 * The box for a row whose value is one line of text. Its hint says what the value is for, or what empty means, and
 * is drawn under the box only while the box is empty: that is when it is the one thing to read (the phone's rule for
 * a row's hint, record.css), and a filled row's editor keeps the row's one line, so nothing under it moves as the
 * value becomes its field. A problem is drawn whenever there is one; RecordField gives it the hint's place.
 */
export const btTextBox =
  (words: TextWords) =>
  ({ draft, set, problem, field }: BoxProps<string>) => (
    <RecordField
      {...field}
      value={draft}
      onChange={set}
      problem={problem}
      hint={draft ? null : words.hint || null}
      placeholder={words.placeholder}
      inputMode={words.inputMode}
      autoComplete={words.autoComplete}
    />
  );

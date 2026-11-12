/**
 * A row's second act on the Line (home.tsx AskRows): Not now on what Ask noticed, and a conversation's x.
 *
 * A row is ONE option, and an option holds no control of its own: a button inside it, even one the Tab key skips, is a
 * control a reader is told of twice and cannot reach by the list's own keys (the nightly's axe, 10 November 2026:
 * "interactive controls must not be nested", on the first row that said Not now). So a row's second act is drawn as the
 * kit's press looks and is a pointer's alone, hidden from a reader (`secondAct`), as Brief me is; the keys say it with
 * Delete on the row (line/under.ts arDeleteKey), which the option names as its shortcut and says in words
 * (`deleteKeyOf`), read from the list's hidden lines (`byKeyLines`). No key is drawn (the Line, D17).
 */
import { Fragment } from "react";
import type { MouseEvent } from "react";
import type { LineWords } from "./words";

/** What of a row says which second act it has: what Ask noticed rests (`rest`, its key), a conversation is deleted. */
interface ActRow {
  type: string;
  rest?: string;
}

/** The hidden lines that say what Delete does on a row, by the id a row names. */
const REST_BY_KEY = "ask-rows-rest-by-key";
const DELETE_BY_KEY = "ask-rows-delete-by-key";
const keyLineOf = (row: ActRow) => (row.rest ? REST_BY_KEY : row.type === "thread" ? DELETE_BY_KEY : null);

/**
 * For the element that draws a second act: a pointer's press that stops at it, so the row under it is not taken too,
 * and nothing a reader is told of or a key can stand on. The row is the option; this is not a control.
 */
export const secondAct = (act: () => unknown) => ({
  "aria-hidden": true,
  onClick: (event: MouseEvent) => {
    event.stopPropagation();
    act();
  },
});

/** For the option itself: Delete is its shortcut, said in the hidden line it names. Nothing for a row with no second act. */
export const deleteKeyOf = (row: ActRow) => {
  const line = keyLineOf(row);
  return line ? { "aria-keyshortcuts": "Delete", "aria-describedby": line } : {};
};

/** What Delete does, said once for every row that has the act and drawn nowhere: a row names its line by id. */
export const byKeyLines = (rows: ActRow[], words: LineWords) => (
  <Fragment>
    {rows.some((row) => keyLineOf(row) === REST_BY_KEY) ? (
      <span id={REST_BY_KEY} hidden>
        {words.notNowByKey}
      </span>
    ) : null}
    {rows.some((row) => keyLineOf(row) === DELETE_BY_KEY) ? (
      <span id={DELETE_BY_KEY} hidden>
        {words.deleteByKey}
      </span>
    ) : null}
  </Fragment>
);

/**
 * Today's lines (Today, calm, 19 Nov 2026, D1 and D5): under the page's one card everything else is one list, a line
 * each, on the page itself and in no pane. A line is the kit's list row: who or what it is at its start, what it is in a
 * few words, one quieter line under them, how long it has waited where someone waits, and a chevron, since the whole line
 * is the press. A person is the kit's face, round; a thing of a kind (the day, a campaign, what AI found) is its glyph in
 * the face's tile, squared, so the two never read alike down the page's edge. A line with a page of its own is a link to
 * it (a door is a link: a long press or a new tab opens it too); one with none says what its press does, where it stands
 * (it rises into the card, or opens under itself).
 *
 * A line that names nothing and only counts what is left (`quiet`: "Also on your list", "4 more AI found") is drawn
 * lighter than one that names someone: no mark, its words not bold.
 *
 * The lines are their parts' to say: Need you's rows, the day, what the day came to, what AI found, Content, the pins.
 * This draws them alike.
 */
import type { MouseEventHandler, ReactElement, ReactNode } from "react";
import { keyPress } from "../../frame-verbs";
import type { FaceProps } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { ListRow } from "../../kit/list-row/list-row";
import { SAYS_WHEN } from "../../kit/says-when";
import { doorGlyph } from "../shell";

/** A line's door: its address, and the app's own way there on a plain press (frame-verbs `routeDoor`). */
interface LineDoor {
  href: string;
  onClick: MouseEventHandler<HTMLAnchorElement>;
}

/** One line of Today. */
export interface CalmLine {
  /**
   * Who it is, as the kit's face; or what kind of thing, as the glyph the face's tile holds. None on a line that only
   * counts (`quiet`).
   */
  first?: { face: FaceProps } | { mark: ReactElement };
  name: ReactNode;
  /** The quieter line under the name; none where it has nothing more to say. */
  said?: ReactNode;
  /**
   * The line under the name as facts (who, since when, whose), in place of `said`: one line of them, each whole or not
   * there. A fact the line has no room for is left out with its dot, so nothing ends mid-word; a fact alone that is too
   * long ends in an ellipsis.
   */
  facts?: readonly ReactNode[];
  /** How long it has waited, in the row's own words, amber (`long`) where the row says it is. */
  wait?: { words: string; long: boolean } | null;
  /** Its page, where it has one: the line is a link. */
  door?: LineDoor | null;
  /** What a press does where it has no page of its own. */
  press?: (() => void) | null;
  /** Whether what it opens under itself is open, for a reader; unset where it opens nothing in place. */
  open?: boolean;
  /** Drawn under the line, inside it: the day's bar, what a press opened. */
  under?: ReactNode;
  /** A line that names nothing and only counts what is left: no mark, its words lighter. */
  quiet?: boolean;
  /** A line that never runs to a second line, of its name or of what stands under it (the day's, D19). */
  tight?: boolean;
  /**
   * A line kept but folded shut: its item is in the card, or past the lines the page names. It folds and opens where it
   * stands as the card hands off (calm.css), so nothing under it jumps; folded, it is out of reach of a press and a reader.
   */
  folded?: boolean;
  /** The first line still showing in its list: it takes no rule over it. */
  top?: boolean;
  testid: string;
}

/** What trails a line's name: how long it has waited, and the chevron that says the line is a press. Called, not drawn. */
function lineEnd(place: string, wait: CalmLine["wait"], glyph: string | null) {
  return (
    <span className={`${place} calm-end`}>
      {wait ? (
        <span className="calm-wait tabular" data-long={wait.long || undefined} {...SAYS_WHEN}>
          {wait.words}
        </span>
      ) : null}
      {glyph ? <Icon name={glyph} size={12} className="calm-go" /> : null}
    </span>
  );
}

/** The row's first column: a person's face, a kind's glyph in the face's tile, or, on a line that only counts, nothing. */
function firstOf(first: CalmLine["first"], quiet: boolean) {
  // A line that only counts keeps the column, so its words stand under the names over it; the stylesheet draws no mark.
  if (quiet || !first) return { mark: <span /> };
  return "mark" in first ? { face: { glyph: first.mark, tile: true } } : first;
}

/** The chevron a line ends in: the door's where it leaves for a page, the fold's where it opens under itself. */
function glyphOf(door: boolean, press: boolean, open: boolean | undefined): string | null {
  if (door) return doorGlyph();
  if (!press) return null;
  if (open === undefined) return doorGlyph();
  return open ? "chevron-up" : "chevron-down";
}

/** A line: the kit's row, a link where it has a page, a press where it has none, with what stands under it. */
export function CalmRow({
  first,
  name,
  said,
  facts,
  wait = null,
  door = null,
  press = null,
  open,
  under,
  quiet = false,
  tight = false,
  folded = false,
  top = false,
  testid,
}: CalmLine) {
  const lines = {
    ...firstOf(first, quiet),
    name: <span className="calm-name">{name}</span>,
    said: facts?.length
      ? (place: string) => (
          <div className={`${place} calm-said calm-facts`}>
            {facts.map((fact, at) => (
              <span key={at} className="calm-fact">
                {fact}
              </span>
            ))}
          </div>
        )
      : said
        ? (place: string) => <div className={`${place} calm-said`}>{said}</div>
        : undefined,
    end: (place: string) => lineEnd(place, wait, glyphOf(!!door, !!press, open)),
  };
  return (
    <div
      className="calm-line"
      role="listitem"
      data-quiet={quiet || undefined}
      data-tight={tight || undefined}
      data-folded={folded || undefined}
      data-top={top || undefined}
      aria-hidden={folded || undefined}
      inert={folded || undefined}
      data-testid={testid}
    >
      <div className="calm-fold">
        {door ? (
          <ListRow {...lines} href={door.href} onClick={door.onClick} />
        ) : press ? (
          <ListRow
            {...lines}
            role="button"
            tabIndex={0}
            aria-expanded={open}
            onClick={press}
            onKeyDown={keyPress(press)}
          />
        ) : (
          <ListRow {...lines} />
        )}
        {under}
      </div>
    </div>
  );
}

/** The list the lines stand in: a part's lines under its name for a reader, which no line draws. */
export function CalmList({ label, testid, children }: { label: string; testid: string; children: ReactNode }) {
  return (
    <div className="calm-lines" role="list" aria-label={label} data-testid={testid}>
      {children}
    </div>
  );
}

/**
 * A list's search at rest: its glyph in the list's top row, whose press puts the caret in the field under the row (Ruben,
 * 12 Nov 2026: one top for every list, and one piece that draws its glyph, so no page keeps a copy). The field stays drawn
 * while it rests, folded to no height (components.css .lookup-folded, the one rule), because a phone's keyboard comes only
 * with a focus made inside the press (Ruben, 11 Oct 2026); it opens while it has the caret or words. People's bar, the
 * Inbox's buckets and Sequences', Messages' and Content's rows draw it. What stands at the row's left is each page's own:
 * People's list, the Inbox's buckets, a Campaigns list's view, Content's Made and Library.
 */
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { cx } from "../variants";

/** A search's classes: the page's own, and the fold's while it rests under its row's glyph. */
export const foldedLookup = (className: string, folded: boolean): string =>
  folded ? `${className} lookup-folded` : className;

/** The search's glyph in the row. `className` is for the row's layout of it. */
export function ListFind({
  label,
  onFind,
  testid,
  className,
}: {
  label: string;
  onFind: () => void;
  testid: string;
  className?: string;
}) {
  return (
    <Button
      variant="plain"
      size="sm"
      iconOnly
      className={cx("list-find", className)}
      aria-label={label}
      onClick={onFind}
      data-testid={testid}
    >
      <Icon name="search" size={16} />
    </Button>
  );
}

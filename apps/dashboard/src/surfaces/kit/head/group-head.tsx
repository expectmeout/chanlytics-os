/**
 * A group's heading over its rows or tiles, the one every list draws (Ruben, 12 Nov 2026: one first heading on every list,
 * and one piece that draws it, so no page keeps a copy of its numbers): its name at the rows' size in the semibold, how many
 * it holds dim beside it where that is known, a hairline under it across the list, and the room over it that parts one
 * group from the next, as the Pipeline's stages stand in their table (kit.css .dtable[data-groups="stages"]; its rules
 * here are components.css .group-head). Sequences' groups, Messages', Content's Made and its Library draw it.
 *
 * A group that needs the owner says its figure in amber. A group that folds is its heading, one press: its name, its
 * count and a chevron. What a group offers of its own stands at the heading's end ("Show 3 ended").
 */
import type { ReactNode } from "react";
import { Icon } from "../icon/icon";
import { LinkButton } from "../link-button/link-button";
import { cx } from "../variants";

/** A heading that folds its group: whether it stands open, the press, and what the press is to a screen reader. */
export interface GroupFold {
  open: boolean;
  onFold: () => void;
  label: string;
  testid?: string;
}

export function GroupHead({
  label,
  count = null,
  needs = false,
  end = null,
  fold = null,
  className,
  testid,
}: {
  label: string;
  /** How many it holds; null where that is not known whole, and no figure is drawn. */
  count?: number | null;
  needs?: boolean;
  /** What the group offers of its own, at the heading's end. */
  end?: ReactNode;
  fold?: GroupFold | null;
  /** The list's own layout over it. */
  className?: string;
  testid?: string;
}) {
  const words = (
    <>
      <span className="group-head-name">{label}</span>
      {count === null ? null : <span className="group-head-count">{count}</span>}
    </>
  );
  return (
    <h3
      className={cx("group-head", className)}
      data-needs={needs || undefined}
      data-fold={fold ? "" : undefined}
      data-testid={testid}
    >
      {fold ? (
        <LinkButton
          className="group-head-fold"
          onClick={fold.onFold}
          aria-expanded={fold.open}
          aria-label={fold.label}
          data-testid={fold.testid}
        >
          {words}
          <Icon name={fold.open ? "chevron-up" : "chevron-down"} size={12} />
        </LinkButton>
      ) : (
        words
      )}
      {end ? <span className="group-head-end">{end}</span> : null}
    </h3>
  );
}

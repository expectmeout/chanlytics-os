/**
 * The rail kit (moved whole from legacy/pages/people.jsx, decision 0015). One rail for both scopes of People: People's
 * lists and Leads' lists and searches are the same thing to the rail: sections, perhaps groups in them, and rows, each
 * one thing to pick with its count. Both scopes draw these, and both pick the same way: one row at a time
 * (aria-current), a pick replaces what was picked, and pressing the picked row again goes back to all of them
 * (railToggle). Hookless, like the table: what is picked is the page's, and arrives as a prop.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import type { PeopleRead } from "../types";

/** The rail's one rule for a pick: the row pressed, unless it was the one picked, which goes back to none. */
export const railToggle = <T,>(current: T | null, id: T): T | null => (current === id ? null : id);

export function RailSection({
  label,
  icon = null,
  testid = null,
  children,
}: {
  label?: ReactNode;
  icon?: string | null;
  testid?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="cl-rail-section" data-testid={testid || undefined}>
      {label ? (
        <div className="cl-rail-label">
          {icon ? <Icon name={icon} size={11} /> : null}
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * A phone's Lists sheet is compact (Ruben, 24 Sep: the sheet "takes most of the screen"): a list with nobody in it gets
 * no cell of its own there, only its name in one quiet line under its block. The one picked is always drawn, empty or
 * not, and so is the list of all of them. `railQuiet` answers the rows that step back; `RailEmpty` says them.
 */
export const railQuiet = <T extends { count: number | string }>(rows: readonly T[], keep: (r: T) => boolean): T[] =>
  rows.filter((r) => r.count === 0 && !keep(r));

/**
 * The list the address names when People doesn't have it: one of People's this workspace can't count (a calendar not
 * read, deals off), archived (it comes back from the rail's Archived line), or not here at all -- deleted, or from
 * another workspace. Null when the list is here, when none is named, or when the lists could not be read.
 */
export const plListGone = ({
  listId,
  activeList,
  savedId,
  activeSaved,
  people,
}: {
  listId: string | null;
  activeList: unknown;
  savedId: string | null;
  activeSaved: unknown;
  people: PeopleRead;
}): { title: string; body: string; archived?: { id: string; name: string } } | null => {
  if (listId && !activeList) {
    // One of People's this workspace doesn't show: a calendar that couldn't be read, deals off. Can't tell, not gone.
    const hidden = (people.hidden || []).find((h) => h.id === listId);
    return hidden
      ? { title: `${hidden.label} can't be counted here`, body: hidden.why }
      : { title: "This list isn't here", body: "People doesn't have a list by that name. The link may be old." };
  }
  if (!savedId || activeSaved || people.savedRead === false) return null;
  const archived = (people.archived || []).find((a) => a.id === savedId);
  return archived
    ? { title: `${archived.name} is archived`, body: "It comes back from Archived under your lists.", archived }
    : { title: "This list isn't here", body: "It was deleted, or the link is from another workspace." };
};

/** The labels are words, or a list's own button (the Saved section's, which still open their lists). */
export function RailEmpty({ labels, testid = null }: { labels: readonly ReactNode[]; testid?: string | null }) {
  return labels.length ? (
    <p className="cl-rail-empty" data-testid={testid || undefined}>
      {"Empty now: "}
      {labels.map((l, i) => (
        <Fragment key={i}>
          {i > 0 ? " · " : null}
          {l}
        </Fragment>
      ))}
    </p>
  ) : null;
}

export function RailGroup({
  label,
  testid = null,
  children,
}: {
  label: ReactNode;
  testid?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="cl-rail-group" data-testid={testid || undefined}>
      <div className="cl-rail-group-label">{label}</div>
      {children}
    </div>
  );
}

/**
 * One row. Its mark, label and count are the pick. A row with acts of its own (a search's menu) keeps them beside the
 * pick, never a button inside a button, and the pick fills the row, so a press anywhere on it but the acts picks it.
 * While the row is being named, `edit` stands in for the pick and its acts; `after` hangs under it (a Confirm).
 * `onWarm` is the row under the pointer, or reached by Tab: a scope may read the view its press would open ahead of the
 * press (the Leads scope does), as the Settings rail warms a tab. A press asks for nothing of its own.
 */
export function RailRow({
  label,
  count = null,
  active = false,
  onPick,
  onWarm = null,
  smart = false,
  tip = null,
  mark = null,
  menu = null,
  edit = null,
  after = null,
  testid = null,
  className = "",
  pickClass = "",
}: {
  label: ReactNode;
  count?: number | string | null;
  active?: boolean;
  onPick: () => void;
  onWarm?: (() => void) | null;
  smart?: boolean;
  tip?: string | null;
  mark?: ReactNode;
  menu?: ReactNode;
  edit?: ReactNode;
  after?: ReactNode;
  testid?: string | null;
  className?: string;
  pickClass?: string;
}) {
  const cls = `cl-rail-row${smart ? " smart" : ""}${active ? " active" : ""}${className ? ` ${className}` : ""}`;
  const said = (
    <>
      {mark}
      <span className="label">{label}</span>
      {count === null || count === undefined ? null : <span className="count">{count}</span>}
    </>
  );
  // What the pick carries: its press, the warm-up under a pointer or Tab, and what a screen reader and a tip say of it.
  const pick = {
    onClick: onPick,
    onPointerEnter: onWarm || undefined,
    onFocus: onWarm || undefined,
    "aria-current": active ? ("true" as const) : undefined,
    "data-tip": tip || undefined,
    "data-testid": testid || undefined,
  };
  if (!menu && !edit && !after) {
    return (
      <button type="button" className={cls} {...pick}>
        {said}
      </button>
    );
  }
  return (
    <div className={`${cls} has-acts`}>
      {edit || (
        <button type="button" className={`cl-rail-pick${pickClass ? ` ${pickClass}` : ""}`} {...pick}>
          {said}
        </button>
      )}
      {edit ? null : menu}
      {after}
    </div>
  );
}

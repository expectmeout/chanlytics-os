/**
 * Which columns show, as a menu that stays open while they are switched (moved whole from legacy/pages/people-table.jsx,
 * decision 0015): a more-menu closes on every item, which is right for an action and wrong for a set of switches.
 * Hookless, with its open state the page's, whose one keyboard listener closes it on Esc and puts focus back on its
 * button (`buttonRef`, the page's); pl-cols-menu keeps it out of PL_OVERLAY, what is open over the page and not the
 * page's. A phone draws cards, not columns, so the menu is hidden there (clients.css).
 */
import type { ReactNode, RefObject } from "react";
import { Icon } from "../../kit/icon/icon";

export function PeopleColumnsMenu({
  open,
  onOpenChange,
  options,
  onPick,
  buttonRef = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: readonly { key: string; label: ReactNode; on: boolean; locked: boolean }[];
  onPick: (key: string) => void;
  buttonRef?: RefObject<HTMLButtonElement | null> | null;
}) {
  return (
    <div className="more-wrap pl-cols">
      <button
        type="button"
        ref={buttonRef}
        className="btn btn-ghost btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        data-testid="people-columns"
      >
        <Icon name="eye" size={12} /> Columns
      </button>
      {open && (
        <>
          <div
            className="more-backdrop"
            role="presentation"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(false);
            }}
          />
          <div
            className="more-menu align-right pl-cols-menu"
            role="menu"
            aria-label="Columns"
            data-testid="people-columns-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="more-header">Show on the table</div>
            {options.map((c) => (
              <button
                key={c.key}
                type="button"
                className="more-item"
                role="menuitemcheckbox"
                aria-checked={c.on}
                aria-disabled={c.locked ? true : undefined}
                onClick={() => {
                  if (!c.locked) onPick(c.key);
                }}
                data-testid={`column-${c.key}`}
              >
                <Icon name="check" size={13} />
                <span className="more-item-label">{c.label}</span>
                {c.locked && <span className="more-item-meta">Always</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

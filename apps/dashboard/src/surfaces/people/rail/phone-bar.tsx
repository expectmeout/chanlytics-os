/**
 * The phone's top (900px and under, the band the rows and the Lists sheet use), the same for every scope of People
 * (moved whole from legacy/pages/people.jsx, decision 0015): the scopes as the Inbox draws its views -- the shell's own
 * tab strip (.stabs), a row of its own with the one picked underlined -- and under it the bar: the list being shown,
 * search behind a button, and the scope's own last control (People's more-menu, Leads' Find, the Pipeline's +).
 * Nothing else sits above the rows but the one line under the bar. Searching, the bar is the field, full width and 16px,
 * so a phone never zooms into it, and Cancel gives the bar back; the scopes stay above it, as the Inbox's views stay
 * over its search. Hookless: its state is the page's (`searchOpen`), so the page's one keyboard listener opens it on /.
 * `listCount` (Leads') stands apart from the name and never gives way: the name is what an ellipsis shortens. `dealsOn`
 * puts the Pipeline in the switch; with no `onLists` there is no list to pick and the bar draws no list button.
 */
import type { ReactNode, RefObject } from "react";
import { Icon } from "../../kit/icon/icon";
import { PeopleScopeTabs } from "./scope-tabs";

type SearchRef = RefObject<HTMLInputElement | null> | null;

/** The bar, searching: the field, full width, and Cancel to give the bar back. */
function PeoplePhoneSearch({
  id,
  q,
  onQ,
  searchRef,
  searchOpen,
  onSearchOpen,
  searchLabel,
}: {
  id: (part: string) => string;
  q: string;
  onQ: (q: string) => void;
  searchRef: SearchRef;
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
  searchLabel: string;
}) {
  return (
    <div className="pp-bar is-searching">
      <label className="pp-bar-field">
        <Icon name="search" size={16} />
        <input
          ref={searchRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={searchOpen}
          value={q}
          placeholder={searchLabel}
          aria-label={searchLabel}
          onChange={(e) => onQ(e.target.value)}
          data-testid={id("search")}
        />
        {q ? (
          <button
            type="button"
            className="pp-bar-clear"
            aria-label="Clear the search"
            onClick={() => {
              onQ("");
              if (searchRef && searchRef.current) searchRef.current.focus();
            }}
            data-testid={id("search-clear")}
          >
            <Icon name="x" size={12} />
          </button>
        ) : null}
      </label>
      <button
        type="button"
        className="pp-bar-cancel"
        onClick={() => {
          onQ("");
          onSearchOpen(false);
        }}
        data-testid={id("search-cancel")}
      >
        Cancel
      </button>
    </div>
  );
}

export function PeoplePhoneBar({
  scope,
  onScope,
  dealsOn = false,
  listLabel = null,
  listCount = null,
  onLists = null,
  listsOpen = false,
  q,
  onQ,
  searchRef,
  searchOpen = false,
  onSearchOpen,
  searchLabel,
  trailing = null,
  testid,
}: {
  scope: string;
  onScope: (to: string) => void;
  dealsOn?: boolean;
  listLabel?: ReactNode;
  listCount?: number | string | null;
  onLists?: (() => void) | null;
  listsOpen?: boolean;
  q: string;
  onQ: (q: string) => void;
  searchRef: SearchRef;
  searchOpen?: boolean;
  onSearchOpen: (open: boolean) => void;
  searchLabel: string;
  trailing?: ReactNode;
  testid: string;
}) {
  const id = (part: string) => `${testid}-phone-${part}`;
  // The two rows are one top: `-phone-bar` names both, so what reads the bar (the scopes, the list, search) finds them.
  return (
    <div className="pp-top" data-testid={id("bar")}>
      <PeopleScopeTabs scope={scope} onScope={onScope} dealsOn={dealsOn} testid={id("scopes")} />
      {searchOpen || q ? (
        <PeoplePhoneSearch
          id={id}
          q={q}
          onQ={onQ}
          searchRef={searchRef}
          searchOpen={searchOpen}
          onSearchOpen={onSearchOpen}
          searchLabel={searchLabel}
        />
      ) : (
        <div className="pp-bar">
          {onLists ? (
            <button
              type="button"
              className="pp-bar-pick"
              aria-haspopup="dialog"
              aria-expanded={!!listsOpen}
              onClick={onLists}
              data-testid={id("lists")}
            >
              <span className="pp-bar-pick-words">{listLabel}</span>
              {listCount != null ? (
                <span className="pp-bar-pick-count" data-testid={id("lists-count")}>
                  {Number(listCount).toLocaleString()}
                </span>
              ) : null}
              <Icon name="chevron-down" size={11} />
            </button>
          ) : null}
          <button
            type="button"
            className="pp-bar-icon pp-bar-push"
            aria-label={searchLabel}
            onClick={() => onSearchOpen(true)}
            data-testid={id("search-open")}
          >
            <Icon name="search" size={18} />
          </button>
          {trailing}
        </div>
      )}
    </div>
  );
}

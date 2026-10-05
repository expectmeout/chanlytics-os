/**
 * The phone's top (900px and under, the band the rows and the Lists sheet use), the same for every scope of People
 * (moved whole from legacy/pages/people.jsx, decision 0015), in the Inbox's tiers under the strip of views the frame draws
 * (SurfaceTabs: the scopes are the page's views, said in its chrome, surfaces/people/chrome.ts): the row of the list
 * being shown and the scope's own last control (People's more-menu, Leads' Find, the Pipeline's +), as the Inbox's buckets
 * stand; and the search, a capsule at rest as the Inbox's is. Nothing else sits above the rows but the one line under them.
 * A press on the capsule opens the field -- full width and 16px, so a phone never zooms into it -- with Cancel beside it;
 * the list stays over it, as the Inbox's views stay over its search. Hookless: its state is the page's
 * (`searchOpen`), so the page's one keyboard listener opens it on /.
 * `listCount` (Leads') stands apart from the name and never gives way: the name is what an ellipsis shortens. With no
 * `onLists` there is no list to pick and the row draws no list button.
 */
import type { ReactNode, RefObject } from "react";
import { Icon } from "../../kit/icon/icon";

type SearchRef = RefObject<HTMLInputElement | null> | null;

/** The search: the capsule at rest, the field once opened (or while there are words in it), and Cancel to rest again. */
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
  if (!searchOpen && !q) {
    return (
      <div className="pp-lookup">
        <button
          type="button"
          className="pp-lookup-rest"
          aria-label={searchLabel}
          onClick={() => onSearchOpen(true)}
          data-testid={id("search-open")}
        >
          <Icon name="search" size={15} />
          <span>{searchLabel}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="pp-lookup is-open">
      <label className="pp-lookup-box">
        <Icon name="search" size={15} />
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
            className="pp-lookup-clear"
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
        className="pp-lookup-cancel"
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
  // The tiers are one top: `-phone-bar` names all of them, so what reads the bar (the list, search) finds them.
  return (
    <div className="pp-top" data-testid={id("bar")}>
      {onLists || trailing ? (
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
          {trailing ? <div className="pp-bar-push">{trailing}</div> : null}
        </div>
      ) : null}
      <PeoplePhoneSearch
        id={id}
        q={q}
        onQ={onQ}
        searchRef={searchRef}
        searchOpen={searchOpen}
        onSearchOpen={onSearchOpen}
        searchLabel={searchLabel}
      />
    </div>
  );
}

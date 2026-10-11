/**
 * The phone's top (900px and under, the band the rows and the Lists sheet use), the same for every scope of People
 * (moved whole from legacy/pages/people.jsx, decision 0015), in the Inbox's tiers under the strip of views the frame draws
 * (SurfaceTabs: the scopes are the page's views, said in its chrome, surfaces/people/chrome.ts): the row of the list
 * being shown and the scope's own words (People's Select, Sort and Export, Leads' and the Pipeline's own), as the Inbox's buckets
 * stand; and the search, the kit's (kit/search/search.tsx), the capsule the Inbox's list wears too. Nothing else sits
 * above the rows but the one line under them. A press on the capsule opens the field -- full width and 16px, so a phone
 * never zooms into it -- with Cancel beside it; the list stays over it, as the Inbox's views stay over its search.
 * Hookless: its state is the page's
 * (`searchOpen`), so the page's one keyboard listener opens it on /.
 * `listCount` (Leads') stands apart from the name and never gives way: the name is what an ellipsis shortens. With no
 * `onLists` there is no list to pick and the row draws no list button. `title`, while a selection is on, stands in the
 * list's place: how many are selected, beside Select all and Cancel, as a phone's mail and photos say it (Ruben, 10 Oct
 * 2026), so the dock at the foot holds the acts alone.
 */
import type { ReactNode, RefObject } from "react";
import { Icon } from "../../kit/icon/icon";
import { Search } from "../../kit/search/search";

type SearchRef = RefObject<HTMLInputElement | null> | null;

/** The words a phone's Select walks through as it is pressed (people/page/screen.tsx selectStep, leads' props). */
export const SELECT_WORDS = ["Select", "Select all", "Cancel"] as const;

/**
 * A bar word that changes as it is pressed: every one of its words drawn in one place, the one now shown and the rest at
 * no opacity, so the button keeps the width of the longest and the words cross where they stand, rather than the row
 * shifting under the thumb between Select, Select all and Cancel (Ruben, 10 Oct 2026). Only the one shown is read out.
 */
export function BarWord({ word, words }: { word: string; words: readonly string[] }) {
  return (
    <span className="pp-bar-morph">
      {words.map((w) => (
        <span key={w} data-on={w === word ? "" : undefined} aria-hidden={w === word ? undefined : true}>
          {w}
        </span>
      ))}
    </span>
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
  title = null,
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
  title?: ReactNode;
  testid: string;
}) {
  const id = (part: string) => `${testid}-phone-${part}`;
  // The tiers are one top: `-phone-bar` names all of them, so what reads the bar (the list, search) finds them.
  return (
    <div className="pp-top" data-testid={id("bar")}>
      {onLists || trailing ? (
        <div className="pp-bar">
          {title != null ? (
            <span className="pp-bar-title" aria-live="polite" data-testid={id("title")}>
              {title}
            </span>
          ) : onLists ? (
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
      <Search
        className="pp-lookup"
        rests
        label={searchLabel}
        value={q}
        onChange={onQ}
        inputRef={searchRef}
        open={searchOpen}
        onOpen={onSearchOpen}
        testid={id("search")}
      />
    </div>
  );
}

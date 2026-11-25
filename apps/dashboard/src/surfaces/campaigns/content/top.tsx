/**
 * What stands over Content's lists (page.tsx): the bar (Made or the Library, then the list's own views, Squares or List and,
 * on a phone, the search's glyph) and the find line under it, which a phone draws in the frame's top, still as the window
 * scrolls the pieces under them (kit/head/under-row.tsx); and the Library readied while Made is shown. Moved out of the
 * page with the phone polish (25 Nov 2026), which put the two in the frame's top and the page past its length.
 */
import { useEffect, type ComponentProps, type RefObject } from "react";
import {
  ADS_ROUTE,
  CONTENT_WORDS as W,
  FILE_WORDS,
  contentRouteOf,
  type ContentPageDto,
  type ContentPlace,
} from "@chanlytics/contracts";
import { aheadWhenIdle } from "@/bridge/workspace";
import { navigate } from "../../frame-verbs";
import { ListFind } from "../../kit/head/list-find";
import { UnderRow } from "../../kit/head/under-row";
import { useAdsNeeding } from "../ads/needs-you";
import { useAdsShown } from "../ads/shown";
import { BackHead, ContentFind, useLibraryHolds, type ContentFindLine, type useContentFind } from "./heads";
import {
  ContentLayoutChoice,
  ContentLists,
  ContentViewRow,
  ContentViews,
  LibraryKinds,
  weekCountOf,
  type AdsChoice,
  type ContentLayout,
  type MadeView,
} from "./views";
import { warmLibrary } from "./warm";

/** The search's glyph in a phone's bar while the find line rests: what it is called, and the press that puts the caret in it. */
interface BarGlyph {
  label: string;
  onFind: () => void;
}

/**
 * Whether Made holds nothing at all, as the tally says: nothing made, being made, waiting on the owner or set aside. Not known
 * before the page is read. The Library's is its own read's (heads.tsx WhileLibraryHolds).
 */
const madeHoldsNothing = (tally: ContentPageDto["tally"] | null): boolean =>
  !!tally && tally.made + tally.making + tally.needs + tally.aside === 0;

/** Ads among Made's views where Ads is on: amber where something in it needed the owner as the Ads page last read it. */
function useAdsChoice(): AdsChoice | null {
  const shown = useAdsShown();
  const needing = useAdsNeeding();
  return shown ? { owed: needing > 0 } : null;
}

/**
 * Whether the list is drawn as Squares or rows, the one choice for both lists: the Library once it holds a file (as its
 * coral Add waits, heads.tsx WhileLibraryHolds); Made's All, Making and Set aside while it holds anything (not its lines).
 */
const laidOutOf = (place: ContentPlace, bare: boolean, libraryHolds: boolean): boolean =>
  place.list === "library"
    ? libraryHolds
    : !bare && (place.view === "all" || place.view === "making" || place.view === "aside");

/**
 * The bar over the list: Made or the Library, then the list's own. On a phone, the search's glyph while the find line rests
 * and the views' pill, which holds Squares or List too (Ruben, 12 Nov 2026: one row as People's and the Inbox's, the glyph
 * leading what stands at its right); on a desk, Squares or List as its track, and the views a row under the bar.
 */
function ContentBar(props: {
  place: ContentPlace;
  tally: ContentPageDto["tally"] | null;
  /** Whether the workspace plans its weeks: the Week is the first tab. */
  planned: boolean;
  phone: boolean;
  layout: ContentLayout;
  choose: (layout: ContentLayout) => void;
  /** Null where the bar shows none: a desk, a list with no find line, a search that holds words. */
  glyph: BarGlyph | null;
}) {
  const { place, tally, phone, glyph } = props;
  const library = place.list === "library";
  // The Week is a list of its own: no find, no views, no Squares or List (the boards' Week 1-12).
  const week = place.list === "week";
  // Ads, the last of Made's views where it is on, is its own page at its own address (campaigns/ads), drawn in Made's place.
  const onView = (v: MadeView) =>
    navigate(v === "ads" ? ADS_ROUTE : contentRouteOf({ list: "made", view: v, open: null }));
  const ads = useAdsChoice();
  const libraryHolds = useLibraryHolds();
  // A list that holds nothing has nothing to look through: no Squares or List, no views (its first day says what to do). The
  // Library's Squares or List waits for its first file, as its coral Add does (heads.tsx WhileLibraryHolds).
  const bare = week || (!library && place.view === "all" && madeHoldsNothing(tally));
  const laidOut = laidOutOf(place, bare, libraryHolds);
  const layoutHeld = laidOut ? { value: props.layout, choose: props.choose } : null;
  return (
    <>
      <div className="cnv-bar">
        <ContentLists
          list={place.list}
          tally={tally}
          onList={(l) => navigate(contentRouteOf({ list: l, view: "all", open: null }))}
          // How many the Week holds, as it was last read: the tab reads no week of its own on Made or the Library.
          week={props.planned ? { count: weekCountOf() } : null}
        />
        <div className="cnv-bar-end">
          {glyph ? <ListFind label={glyph.label} onFind={glyph.onFind} testid="cnv-find-open" /> : null}
          {!phone && laidOut ? <ContentLayoutChoice layout={props.layout} choose={props.choose} /> : null}
          {phone && !bare ? (
            library ? (
              <LibraryKinds phone layout={layoutHeld} />
            ) : (
              <ContentViews
                view={place.view}
                tally={tally}
                onView={onView}
                layout={layoutHeld}
                planned={props.planned}
                ads={ads}
              />
            )
          ) : null}
        </div>
      </div>
      {/* A desk has the room for the five views in a row, with their counts (the content canvas, board List). */}
      {phone || bare ? null : library ? (
        <LibraryKinds phone={false} />
      ) : place.view === "aside" ? null : (
        <ContentViewRow view={place.view} tally={tally} onView={onView} planned={props.planned} ads={ads} />
      )}
      {/* Made's Set aside stands apart from its views, as the Library's does: the way back to All, and how many. */}
      {!library && place.view === "aside" ? (
        <BackHead
          said={`${W.views.name.aside} · ${tally?.aside ?? 0}`}
          back={FILE_WORDS.backToAll}
          onBack={() => onView("all")}
          testid="cnv-aside-head"
        />
      ) : null}
    </>
  );
}

/** The search's glyph in a phone's bar, where the list has a find line that holds no words; never on the Week. */
export const barGlyphOf = (at: {
  week: boolean;
  phone: boolean;
  find: ReturnType<typeof useContentFind>;
  onFind: () => void;
}): BarGlyph | null =>
  !at.week && at.phone && at.find && !at.find.about ? { label: at.find.label, onFind: at.onFind } : null;

/**
 * The bar and the find line over the list: on a phone they stand in the frame's top, still as the window scrolls the pieces
 * under them (kit/head/under-row.tsx); in the list where a piece is open over it, or another of Campaigns' views shows.
 * One search under the bar, the list's own (Made's over All, the Library's over all it keeps); none on the Week. What needs
 * the owner is each list's first group (body.tsx MadeGroups, files/library-groups.tsx).
 */
export function ContentTop(top: {
  away: boolean;
  bar: Omit<ComponentProps<typeof ContentBar>, "glyph">;
  glyph: ComponentProps<typeof ContentBar>["glyph"];
  find: {
    line: ContentFindLine | null;
    library: boolean;
    inputRef: RefObject<HTMLTextAreaElement | null> | null;
  } | null;
}) {
  const { find } = top;
  return (
    <UnderRow className="cnv-under" away={top.away}>
      <ContentBar {...top.bar} glyph={top.glyph} />
      {find ? (
        <ContentFind
          key={find.library ? "library" : "made"}
          find={find.line}
          drawn={find.inputRef ? { inputRef: find.inputRef, folds: true } : {}}
        />
      ) : null}
    </UnderRow>
  );
}

/** How long Made waits before the Library is readied: its idle moment, and at most this (Safari has none). */
const LIBRARY_AHEAD_MS = 400;

/**
 * The Library readied while Made is shown (warm.ts warmLibrary), a beat after Made's own reads: its press shows it whole.
 * Effects wait while the view is hidden (route.tsx Activity), so a Content drawn ahead readies nothing until it is shown.
 */
export function useLibraryAhead(library: boolean): void {
  useEffect(() => {
    if (library) return undefined;
    return aheadWhenIdle(() => void warmLibrary().catch(() => undefined), LIBRARY_AHEAD_MS);
  }, [library]);
}

/**
 * Whether the bar and the find line stand in the list rather than the frame's top: not on a phone, and on a phone while a
 * piece (or a planned row of the Week) is open over the list, or another of Campaigns' views shows.
 */
export const barAway = (at: { phone: boolean; shown: boolean; opened: boolean; plannedOpen: boolean }): boolean =>
  !at.phone || !at.shown || at.opened || at.plannedOpen;

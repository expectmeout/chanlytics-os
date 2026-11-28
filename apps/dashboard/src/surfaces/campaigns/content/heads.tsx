/**
 * What stands over both of Content's lists, the same on Made and on the Library (Ruben, 12 Nov 2026: one way for both): one
 * line to find by words, a head with the way back to All where a list shows what was set aside or what waits, and a quiet
 * press at the foot of All for what was set aside. What waits on the owner is each list's first group, under its heading
 * (body.tsx MadeGroups, files/library-groups.tsx), where an amber line led to it.
 *
 * And the bar over them (ContentBar: Made or the Library, the list's own views, Squares or List and, on a phone, the
 * search's glyph) with the find line under it, which a phone draws in the frame's top, still as the window scrolls the
 * pieces under them (ContentTop, kit/head/under-row.tsx); and the Library readied while Made is shown (useLibraryAhead).
 */
import { useEffect, type ComponentProps, type ReactNode, type Ref, type RefObject } from "react";
import {
  ADS_ROUTE,
  CONTENT_WORDS as W,
  FILE_WORDS,
  contentRouteOf,
  type ContentPageDto,
  type ContentPlace,
  type ContentView,
  type FilesPageDto,
} from "@chanlytics/contracts";
import { aheadWhenIdle } from "@/bridge/workspace";
import { navigate, refreshSurface } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { ListFind } from "../../kit/head/list-find";
import { UnderRow } from "../../kit/head/under-row";
import { FindWords } from "../../files/library-views";
import { showFiles, type FilesView } from "../../files/surface";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { useAdsListed, useAdsNeeding } from "../ads/needs-you";
import { useAdsShown } from "../ads/shown";
import { askContentFind } from "./surface";
import {
  ContentLayoutChoice,
  ContentLists,
  ContentViewRow,
  ContentViews,
  LibraryKinds,
  weekCountOf,
  type AdsTab,
  type ContentLayout,
} from "./views";
import { warmLibrary } from "./warm";

/** Where a list stands apart from All (what was set aside, what waits): the way back, and what it is, with how many. */
function BackHead({ said, back, onBack, testid }: { said: string; back: string; onBack: () => void; testid: string }) {
  return (
    <div className="files-shelf-head" data-testid={testid}>
      <Button size="sm" variant="quiet" onClick={onBack} data-testid={`${testid}-back`}>
        {back}
      </Button>
      <span className="files-shelf-said">{said}</span>
    </div>
  );
}

/** A quiet press at the foot of a list: what was set aside, which opens it. */
export function QuietMore({ said, onPress, testid }: { said: string; onPress: () => void; testid: string }) {
  return (
    <div className="files-more">
      <Button size="sm" variant="quiet" onClick={onPress} data-testid={testid}>
        {said}
      </Button>
    </div>
  );
}

/** The Library as it is read: what it shows, and its tally; nothing until read. */
function useLibraryView(): { view: FilesView; dto: FilesPageDto } | null {
  const held = useSurface("files");
  if (!held) return null;
  const { dto } = held;
  return { view: { shelf: dto.shelf, kind: dto.kind, about: dto.about }, dto };
}

/**
 * What stands over the Library only while it holds something: an empty Library's own page leads with its own Add photos (files
 * pane.tsx), so the head's coral Add and the Squares or List choice wait for its first file. Nothing until it is read: a coral
 * Add that vanishes as the read lands would be a press promised and taken back.
 */
export function WhileLibraryHolds({ children }: { children: ReactNode }) {
  return useLibraryHolds() ? <>{children}</> : null;
}

/** Whether the Library holds anything, as its own read says: not until it is read. */
function useLibraryHolds(): boolean {
  const held = useLibraryView();
  return !!held && held.dto.tally.total > 0;
}

/** How a find line is drawn: on a phone folded while it holds no words, its field the bar's glyph puts the caret in. */
interface FindDrawn {
  inputRef?: Ref<HTMLTextAreaElement>;
  folds?: boolean;
}

/** The find line of the list shown: the words it holds, what it is called, and what finding does. */
interface ContentFindLine {
  about: string | null;
  label: string;
  testid: string;
  onFind: (about: string | null) => void;
}

/**
 * The find line of the list shown, or null where the list draws none: Made's over All, where anything was made or a search
 * stands; the Library's over all it keeps, where it keeps anything (what waits or was set aside says where it is instead).
 * Asked once, by the page: a phone's bar shows the search's glyph while the line holds no words, as People's and the Inbox's
 * do, and the line is drawn from the same answer (ContentFind), so the two never differ.
 */
export function useContentFind(library: boolean, page: ContentPageDto | null | undefined): ContentFindLine | null {
  const files = useLibraryView();
  if (library) {
    if (!files || files.view.shelf !== "all" || files.dto.tally.total === 0) return null;
    const { view } = files;
    return {
      about: view.about,
      label: FILE_WORDS.find,
      testid: "fl-find",
      onFind: (about) => void showFiles({ ...view, about }).catch(() => undefined),
    };
  }
  if (!page || page.view !== "all" || (page.tally.made === 0 && !page.about)) return null;
  return {
    about: page.about,
    label: W.find,
    testid: "cnv-find",
    // All found by its words, read again as they change.
    onFind: (about) => {
      if (askContentFind(about)) void refreshSurface("content");
    },
  };
}

/** The one search line under the bar, the list's own (useContentFind); nothing where the list draws none. */
function ContentFind({ find, drawn = {} }: { find: ContentFindLine | null; drawn?: FindDrawn }) {
  if (!find) return null;
  return <FindWords about={find.about} onFind={find.onFind} placeholder={find.label} testid={find.testid} {...drawn} />;
}

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

/**
 * Ads beside Made and the Library where the workspace runs ads (Ruben, 25 Nov 2026), lit where `on`: how many ads its list
 * holds and amber where one needed the owner, as the Ads page last read them; its press opens Ads' own address.
 */
export function useAdsTab(on: boolean): AdsTab | null {
  const shown = useAdsShown();
  const needing = useAdsNeeding();
  const count = useAdsListed();
  return shown ? { on, count, owed: needing > 0, onPress: () => navigate(ADS_ROUTE) } : null;
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
  const onView = (v: ContentView) => navigate(contentRouteOf({ list: "made", view: v, open: null }));
  const ads = useAdsTab(false);
  const libraryHolds = useLibraryHolds();
  // Made's read is this page's own while Made is the list shown: until it lands (or fails) the tally is on its way. The
  // Library and the Week read their own, and nothing of Made's is coming there.
  const madeFailed = useSurfaceFailed("content");
  const tallyComing = !library && !week && !madeFailed;
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
          reading={tallyComing}
          onList={(l) => navigate(contentRouteOf({ list: l, view: "all", open: null }))}
          // How many the Week holds, as it was last read: the tab reads no week of its own on Made or the Library.
          week={props.planned ? { count: weekCountOf() } : null}
          ads={ads}
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
              />
            )
          ) : null}
        </div>
      </div>
      {/* A desk has the room for the five views in a row, with their counts (the content canvas, board List). */}
      {phone || bare ? null : library ? (
        <LibraryKinds phone={false} />
      ) : place.view === "aside" ? null : (
        <ContentViewRow view={place.view} tally={tally} onView={onView} planned={props.planned} />
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

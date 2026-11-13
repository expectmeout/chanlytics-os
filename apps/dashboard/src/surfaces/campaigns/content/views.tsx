/**
 * How Content's two lists are looked through, one way for both (Ruben, 12 Nov 2026): Made's five views (the content canvas,
 * "Made's five views": All, Needs you, Being made, Scheduled, Posted) and the Library's kinds (All, Photos, Videos), each with
 * how many it holds, as one caret pill on a phone and one row on a desk (ViewsPill, ViewsRow); Needs you is marked amber while
 * it holds anything. Then Made or Library, and the Squares or List both are drawn as, kept on this device for the person who
 * chose it.
 */
import { useState, useSyncExternalStore } from "react";
import {
  CONTENT_VIEWS,
  CONTENT_WORDS,
  FILE_WORDS,
  contentViewCountOf,
  type ContentList,
  type ContentTally,
  type ContentView,
} from "@chanlytics/contracts";
import { canDo } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Popover } from "../../kit/popover/popover";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { showFiles, type FilesView } from "../../files/surface";
import { useSurface } from "../../use-surface";

const VIEW_SAYS = CONTENT_WORDS.views;

/** Squares or List, the two a list is drawn as, and what the pair is called. */
const LAYOUTS = ["grid", "list"] as const;
const LAYOUT_LABEL = `${VIEW_SAYS.grid} or ${VIEW_SAYS.list}`;

/** Needs you, marked while it holds anything: amber, still. */
const Owed = ({ on }: { on: boolean }) => (on ? <span className="cnv-owed" aria-hidden="true" /> : null);

/** One way of looking at a list, with how many it holds; `owed` marks one that holds something that needs the owner. */
export interface ViewChoice<V extends string> {
  value: V;
  label: string;
  count: number | null;
  owed?: boolean;
}

/** What a views pill or row is told: its name, its choices (the first is all of it), the one picked, and what a press does. */
interface ViewsProps<V extends string> {
  label: string;
  choices: readonly ViewChoice<V>[];
  value: V;
  onChoose: (value: V) => void;
  /** The press's id, and each choice's under it (`<testid>-<value>`). */
  testid: string;
  choiceTestid: string;
  /**
   * Squares or List, under the views in the pill's card on a phone (Ruben, 12 Nov 2026: so the row holds the search's glyph,
   * as People's and the Inbox's do); null where the view draws neither (lines: Needs you, Scheduled, Posted).
   */
  layout?: LayoutHeld | null;
}

/** The layout shown, and its choice. */
interface LayoutHeld {
  value: ContentLayout;
  choose: (layout: ContentLayout) => void;
}

/** Squares or List as rows of the pill's card, after the views, each its glyph and word, the one chosen pressed. */
function LayoutRows({ layout, close }: { layout: LayoutHeld; close: () => void }) {
  return (
    <div className="cnv-views cnv-views-layout" role="group" aria-label={LAYOUT_LABEL}>
      {LAYOUTS.map((choice) => (
        <Button
          key={choice}
          size="touch"
          variant="quiet"
          className="cnv-view"
          aria-pressed={choice === layout.value}
          onClick={() => {
            close();
            layout.choose(choice);
          }}
          data-testid={`cnv-layout-${choice}`}
        >
          <Icon name={choice} size={15} />
          {VIEW_SAYS[choice]}
        </Button>
      ))}
    </div>
  );
}

/** A choice as a press: its words, Needs you's amber, and how many it holds. */
const ChoiceWords = <V extends string>({ choice }: { choice: ViewChoice<V> }) => (
  <>
    {choice.label}
    <Owed on={!!choice.owed} />
    {choice.count === null ? null : <span className="cnv-count">{choice.count}</span>}
  </>
);

/**
 * The views on a phone: one caret pill naming the one picked, on the accent's soft fill while it narrows the list (what is
 * chosen is Chanlytics' coral), and a small card under it of them all (the kit's Popover: the canvas draws a card hanging from
 * the pill, never a sheet). Made's views and the Library's kinds are this one pill.
 */
export function ViewsPill<V extends string>({
  label,
  choices,
  value,
  onChoose,
  testid,
  choiceTestid,
  layout = null,
}: ViewsProps<V>) {
  const [open, setOpen] = useState(false);
  const picked = choices.find((c) => c.value === value) ?? choices[0];
  return (
    <Popover
      label={label}
      open={open}
      onOpenChange={setOpen}
      align="end"
      size="flush"
      className="cnv-views-open"
      trigger={
        <Button size="sm" variant="glass" data-narrowed={value !== choices[0]?.value || undefined} data-testid={testid}>
          {picked?.label}
          <Icon name="chevron-down" size={12} />
        </Button>
      }
    >
      <div className="cnv-views" role="group" aria-label={label}>
        {choices.map((choice) => (
          <Button
            key={choice.value}
            size="touch"
            variant="quiet"
            className="cnv-view"
            aria-pressed={choice.value === value}
            onClick={() => {
              setOpen(false);
              onChoose(choice.value);
            }}
            data-testid={`${choiceTestid}-${choice.value}`}
          >
            <ChoiceWords choice={choice} />
          </Button>
        ))}
      </div>
      {layout ? <LayoutRows layout={layout} close={() => setOpen(false)} /> : null}
    </Popover>
  );
}

/** The views on a desk, which has the room the pill saves a phone: all of them in one row, the one picked on the soft coral. */
export function ViewsRow<V extends string>({ label, choices, value, onChoose, testid, choiceTestid }: ViewsProps<V>) {
  return (
    <div className="cnv-view-row" role="group" aria-label={label} data-testid={testid}>
      {choices.map((choice) => (
        <Button
          key={choice.value}
          size="sm"
          variant="quiet"
          aria-pressed={choice.value === value}
          onClick={() => onChoose(choice.value)}
          data-testid={`${choiceTestid}-${choice.value}`}
        >
          <ChoiceWords choice={choice} />
        </Button>
      ))}
    </div>
  );
}

/** Made's five views, each with how many it holds, Needs you marked amber while it holds anything. */
const madeChoicesOf = (tally: ContentTally | null): ViewChoice<ContentView>[] =>
  CONTENT_VIEWS.filter((v) => v !== "aside").map((v) => ({
    value: v,
    label: VIEW_SAYS.name[v],
    count: tally ? contentViewCountOf(tally, v) : null,
    owed: v === "needs" && !!tally && tally.needs > 0,
  }));

/** Made's views on a phone: the pill. A view is the page's address (`campaigns/content:<view>`), so Back returns to it. */
export function ContentViews({
  view,
  tally,
  onView,
  layout = null,
}: {
  view: ContentView;
  tally: ContentTally | null;
  onView: (view: ContentView) => void;
  layout?: LayoutHeld | null;
}) {
  // Set aside is no view of the five: it is named in the pill while it is shown, so the pill says where the list is.
  const choices: ViewChoice<ContentView>[] =
    view === "aside"
      ? [...madeChoicesOf(tally), { value: "aside", label: VIEW_SAYS.name.aside, count: tally ? tally.aside : null }]
      : madeChoicesOf(tally);
  return (
    <ViewsPill
      label={VIEW_SAYS.label}
      choices={choices}
      value={view}
      onChoose={onView}
      testid="cnv-views"
      choiceTestid="cnv-view"
      layout={layout}
    />
  );
}

/** Made's views on a desk (the content canvas, board List: "All 8 · Needs you 2 · Being made 1 · Scheduled 2 · Posted 3"). */
export function ContentViewRow({
  view,
  tally,
  onView,
}: {
  view: ContentView;
  tally: ContentTally | null;
  onView: (view: ContentView) => void;
}) {
  return (
    <ViewsRow
      label={VIEW_SAYS.label}
      choices={madeChoicesOf(tally)}
      value={view}
      onChoose={onView}
      testid="cnv-view-row"
      choiceTestid="cnv-view-row"
    />
  );
}

type LibraryKind = "all" | "photos" | "videos";
const KIND_OF: Record<LibraryKind, FilesView["kind"]> = { all: null, photos: "image", videos: "video" };

/**
 * The Library's kinds, as Made's views are (Ruben, 12 Nov 2026: beside the toggle, a pill like Made's): All, Photos, Videos,
 * each with how many, the pill on a phone and the row on a desk. Drawn over all the Library keeps where both kinds are kept,
 * since one alone is all of it; never over what waits or was set aside, which say where they are themselves.
 */
export function LibraryKinds({ phone, layout = null }: { phone: boolean; layout?: LayoutHeld | null }) {
  const held = useSurface("files");
  const dto = held?.dto;
  if (!dto || dto.shelf !== "all") return null;
  const photos = dto.tally.kept - dto.tally.videos;
  // One kind alone is all of it: a desk draws no row, and a phone's pill holds Squares or List alone, under All.
  const both = photos > 0 && dto.tally.videos > 0;
  if (!both && !(phone && layout)) return null;
  const view: FilesView = { shelf: dto.shelf, kind: dto.kind, about: dto.about };
  const value: LibraryKind = dto.kind === "image" ? "photos" : dto.kind === "video" ? "videos" : "all";
  const said = FILE_WORDS.views;
  const choices: ViewChoice<LibraryKind>[] = [
    { value: "all", label: said.all, count: dto.tally.kept },
    ...(both
      ? [
          { value: "photos" as const, label: said.photos, count: photos },
          { value: "videos" as const, label: said.videos, count: dto.tally.videos },
        ]
      : []),
  ];
  const choose = (kind: LibraryKind) => void showFiles({ ...view, kind: KIND_OF[kind] }).catch(() => undefined);
  const props = { label: FILE_WORDS.title, choices, value, onChoose: choose, choiceTestid: "fl-kind" };
  return phone ? (
    <ViewsPill {...props} testid="fl-kinds" layout={layout} />
  ) : (
    <ViewsRow {...props} testid="fl-kinds-row" />
  );
}

const CONTENT_LISTS: readonly ContentList[] = ["made", "library"];

/**
 * Content's two lists (the content redesign's stage 2): what Ask made, and the library it makes them from, which was Settings ›
 * Files, each with how many it holds ("Made 8 · Library 41", the content canvas). The kit's sub-tabs, words on a line with the
 * one shown underlined, as the Inbox's buckets stand under its strip: a second capsule under Campaigns' read as more of the
 * strip over it (Ruben, 12 Nov 2026). A pick changes the address (`campaigns/content:library`), so Back returns to the one before.
 */
export function ContentLists({
  list,
  tally,
  onList,
}: {
  list: ContentList;
  tally: ContentTally | null;
  onList: (list: ContentList) => void;
}) {
  const listSays = CONTENT_WORDS.lists;
  const countOf = (each: ContentList) => (tally ? (each === "made" ? tally.made : tally.library) : undefined);
  // What waits on the owner in a list is marked beside its name, whichever list is shown (the kit's amber dot): a post
  // that stopped was said on Made alone, and photos found online on the Library alone. The Library's are theirs to keep
  // only where they may change the business's files.
  const needOf = (each: ContentList): string | undefined => {
    if (!tally) return undefined;
    if (each === "made") return tally.needs > 0 ? listSays.madeNeeds : undefined;
    return tally.waiting > 0 && canDo("settings") ? listSays.libraryWaits : undefined;
  };
  return (
    <SubTabs
      label={listSays.label}
      className="cnv-lists"
      value={list}
      onSelect={(id) => onList(id === "library" ? "library" : "made")}
      tabs={CONTENT_LISTS.map((each) => ({
        id: each,
        label: listSays[each],
        count: countOf(each),
        need: needOf(each),
        testid: `cnv-list-${each}`,
      }))}
    />
  );
}

export type ContentLayout = "grid" | "list";

/** Where this device keeps the Grid or List a person chose. */
const LAYOUT_KEY = "chanlytics.content.layout";

/** The Grid or List chosen on this device, read from storage the first time it is asked; null where none was chosen. */
let chosenLayout: ContentLayout | null | undefined;
const layoutHeard = new Set<() => void>();

function layoutChosen(): ContentLayout | null {
  if (typeof window === "undefined") return null;
  if (chosenLayout === undefined) {
    try {
      const was = localStorage.getItem(LAYOUT_KEY);
      chosenLayout = was === "list" || was === "grid" ? was : null;
    } catch {
      // Storage refused (a private window): the device's own stands.
      chosenLayout = null;
    }
  }
  return chosenLayout;
}

const hearLayout = (tell: () => void) => {
  layoutHeard.add(tell);
  return () => layoutHeard.delete(tell);
};

/** What a device shows where nothing was chosen: a phone's rows, as its other pages are lists, and a desk's grid. */
const deviceLayout = (phone: boolean): ContentLayout => (phone ? "list" : "grid");

/** The layout a page drawn now shows: the device's choice, else the device's own (content/warm.ts). */
export const contentLayoutNow = (phone: boolean): ContentLayout => layoutChosen() ?? deviceLayout(phone);

/**
 * The Grid or List chosen on this device, and kept as it changes. Nothing chosen, a phone shows rows, as its other pages are
 * lists, and a desk the grid (Ruben, 12 Nov 2026). Read as the page is drawn, never after: read in an effect, the first draw
 * was the device's own and a chosen grid then replaced it, so Content seemed to load twice (Ruben, 12 Nov 2026), and a page
 * drawn ahead, hidden (campaigns/home/route.tsx), runs no effect until it is shown.
 */
export function useContentLayout(phone: boolean): [ContentLayout, (layout: ContentLayout) => void] {
  const kept = useSyncExternalStore(hearLayout, layoutChosen, () => null);
  const layout = kept ?? deviceLayout(phone);
  const choose = (next: ContentLayout) => {
    chosenLayout = next;
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Storage refused: kept for this visit alone.
    }
    for (const tell of layoutHeard) tell();
  };
  return [layout, choose];
}

/**
 * Grid or List on a desk: one track at the bar's end, the one chosen raised (the canvas's .ct-gl). A phone holds the two in
 * its views' pill instead (LayoutRows).
 */
export function ContentLayoutChoice({ layout, choose }: { layout: ContentLayout; choose: (l: ContentLayout) => void }) {
  return (
    <div className="cnv-layout" role="group" aria-label={LAYOUT_LABEL}>
      {LAYOUTS.map((choice) => (
        <Button
          key={choice}
          size="sm"
          variant={choice === layout ? "glass" : "quiet"}
          aria-pressed={choice === layout}
          onClick={() => choose(choice)}
          data-testid={`cnv-layout-${choice}`}
        >
          <Icon name={choice} size={13} />
          {VIEW_SAYS[choice]}
        </Button>
      ))}
    </div>
  );
}

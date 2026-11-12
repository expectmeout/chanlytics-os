/**
 * How Content's two lists are looked through, one way for both (Ruben, 12 Nov 2026): Made's five views (the content canvas,
 * "Made's five views": All, Needs you, Being made, Scheduled, Posted) and the Library's kinds (All, Photos, Videos), each with
 * how many it holds, as one caret pill on a phone and one row on a desk (ViewsPill, ViewsRow); Needs you is marked amber while
 * it holds anything. Then Made or Library, and the Squares or List both are drawn as, kept on this device for the person who
 * chose it.
 */
import { useEffect, useState } from "react";
import {
  CONTENT_VIEWS,
  CONTENT_WORDS,
  FILE_WORDS,
  contentViewCountOf,
  type ContentList,
  type ContentTally,
  type ContentView,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Popover } from "../../kit/popover/popover";
import { showFiles, type FilesView } from "../../files/surface";
import { useSurface } from "../../use-surface";

const VIEW_SAYS = CONTENT_WORDS.views;

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
export function ViewsPill<V extends string>({ label, choices, value, onChoose, testid, choiceTestid }: ViewsProps<V>) {
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
}: {
  view: ContentView;
  tally: ContentTally | null;
  onView: (view: ContentView) => void;
}) {
  return (
    <ViewsPill
      label={VIEW_SAYS.label}
      choices={madeChoicesOf(tally)}
      value={view}
      onChoose={onView}
      testid="cnv-views"
      choiceTestid="cnv-view"
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
export function LibraryKinds({ phone }: { phone: boolean }) {
  const held = useSurface("files");
  const dto = held?.dto;
  if (!dto || dto.shelf !== "all") return null;
  const photos = dto.tally.kept - dto.tally.videos;
  if (photos === 0 || dto.tally.videos === 0) return null;
  const view: FilesView = { shelf: dto.shelf, kind: dto.kind, about: dto.about };
  const value: LibraryKind = dto.kind === "image" ? "photos" : dto.kind === "video" ? "videos" : "all";
  const said = FILE_WORDS.views;
  const choices: ViewChoice<LibraryKind>[] = [
    { value: "all", label: said.all, count: dto.tally.kept },
    { value: "photos", label: said.photos, count: photos },
    { value: "videos", label: said.videos, count: dto.tally.videos },
  ];
  const choose = (kind: LibraryKind) => void showFiles({ ...view, kind: KIND_OF[kind] }).catch(() => undefined);
  const Draw = phone ? ViewsPill : ViewsRow;
  return (
    <Draw
      label={FILE_WORDS.title}
      choices={choices}
      value={value}
      onChoose={choose}
      testid={phone ? "fl-kinds" : "fl-kinds-row"}
      choiceTestid="fl-kind"
    />
  );
}

const CONTENT_LISTS: readonly ContentList[] = ["made", "library"];

/**
 * Content's two lists (the content redesign's stage 2): what Ask made, and the library it makes them from, which was Settings ›
 * Files, each with how many it holds ("Made 8 · Library 41", the content canvas). Pressed buttons on one track that change the
 * address (`campaigns/content:library`), so Back returns to the one before, the one shown raised on the track: the kit's glass
 * kind, the control layer's white over the track's grey, as the canvas draws it (.ct-seg .on).
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
  const countOf = (each: ContentList) => (tally ? (each === "made" ? tally.made : tally.library) : null);
  return (
    <div className="cnv-lists" role="group" aria-label={listSays.label} data-testid="cnv-lists">
      {CONTENT_LISTS.map((each) => (
        <Button
          key={each}
          size="sm"
          variant={each === list ? "glass" : "quiet"}
          aria-pressed={each === list}
          onClick={() => onList(each)}
          data-testid={`cnv-list-${each}`}
        >
          {listSays[each]}
          {countOf(each) === null ? null : <span className="cnv-count">{countOf(each)}</span>}
        </Button>
      ))}
    </div>
  );
}

export type ContentLayout = "grid" | "list";

/** Where this device keeps the Grid or List a person chose. */
const LAYOUT_KEY = "chanlytics.content.layout";

/**
 * The Grid or List chosen on this device, read once the page is drawn, and kept as it changes. Nothing chosen, a phone shows
 * rows, as its other pages are lists, and a desk the grid (Ruben, 12 Nov 2026).
 */
export function useContentLayout(phone: boolean): [ContentLayout, (layout: ContentLayout) => void] {
  const [kept, setKept] = useState<ContentLayout | null>(null);
  useEffect(() => {
    try {
      const was = localStorage.getItem(LAYOUT_KEY);
      if (was === "list" || was === "grid") setKept(was);
    } catch {
      // Storage refused (a private window): the device's own stands.
    }
  }, []);
  const layout = kept ?? (phone ? "list" : "grid");
  const choose = (next: ContentLayout) => {
    setKept(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Storage refused: kept for this visit alone.
    }
  };
  return [layout, choose];
}

/** Grid or List: one track, the one chosen raised, as Made or Library is (the canvas's .ct-gl); on a phone, its glyphs alone. */
export function ContentLayoutChoice({
  layout,
  choose,
  phone = false,
}: {
  layout: ContentLayout;
  choose: (l: ContentLayout) => void;
  phone?: boolean;
}) {
  return (
    <div className="cnv-layout" role="group" aria-label={`${VIEW_SAYS.grid} or ${VIEW_SAYS.list}`}>
      {(["grid", "list"] as const).map((choice) => (
        <Button
          key={choice}
          size="sm"
          variant={choice === layout ? "glass" : "quiet"}
          aria-pressed={choice === layout}
          aria-label={phone ? VIEW_SAYS[choice] : undefined}
          onClick={() => choose(choice)}
          data-testid={`cnv-layout-${choice}`}
        >
          <Icon name={choice === "grid" ? "grid" : "list"} size={phone ? 15 : 13} />
          {phone ? null : VIEW_SAYS[choice]}
        </Button>
      ))}
    </div>
  );
}

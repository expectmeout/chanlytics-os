/**
 * Made's five views (the content canvas, "Made's five views"): All, Needs you, Being made, Scheduled, Posted, each with how many
 * it holds. On a desk a row of them under the head, the one picked filled; on a phone one caret pill naming the view picked,
 * filled in ink while it narrows the list, and a menu of the five. Needs you is marked amber while it holds anything. A view is
 * the page's address (`campaigns/content:<view>`), so Back returns to it. And, on a desk, the Grid or List the pieces are drawn
 * as, kept on this device for the person who chose it.
 */
import { useEffect, useState } from "react";
import {
  CONTENT_VIEWS,
  CONTENT_WORDS,
  contentViewCountOf,
  type ContentList,
  type ContentTally,
  type ContentView,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";

const VIEW_SAYS = CONTENT_WORDS.views;

/** Needs you, marked while it holds anything: amber, still. */
const Owed = ({ on }: { on: boolean }) => (on ? <span className="cnv-owed" aria-hidden="true" /> : null);

export function ContentViews({
  view,
  tally,
  phone,
  onView,
}: {
  view: ContentView;
  tally: ContentTally | null;
  phone: boolean;
  onView: (view: ContentView) => void;
}) {
  const countOf = (v: ContentView) => (tally ? contentViewCountOf(tally, v) : null);
  if (phone)
    return (
      <Menu
        label={VIEW_SAYS.label}
        trigger={
          <Button size="sm" variant={view === "all" ? "secondary" : "ink"} data-testid="cnv-views">
            {VIEW_SAYS.name[view]}
            <Owed on={view !== "needs" && !!tally && tally.needs > 0} />
            <Icon name="chevron-down" size={12} />
          </Button>
        }
        groups={[
          {
            choose: {
              value: view,
              onChoose: (v) => {
                const picked = CONTENT_VIEWS.find((x) => x === v);
                if (picked) onView(picked);
              },
              tick: <Icon name="check" size={13} />,
              options: CONTENT_VIEWS.map((v) => ({
                value: v,
                label: VIEW_SAYS.name[v],
                hint: String(countOf(v) ?? ""),
              })),
            },
          },
        ]}
      />
    );
  return (
    <div className="cnv-views" role="group" aria-label={VIEW_SAYS.label} data-testid="cnv-views">
      {CONTENT_VIEWS.map((choice) => (
        <Button
          key={choice}
          size="sm"
          variant={choice === view ? "soft" : "quiet"}
          aria-pressed={choice === view}
          onClick={() => onView(choice)}
          data-testid={`cnv-view-${choice}`}
        >
          {VIEW_SAYS.name[choice]}
          <Owed on={choice === "needs" && !!tally && tally.needs > 0} />
          {countOf(choice) === null ? null : <span className="cnv-count">{countOf(choice)}</span>}
        </Button>
      ))}
    </div>
  );
}

const CONTENT_LISTS: readonly ContentList[] = ["made", "library"];

/**
 * Content's two lists (the content redesign's stage 2): what Ask made, and the library it makes them from, which was Settings ›
 * Files. Pressed buttons that change the address (`campaigns/content:library`), so Back returns to the one before, filled
 * in ink for the one shown: a level above Made's views, which fill softly.
 */
export function ContentLists({ list, onList }: { list: ContentList; onList: (list: ContentList) => void }) {
  const listSays = CONTENT_WORDS.lists;
  return (
    <div className="cnv-lists" role="group" aria-label={listSays.label} data-testid="cnv-lists">
      {CONTENT_LISTS.map((each) => (
        <Button
          key={each}
          size="sm"
          variant={each === list ? "ink" : "quiet"}
          aria-pressed={each === list}
          onClick={() => onList(each)}
          data-testid={`cnv-list-${each}`}
        >
          {listSays[each]}
        </Button>
      ))}
    </div>
  );
}

export type ContentLayout = "grid" | "list";

/** Where this device keeps the Grid or List a person chose. */
const LAYOUT_KEY = "chanlytics.content.layout";

/** The Grid or List chosen on this device, read once the page is drawn (a server draws the grid), and kept as it changes. */
export function useContentLayout(): [ContentLayout, (layout: ContentLayout) => void] {
  const [layout, setLayout] = useState<ContentLayout>("grid");
  useEffect(() => {
    try {
      if (localStorage.getItem(LAYOUT_KEY) === "list") setLayout("list");
    } catch {
      // Storage refused (a private window): the grid stands.
    }
  }, []);
  const choose = (next: ContentLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Storage refused: kept for this visit alone.
    }
  };
  return [layout, choose];
}

/** Grid or List, on a desk. */
export function ContentLayoutChoice({ layout, choose }: { layout: ContentLayout; choose: (l: ContentLayout) => void }) {
  return (
    <div className="cnv-layout" role="group" aria-label={`${VIEW_SAYS.grid} or ${VIEW_SAYS.list}`}>
      {(["grid", "list"] as const).map((choice) => (
        <Button
          key={choice}
          size="sm"
          variant={choice === layout ? "soft" : "quiet"}
          aria-pressed={choice === layout}
          onClick={() => choose(choice)}
          data-testid={`cnv-layout-${choice}`}
        >
          <Icon name={choice === "grid" ? "content" : "list"} size={13} />
          {VIEW_SAYS[choice]}
        </Button>
      ))}
    </div>
  );
}

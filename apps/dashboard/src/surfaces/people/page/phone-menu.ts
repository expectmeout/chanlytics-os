/**
 * What a phone's People offers beyond its bar's words (moved whole from legacy/pages/people.jsx, decision 0015). The bar
 * says Select, Sort and Export as words (screen.tsx, Ruben, 10 Oct 2026: a ⋯ hid them), and adding someone is the
 * page's act, Add people. What is left here is the two lists those words and the Lists sheet draw: the sorts a desktop's
 * headings give (a phone draws none), which Sort opens as the phone's action sheet; and the open list's own acts, which
 * a desktop does on the list's title line and a phone does at the foot of the Lists sheet.
 */
import type { Dispatch, SetStateAction } from "react";
import type { ListRule, PersonRowVM } from "@chanlytics/contracts";
import type { SavedList, SmartList } from "../types";
import { PL_LIST_EMPTY, PL_PHONE_SORTS, PL_TAB_LABEL } from "../words";
import type { ListDraft } from "../words";
import type { PeopleMenuItem } from "../menu-groups";

type Setter<T> = Dispatch<SetStateAction<T>>;

/** The sorts a phone offers, the appointments' in the workspace's word: each checked when it is the one in use. */
export function peopleSortItems({
  withCalendar,
  dealsOn,
  sortBy,
  sortDir,
  pickSort,
}: {
  withCalendar: boolean;
  dealsOn: boolean;
  sortBy: string;
  sortDir: string;
  pickSort: (by: string, dir: string) => void;
}): PeopleMenuItem[] {
  return PL_PHONE_SORTS.filter((s) => !s.needs || s.needs({ withCalendar })).map((s) => ({
    label: s.labelOf ? s.labelOf({ dealsOn }) : s.label,
    checked: sortBy === s.by && sortDir === s.dir,
    onClick: () => pickSort(s.by, s.dir),
  }));
}

/**
 * The open list's own acts, for the Lists sheet: pin it to Today; a kept list's rename, its rule and its deletion; or
 * what is shown kept as a list. None for a view with nothing of its own to do.
 */
export function peopleListActs({
  canEditLists,
  shown,
  canPin,
  pinned,
  togglePin,
  activeSaved,
  setListDraft,
  setListAct,
  filtered,
  viewRule,
  activeList,
  tab,
}: {
  canEditLists: boolean;
  shown: readonly PersonRowVM[];
  canPin: boolean;
  pinned: boolean;
  togglePin: () => Promise<void>;
  activeSaved: SavedList | null;
  setListDraft: Setter<ListDraft>;
  setListAct: Setter<string | null>;
  filtered: boolean;
  viewRule: ListRule | null;
  activeList: SmartList | null;
  tab: string;
}): PeopleMenuItem[] {
  return [
    ...(canPin
      ? [{ label: pinned ? "Take off Today" : "Pin to Today", icon: "pin", onClick: () => void togglePin() }]
      : []),
    ...(activeSaved && canEditLists
      ? [
          {
            label: "Rename this list",
            icon: "edit",
            onClick: () => {
              setListDraft({ ...PL_LIST_EMPTY, name: activeSaved.name });
              setListAct("rename");
            },
          },
          // A smart list's rule, shown and changed: the phone draws no title line to show it on.
          ...(activeSaved.rule
            ? [
                {
                  label: "Who is on it",
                  icon: "sparkle",
                  onClick: () => {
                    setListDraft(PL_LIST_EMPTY);
                    setListAct("rule");
                  },
                },
              ]
            : []),
          {
            label: "Delete this list…",
            icon: "x",
            danger: true,
            onClick: () => {
              setListDraft(PL_LIST_EMPTY);
              setListAct("delete");
            },
          },
        ]
      : []),
    ...(!activeSaved && filtered && (shown.length > 0 || viewRule) && canEditLists
      ? [
          {
            label: shown.length ? `Save these ${shown.length} as a list` : "Keep this list as yours",
            icon: "filter",
            onClick: () => {
              setListDraft({
                ...PL_LIST_EMPTY,
                name: activeList ? activeList.label : tab !== "all" ? (PL_TAB_LABEL[tab] ?? "") : "",
              });
              setListAct("save");
            },
          },
        ]
      : []),
  ];
}

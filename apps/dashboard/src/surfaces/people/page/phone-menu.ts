/**
 * People's more-menu on a phone, the bar's last control (moved whole from legacy/pages/people.jsx, decision 0015): the
 * acts a desktop spreads over its controls row and a list's title line. Add a person; the sorts a desktop's headings give
 * (a phone draws none); everyone as a file; and with a list open, that list's own acts.
 */
import type { Dispatch, SetStateAction } from "react";
import type { ListRule, PersonRowVM } from "@chanlytics/contracts";
import { gate } from "../../legacy-verbs";
import type { SavedList, SmartList } from "../types";
import { PL_ADD_EMPTY, PL_LIST_EMPTY, PL_PHONE_SORTS, PL_TAB_LABEL } from "../words";
import type { AddDraft, ListDraft } from "../words";
import type { MoreMenuItem } from "../../kit/more-menu/more-menu";

type Setter<T> = Dispatch<SetStateAction<T>>;

export function peoplePhoneMenu({
  canEditLists,
  canExport,
  shown,
  setSelectMode,
  setAddDraft,
  setAddOpen,
  setImportOpen,
  withCalendar,
  sortBy,
  sortDir,
  pickSort,
  exportBlocked,
  exportName,
  exportHref,
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
  canExport: boolean;
  shown: readonly PersonRowVM[];
  setSelectMode: Setter<boolean>;
  setAddDraft: Setter<AddDraft>;
  setAddOpen: Setter<boolean>;
  setImportOpen: Setter<boolean>;
  withCalendar: boolean;
  sortBy: string;
  sortDir: string;
  pickSort: (by: string, dir: string) => void;
  exportBlocked: string | null;
  exportName: string | null;
  exportHref: string;
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
}): MoreMenuItem[] {
  return [
    // A selection begun from here, with nobody picked yet, for whoever a selection could do something for.
    ...((canEditLists || canExport) && shown.length > 0
      ? [{ label: "Select people", icon: "check", onClick: () => setSelectMode(true) }]
      : []),
    ...(canEditLists
      ? [
          {
            label: "Add a person",
            icon: "plus",
            onClick: () => {
              setAddDraft(PL_ADD_EMPTY);
              setAddOpen(true);
            },
          },
        ]
      : []),
    // A client list as a file, for the owner (the import door is the owner's, as the export is).
    ...(canExport
      ? [{ label: "Import people", icon: "download", meta: "CSV", onClick: () => setImportOpen(true) }]
      : []),
    { header: "Sort" },
    ...PL_PHONE_SORTS.filter((s) => !s.needs || s.needs({ withCalendar })).map((s) => ({
      label: s.label,
      checked: sortBy === s.by && sortDir === s.dir,
      onClick: () => pickSort(s.by, s.dir),
    })),
    // The route's file of everyone: a download (it answers as an attachment), so the page stays where it is.
    ...(!exportBlocked
      ? [
          { divider: true },
          {
            label: exportName ? `Export ${exportName}` : "Export everyone",
            icon: "external",
            meta: "CSV",
            onClick: () => window.location.assign(exportHref),
            ...(canExport ? {} : { gate: gate("export") }),
          },
        ]
      : []),
    ...(canPin
      ? [
          { divider: true },
          { label: pinned ? "Take off Today" : "Pin to Today", icon: "pin", onClick: () => void togglePin() },
        ]
      : []),
    ...(activeSaved && canEditLists
      ? [
          { divider: true },
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
          { divider: true },
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

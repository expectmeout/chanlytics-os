/**
 * The shapes People's page passes between its parts: what the People surface says before it has landed, the toast's
 * flash, a table's columns and what a cell draws from, a selection's list. The surface's own value is
 * surface.ts `PeopleSurface`; a row is contracts' `PersonRowVM`.
 */
import type { ReactElement, ReactNode } from "react";
import type { PeopleAggregates, PersonRowVM } from "@chanlytics/contracts";
import type { PeopleSurface } from "./surface";
import type { ColumnWidth } from "./table/layout";

/** A smart list of People's, as the surface holds it. */
export type SmartList = PeopleSurface["lists"][number];
/** A list kept by hand or by a rule, as the surface holds it. */
export type SavedList = PeopleSurface["saved"][number];

/**
 * What a page reads of People: the surface once it has landed, else what a scope has before its surface does (People's
 * route waits for People and Leads' for Leads, so the other scope's surface may not be read yet). Only the parts the
 * rail's switch and the hooks need are certain; the rest is read where it is there.
 */
export type PeopleRead = Pick<PeopleSurface, "rows" | "lists" | "saved" | "views" | "attention" | "savedRead"> & {
  aggregates: Pick<PeopleAggregates, "total" | "needsYou" | "reachedWeek"> & Partial<PeopleAggregates>;
} & Partial<Omit<PeopleSurface, "rows" | "lists" | "saved" | "aggregates" | "views" | "attention" | "savedRead">>;

/** What the shell's one toast takes: its words, a tone, and an Undo. */
export interface PeopleFlash {
  tone?: string;
  msg: ReactNode;
  /** As the shell's own flash has it (legacy-verbs.ts LegacyFlash): null where a refusal offers no undo. */
  undo?: (() => unknown) | null;
}
export type Flash = (flash: PeopleFlash) => void;

/** A row the table can draw: People's person, or Leads' lead. */
export interface TableRow {
  id: string;
  name: string;
}

/** What a cell draws from besides its row: the doors the table warms a person through. */
export interface TableCtx {
  onWarm?: (id: string) => void;
}

/** What a column's default depends on: `{ withCalendar }` under People, `{ hasCenter }` under Leads. */
export interface ColCtx {
  withCalendar?: boolean;
  dealsOn?: boolean;
  hasCenter?: boolean;
}

/** What a row's face says of the selection it is in: a selection under way (`choose`), this row in it (`chosen`), or none. */
export type RowPick = "choose" | "chosen" | undefined;

/**
 * One column, declared once: its heading, whether it sorts and how, what it asks of the table's room, whether a member
 * may hide it, how its cell is drawn from a row, and what it says in an export. Nothing about a column is a class on its
 * cell or a switch elsewhere: the sort, the width and the file all read this.
 */
export interface TableColumn<R extends TableRow = TableRow, X extends TableCtx = TableCtx> {
  key: string;
  label: ReactNode;
  /** The heading, where it is the workspace's word (the appointments column): read with what the workspace is, over `label`. */
  labelOf?: (x: ColCtx) => string;
  sortable: boolean;
  /** Which way the first press on its heading goes: `"asc"`, or by default the most first (`"desc"`). */
  sortFirst?: "asc" | "desc";
  /** What a row sorts by under this heading, where the page sorts the rows itself; a text is compared as words, in order. */
  sortValue?: (p: R, dir: string) => number | string;
  pinned?: boolean;
  fixed?: boolean;
  on?: boolean | ((x: ColCtx) => boolean);
  needs?: (x: ColCtx) => boolean;
  /** What it asks of the room (table/layout.ts); a column that says nothing is 120px and stays so. */
  width?: ColumnWidth;
  /** A number or a count sits against the column's right edge, its heading with it. */
  align?: "end";
  /** What the heading means, in a line: its tip, for a name that does not say it. */
  hint?: string;
  /**
   * What it says in a file of the people shown: the heading and the cell's words. A column with none is not in the file.
   * `headOf` is the file's heading where it is the workspace's word, read with what the workspace is, as `labelOf` is.
   */
  csv?: { head: string; headOf?: (x: ColCtx) => string; cell: (p: R) => string };
  /** The cell, from the row, what the page knows, and (a card's) where the row stands in a selection. */
  cell: (p: R, x: X, pick?: RowPick) => ReactElement<{ className?: string }>;
}

/** People's cell context: the booking link, each row's words, the list open for taking people off, their lists, and which columns show. */
export interface PeopleCellCtx extends TableCtx {
  bookingLink: string | null;
  attention: PeopleSurface["attention"] | null | undefined;
  onOpen: (id: string) => void;
  onWarm: (id: string) => void;
  drop: { list: SavedList; onDrop: (person: PersonRowVM) => void } | null;
  listsOf: Record<string, string[]>;
  shows: Record<string, boolean>;
}

/** One item of a table's empty state. */
export interface TableEmpty {
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void } | null;
}

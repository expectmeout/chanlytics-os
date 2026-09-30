/**
 * The shapes People's page passes between its parts: what the People surface says before it has landed, the toast's
 * flash, a table's columns and what a cell draws from, a selection's list. The surface's own value is
 * surface.ts `PeopleSurface`; a row is contracts' `PersonRowVM`.
 */
import type { ReactElement, ReactNode } from "react";
import type { PeopleAggregates, PersonRowVM } from "@chanlytics/contracts";
import type { PeopleSurface } from "./surface";

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
  undo?: () => void | Promise<void>;
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

/** One column: its heading, whether it sorts, whether a member may hide it, and how its cell is drawn from a row. */
export interface TableColumn<R extends TableRow = TableRow, X extends TableCtx = TableCtx> {
  key: string;
  label: ReactNode;
  sortable: boolean;
  pinned?: boolean;
  fixed?: boolean;
  on?: boolean | ((x: ColCtx) => boolean);
  needs?: (x: ColCtx) => boolean;
  off?: boolean;
  cell: (p: R, x: X) => ReactElement<{ className?: string }>;
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

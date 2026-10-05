/**
 * What a lead's cell draws from besides its row (moved from legacy/pages/leads-real.jsx leadCellCtxFor, decision 0015): the
 * page's doors behind one context that holds still, and the few values a cell's drawing depends on.
 */
import type { PersonRowVM } from "@chanlytics/contracts";
import type { MenuHandle } from "../../kit/menu/menu";
import type { TableCtx } from "../../people/types";
import type { ReachOutLines } from "../reach-out/lines";

/** The cell context of the Leads scope (the page's `cellCtxLeads`): doors to the page's latest acts, and what a cell reads. */
export interface LeadCellCtx extends TableCtx {
  onOpen: (id: string) => void;
  onExpand: (id: string) => void;
  /** Values ⁄ Signals: the number and the address in the row. */
  values: boolean;
  /** Whether the open search's fits differ, which is when a row wears its fit. */
  mixedFits: boolean;
  /** Whether a search names a centre, which is when Distance may be shown. */
  hasCenter: boolean;
  canFind: boolean;
  /** People's rows, for a converted lead's Client pill (0004). */
  peopleRows: readonly PersonRowVM[];
  /** Whether the Stage column is drawn: then the name's tag gives way where the column says the same. */
  stageShown: boolean;
  /** The open search's reach-out lines (Reach out Part 6, H8), or null. */
  reachOut: ReachOutLines | null;
  onCall: (id: string) => void;
  onCopy: (id: string) => void;
  onCopyPhone: (id: string) => void;
  onLogCall: (id: string) => void;
  onWarm: (id: string) => void;
  onKeep: (id: string) => void;
  onExclude: (id: string) => void;
  onPutBack: (id: string) => void;
  /** What ties each row's Call to the one menu the rows share (call-menu.tsx LeadRowsCallMenu), made once by the page. */
  callMenu: LeadCallHandle;
  /** Under a group's own heading on a phone (Needs review's sections): the reason is said once, above. */
  sectioned?: boolean;
}

/** The three ways of calling a lead, each a door of the page's. */
export interface CallActs {
  onCall: (id: string) => void;
  onCopyPhone: (id: string) => void;
  onLogCall: (id: string) => void;
}

/** What a row's Call carries to the menu the rows share: the lead, its name, and its number as a person reads it. */
export interface LeadCallPayload {
  id: string;
  name: string;
  number: string | null;
}
export type LeadCallHandle = MenuHandle<LeadCallPayload>;

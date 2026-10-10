/**
 * Campaigns' ledger, as the page narrows it (spec 2026-10-09 §4.3, §4.4; decisions 7, 8, 15 and 16): the status a tab
 * picks, the group the address names (`campaigns/in:<group>`), the words searched for, the order, and whether the rows
 * stand in their groups. The status, the words, the order and the grouping are the page's own and reset on reload; the
 * group is the address's, replaced as it changes and kept while a sheet stands (use-home.ts useKeptGroup).
 *
 * `ledgerViewOf` is the decision, pure, over the view model's groups (contracts LifecycleLedger): which groups and rows
 * the screen shows, in which order, and how many of how many. `useLedgerView` holds the page's state around it, once, in
 * the page (home-page.tsx), where Ask's door reads `visibleRows`: what the screen shows, in order.
 *
 * Under seven rows (`ledger.tools` false) there is no tool line, so only the group narrows the list: the status is All,
 * nothing is searched, the order is Next and the rows stand in their groups. A phone holds one choice (a group or a
 * status, never both), sorts by Next and keeps the groups; a desk composes a card and a tab.
 */
import { useState } from "react";
import { isLedgerCampaign, ledgerOrder, ledgerRowIn } from "@chanlytics/contracts";
import type { LedgerSort, LedgerStatus, LifecycleGroup, LifecycleLedger, LifecycleRow } from "@chanlytics/contracts";

/** Whether the rows stand under their groups' heads, or as one list in the order chosen. */
export const LEDGER_GROUPINGS = ["moment", "none"] as const;
export type LedgerGrouping = (typeof LEDGER_GROUPINGS)[number];

/** What the page asks of the ledger. */
interface LedgerAsk {
  status: LedgerStatus;
  group: string | null;
  query: string;
  sort: LedgerSort;
  grouping: LedgerGrouping;
  /**
   * A row decided where it stands (approved, skipped, resumed): it stays shown under the filter it was decided in, its
   * state changed in place, until the filter changes (spec §4.3: it does not leave from under the pointer). It is sorted
   * with the rest, so its new state may move it within its group.
   */
  keep?: string | null;
}

/** What the screen shows. */
interface LedgerShown {
  /** The groups drawn, each with the rows it shows, in order; none where the rows do not stand in groups. */
  groups: readonly LifecycleGroup[];
  /** Every row drawn, in the order the screen shows them. */
  rows: readonly LifecycleRow[];
  /** Whether the rows stand under their groups' heads. */
  grouped: boolean;
  /** The group the address names, where the ledger holds it. */
  chosen: LifecycleGroup | null;
  /**
   * How many campaigns the ledger holds, and how many of them are shown: the All tab's count (contracts isLedgerCampaign),
   * so "Showing 7 of 19" and "Search 19 campaigns" say one number. The receptionist and the call's text are drawn, not
   * counted; whether anything is drawn is `rows`.
   */
  total: number;
  shown: number;
  /** Whether anything narrows the list: a status but All, a group, words searched. */
  filtered: boolean;
}

/** Whether a row answers the words searched: its own words for a search (the view model's `search`), any case. */
const rowAnswers = (r: LifecycleRow, words: string): boolean => words === "" || r.search.toLowerCase().includes(words);

/**
 * A group's rows in the order chosen: its own rows that are no campaign (First contact's receptionist and the call's
 * text) first, as the view model ordered them (lifecycle-ledger.ts journeyGroup), then its campaigns, sorted.
 */
const groupInOrder = (rows: readonly LifecycleRow[], order: (a: LifecycleRow, b: LifecycleRow) => number) => [
  ...rows.filter((r) => !isLedgerCampaign(r)),
  ...rows.filter(isLedgerCampaign).sort(order),
];

/** The ledger as the screen shows it, for what the page asks. */
export function ledgerViewOf(ledger: LifecycleLedger, ask: LedgerAsk): LedgerShown {
  const words = ask.query.trim().toLowerCase();
  const chosen = ledger.groups.find((g) => g.id === ask.group) ?? null;
  const filtered = ask.status !== "all" || chosen !== null || words !== "";
  // The order is contracts' one (lifecycle-ledger.ts ledgerOrder): Next is a run waiting, then what runs by its time,
  // then what does not, paused last; ties by name.
  const order = ledgerOrder(ask.sort);
  const keep = (r: LifecycleRow) => r.id === ask.keep || (ledgerRowIn(r, ask.status) && rowAnswers(r, words));
  const groups = ledger.groups
    .filter((g) => chosen === null || g.id === chosen.id)
    .map((g) => ({ ...g, rows: groupInOrder(g.rows.filter(keep), order) }))
    // Under All an empty moment stands with its Turn on (decision 16); under a filter a group with no row is not drawn.
    .filter((g) => g.rows.length > 0 || (!filtered && g.add !== null));
  const total = ledger.groups.reduce((n, g) => n + g.rows.filter(isLedgerCampaign).length, 0);
  const inGroups = groups.flatMap((g) => g.rows);
  const shown = inGroups.filter(isLedgerCampaign).length;
  if (ask.grouping === "moment") {
    return { groups, rows: inGroups, grouped: true, chosen, total, shown, filtered };
  }
  const rows = [...inGroups].sort(order);
  return { groups: [], rows, grouped: false, chosen, total, shown, filtered };
}

/** Where the group lives and how it changes (the address's, replaced: home-page.tsx), and whether this is a phone. */
interface LedgerAt {
  group: string | null;
  onGroup: (group: string | null) => void;
  phone: boolean;
  /** The row just decided where it stands, which stays shown. */
  keep?: string | null;
}

/** What the page holds of the ledger, and how it changes it. */
export interface LedgerView extends LedgerShown {
  status: LedgerStatus;
  /** The group shown alone, where the ledger holds the one the address names. */
  group: string | null;
  query: string;
  sort: LedgerSort;
  grouping: LedgerGrouping;
  /** The groups the screen shows, in order. */
  visibleGroups: readonly LifecycleGroup[];
  /** The rows the screen shows, in order: what the keys walk, and the rows Ask is told (the first forty). */
  visibleRows: readonly LifecycleRow[];
  setStatus: (status: LedgerStatus) => void;
  setGroup: (group: string | null) => void;
  setQuery: (query: string) => void;
  setSort: (sort: LedgerSort) => void;
  setGrouping: (grouping: LedgerGrouping) => void;
  /** Escape: the words searched go first, then the filter (the status and the group). */
  clearOne: () => void;
  /** Clear: every narrowing at once. */
  clearAll: () => void;
}

/** The page's ledger: its state, what it shows, and the presses that change it. */
export function useLedgerView(ledger: LifecycleLedger, at: LedgerAt): LedgerView {
  const [status, setStatus] = useState<LedgerStatus>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LedgerSort>("next");
  const [grouping, setGrouping] = useState<LedgerGrouping>("moment");
  const tools = ledger.tools;
  const ask: LedgerAsk = {
    status: tools ? status : "all",
    group: at.group,
    query: tools ? query : "",
    sort: tools && !at.phone ? sort : "next",
    grouping: tools && !at.phone ? grouping : "moment",
    keep: at.keep ?? null,
  };
  const shown = ledgerViewOf(ledger, ask);
  const group = shown.chosen ? shown.chosen.id : null;
  // A phone holds one choice: a status lets go of the group, a group lets go of the status.
  const pickStatus = (next: LedgerStatus) => {
    setStatus(next);
    if (at.phone && group !== null) at.onGroup(null);
  };
  const pickGroup = (next: string | null) => {
    if (at.phone) setStatus("all");
    at.onGroup(next);
  };
  const clearAll = () => {
    setQuery("");
    setStatus("all");
    if (group !== null) at.onGroup(null);
  };
  const clearOne = () => {
    if (ask.query !== "") setQuery("");
    else clearAll();
  };
  return {
    ...shown,
    status: ask.status,
    group,
    query: ask.query,
    sort: ask.sort,
    grouping: ask.grouping,
    visibleGroups: shown.groups,
    visibleRows: shown.rows,
    setStatus: pickStatus,
    setGroup: pickGroup,
    setQuery,
    setSort,
    setGrouping,
    clearOne,
    clearAll,
  };
}

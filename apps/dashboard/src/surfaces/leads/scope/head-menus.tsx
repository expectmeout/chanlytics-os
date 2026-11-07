/**
 * What a desk's Leads table takes from the page beyond its rows (the table review of 5 Nov 2026): the queue's heads while
 * the view is sorted by Stage, a heading's menu (Stage's status groups, Reach's two switches, each with Hide column, where
 * the Filter button stood), and the foot: what the view holds, a filter that is on, and the way out of it. The counts are
 * the read's (00552 lead_view_counts); where it did not say them, nothing is said.
 */
import {
  LEAD_HEADING_WORDS,
  LEAD_STATUS_GROUPS,
  LEAD_STATUS_GROUP_WORDS,
  leadReachWord,
  type LeadReachFilter,
  type LeadRowVM,
  type LeadStatusGroup,
  type LeadViewCountsDto,
} from "@chanlytics/contracts";
import { leadFootOf, leadGroupOf } from "../row-status";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import type { MenuGroup } from "../../kit/menu/menu";
import type { HeadingMenu } from "../../kit/table/head";
import type { TableState } from "../../kit/table/state";
import { leadReachGroup } from "./controls";

type StatusCounts = LeadViewCountsDto["status_groups"] | null | undefined;

/** The status groups as the kit's Menu takes them: rows on a desk, chips on a line in a phone's sheet. */
export const leadStatusGroupMenu = (
  groups: readonly LeadStatusGroup[],
  onToggle: (group: string) => void,
  counts: StatusCounts,
  chips: boolean,
): MenuGroup => ({
  caption: LEAD_HEADING_WORDS.caption,
  toggles: {
    onToggle,
    tick: <Icon name="check" size={13} />,
    chips,
    items: LEAD_STATUS_GROUPS.map((g) => ({
      value: g,
      label: LEAD_STATUS_GROUP_WORDS[g],
      on: groups.includes(g),
      ...(counts ? { hint: String(counts[g]) } : {}),
    })),
  },
});

/** A heading's menu ends in Hide column: what the Columns menu does, where the column stands. */
const hideOf = (table: Pick<TableState, "toggleColumn">, key: string): MenuGroup => ({
  items: [{ label: LEAD_HEADING_WORDS.hide, onSelect: () => table.toggleColumn(key) }],
});

/** The menus a desk's headings wear. A filter stays on if its column is hidden: the foot says so, with the way out. */
export const leadHeadMenus = (p: {
  table: Pick<TableState, "toggleColumn">;
  statusGroups: readonly LeadStatusGroup[];
  onStatusGroup: (group: string) => void;
  statusCounts: StatusCounts;
  reach: readonly LeadReachFilter[];
  onReach: (filter: string) => void;
}): Record<string, HeadingMenu> => ({
  stage: {
    active: p.statusGroups.length > 0,
    groups: [leadStatusGroupMenu(p.statusGroups, p.onStatusGroup, p.statusCounts, false), hideOf(p.table, "stage")],
  },
  reach: {
    active: p.reach.length > 0,
    groups: [leadReachGroup(p.reach, p.onReach, false), hideOf(p.table, "reach")],
  },
});

/**
 * Which head a row stands under, where the view is the queue: sorted by Stage, as the read answered it, on a desk's view
 * of the leads and not of a review's. None draws no heads, as for any other sort.
 */
export const leadQueueGroupOf = (
  surface: { view: { sort: string; cls: unknown }; viewCounts: Partial<LeadViewCountsDto> | null },
  at: { phone: boolean },
): ((l: LeadRowVM) => ReturnType<typeof leadGroupOf>) | null => {
  const ofAClass = surface.view.cls && surface.view.cls !== "qualified";
  if (at.phone || surface.view.sort !== "stage" || ofAClass) return null;
  const counts = surface.viewCounts?.status_groups ?? null;
  return (l) => leadGroupOf(l, counts);
};

/**
 * The table's foot: what the view holds after its count, and at its end a heading's filter that is on, however its menu
 * was left (closed, or its column hidden), with the way out. Clear filters here clears those alone: the rail's list stays.
 */
export const leadsFootOf = (p: {
  surface: { viewCounts: Partial<LeadViewCountsDto> | null };
  statusGroups: readonly LeadStatusGroup[];
  reach: readonly LeadReachFilter[];
  onClearHeadings: () => void;
}) => {
  const on = [
    ...(p.reach.length ? [leadReachWord(p.reach)] : []),
    ...p.statusGroups.map((g) => LEAD_STATUS_GROUP_WORDS[g]),
  ];
  return {
    words: leadFootOf(p.surface.viewCounts),
    end: on.length ? (
      <span>
        {on.join(" · ")}
        {" · "}
        <LinkButton onClick={p.onClearHeadings} data-testid="leads-clear-headings">
          {LEAD_HEADING_WORDS.clear}
        </LinkButton>
      </span>
    ) : null,
  };
};

/**
 * The desk's controls at the right of the search (moved from legacy/pages/leads-scope.jsx, decision 0015): the Filter, the
 * map, Values ⁄ Signals, which columns show and the file, as words beside Columns (the ⋯ that folded them is gone). The page's acts, Reach out's door and Ask's (spec F1: the three's still mark, never a second live
 * canvas), stand at the right of the strip over the list, as People's Add a person does (`LeadsActs`).
 */
import type { ReactNode } from "react";
import { LEAD_REACH_FILTERS, LEAD_REACH_WORDS, leadReachWord, type LeadReachFilter } from "@chanlytics/contracts";
import { ActWords } from "../../kit/head/act-words";
import { useStanding } from "../../kit/head/standing";
import { Icon } from "../../kit/icon/icon";
import { Button } from "../../kit/button/button";
import { Menu } from "../../kit/menu/menu";
import { gate } from "../../legacy-verbs";
import type { ColumnOption } from "../../people/table/columns";
import type { TableLayout } from "../../people/table/use-layout";
import { PeopleColumnsMenu } from "../../people/table/columns-menu";

interface ControlsProps {
  canExport: boolean;
  /** The press that exports the view as a file: a POST that saves it (page/acts.tsx exportLeads), not a link. */
  onExport: () => void;
  mapOpen: boolean;
  onMap: (on: boolean) => void;
  values: boolean;
  onValues: (on: boolean) => void;
  reach: readonly LeadReachFilter[];
  onReach: (filter: string) => void;
  colOptions: readonly ColumnOption[];
  onPickColumn: (key: string) => void;
  layout: TableLayout | null;
}

/**
 * The page's act on a desk, said to the frame's head (people/rail/standing.tsx): Find leads (Ruben, 6 Oct 2026: it stood
 * in the controls row, inside the pane). A search's leads go to a sequence by Add, on each lead or many at once (the
 * lead-to-sequence canvas's one road): the head has no door of its own to a sequence.
 */
export const LeadsActs = ({ canFind, onFind }: { canFind: boolean; onFind: () => void }) => (
  <>
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() => onFind()}
      data-testid="leads-find"
      {...(canFind ? {} : gate("find", "find leads"))}
    >
      <ActWords icon={<Icon name="three" size={12} />} words="Find leads" />
    </button>
  </>
);

/**
 * Leads' head where no standing line is drawn: People's name, and the act it is handed. A desk says its standing with its
 * line (people/rail/standing.tsx) and Find leads beside it; a phone drew no line and said nothing, so the frame named the
 * page from its crumbs and it had no act (Ruben, 7 Oct 2026).
 *
 * A phone's act is Import leads (reach-out/lists.tsx `importAct`), on the first day too: the door that brings leads in,
 * as People's is Add a person and the Pipeline's New proposal, each at the right of the row of views. Find leads is Ask
 * on a phone, whose circle stands over every page (spec F1), and the first day's own door. A desk's first day says the
 * name alone: the page's door is the one press there, and "0 leads · 0 ready · 0 searches" is no standing to say. Draws
 * nothing of its own.
 */
export const LeadsHead = ({ act }: { act?: ReactNode }) => {
  useStanding({ title: "People", back: null, act });
  return null;
};

/**
 * The Filter (Ruben, 30 Oct 2026: "a specific email list to send a sequence to vs a call list"): only the leads with a
 * checked email, a checked phone, or both, as the Reach column says Checked. The kit's switches, as Columns draws them,
 * the menu open while each is flipped; its word says what is on, as Map and Values say the view they show. The phone's is
 * the same two switches in its Sort sheet (phone-bar.tsx).
 */
const LeadsFilterMenu = ({
  reach,
  onReach,
}: {
  reach: readonly LeadReachFilter[];
  onReach: (filter: string) => void;
}) => (
  <Menu
    label={LEAD_REACH_WORDS.none}
    groups={[leadReachGroup(reach, onReach, false)]}
    trigger={
      <Button variant="quiet" size="sm" data-tip={LEAD_REACH_WORDS.header} data-testid="leads-filter">
        {leadReachWord(reach)}
      </Button>
    }
  />
);

/** The Filter's switches as the kit's Menu takes them: rows on a desk, chips on a line in a phone's sheet. */
export const leadReachGroup = (
  reach: readonly LeadReachFilter[],
  onReach: (filter: string) => void,
  chips: boolean,
) => ({
  header: LEAD_REACH_WORDS.header,
  caption: LEAD_REACH_WORDS.caption,
  toggles: {
    onToggle: onReach,
    tick: <Icon name="check" size={13} />,
    chips,
    items: LEAD_REACH_FILTERS.map((f) => ({ value: f, label: LEAD_REACH_WORDS[f], on: reach.includes(f) })),
  },
});

export const LeadsControlsRight = ({ p }: { p: ControlsProps }) => {
  // Export: a role that may not keeps the button and says why at it (gate's props come last, so its handler is the one that runs).
  const exportPress = p.canExport
    ? {
        "data-tip": "Download these leads as a CSV file",
        onClick: p.onExport,
      }
    : { onClick: () => undefined, ...gate("export", "export these leads") };
  return (
    <div className="cl-controls-right">
      <LeadsFilterMenu reach={p.reach} onReach={p.onReach} />
      <PeopleColumnsMenu options={p.colOptions} onPick={p.onPickColumn} layout={p.layout} rowHeight={false} />
      {/* The map, Values / Signals and the file stand beside Columns as words, as People's Import and Export do (the ⋯ that
          folded them away is gone, Ruben, 9 Oct 2026). */}
      <div className="pl-file-acts">
        <Button
          variant="quiet"
          size="sm"
          data-tip="See these leads on the ground"
          onClick={() => p.onMap(!p.mapOpen)}
          data-testid="leads-map-toggle"
        >
          {p.mapOpen ? "Table" : "Map"}
        </Button>
        <Button
          variant="quiet"
          size="sm"
          data-tip="Show the numbers and addresses in the rows"
          onClick={() => p.onValues(!p.values)}
          data-testid="leads-values-toggle"
        >
          {p.values ? "Signals" : "Values"}
        </Button>
        <Button variant="quiet" size="sm" data-testid="leads-export" {...exportPress}>
          Export
        </Button>
      </div>
    </div>
  );
};

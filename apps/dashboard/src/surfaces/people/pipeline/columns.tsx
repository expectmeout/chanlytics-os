/**
 * The Pipeline's table (docs/decisions/0008-a-proposal-is-part-of-the-deal.md), moved from the top of
 * legacy/pages/pipeline-scope.jsx (decision 0015): its columns, People's own person cell first, then the deal's service,
 * its value in tabular figures, where it stands (its steps, `track`, and how long it has stood there), where they came
 * from and the day a proposal stands until (a member shows those two with Columns), its one chip, whose heading only a
 * screen reader hears (the house's .rec-sr: no one word is right for "Fri 2:00 PM" and "Since Sep 18" alike), and the
 * row's own menu. Their next step (0007, amended) stands after Stage: what, then when, the day in the warn ink once it
 * has come. Person, Value, Stage and Next step sort within each group (contracts pipelineSorted); Stage is the
 * Pipeline's own order, as the page opens. And a row on a phone: People's card.
 */
import type { PipelineRowVM } from "@chanlytics/contracts";
import { StatePill } from "../../kit/pill/state-pill";
import { plNameCell } from "../cells/columns";
import { plRowCard } from "../cells/row-card";
import type { TableColumn, TableCtx } from "../types";
import { plFace, plIsNumber } from "../words";
import { P } from "./pipe";
import { PipelineRowMenu, PipelineTrack } from "./row";

/** What a cell draws from besides its row: the doors the row has (the peek, the person's page, their thread). */
interface PipelineCellCtx extends TableCtx {
  attention: null;
  onOpen: (id: string) => void;
  canRecord: boolean;
  onPage: (id: string) => void;
  onThread: (r: PipelineRowVM) => void;
}

/** A column of the Pipeline's table. */
type PipelineColumn = TableColumn<PipelineRowVM, PipelineCellCtx>;

// Made once, from contracts' headings, so the list page's memo sees one list from one draw to the next.
let PIPE_COLUMNS: PipelineColumn[] | null = null;
export const pipeColumns = (): PipelineColumn[] => {
  if (PIPE_COLUMNS) return PIPE_COLUMNS;
  const w = P.words.columns;
  PIPE_COLUMNS = [
    { key: "name", label: w.person, sortable: true, pinned: true, cell: (r, x) => plNameCell(r.person, x) },
    {
      key: "service",
      label: w.service,
      sortable: false,
      cell: (r) => (
        <td key="service" className="pipe-service" data-testid="pipe-service">
          {r.service || ""}
        </td>
      ),
    },
    {
      key: "value",
      label: w.value,
      sortable: true,
      cell: (r) => (
        <td key="value" className="shrink tabular pipe-value" data-testid="pipe-value">
          {r.value || ""}
        </td>
      ),
    },
    {
      key: "stage",
      label: w.stage,
      sortable: true,
      cell: (r) => (
        <td key="stage" className="shrink dim tabular pipe-stage">
          <span className="pipe-stage-in">
            <PipelineTrack steps={r.track} />
            <span data-testid="pipe-in-stage">{r.inStage}</span>
          </span>
        </td>
      ),
    },
    {
      key: "next",
      label: w.next,
      sortable: true,
      cell: (r) => (
        <td
          key="next"
          className="pipe-next"
          data-due={r.next ? r.next.due : undefined}
          title={r.next ? [r.next.words, r.next.forWho].filter(Boolean).join(" · ") : undefined}
          data-testid="pipe-next"
        >
          {r.next ? (
            <span className="pipe-next-in">
              <span className="pipe-next-words">{r.next.words}</span>
              <span className="pipe-next-when">{r.next.when}</span>
            </span>
          ) : null}
        </td>
      ),
    },
    {
      key: "came",
      label: w.came,
      sortable: false,
      on: false,
      cell: (r) => (
        <td key="came" className="dim pipe-came" data-testid="pipe-came">
          {r.person.cameFrom ? r.person.cameFrom.label : ""}
        </td>
      ),
    },
    {
      key: "valid",
      label: w.valid,
      sortable: false,
      on: false,
      cell: (r) => {
        const v = r.person.deal && r.person.deal.validUntil;
        return (
          <td
            key="valid"
            className={`shrink tabular pipe-valid${v && v.lapsed ? " is-lapsed" : ""}`}
            data-testid="pipe-valid"
          >
            {v ? (v.lapsed ? v.words : v.date) : ""}
          </td>
        );
      },
    },
    {
      key: "chip",
      label: <span className="rec-sr">{w.chip}</span>,
      sortable: false,
      fixed: true,
      cell: (r) => (
        <td key="chip" className="shrink pipe-chip">
          {r.chip ? <StatePill kind="tone" value={r.chip.tone} label={r.chip.words} testid="pipe-chip" /> : null}
        </td>
      ),
    },
    {
      key: "actions",
      label: <span className="rec-sr">{w.acts}</span>,
      sortable: false,
      fixed: true,
      cell: (r, x) => (
        <td key="actions" className="shrink cl-actions-cell">
          <PipelineRowMenu r={r} canRecord={x.canRecord} onPage={x.onPage} onThread={x.onThread} />
        </td>
      ),
    },
  ];
  return PIPE_COLUMNS;
};

// A row on a phone is People's card (plRowCard): the face and the name with the chip beside them; the service under
// them; then the deal's steps, the value and the time in stage; and their next step on a line of its own, where it
// takes nothing from the facts.
const pipeCardCell = (r: PipelineRowVM) => {
  const p = r.person;
  return plRowCard({
    face: plFace(p),
    name: p.name,
    numeric: plIsNumber(p.name),
    pill: r.chip ? <StatePill kind="tone" value={r.chip.tone} label={r.chip.words} testid="pipe-chip" /> : null,
    lead: r.service,
    leadTestid: "pipe-service",
    facts: [
      r.track.length ? <PipelineTrack key="track" steps={r.track} /> : null,
      r.value ? (
        <span key="value" className="pipe-card-value" data-testid="pipe-value">
          {r.value}
        </span>
      ) : null,
      r.inStage ? (
        <span key="stage" className="pl-card-last" data-testid="pipe-in-stage">
          {r.inStage}
        </span>
      ) : null,
    ],
    tail: r.next ? (
      <span className="pipe-row-next" data-due={r.next.due} data-testid="pipe-next">
        <span className="pipe-next-words">{r.next.words}</span>
        <span className="pipe-next-when">{r.next.when}</span>
      </span>
    ) : null,
  });
};
let PIPE_PHONE_COLUMNS: PipelineColumn[] | null = null;
export const pipePhoneColumns = (): PipelineColumn[] =>
  PIPE_PHONE_COLUMNS ||
  (PIPE_PHONE_COLUMNS = [
    { key: "card", label: P.words.columns.person, sortable: false, pinned: true, cell: pipeCardCell },
  ]);
export const pipeCardRow = () => "pl-card-row";

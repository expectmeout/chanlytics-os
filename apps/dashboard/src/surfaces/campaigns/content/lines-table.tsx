/**
 * Scheduled and Posted on a desk (the content canvas, board List: "Scheduled and Posted are the same table, narrowed"): the
 * app's one operational table (kit/table/data-table.tsx, decision 0083), a post a row. Scheduled, by when, soonest first: when,
 * the piece, where it goes ("Instagram story"), how it goes (by itself), and Don't post, for whoever may post. Posted, newest
 * first: when it went up, the piece, where, and Open, the post itself. A row opens its piece beside the list, as a line does.
 * A phone keeps the lines (lines.tsx): a table is a desk's.
 */
import { useMemo } from "react";
import {
  CONTENT_WORDS as W,
  fileSaidOf,
  fileViewOf,
  type ContentLineDto,
  type ContentPageDto,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import type { DataColumn } from "../../kit/table/columns";
import { DataTable } from "../../kit/table/data-table";
import { useTableState } from "../../kit/table/state";
import { useDataTable } from "../../kit/table/use-data-table";
import { Picture } from "../../files/photo";
import { placeSaid } from "./lines";
import { DEVICE_ONLY } from "./list";
import { tileShapeOf } from "./model/tiles";

/** A post as the table holds it: its id and its piece's name, as every table's row has them, and the line. */
interface PostRow {
  id: string;
  name: string;
  line: ContentLineDto;
}

/** What a cell draws from besides its row: the business's clock. Don't post is the sheet's, which a row opens. */
interface LinesCtx {
  stamp: (atMs: number) => string;
  when: (atMs: number) => string;
}

const scheduledAt = (line: ContentLineDto): number => Date.parse(line.post.scheduled_for);
const postedAt = (line: ContentLineDto): number => Date.parse(line.post.published_at ?? line.post.created_at);

/** The piece: its picture, small at its own shape, and its name. */
const pieceColumn: DataColumn<PostRow, LinesCtx> = {
  key: "piece",
  label: W.views.columns.piece,
  fill: true,
  width: { base: 280, min: 200, max: 520 },
  cell: (row) => (
    <td key="piece" className="cnv-cell">
      <span className="cnv-cell-piece">
        <span className="cnv-thumb" data-shape={tileShapeOf(row.line.file)}>
          <Picture src={`${fileViewOf(row.line.file.id)}?w=160`} alt={row.line.file.line ?? row.name} name={row.name} />
        </span>
        <span className="cnv-line-words">
          <b>{row.name}</b>
        </span>
      </span>
    </td>
  ),
};

const whereColumn: DataColumn<PostRow, LinesCtx> = {
  key: "where",
  label: W.views.columns.where,
  width: { base: 170, max: 260 },
  cell: (row) => (
    <td key="where" className="cnv-cell">
      {placeSaid(row.line)}
    </td>
  ),
};

const SCHEDULED_COLUMNS: DataColumn<PostRow, LinesCtx>[] = [
  {
    key: "when",
    label: W.views.columns.when,
    width: { base: 160, max: 220 },
    sort: { first: "asc", value: (r) => r.line.post.scheduled_for },
    cell: (row, x) => (
      <td key="when" className="cnv-cell">
        {x.when(scheduledAt(row.line))}
      </td>
    ),
  },
  pieceColumn,
  whereColumn,
  {
    key: "how",
    label: W.views.columns.how,
    width: { base: 150, max: 220 },
    cell: () => (
      <td key="how" className="cnv-cell">
        {W.views.columns.byItself}
      </td>
    ),
  },
];

const POSTED_COLUMNS: DataColumn<PostRow, LinesCtx>[] = [
  {
    key: "posted",
    label: W.views.columns.posted,
    width: { base: 160, max: 220 },
    sort: { first: "desc", value: (r) => r.line.post.published_at ?? r.line.post.created_at },
    cell: (row, x) => (
      <td key="posted" className="cnv-cell">
        {x.stamp(postedAt(row.line))}
      </td>
    ),
  },
  pieceColumn,
  whereColumn,
  {
    key: "acts",
    label: "",
    fixed: true,
    width: { base: 110 },
    cell: (row) => (
      <td key="acts" className="cnv-cell cnv-cell-end">
        {row.line.post.permalink ? (
          <Button size="sm" variant="quiet" href={row.line.post.permalink} target="_blank" rel="noreferrer">
            {W.views.open}
            <Icon name="external" size={12} />
          </Button>
        ) : null}
      </td>
    ),
  },
];

export function ContentLinesTable({
  dto,
  openId,
  onOpen,
}: {
  dto: ContentPageDto;
  openId: string | null;
  /** A row's piece: Scheduled's opened straight to its sheet, where Don't post is. */
  onOpen: (fileId: string) => void;
}) {
  const scheduled = dto.view === "scheduled";
  const columns = scheduled ? SCHEDULED_COLUMNS : POSTED_COLUMNS;
  const state = useTableState({
    scope: scheduled ? "content-scheduled" : "content-posted",
    columns,
    first: scheduled ? { by: "when", dir: "asc" } : { by: "posted", dir: "desc" },
    saved: null,
    landed: true,
    store: DEVICE_ONLY,
  });
  const data = useMemo(
    () => dto.lines.map((line) => ({ id: line.post.id, name: fileSaidOf(line.file.name), line })),
    [dto.lines],
  );
  const model = useDataTable({ state, columns, data });
  const clock = pageClock();
  const ctx: LinesCtx = { stamp: clock.stamp, when: clock.when };
  const shown = state.chosen;
  // A row opens its piece, by the file it is a post of.
  const fileOf = new Map(dto.lines.map((line) => [line.post.id, line.file.id]));
  const openRow = dto.lines.find((line) => line.file.id === openId)?.post.id ?? null;
  return (
    <>
      <DataTable
        table={model.table}
        rows={model.rows}
        state={state}
        columns={columns}
        ctx={ctx}
        total={dto.lines.length}
        filtered={false}
        onClearFilters={() => {}}
        sortBy={shown.by}
        sortDir={shown.dir}
        onSort={(key) => state.pressSort(key, shown)}
        onOpen={(id) => onOpen(fileOf.get(id) ?? id)}
        cursor={openRow}
        noun="piece"
        empty={{ title: W.views.empty[dto.view] }}
        classNames={{ wrap: "cnv-table" }}
      />
      {scheduled && dto.lines.length > 0 ? <p className="cnv-lines-foot">{W.views.onCalendar}</p> : null}
    </>
  );
}

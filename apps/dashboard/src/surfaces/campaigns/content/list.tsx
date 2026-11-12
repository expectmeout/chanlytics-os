/**
 * Made, as a list on a desk (the content canvas, "The list on a desk"): the same pieces through the app's one operational table
 * (kit/table/data-table.tsx, decision 0083), so a heading sorts, a column widens and is hidden as People's do, and nothing of a
 * table is built twice. A piece's line: its picture and name, where it stands, and a column a place, Instagram and Google,
 * each with what is still to come under what is. A line opens the piece beside the list, as a tile does.
 *
 * What the member sizes, hides or sorts is kept on this device (the view store's own copy, read as the table is made): the
 * workspace keeps a saved view for People, Leads and the Pipeline only.
 */
import { useMemo } from "react";
import {
  CONTENT_WORDS as W,
  contentMarkOf,
  contentMarkSaid,
  fileSaidOf,
  fileViewOf,
  type ContentMadeDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import type { DataColumn } from "../../kit/table/columns";
import { DataTable } from "../../kit/table/data-table";
import { useTableState, type TableState } from "../../kit/table/state";
import { useDataTable } from "../../kit/table/use-data-table";
import type { ViewStore } from "../../kit/table/view";
import { Picture } from "../../files/photo";
import { pieceStandsAt, pieceTimedOf, type PieceStandsAt } from "./model/piece-open";
import { tileShapeOf } from "./model/tiles";

/** A piece as the table holds it: its id and name, as every table's row has them, and the piece. */
interface PieceRow {
  id: string;
  name: string;
  made: ContentMadeDto;
}

/** What a cell draws from besides its row: the time now, and the business's clock. */
interface ListCtx {
  now: number;
  stamp: (atMs: number) => string;
  when: (atMs: number) => string;
}

/** Where it stands at a place, and what is still to come there under it. */
function PlaceCell({ row, place, x }: { row: PieceRow; place: PostPlace; x: ListCtx }) {
  const stands: PieceStandsAt = pieceStandsAt(row.made.posts, place, x.now);
  const timed =
    stands.is === "timed"
      ? null
      : pieceTimedOf(
          row.made.posts.filter((p) => p.place === place),
          x.now,
        );
  const top =
    stands.is === "up"
      ? W.piece.stands.up(stands.at ? x.stamp(Date.parse(stands.at)) : null)
      : stands.is === "timed"
        ? x.when(Date.parse(stands.at))
        : W.piece.stands[stands.is];
  return (
    <td key={place} className="cnv-cell" data-stands={stands.is}>
      <span className="cnv-cell-top">{top}</span>
      {stands.is === "stuck" && stands.why ? <span className="cnv-cell-sub">{stands.why}</span> : null}
      {timed ? <span className="cnv-cell-sub">{x.when(Date.parse(timed.scheduled_for))}</span> : null}
    </td>
  );
}

/** The columns, declared once. */
const COLUMNS: DataColumn<PieceRow, ListCtx>[] = [
  {
    key: "piece",
    label: W.views.columns.piece,
    fill: true,
    width: { base: 300, min: 220, max: 560 },
    sort: { first: "desc", value: (r) => r.made.file.created_at },
    cell: (row, clock) => (
      <td key="piece" className="cnv-cell">
        <span className="cnv-cell-piece">
          <span className="cnv-thumb" data-shape={tileShapeOf(row.made.file)}>
            <Picture
              src={`${fileViewOf(row.made.file.id)}?w=160`}
              alt={row.made.file.line ?? row.name}
              name={row.name}
            />
          </span>
          <span className="cnv-line-words">
            <b>{row.name}</b>
            <span>{clock.stamp(Date.parse(row.made.file.created_at))}</span>
          </span>
        </span>
      </td>
    ),
  },
  {
    key: "stands",
    label: W.views.columns.stands,
    width: { base: 180, max: 280 },
    cell: (r) => {
      const mark = contentMarkOf(r.made.posts);
      return (
        <td key="stands" className="cnv-cell">
          <span className="cnv-said" data-mark={mark.is}>
            {contentMarkSaid(mark, r.made.file.kind)}
          </span>
        </td>
      );
    },
  },
  {
    key: "instagram",
    label: W.piece.place.instagram,
    width: { base: 170, max: 280 },
    cell: (r, x) => <PlaceCell key="instagram" row={r} place="instagram" x={x} />,
  },
  {
    key: "google",
    label: W.piece.place.google,
    width: { base: 170, max: 280 },
    cell: (r, x) => <PlaceCell key="google" row={r} place="google" x={x} />,
  },
];

/** This device's copy alone: the workspace keeps no saved view for Content. */
const DEVICE_ONLY: ViewStore = {
  load: (scope) => {
    try {
      const kept: unknown = JSON.parse(localStorage.getItem(`chanlytics.view.${scope}`) || "{}");
      return kept && typeof kept === "object" ? { ...kept } : {};
    } catch {
      return {};
    }
  },
  save: (scope, view) => {
    try {
      localStorage.setItem(`chanlytics.view.${scope}`, JSON.stringify(view));
    } catch {
      // Storage refused: kept for this visit alone.
    }
  },
  saver: () => () => {},
};

const LIST_SORTED_FIRST = { by: "piece", dir: "desc" } as const;

export function ContentList({
  made,
  openId,
  onOpen,
}: {
  made: readonly ContentMadeDto[];
  openId: string | null;
  onOpen: (fileId: string) => void;
}) {
  const state: TableState = useTableState({
    scope: "content",
    columns: COLUMNS,
    first: LIST_SORTED_FIRST,
    saved: null,
    landed: true,
    store: DEVICE_ONLY,
  });
  const data = useMemo(() => made.map((m) => ({ id: m.file.id, name: fileSaidOf(m.file.name), made: m })), [made]);
  const model = useDataTable({ state, columns: COLUMNS, data });
  const clock = pageClock();
  const ctx: ListCtx = { now: Date.now(), stamp: clock.stamp, when: clock.when };
  const shown = state.chosen;
  return (
    <DataTable
      table={model.table}
      rows={model.rows}
      state={state}
      columns={COLUMNS}
      ctx={ctx}
      total={made.length}
      filtered={false}
      onClearFilters={() => {}}
      sortBy={shown.by}
      sortDir={shown.dir}
      onSort={(key) => state.pressSort(key, shown)}
      onOpen={onOpen}
      cursor={openId}
      noun="piece"
      empty={{ title: W.views.empty.all }}
      classNames={{ wrap: "cnv-table" }}
    />
  );
}

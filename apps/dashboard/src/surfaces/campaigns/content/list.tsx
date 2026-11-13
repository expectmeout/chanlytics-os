/**
 * Made, as a list on a desk (the content canvas, "The list on a desk"): the same pieces through the app's one operational table
 * (kit/table/data-table.tsx, decision 0083), so a heading sorts, a column widens and is hidden as People's do, and nothing of a
 * table is built twice. A piece's line: its picture and name, where it stands, and a column a place, Instagram and Google,
 * each with what is still to come under what is. A line opens the piece beside the list, as a tile does. A video still being
 * made is a line too (the content canvas, board List: "How we get the bounce · Video · being made"), its first picture dim and
 * where it is at; it is no piece yet, so its line opens Being made.
 *
 * What the member sizes, hides or sorts is kept on this device (the view store's own copy, read as the table is made): the
 * workspace keeps a saved view for People, Leads and the Pipeline only.
 */
import { useMemo } from "react";
import {
  CONTENT_WORDS as W,
  contentMakingSaid,
  contentPieceMarkOf,
  contentMarkToneOf,
  fileSaidOf,
  fileViewOf,
  type ContentMadeDto,
  type ContentMakingDto,
  type ContentMark,
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

/**
 * A line as the table holds it: its id and name, as every table's row has them, when it was asked for, and the piece, or the
 * video still being made.
 */
type PieceRow = { id: string; name: string; at: string } & (
  { made: ContentMadeDto; making: null } | { made: null; making: ContentMakingDto }
);

/** A video being made, as its line draws it: its first picture dim, at a video's shape, its words, and where it is at. */
function MakingPiece({ making, name }: { making: ContentMakingDto; name: string }) {
  return (
    <span className="cnv-cell-piece">
      <span className="cnv-thumb" data-shape="tall" data-dim="">
        {making.first_picture ? <Picture src={`${fileViewOf(making.first_picture)}?w=160`} alt="" name={name} /> : null}
      </span>
      <span className="cnv-line-words">
        <b>{name}</b>
        <span>{contentMakingSaid(making).state}</span>
      </span>
    </span>
  );
}

/** A video being made, as its line says where it stands: being made, or, where it could not be, so, in the owner's tone. */
function MakingStands({ making }: { making: ContentMakingDto }) {
  const failed = making.status === "failed";
  return (
    <span className="cnv-said" data-tone={failed ? "need" : "going"}>
      <span className="cnv-dot" aria-hidden="true" />
      {failed ? contentMakingSaid(making).state : W.views.name.making}
    </span>
  );
}

/**
 * Where a piece stands, in a word or two (the content canvas, "The list on a desk": "Posted", "Posting", "Didn't post",
 * "Ready to post"): the columns beside it say where and when, so the tile's "On Instagram · Monday" would say it twice.
 */
function standsWordOf(mark: ContentMark): string {
  if (mark.is === "posted") return W.piece.stands.up(null);
  if (mark.is === "going") return W.piece.stands.going;
  if (mark.is === "timed") return W.views.name.scheduled;
  if (mark.is === "stuck") return W.piece.stands.stuck;
  if (mark.is === "by_hand") return W.piece.byHand.stands;
  if (mark.is === "save") return W.mark.save;
  return W.mark.ready;
}

/** What a cell draws from besides its row: the time now, and the business's clock. */
interface ListCtx {
  now: number;
  stamp: (atMs: number) => string;
  when: (atMs: number) => string;
}

/**
 * Where it stands at a place, and what is still to come there under it. A video that went nowhere says nothing at a place:
 * nothing posts a video from here (decision 0121), so "Not yet" would promise what no press keeps; its row says Ready to save.
 */
function PlaceCell({ row, place, x }: { row: PieceRow; place: PostPlace; x: ListCtx }) {
  // Nothing is at a place while it is being made.
  if (!row.made) return <td key={place} className="cnv-cell" data-stands="none" />;
  const stands: PieceStandsAt = pieceStandsAt(row.made.posts, place, x.now);
  if (row.made.file.kind === "video" && stands.is === "none")
    return <td key={place} className="cnv-cell" data-stands="none" />;
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
    sort: { first: "desc", value: (r) => r.at },
    cell: (row, clock) => (
      <td key="piece" className="cnv-cell">
        {row.made ? (
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
              <span>{clock.stamp(Date.parse(row.at))}</span>
            </span>
          </span>
        ) : (
          <MakingPiece making={row.making} name={row.name} />
        )}
      </td>
    ),
  },
  {
    key: "stands",
    label: W.views.columns.stands,
    width: { base: 180, max: 280 },
    cell: (r, at) => {
      if (!r.made)
        return (
          <td key="stands" className="cnv-cell">
            <MakingStands making={r.making} />
          </td>
        );
      const mark = contentPieceMarkOf(r.made, at.now);
      return (
        <td key="stands" className="cnv-cell">
          <span className="cnv-said" data-tone={contentMarkToneOf(mark)}>
            <span className="cnv-dot" aria-hidden="true" />
            {standsWordOf(mark)}
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

/** This device's copy alone: the workspace keeps no saved view for Content (its list, and Scheduled's and Posted's tables). */
export const DEVICE_ONLY: ViewStore = {
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
  making,
  openId,
  onOpen,
  onMaking,
}: {
  made: readonly ContentMadeDto[];
  /** What is being made, heading the list as the tiles head the grid; each opens Being made. */
  making: readonly ContentMakingDto[];
  openId: string | null;
  onOpen: (fileId: string) => void;
  onMaking: () => void;
}) {
  const state: TableState = useTableState({
    scope: "content",
    columns: COLUMNS,
    first: LIST_SORTED_FIRST,
    saved: null,
    landed: true,
    store: DEVICE_ONLY,
  });
  const data = useMemo<PieceRow[]>(
    () => [
      ...making.map((m) => ({
        id: m.id,
        name: contentMakingSaid(m).title,
        at: m.created_at,
        made: null,
        making: m,
      })),
      ...made.map((m) => ({
        id: m.file.id,
        name: fileSaidOf(m.file.name),
        at: m.file.created_at,
        made: m,
        making: null,
      })),
    ],
    [made, making],
  );
  const beingMade = new Set(making.map((m) => m.id));
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
      total={data.length}
      filtered={false}
      onClearFilters={() => {}}
      sortBy={shown.by}
      sortDir={shown.dir}
      onSort={(key) => state.pressSort(key, shown)}
      onOpen={(id) => (beingMade.has(id) ? onMaking() : onOpen(id))}
      cursor={openId}
      noun="piece"
      empty={{ title: W.views.empty.all }}
      classNames={{ wrap: "cnv-table" }}
    />
  );
}

/**
 * The Pipeline as a board (docs/decisions/0008-a-proposal-is-part-of-the-deal.md, "the Pipeline is a workspace"), moved
 * from legacy/pages/pipeline-board.jsx (decision 0015): the same four groups as columns, the same rows as cards -- who,
 * the service, the value and the time in stage, the one chip -- and a card dragged into another column asks for the one
 * deal sheet in the mode the move needs (contracts pipelineMove: a consultation into Proposal out starts one, a proposal
 * into Clients is a yes, into Passed or ended a pass, a client into Passed or ended an end, a passed deal back into
 * Proposal out again). A drop is a person's confirmation, never the record: the sheet still asks what the move needs.
 * The browser's own drag and drop, no library; a card is a button too, so a keyboard opens the peek and moves the deal
 * from there, and its Move to menu (beside the card, never inside it: a button inside a button is not one) asks for
 * the same sheet a drop does, for a finger or a keyboard. A column shows twenty cards, then says how many more it holds
 * (contracts PIPELINE_BOARD_CAP). A desk's only: a phone has the list. Hookless: what is in hand, which column is
 * under it and which columns show every card are PipelineScope's.
 */
import type { DragEvent } from "react";
import type { PipelineGroupKey, PipelineMove, PipelineRowVM } from "@chanlytics/contracts";
import { StatePill } from "../../kit/pill/state-pill";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { Icon } from "../../kit/icon/icon";
import { plFace, plIsNumber } from "../words";
import { PipelineTrack } from "./row";
import { P } from "./pipe";
import type { PipelineSection } from "./pipe";

/** A card in hand: who, the column it left, and its row. */
interface BoardDrag {
  id: string;
  from: PipelineGroupKey;
  row: PipelineRowVM;
}

/** What dropping a row from one column into another asks for; null where it asks for nothing. */
type MoveOf = (from: PipelineGroupKey, to: PipelineGroupKey, row: PipelineRowVM) => PipelineMove | null;

// One card: the row's face and name, the service, the value beside the time in stage, and the chip. It carries the
// table row's id, so the page's cursor effect finds it and J and K walk the cards as they walk the rows.
const PipelineCard = ({
  r,
  group,
  cursor,
  canDrag,
  dragging,
  moves = [],
  onOpen,
  onWarm,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  r: PipelineRowVM;
  group: PipelineGroupKey;
  cursor: string | null;
  canDrag: boolean;
  dragging: boolean;
  moves?: { key: PipelineGroupKey; label: string }[];
  onOpen: (id: string) => void;
  onWarm: ((id: string) => void) | null;
  onDragStart: (row: PipelineRowVM, from: PipelineGroupKey) => void;
  onDragEnd: () => void;
  onMove: (row: PipelineRowVM, from: PipelineGroupKey, to: PipelineGroupKey) => void;
}) => {
  const p = r.person;
  const face = plFace(p);
  const W = P.words.board;
  return (
    <div className="pipe-card-wrap">
      <article
        id={`person-${r.id}`}
        className={`pipe-card${cursor === r.id ? " focused" : ""}${dragging ? " is-dragging" : ""}`}
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-to-interactive-role -- kept as the JSX drew it: a card is a button too, so a keyboard opens the peek
        role="button"
        tabIndex={cursor === r.id ? 0 : -1}
        aria-label={`${P.words.board.card} ${r.name}`}
        draggable={canDrag ? true : undefined}
        data-testid="pipeline-card"
        onClick={() => onOpen(r.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(r.id);
          }
        }}
        onFocus={onWarm ? () => onWarm(r.id) : undefined}
        onPointerEnter={onWarm ? () => onWarm(r.id) : undefined}
        onDragStart={
          canDrag
            ? (e) => {
                if (e.dataTransfer) {
                  e.dataTransfer.effectAllowed = "move";
                  try {
                    e.dataTransfer.setData("text/plain", r.id);
                  } catch {
                    /* a browser that will not */
                  }
                }
                onDragStart(r, group);
              }
            : undefined
        }
        onDragEnd={canDrag ? onDragEnd : undefined}
      >
        <div className="pipe-card-top">
          <span
            className={`ix-thread-avatar pipe-card-face${face.glyph ? " cl-row-avatar-glyph" : ""}`}
            aria-hidden="true"
          >
            {face.glyph ? <Icon name={face.glyph} size={11} /> : face.initials}
          </span>
          <span className={`pipe-card-name${plIsNumber(p.name) ? " tabular" : ""}`}>{r.name}</span>
        </div>
        {r.service ? (
          <div className="pipe-card-service" data-testid="pipe-service">
            {r.service}
          </div>
        ) : null}
        <PipelineTrack steps={r.track} />
        {r.value || r.inStage ? (
          <div className="pipe-card-line">
            {r.value ? (
              <span className="pipe-card-value" data-testid="pipe-value">
                {r.value}
              </span>
            ) : (
              <span />
            )}
            {r.inStage ? (
              <span className="pipe-card-stage" data-testid="pipe-in-stage">
                {r.inStage}
              </span>
            ) : null}
          </div>
        ) : null}
        {r.chip ? <StatePill kind="tone" value={r.chip.tone} label={r.chip.words} testid="pipe-chip" /> : null}
        {/* Their next step (0007, amended): one quiet line, its day in the warn ink once it has come. */}
        {r.next ? (
          <div className="pipe-card-next" data-due={r.next.due} data-testid="pipe-next">
            <span className="pipe-next-words">{r.next.words}</span>
            <span className="pipe-next-when">{r.next.when}</span>
          </div>
        ) : null}
      </article>
      {canDrag && moves.length ? (
        <span className="pipe-card-menu">
          <MoreMenu
            items={[
              { header: W.move },
              ...moves.map((m) => ({ label: m.label, onClick: () => onMove(r, group, m.key) })),
            ]}
            title={`${W.menu} ${r.name}`}
            size={13}
            btnClass="cl-row-act"
            escape
            testid="pipe-card-menu"
          />
        </span>
      ) : null}
    </div>
  );
};

// A drag leaving for one of the column's own children is not a leave: the browser fires one for every child crossed.
const pipeLeftColumn = (e: DragEvent<HTMLElement>) =>
  !(
    e &&
    e.relatedTarget &&
    e.currentTarget &&
    e.currentTarget.contains &&
    e.currentTarget.contains(e.relatedTarget as Node)
  );

/** One column's head: its name, how many, what it comes to, and the fold that opens a folded one. */
function columnHead(s: PipelineSection) {
  return (
    <header className="pipe-col-head">
      <span className="pl-sec-label">{s.label}</span>
      <span className="tally">{s.rows.length}</span>
      {s.meta ? (
        <span className="pipe-col-meta" data-testid="pipeline-col-meta">
          {s.meta}
        </span>
      ) : null}
      {s.onToggle && s.toggle ? (
        <button
          type="button"
          className="pl-sec-toggle"
          aria-expanded={!s.collapsed}
          onClick={s.onToggle}
          data-testid="pipeline-col-toggle"
        >
          {s.toggle}
        </button>
      ) : null}
    </header>
  );
}

interface BoardProps {
  columns: readonly PipelineSection[];
  cursor?: string | null;
  canDrag?: boolean;
  drag?: BoardDrag | null;
  over?: PipelineGroupKey | null;
  moveOf: MoveOf;
  onOpen: (id: string) => void;
  onWarm?: ((id: string) => void) | null;
  onDragStart: (row: PipelineRowVM, from: PipelineGroupKey) => void;
  onDragEnd: () => void;
  onDragOver: (key: PipelineGroupKey) => void;
  onDragLeave: (key: PipelineGroupKey) => void;
  onDrop: (key: PipelineGroupKey) => void;
  onMove?: (row: PipelineRowVM, from: PipelineGroupKey, to: PipelineGroupKey) => void;
  every?: Record<string, boolean>;
  onEvery?: (key: PipelineGroupKey) => void;
}

/** A column's cards, or the room for them: a folded column keeps its box, so a card can still be dropped there. */
function columnCards(s: PipelineSection, b: BoardProps, cap: number) {
  const { columns, cursor = null, canDrag = false, drag = null, moveOf, onOpen, onWarm = null, every = {} } = b;
  const { onDragStart, onDragEnd, onMove = () => {}, onEvery = () => {} } = b;
  return (
    <div className="pipe-col-cards">
      {s.collapsed
        ? null
        : (every[s.key] ? s.rows : s.rows.slice(0, cap)).map((r) => (
            <PipelineCard
              key={r.id}
              r={r}
              group={s.key}
              cursor={cursor}
              canDrag={canDrag}
              dragging={!!drag && drag.id === r.id}
              moves={columns
                .filter((c) => c.key !== s.key && moveOf(s.key, c.key, r))
                .map((c) => ({ key: c.key, label: c.label }))}
              onOpen={onOpen}
              onWarm={onWarm}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMove={onMove}
            />
          ))}
      {!s.collapsed && !every[s.key] && s.rows.length > cap ? (
        <button
          type="button"
          className="cl-bucket-link pipe-col-more"
          onClick={() => onEvery(s.key)}
          data-testid="pipeline-col-more"
        >
          {P.boardMore(s.rows.length - cap)}
        </button>
      ) : null}
      {!s.collapsed && s.rows.length === 0 ? <p className="pipe-col-none">{P.words.board.nobody}</p> : null}
    </div>
  );
}

export const PipelineBoard = (props: BoardProps) => {
  const { columns, drag = null, over = null, moveOf, onDragOver, onDragLeave, onDrop } = props;
  const cap = P.boardCap || Infinity;
  // A folded column is a head and a drop target, so it takes less room than one with cards: at 1280 beside the rail
  // the four then fit without a sideways scroll.
  const template = columns.map((s) => (s.collapsed ? "minmax(120px, 0.6fr)" : "minmax(200px, 1fr)")).join(" ");
  return (
    <div className="pipe-board" style={{ gridTemplateColumns: template }} data-testid="pipeline-board">
      {columns.map((s) => {
        // What dropping the card in hand here would ask for; null where it asks for nothing, and the column says so.
        const can = drag ? moveOf(drag.from, s.key, drag.row) : null;
        const cls = `pipe-col${s.collapsed ? " is-folded" : ""}${drag && can && over === s.key ? " is-over" : ""}${drag && !can && drag.from !== s.key ? " is-refused" : ""}`;
        return (
          <section
            key={s.key}
            className={cls}
            data-group={s.key}
            aria-label={s.label}
            data-testid={`pipeline-col-${s.key}`}
            onDragOver={
              drag
                ? (e) => {
                    if (can) {
                      e.preventDefault();
                      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    }
                    onDragOver(s.key);
                  }
                : undefined
            }
            onDragLeave={
              drag
                ? (e) => {
                    if (pipeLeftColumn(e)) onDragLeave(s.key);
                  }
                : undefined
            }
            onDrop={
              drag
                ? (e) => {
                    if (e && e.preventDefault) e.preventDefault();
                    onDrop(s.key);
                  }
                : undefined
            }
          >
            {columnHead(s)}
            {columnCards(s, props, cap)}
          </section>
        );
      })}
    </div>
  );
};

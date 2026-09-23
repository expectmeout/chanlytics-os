/* global React, Icon, StatePill */
// The Pipeline as a board (docs/decisions/0008-a-proposal-is-part-of-the-deal.md, "the Pipeline is a workspace"): the
// same four groups as columns, the same rows as cards -- who, the service, the value and the time in stage, the one
// chip -- and a card dragged into another column asks for the one deal sheet in the mode the move needs (contracts
// pipelineMove: a consultation into Proposal out starts one, a proposal into Clients is a yes, into Passed or ended a
// pass, a client into Passed or ended an end, a passed deal back into Proposal out again). A drop is a person's
// confirmation, never the record: the sheet still asks what the move needs. The browser's own drag and drop, no
// library; a card is a button too, so a keyboard opens the peek and moves the deal from there. A desk's only: a phone
// has the list. Hookless: what is in hand and which column is under it are PipelineScope's.

// One card: the row's face and name, the service, the value beside the time in stage, and the chip. It carries the
// table row's id, so the page's cursor effect finds it and J and K walk the cards as they walk the rows.
const PipelineCard = ({ r, group, cursor, canDrag, dragging, onOpen, onWarm, onDragStart, onDragEnd }) => {
  const p = r.person;
  const face = window.plFace(p);
  return (
    <article
      id={`person-${r.id}`}
      className={`pipe-card${cursor === r.id ? " focused" : ""}${dragging ? " is-dragging" : ""}`}
      role="button"
      tabIndex={cursor === r.id ? 0 : -1}
      aria-label={`${window.__pipeline.words.board.card} ${r.name}`}
      draggable={canDrag ? true : undefined}
      data-testid="pipeline-card"
      onClick={() => onOpen(r.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r.id); } }}
      onFocus={onWarm ? () => onWarm(r.id) : undefined}
      onPointerEnter={onWarm ? () => onWarm(r.id) : undefined}
      onDragStart={canDrag ? (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", r.id); } catch (err) { /* a browser that will not */ }
        }
        onDragStart(r, group);
      } : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
    >
      <div className="pipe-card-top">
        <span className={`ix-thread-avatar pipe-card-face${face.glyph ? " cl-row-avatar-glyph" : ""}`} aria-hidden="true">{face.glyph ? <Icon name={face.glyph} size={11} /> : face.initials}</span>
        <span className={`pipe-card-name${window.plIsNumber(p.name) ? " tabular" : ""}`}>{r.name}</span>
      </div>
      {r.service ? <div className="pipe-card-service" data-testid="pipe-service">{r.service}</div> : null}
      {r.value || r.inStage ? (
        <div className="pipe-card-line">
          {r.value ? <span className="pipe-card-value" data-testid="pipe-value">{r.value}</span> : <span />}
          {r.inStage ? <span className="pipe-card-stage" data-testid="pipe-in-stage">{r.inStage}</span> : null}
        </div>
      ) : null}
      {r.chip ? <StatePill kind="tone" value={r.chip.tone} label={r.chip.words} testid="pipe-chip" /> : null}
    </article>
  );
};

// A drag leaving for one of the column's own children is not a leave: the browser fires one for every child crossed.
const pipeLeftColumn = (e) => !(e && e.relatedTarget && e.currentTarget && e.currentTarget.contains && e.currentTarget.contains(e.relatedTarget));

const PipelineBoard = ({ columns, cursor = null, canDrag = false, drag = null, over = null, moveOf, onOpen, onWarm = null, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }) => {
  const W = window.__pipeline.words;
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
            onDragOver={drag ? (e) => { if (can) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "move"; } onDragOver(s.key); } : undefined}
            onDragLeave={drag ? (e) => { if (pipeLeftColumn(e)) onDragLeave(s.key); } : undefined}
            onDrop={drag ? (e) => { if (e && e.preventDefault) e.preventDefault(); onDrop(s.key); } : undefined}
          >
            <header className="pipe-col-head">
              <span className="pl-sec-label">{s.label}</span>
              <span className="tally">{s.rows.length}</span>
              {s.meta ? <span className="pipe-col-meta" data-testid="pipeline-col-meta">{s.meta}</span> : null}
              {s.onToggle && s.toggle ? <button type="button" className="pl-sec-toggle" aria-expanded={!s.collapsed} onClick={s.onToggle} data-testid="pipeline-col-toggle">{s.toggle}</button> : null}
            </header>
            {/* The cards, or the room for them: a folded column keeps its box, so a card can still be dropped there. */}
            <div className="pipe-col-cards">
              {s.collapsed ? null : s.rows.map((r) => (
                <PipelineCard key={r.id} r={r} group={s.key} cursor={cursor} canDrag={canDrag} dragging={!!drag && drag.id === r.id} onOpen={onOpen} onWarm={onWarm} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              ))}
              {!s.collapsed && s.rows.length === 0 ? <p className="pipe-col-none">{W.board.nobody}</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
};

Object.assign(window, { PipelineBoard });

/* global React, Icon */
// People › Pipeline's New proposal (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): who a proposal is for,
// before the one deal sheet opens. A desk's record sheet (record-sheet.jsx) with no Save -- the pick is the act -- or a
// phone's sheet (clients-a.jsx PhoneSheet). A search over the People rows the page already holds, by People's own rule
// (plMatcher), the first eight; or Add someone new, by name and number, through People's own door and words
// (plAddPerson). A pick, or an add, closes it and asks for the deal sheet in its propose mode. Hookless: what is open
// and what was typed are PipelineScope's. Every word is contracts' (PIPELINE_WORDS.newProposal).

const PIPE_NEW_MAX = 8;

// Who the words find, by People's own rule; with no words, the first eight People holds, in People's own order.
const pipeNewMatches = (rows, q) => {
  const match = window.plMatcher ? window.plMatcher(q || "") : null;
  return (match ? rows.filter(match) : rows).slice(0, PIPE_NEW_MAX);
};

const PipelineNewBody = ({ rows, q, add, onQ, onPick, onAddOpen, onAddDraft, onAdd }) => {
  const W = window.__pipeline.words.newProposal;
  const found = pipeNewMatches(rows, q);
  return (
    <div className="pipe-new" data-testid="pipeline-new">
      <p className="pipe-new-sub">{W.sub}</p>
      <label className="pipe-new-search">
        <Icon name="search" size={13} />
        <input type="search" autoFocus autoComplete="off" value={q} placeholder={W.search} aria-label={W.search} onChange={(e) => onQ(e.target.value)} data-testid="pipeline-new-search" />
      </label>
      {found.length ? (
        <ul className="pipe-new-list" data-testid="pipeline-new-list">
          {found.map((p) => {
            const face = window.plFace ? window.plFace(p) : { initials: p.initials, glyph: null };
            return (
              <li key={p.id}>
                <button type="button" className="pipe-new-row" onClick={() => onPick(p.id)} data-testid="pipeline-new-pick">
                  <span className={`ix-thread-avatar pipe-new-face${face.glyph ? " cl-row-avatar-glyph" : ""}`} aria-hidden="true">{face.glyph ? <Icon name={face.glyph} size={11} /> : face.initials}</span>
                  <span className="pipe-new-name">{p.name}</span>
                  {/* Where their deal stands, or when they were last heard: the row's own words. */}
                  <span className="pipe-new-said">{p.deal ? p.deal.line : p.lastContact.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pipe-new-none" data-testid="pipeline-new-none">{W.none}</p>
      )}
      {add.open ? (
        <div className="pipe-new-add" data-testid="pipeline-new-add">
          <label className="rec-field">
            <span className="rec-field-label">{W.name} <span className="pipe-new-opt">({W.optional})</span></span>
            <input className="rec-input" value={add.name} maxLength={80} autoComplete="name" readOnly={add.busy} onChange={(e) => onAddDraft({ name: e.target.value })} data-testid="pipeline-new-name" />
          </label>
          <label className="rec-field">
            <span className="rec-field-label">{W.number}</span>
            <input className="rec-input" type="tel" inputMode="tel" autoComplete="tel" value={add.phone} maxLength={24} readOnly={add.busy} aria-invalid={add.error ? true : undefined} aria-describedby={add.error ? "pipeline-new-error" : undefined} onChange={(e) => onAddDraft({ phone: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }} data-testid="pipeline-new-phone" />
          </label>
          {window.FieldError ? <window.FieldError id="pipeline-new-error" message={add.error} testid="pipeline-new-error" /> : null}
          <button type="button" className="btn btn-primary btn-sm pipe-new-go" disabled={add.busy || !add.phone.trim()} onClick={onAdd} data-testid="pipeline-new-go">{add.busy ? W.adding : W.go}</button>
        </div>
      ) : (
        <button type="button" className="cl-prof-deal-act pipe-new-open-add" onClick={onAddOpen} data-testid="pipeline-new-add-open"><Icon name="plus" size={12} /> {W.add}</button>
      )}
    </div>
  );
};

const PipelineNew = ({ phone = false, onClose, ...body }) => {
  const W = window.__pipeline.words.newProposal;
  if (phone && window.PhoneSheet) {
    return <window.PhoneSheet title={W.title} onClose={onClose} testid="pipeline-new-sheet"><PipelineNewBody {...body} /></window.PhoneSheet>;
  }
  if (!window.RecordSheet) return null;
  return <window.RecordSheet id="pipeline-new" className="pipe-new-sheet" title={W.title} onClose={onClose} testid="pipeline-new-sheet"><PipelineNewBody {...body} /></window.RecordSheet>;
};

Object.assign(window, { PipelineNew });

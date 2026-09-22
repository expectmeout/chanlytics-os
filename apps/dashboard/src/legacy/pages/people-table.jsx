/* global React, Icon, EmptyState */
// The table for any rows, and its Columns menu, for People and for Leads (a scope of People): the columns they are
// given, what a cell needs (`ctx`), a selection, a keyboard cursor and a way to open a row. Lifted out of
// clients-a.jsx (release B of the lead finder): four of these helpers closed over People's PL_COLUMNS, so Leads could
// not draw the table with columns of its own. Every helper takes the column list. Hookless, as before: the tests'
// stub React keys state by call order, and a list's own controls above the table come and go.

// Person and the row's actions are not the member's to hide.
const plLocked = (c) => !!(c.pinned || c.fixed);
// Whether a column shows on a desktop: Person and the row's actions always; any other by the member's own choice, else
// its default.
const plShows = (c, choices, x) => plLocked(c) || (typeof choices[c.key] === "boolean" ? choices[c.key] : typeof c.on === "function" ? c.on(x) : c.on !== false);
// The keys a view may sort by: the columns whose headings sort.
const plSortKeys = (columns) => columns.filter((c) => c.sortable).map((c) => c.key);
// The columns drawn, in their order: every one this workspace can show (Visits needs a calendar). A member's choices are
// a desktop's: one they turned off is drawn all the same, `off`, and only a desktop hides it (clients.css, pl-col-off),
// so a phone's cards keep the facts they draw by default. Hidden cells were gone from the cards too, and the Columns menu
// that could put them back is not drawn on a phone.
const plDrawnColumns = (columns, choices, x) => columns.filter((c) => !c.needs || c.needs(x)).map((c) => (plShows(c, choices, x) ? c : { ...c, off: true }));
// The columns the table is handed: on a phone every one, the ones off marked (its cards keep the facts they draw by
// default, #789); on a desktop only what shows. A desktop hid the rest with the same mark, so every cell of a column
// turned off was built, cloned and inserted for nothing -- seven of the Leads scope's twelve, on every row, on every
// draw. The page keeps the result while nothing it is made of changed (useMemo), so a memoised row sees one list.
const plShownColumns = (drawn, phone) => (phone ? drawn : drawn.filter((c) => !c.off));

const PL_NO_SEL = new Set();

// One row. Drawn again only when something of its own changed: its view model, whether it is selected, the cursor,
// the columns, the cell context. So a keystroke in the search box, a tick on another row, a J and an opened peek
// each redraw the rows they touch and leave the rest -- every row was drawn again for any of them, ~0.17ms a row,
// 85ms a keystroke at a page of 500. React.memo is not a hook, so the table stays hookless for the tests' stub
// React, which has no memo and draws every row every time; what it proves is that every prop here is a primitive
// or the same object from one draw to the next (leads-honest.test.mjs).
const PeopleRow = ({ p, columns, ctx, words, selectable, selected, focused, tabStop, onToggle, onCursor, onOpen, rowClass }) => (
  <tr id={`${words.one}-${p.id}`} className={`${selected ? "selected" : ""} ${focused ? "focused" : ""} ${rowClass ? rowClass(p) : ""}`} aria-selected={selectable ? selected : undefined} tabIndex={tabStop ? 0 : -1} onFocus={() => { if (!focused) onCursor(p.id); }} onClick={() => onOpen(p.id)}>
    {selectable && (
      <td className="cl-sel" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="cl-check" checked={selected} onChange={() => onToggle(p.id)} aria-label={`Select ${p.name}`} data-testid="row-select" />
      </td>
    )}
    {columns.map((c) => {
      const td = c.cell(p, ctx);
      return c.off ? React.cloneElement(td, { className: `${td.props.className || ""} pl-col-off` }) : td;
    })}
  </tr>
);
const PeopleRowMemo = React.memo ? React.memo(PeopleRow) : PeopleRow;
// What the table calls its rows: the foot's count, the select-all label, and the row id prefix the page's cursor
// effect reads (document.getElementById(`${noun}-${cursor}`)). The empty state's default title is People's own, and
// the Leads scope passes an `empty` of its own, so a lead never draws it.
const PL_NOUNS = { person: { one: "person", many: "people", all: "Select everyone shown" }, lead: { one: "lead", many: "leads", all: "Select every lead shown" } };

// The table, for any rows: the columns it is given (one that is `off` drawn with pl-col-off on its heading and every
// cell, which only a desktop hides), what a cell needs (`ctx`), a selection, a keyboard cursor and a way to open a
// row. People draws it; Leads, a scope of People, draws it with columns of its own. Still a <table class="cl-table">,
// so the page's selectors and the phone's card rules hold. On a desktop it scrolls in its own box (pl-table-scroll):
// the header sticks to its top and the pinned column to its left, and the hairline beside that column shows once it
// has scrolled sideways (`scrolled`, the page's state). Hookless on purpose: the tests' stub React keys state by call
// order, and a list's own controls above the table come and go.
// `busy`: the rows drawn are the last view's while the one asked for is on its way; a screen reader hears it, and
// the page's stylesheet dims them (Leads: leads.css [data-loading]).
// The columns are the page's to choose (plShownColumns): the table draws every one it is given.
const PeopleTable = ({ columns, ctx, rows, total, sortBy, sortDir, onSort, onOpen, filtered, onClearFilters, selectable = false, sel = PL_NO_SEL, onToggle = () => {}, onToggleAll = () => {}, cursor = null, onCursor = () => {}, empty = null, scrolled = false, onScrolled = () => {}, noun = "person", rowClass = null, busy = false }) => {
  const words = PL_NOUNS[noun] || PL_NOUNS.person;
  const selecting = rows.some((p) => sel.has(p.id));
  return (
    <div className={`cl-table-wrap pl-table-wrap ${selecting ? "selecting" : ""}`}>
      <div className={`pl-table-scroll ${scrolled ? "scrolled" : ""}`} onScroll={(e) => { const on = e.currentTarget.scrollLeft > 0; if (on !== scrolled) onScrolled(on); }} aria-busy={busy ? "true" : undefined} data-testid="people-table-scroll">
        {/* pl-table is the phone's hook: on a narrow screen these rows stop being a
            sideways scroll and stack, so the state is on the row instead of off the
            right edge. The seeded page, Leads and Lists keep the table. */}
        <table className="cl-table pl-table">
          <thead>
            <tr>
              {selectable && (
                <th className="cl-sel">
                  <input type="checkbox" className="cl-check" checked={rows.length > 0 && rows.every((p) => sel.has(p.id))} onChange={onToggleAll} aria-label={words.all} title={words.all} data-testid="select-all" />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={`${c.sortable ? "sortable" : ""} ${c.pinned ? "pl-pin" : ""} ${c.key === "actions" ? "cl-actions-head" : ""} ${c.off ? "pl-col-off" : ""}`} aria-sort={sortBy === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                  {/* A heading that sorts is a button, so a keyboard reaches it: the sort was the cell's own click, which Tab never found. */}
                  {c.sortable
                    ? <button type="button" className="cl-th-sort" onClick={() => onSort(c.key)}>{c.label}{sortBy === c.key && <span className="sort-arr">{sortDir === "asc" ? "▲" : "▼"}</span>}</button>
                    : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* The cursor's row is the table's one tab stop (the first row until there is a cursor), and a row focused --
                by Tab, or by a click -- takes the cursor, so what a screen reader hears and what the keys act on agree.
                J and K move focus with the cursor (the page's effect on `cursor`). */}
            {rows.map((p, i) => (
              <PeopleRowMemo key={p.id} p={p} columns={columns} ctx={ctx} words={words} selectable={selectable} selected={sel.has(p.id)} focused={cursor === p.id} tabStop={cursor === p.id || (!cursor && i === 0)} onToggle={onToggle} onCursor={onCursor} onOpen={onOpen} rowClass={rowClass} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <EmptyState kind="line" className="empty-center" glyph="search" title={empty ? empty.title : total === 0 ? "Nobody has written or phoned yet." : "No one matches this view."} body={empty ? empty.body : undefined} action={empty ? empty.action : total > 0 && filtered ? { label: "Clear filters", onClick: onClearFilters } : null} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="cl-table-foot">
        <span>{filtered ? `Showing ${rows.length} of ${total}` : `${total} ${total === 1 ? words.one : words.many}`}</span>
        <span className="cl-table-keys"><kbd>J</kbd><kbd>K</kbd> move · {selectable && <><kbd>x</kbd> selects · <kbd>esc</kbd> clears · </>}<kbd>↵</kbd> opens · <kbd>/</kbd> searches</span>
      </div>
    </div>
  );
};

// A saved `columns` value, read with care: only the columns a member may hide, and only true or false. A view is the
// member's own JSON, and an older page or another device may have written anything into it.
const plColumnChoices = (columns, raw) => {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const c of columns) if (!plLocked(c) && typeof raw[c.key] === "boolean") out[c.key] = raw[c.key];
  return out;
};
// The Columns menu's rows: every column this workspace can show, whether it shows, and Person, which always does.
const plColumnOptions = (columns, choices, x) => columns
  .filter((c) => !c.fixed && (!c.needs || c.needs(x)))
  .map((c) => ({ key: c.key, label: c.label, on: plShows(c, choices, x), locked: !!c.pinned }));

// Which columns show, as a menu that stays open while they are switched: MoreMenu closes on every item, which is right
// for an action and wrong for a set of switches. Hookless, with its open state the page's, whose one keyboard listener
// closes it on Esc and puts focus back on its button (`buttonRef`, the page's); pl-cols-menu keeps it out of
// PL_OVERLAY, what is open over the page and not the page's. A phone draws cards, not columns, and a member's choices
// are a desktop's (plDrawnColumns): the cards keep what they draw by default, so the menu is hidden there (clients.css).
const PeopleColumnsMenu = ({ open, onOpenChange, options, onPick, buttonRef = null }) => (
  <div className="more-wrap pl-cols">
    <button type="button" ref={buttonRef} className="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onOpenChange(!open); }} data-testid="people-columns">
      <Icon name="eye" size={12} /> Columns
    </button>
    {open && (
      <>
        <div className="more-backdrop" onClick={(e) => { e.stopPropagation(); onOpenChange(false); }} />
        <div className="more-menu align-right pl-cols-menu" role="menu" aria-label="Columns" data-testid="people-columns-menu" onClick={(e) => e.stopPropagation()}>
          <div className="more-header">Show on the table</div>
          {options.map((c) => (
            <button key={c.key} type="button" className="more-item" role="menuitemcheckbox" aria-checked={c.on} aria-disabled={c.locked ? true : undefined} onClick={() => { if (!c.locked) onPick(c.key); }} data-testid={`column-${c.key}`}>
              <Icon name="check" size={13} />
              <span className="more-item-label">{c.label}</span>
              {c.locked && <span className="more-item-meta">Always</span>}
            </button>
          ))}
        </div>
      </>
    )}
  </div>
);

Object.assign(window, { PeopleTable, PeopleColumnsMenu, plLocked, plShows, plSortKeys, plDrawnColumns, plShownColumns, plColumnChoices, plColumnOptions, PL_NO_SEL });

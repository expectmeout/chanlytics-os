/* global React, Icon */
// One appointment on a list, and the list it sits on: the shape Today's day drew (dashboard-a-day.jsx) and the
// Calendar's agenda (calendar-real.jsx) drew a second time, in its own grid, its own sizes and its own order.
// The two said the same facts about the same appointment and looked like two products, so a day read one way on
// Today and another on the Calendar.
//
// It is one row now, `.ag-*` in components.css:
//
//   10:30 AM  •  Emily Chen
//                Gloss · 1h
//                Needs you — in Inbox
//
// A time column, a rail with a dot per entry (the now marker on today's), then who it is for with what it is for
// and how long under them, and a line when their thread needs someone. Nobody matched to the appointment means
// the service IS the headline, and there is nothing under it but the length.
//
// The name is said ONCE. A business writes the customer into the event's own title ("Gloss · Emily Chen"), so a
// row that names them and then prints the title said them twice: contracts' `serviceOf` takes the name out, and
// `block.service` is what is left. Never compose that here -- the words are the view model's.
//
// What each page still owns: the day's heading and its notes, what a press does, whether there is a rail at all,
// and the open windows under the list. Those genuinely differ, and the pages pass them in.

// One row. `name` is the headline, `service` and `dur` the line under it -- give it whichever of those you have.
// `phase` places it against the clock on today's list (past · now · next · later) and is "later" anywhere else.
const AgendaItem = ({
  time,
  name,
  service = null,
  dur = null,
  flag = null,
  glyph = null,
  phase = "later",
  onOpen,
  hint = null,
  testid = null,
}) => {
  // The line under the name: what it is for, then how long. Either may be missing; both missing draws no line.
  const sub = [service, dur].filter(Boolean).join(" · ");
  return (
    <button
      className={`ag-item ${phase}${flag ? " flagged" : ""}`}
      onClick={onOpen}
      title={hint || undefined}
      data-testid={testid || undefined}
      data-phase={phase}
    >
      <span className="ag-item-time">{time}</span>
      <span className="ag-item-rail" aria-hidden="true" />
      <span className="ag-item-body">
        <span className="ag-item-name">{name}</span>
        {sub && <span className="ag-item-sub">{sub}</span>}
        {flag && <span className="ag-item-flag">{flag}</span>}
      </span>
      {glyph && (
        <span className="mark ag-item-glyph">
          <Icon name={glyph} size={13} />
        </span>
      )}
    </button>
  );
};

// The list the rows stand on: it draws the rail behind them, so a page never positions that itself.
const AgendaItems = ({ children }) => <div className="ag-items">{children}</div>;

// What the receptionist would offer, under a day's rows. The label is the page's -- Today says "Open", the
// Calendar says what service it is open FOR -- and the windows are drawn the same on both.
const AgendaOpen = ({ label = "Open", children }) => (
  <div className="ag-open">
    <span className="ag-open-label">{label}</span>
    {children}
  </div>
);

Object.assign(window, { AgendaItem, AgendaItems, AgendaOpen });

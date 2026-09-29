/* global React, Icon, EmptyState, FailedRead, StatePill, AgendaItem, AgendaItems, AgendaOpen */
// Calendar, real: the owner's calendar as the receptionist reads it.
//
// One loaded window of days, four views sliced from it. The page keeps two
// things: the view and the day it looks at (the anchor). Everything else is
// derived — the span a view needs, the frames it draws, the numbers in the
// strip — and a view's SHAPE comes from dates alone (seven columns, forty-two
// cells, fourteen rows) while its CONTENT comes from the window, so a switch
// is instant and a read that is still landing changes nothing but the words
// inside. Only a move outside the window reads again.
//
// Every block is the feed's, every band is the business's hours and
// closures, every dashed window is a time the receptionist would offer a
// caller — the same function the phone tool uses. Nothing is booked, moved
// or cancelled here: the booking link does that.

const useCalendar = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:calendar", bump);
    return () => window.removeEventListener("surface:calendar", bump);
  }, []);
  return window.__CALENDAR;
};

const CR_HOUR_PX = 64;
const CR_VIEWS = [["week", "Week"], ["day", "Day"], ["month", "Month"], ["agenda", "Agenda"]];
/** Five minutes: the board reads itself again while open, so what it draws follows the clock. */
const CR_REFRESH_MS = 5 * 60 * 1000;
// What the page says of a read that gives no reason of its own (the feed's `problem` is contracts' sentence when there
// is one): a last good read that could not be refreshed, and a calendar that could not be read.
const CR_FEED_WORDS = {
  stale: "The calendar could not be refreshed.",
  unavailable: "The address is saved; check it in Settings › Business if this keeps happening.",
};
// Settings › Business states the same calendar's last read in its own row (pages/business-tab-open.jsx). It keeps a
// read for as long as this board does, and says these two states in these words: one number and one spelling, here,
// published because in the app each file is its own module.
window.__calendarPage = { refreshMs: CR_REFRESH_MS, words: CR_FEED_WORDS };
// The date arithmetic is contracts' (shiftKey, shiftMonth, monthLabelOf, clockLabel), reached through the bridge:
// one implementation for the page, the surface and the tests.
const crTyping = () => { const el = document.activeElement; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };
// What can be open over the board and has the keys while it is: the deal sheet, Ask, a menu. Only the app's (each sits
// inside .app-root), by People's rule (clients-a.jsx PL_OVERLAY), so a dialog a browser extension adds cannot silence
// the board. The appointment's own dialog is the page's: it holds Escape, and the key handler asks it first.
const CR_OVERLAY = '.app-root [role="dialog"], .app-root [role="menu"]';

// Where ‹ › and ← → take the board, one rule per view: a day in Day view, a
// week in Week view, fourteen days in Agenda, a month in Month. Day view used
// to fall through to the week branch and jump seven days.
const crStep = (view, anchor, n, cal) =>
  view === "month" ? cal.shiftMonth(anchor, n)
  : view === "agenda" ? cal.shiftKey(anchor, 14 * n)
  : view === "day" ? cal.shiftKey(anchor, n)
  : cal.shiftKey(anchor, 7 * n);
window.crStep = crStep;

// A phone opens on the agenda: a week grid is four times a phone's width.
const crPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

// Tab and Shift+Tab walk an open appointment's own controls and wrap round:
// focus never leaves the dialog for the board behind it.
const CR_FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const crTrapTab = (e, box) => {
  if (!box || !box.querySelectorAll) return;
  const els = Array.from(box.querySelectorAll(CR_FOCUSABLE));
  if (!els.length) { e.preventDefault(); return; }
  const first = els[0];
  const last = els[els.length - 1];
  const at = document.activeElement;
  if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
};
window.crTrapTab = crTrapTab;

// The range opens the browser's own date picker: a click on a date field only focuses its first number. A touch
// opens the picker by itself, and a browser that will not open it still takes a typed date.
const crOpenPicker = (e) => {
  const el = e.currentTarget;
  if (!el || typeof el.showPicker !== "function") return;
  if (e.type === "click" && window.matchMedia && !window.matchMedia("(pointer: fine)").matches) return;
  try { el.showPicker(); } catch { /* not allowed here; the field still takes a typed date */ }
};

// One taken block from the feed. Neutral, never an agent's colour: the
// calendar did not say who booked it, only that the time is taken.
const CrBlock = ({ b, hours, onOpen, wide, dayLong }) => {
  const y = (Math.max(hours.start, b.t) - hours.start) * CR_HOUR_PX;
  const h = Math.max(22, (Math.min(hours.end, b.t + b.dur / 60) - Math.max(hours.start, b.t)) * CR_HOUR_PX - 2);
  // Overlapping blocks take lanes side by side; a block alone keeps the column.
  const laned = b.lanes > 1 ? { left: `calc(4px + ${b.lane} * (100% - 8px) / ${b.lanes})`, width: `calc((100% - 8px) / ${b.lanes} - 2px)`, right: "auto" } : {};
  return (
    <button className="cal-appt feed" style={{ top: y, height: h, ...laned }} onClick={() => onOpen(b)} title={`${b.title} · ${b.time}`} aria-label={`${b.title}, ${b.time}, ${dayLong}`} data-testid="cal-block" data-lane={b.lanes > 1 ? `${b.lane + 1}/${b.lanes}` : undefined}>
      <span className="cal-appt-line1"><span className="cal-appt-who">{b.title}</span></span>
      <span className="cal-appt-service">{b.time}{wide && b.person ? ` · ${b.person.name}` : ""}</span>
    </button>
  );
};

// A window the receptionist would offer: dashed, quiet, under the blocks.
const CrWindow = ({ w, hours }) => {
  const y = (Math.max(hours.start, w.t) - hours.start) * CR_HOUR_PX;
  const h = Math.max(18, (Math.min(hours.end, w.t + w.dur / 60) - Math.max(hours.start, w.t)) * CR_HOUR_PX - 2);
  return (
    <div className="cal-open" style={{ top: y, height: h }} title={`Open · ${w.label} — the receptionist would offer this`} data-testid="cal-window">
      <span className="cal-open-label">Open · {w.label}</span>
    </div>
  );
};

// One appointment: who it is for (by a phone in the event, else a whole
// name), what the calendar wrote, and the one rule — nothing changes here.
// A person is never added from here by hand: an appointment that carries a
// phone puts its person in People on its own — when an owner opens this
// board, and every hour by the sweep — and a person nobody wants is deleted
// from their profile.
/** "1h", "45m", "1h 30m" — the same words the day's rows use (contracts durationLabel). */
const crDur = (min) => {
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

/**
 * When it is, said the way a person asks it: the day relative to now first, because "Tomorrow" is what an
 * owner checks for, and the date after it for the ones that are neither today nor tomorrow.
 */
const crWhen = (day, todayKey) => {
  if (day.today) return "Today";
  if (!todayKey || !day.key) return null;
  const at = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  const days = Math.round((at(day.key) - at(todayKey)) / 86400000);
  return days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : null;
};

/**
 * Whether the notes say anything the panel has not already said. A booking tool writes the person's name and
 * number into the event's description, and this dialog prints both above it; a box repeating them is noise
 * a reader has to look past. Strip what is already shown, and if no letter or digit survives, there is
 * nothing to show.
 */
const crNotesWorth = (desc, person, contacts) => {
  if (!desc) return null;
  let rest = desc;
  const shown = [person?.name, ...(contacts?.phones ?? []), ...(contacts?.e164 ?? []), ...(contacts?.emails ?? [])].filter(Boolean);
  for (const s of shown) rest = rest.split(s).join(" ");
  // A number written differently is the same number, so its digits decide — the last ten of them, because
  // "+1 917 555 0103" and "(917) 555-0103" are one number with and without its country code.
  for (const ph of [...(contacts?.phones ?? []), ...(contacts?.e164 ?? [])]) {
    const digits = String(ph).replace(/\D/g, "").slice(-10);
    if (digits.length >= 7) rest = rest.replace(new RegExp(digits.split("").join("\\D*"), "g"), " ");
  }
  return /[a-z0-9]/i.test(rest) ? desc : null;
};

// Published like crStep and crTrapTab are, so the decisions can be run in a test rather than read.
window.crDur = crDur;
window.crWhen = crWhen;
window.crNotesWorth = crNotesWorth;

const CrPanel = ({ b, day, todayKey, source, bookingLink, onCopyLink, onClose }) => {
  // A dialog: focus goes into it as it opens and back to what opened it as it
  // closes, Tab stays inside, and Escape (the page's key handler) closes it.
  // It was a borrowed modal with none of that, over a board the arrows moved.
  const boxRef = React.useRef(null);
  React.useEffect(() => {
    const opener = document.activeElement;
    if (boxRef.current) boxRef.current.focus();
    return () => { if (opener && typeof opener.focus === "function" && opener.isConnected !== false) opener.focus(); };
  }, []);
  // The person's deal is People's (0008), which can land after the dialog opens and moves when a proposal is recorded:
  // the dialog draws again whenever People does.
  const [, peopleMoved] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:clients", peopleMoved);
    return () => window.removeEventListener("surface:clients", peopleMoved);
  }, []);
  // Their deal's stage beside their name, and, once a consultation is over with no proposal since, the sheet's own act
  // that starts one: contracts' rule, words and mode (calendarPeekDeal, through the bridge), nothing where deals are off
  // or People does not hold them. The act opens the one deal sheet, so it is offered only where the sheet is installed.
  const deal = window.__calendar && window.__calendar.peekDeal ? window.__calendar.peekDeal(b, window.__PEOPLE, Date.now()) : null;
  const start = deal && deal.start && typeof window.openDealSheet === "function" ? deal.start : null;
  // The sheet takes over from the dialog, and focus with it. The dialog closes first and gives focus back to the
  // appointment that opened it; the sheet opens on the next task, takes focus, and has that appointment as its way
  // back. Opened in the same press, the dialog's way back ran after the sheet had taken focus and took it out again.
  const startProposal = () => {
    const { act, personId, service } = start;
    onClose();
    setTimeout(() => window.openDealSheet({ personId, mode: act.mode, service }), 0);
  };
  const contacts = b.contacts || { phones: [], emails: [] };
  const e164 = contacts.e164 || [];
  // The day before and after this board's today, so "Tomorrow" can be said without a second clock.
  const when = crWhen(day, todayKey);
  // A time that has gone is said so: an owner reading a finished appointment should not be deciding about it.
  const state = day.past ? { text: "Done", tone: "past" } : null;
  const namedInTitle = !!(b.person && b.person.name && String(b.title || "").toLowerCase().includes(String(b.person.name).toLowerCase()));
  const notes = crNotesWorth(b.description, b.person, { ...contacts, e164 });
  const found = [...contacts.phones, ...contacts.emails];
  // The link into their thread, the way the People rows and the profile hand it over:
  // a plain text while any message reaches them, the approved message once only that does.
  const textLink = () => {
    if (b.person.replyOpen) {
      try { sessionStorage.setItem("chanlytics-compose", JSON.stringify({ threadId: b.person.threadId, text: `Here's the link to book your appointment: ${bookingLink}` })); } catch { /* nothing to carry */ }
    }
    window.CHANLY.nav(window.CHANLY.R.thread(b.person.threadId));
  };
  return (
    <div className="ask-overlay" onClick={onClose} ref={window.leaving ? window.leaving("cal-ev") : undefined}>
      <div ref={boxRef} className="ask-modal cal-ev" role="dialog" aria-modal="true" aria-labelledby="cal-panel-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === "Tab") crTrapTab(e, boxRef.current); }} onClick={(e) => e.stopPropagation()} data-testid="cal-panel">
        <section className="st-modal-section">
          <div className="st-modal-name" id="cal-panel-title">{b.title}</div>
          <div className="cal-ev-when" data-testid="cal-panel-when">
            {when && <b className="cal-ev-when-rel">{when}</b>}
            <span>{when ? day.date || day.long : day.long}</span>
            <span>{b.time}</span>
            {b.dur > 0 && <span className="cal-ev-when-dur">{crDur(b.dur)}</span>}
            {state && <span className={`cal-ev-state ${state.tone}`} data-testid="cal-panel-state">{state.text}</span>}
          </div>
          {b.person ? (
            <div className="cal-ev-who" data-testid="cal-panel-person">
              <Icon name="users" size={12} />
              {namedInTitle ? <span>In People</span> : <><b>{b.person.name}</b> is in People</>}
              {deal && deal.stage && <StatePill kind="deal" value={deal.stage} testid="cal-panel-deal" />}
              {b.person.via && <span className="cal-ev-via">matched by {b.person.via}</span>}
            </div>
          ) : found.length > 0 ? (
            <div className="cal-ev-who" data-testid="cal-panel-contact">
              <Icon name="users" size={12} /> {b.guess ? <><b>{b.guess}</b> is </> : ""}{e164.length ? "Not in People yet — added within the hour" : "Not in People"}
              <span className="cal-ev-via">{found.join(" · ")}</span>
            </div>
          ) : b.guess ? (
            <div className="cal-ev-who" data-testid="cal-panel-guess">
              <Icon name="users" size={12} /> <b>{b.guess}</b>, as the calendar names them — no number on the event, so not in People
            </div>
          ) : null}
          {b.location && <div className="cal-ev-detail" data-testid="cal-panel-where"><span className="cal-ev-detail-key">Where</span><span>{b.location}</span></div>}
          {notes && (
            <div className="cal-ev-detail" data-testid="cal-panel-desc">
              <span className="cal-ev-detail-key">Notes</span>
              <span className="cal-ev-desc">{notes}</span>
            </div>
          )}
          <div className="cal-ev-note">From {source}. The receptionist treats this time as taken; to change or cancel it, edit it there.</div>
        </section>
        <footer className="st-modal-foot">
          <div className="cal-ev-foot-left">
            {b.person && (
              <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(`clients/${b.person.id}`)}>
                Open in People <Icon name="arrow-right" size={10} />
              </button>
            )}
            {b.person && b.person.threadId && bookingLink && (
              <button className="btn btn-ghost btn-sm" data-testid="cal-panel-text-link" title={b.person.replyOpen ? "Opens their thread with the link ready to send" : "Only an approved message reaches them until they write again; their thread offers the one with the link"} onClick={textLink}>
                <Icon name="calendar" size={12} /> {b.person.replyOpen ? "Text the booking link" : "Send the booking link"}
              </button>
            )}
          </div>
          <div className="st-modal-foot-actions">
            {bookingLink && (
              <button className="btn btn-ghost btn-sm" data-testid="cal-panel-copy-link" title={bookingLink} onClick={onCopyLink}>Copy the booking link</button>
            )}
            {/* The dialog's primary act, gated as the sheet's Save is: a role that may not record a deal is told why here. */}
            {start && (
              <button className="btn btn-primary btn-sm" onClick={startProposal} data-testid="cal-panel-propose" {...window.gate("approve", "record a deal")}>{start.act.label}</button>
            )}
            <button className="btn btn-sm" onClick={onClose}>Close</button>
          </div>
        </footer>
      </div>
    </div>
  );
};

// The board: hours down, days across. Seven columns in Week, one in Day.
const CrBoard = ({ frames, hours, now, wide, fit, onDay, onOpen }) => {
  const gridH = (hours.end - hours.start) * CR_HOUR_PX;
  const ticks = [];
  for (let h = hours.start; h < hours.end; h++) ticks.push(h);
  return (
    <div className="cal-scroll">
      <div className={`cal-grid ${wide ? "cal-grid-day" : ""}`}>
        <div className="cal-corner" />
        {frames.map((d) => (
          <div key={d.key} className={`cal-dayhead ${d.today ? "today" : ""}`} data-testid="cal-dayhead">
            {/* The day's name opens it in Day view from a keyboard too (C4): the head was a clickable div no Tab reached,
                named only in a title. */}
            {wide ? (
              <><span className="cal-dow">{d.dow}</span><span className="cal-date tabular">{d.date}</span></>
            ) : (
              <button type="button" className="cal-dayhead-open" onClick={() => onDay(d.key)} aria-label={`Open ${d.long} in Day view`} aria-current={d.today ? "date" : undefined} data-testid="cal-dayhead-open">
                <span className="cal-dow">{d.dow}</span>
                <span className="cal-date tabular">{d.date}</span>
              </button>
            )}
            {d.closed.yes && <span className="cal-closed-chip" title={d.closed.note || ""}>Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>}
            {d.allDay.map((b) => (
              <button key={b.id} className="cal-allday" onClick={() => onOpen(b)} title={b.title} aria-label={`${b.title}, all day, ${d.long}`}>{b.title}</button>
            ))}
          </div>
        ))}
        <div className="cal-gutter" style={{ height: gridH }}>
          {ticks.map((h) => (
            <span key={h} className="cal-hour tabular" style={{ top: (h - hours.start) * CR_HOUR_PX }}>{window.__calendar.clockLabel(h)}</span>
          ))}
        </div>
        {frames.map((d) => (
          <div key={d.key} className={`cal-col ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`} style={{ height: gridH }} data-testid="cal-col">
            {d.bands.map((b, i) => (
              <div key={i} className={`cal-unavail ${b.from <= hours.start && b.to >= hours.end ? "full" : ""}`} style={{ top: (b.from - hours.start) * CR_HOUR_PX, height: (b.to - b.from) * CR_HOUR_PX }}>
                {b.label && <span>{b.label}</span>}
              </div>
            ))}
            {d.windows.filter(fit).map((w, i) => <CrWindow key={i} w={w} hours={hours} />)}
            {d.blocks.map((b) => <CrBlock key={b.id} b={b} hours={hours} onOpen={onOpen} wide={wide} dayLong={d.long} />)}
            {d.today && now !== null && now >= hours.start && now <= hours.end && (
              <div className="cal-nowline" style={{ top: (now - hours.start) * CR_HOUR_PX }}><span className="cal-nowdot" /></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// What a month day holds, said with its date (C4): a screen reader heard "8", "1 taken", "1 open" and no day. The words
// the cell draws, in its order.
const crCellLabel = (d, taken, open, feedOk) => {
  const held = d.closed.yes ? `closed${d.closed.note ? ` · ${d.closed.note}` : ""}`
    : d.unread ? "couldn't read"
    : d.loading ? "reading"
    : !feedOk ? ""
    : [taken > 0 ? `${taken} taken` : "", open > 0 && !d.past ? `${open} open` : ""].filter(Boolean).join(", ") || "nothing on the calendar";
  return held ? `${d.long}: ${held}` : d.long;
};

// The month: six weeks of counts. A day says how much is taken and how
// many open times it has; closed days say why. Click a day to see it.
const CrMonth = ({ frames, monthKey, feedOk, fit, onDay }) => {
  const rows = [];
  for (let i = 0; i < frames.length; i += 7) rows.push(frames.slice(i, i + 7));
  return (
    <div className="cal-month" data-testid="cal-month">
      <div className="cal-month-head">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}</div>
      {rows.map((row, r) => (
        <div key={r} className="cal-month-row">
          {row.map((d) => {
            const taken = d.blocks.length + d.allDay.length;
            const open = d.windows.filter(fit).length;
            const inMonth = d.key.slice(0, 7) === monthKey;
            return (
              <button key={d.key} className={`cal-month-cell ${inMonth ? "" : "muted"} ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.closed.yes ? "closed" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`} onClick={() => onDay(d.key)} title={d.long} aria-label={crCellLabel(d, taken, open, feedOk)} aria-current={d.today ? "date" : undefined} data-testid="cal-month-cell">
                <span className="cal-month-num tabular">{d.dayNum}</span>
                {d.closed.yes && <span className="cal-month-closed">{d.closed.note ? `Closed · ${d.closed.note}` : "Closed"}</span>}
                {d.unread && <span className="cal-month-none">couldn't read</span>}
                {d.loading && <span className="cal-month-none">reading…</span>}
                {!d.closed.yes && !d.loading && !d.unread && feedOk && (
                  <span className="cal-month-counts">
                    {taken > 0 && <span className="cal-month-taken">{taken} taken</span>}
                    {open > 0 && !d.past && <span className="cal-month-open">{open} open</span>}
                    {taken === 0 && (open === 0 || d.past) && <span className="cal-month-none">—</span>}
                  </span>
                )}
                {d.allDay.slice(0, 2).map((b) => <span key={b.id} className="cal-month-allday" title={b.title}>{b.title}</span>)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// The agenda: days as a list — what is taken, then what the receptionist
// would offer — the way a phone-first owner reads a day.
//
// Its rows ARE Today's rows (components/day-agenda.jsx): the same time column, the same rail, the person first
// with the service and the length under them. It drew its own before — a 120px span, the event's whole title,
// the name again underneath — so the same appointment read one way here and another on Today, and the customer's
// name appeared twice in both. The day's heading, what a press opens, and the Open line below are still the
// Calendar's own.
const CrAgenda = ({ frames, feedOk, fit, service, offer, onOpen }) => {
  const cal = window.__calendar || {};
  const clock = cal.clockLabel || ((t) => String(t));
  const howLong = cal.durationLabel || (() => "");
  return (
    <div className="cal-agenda" data-testid="cal-agenda">
      {frames.map((d) => {
        const windows = d.windows.filter(fit);
        const items = [...d.allDay.map((b) => [b, true]), ...d.blocks.map((b) => [b, false])];
        return (
          <div key={d.key} className={`cal-agenda-day ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`} data-testid="cal-agenda-day">
            <div className="cal-agenda-head">
              <span className="cal-dow">{d.dow}</span>
              <span className="cal-date tabular">{d.date}</span>
              {d.closed.yes && <span className="cal-closed-chip">Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>}
            </div>
            {items.length > 0 && (
              <AgendaItems>
                {items.map(([b, allDay]) => (
                  <AgendaItem
                    key={b.id}
                    time={allDay ? "All day" : clock(b.t)}
                    name={b.person ? b.person.name : b.service}
                    service={b.person ? b.service : null}
                    dur={allDay ? null : howLong(b.dur)}
                    onOpen={() => onOpen(b)}
                    hint={b.time}
                    testid="cal-agenda-item"
                  />
                ))}
              </AgendaItems>
            )}
            {d.loading && <span className="ag-none">Reading this day…</span>}
            {d.unread && <span className="ag-none">Couldn't read this day.</span>}
            {!d.loading && !d.unread && !d.closed.yes && feedOk && items.length === 0 && <EmptyState kind="line" title="Nothing on the calendar." />}
            {!d.loading && !d.unread && !d.closed.yes && feedOk && !d.past && (
              <AgendaOpen label={`Open${service ? (service.consultFirst ? " for a consultation" : ` for ${service.name}`) : ""}:`}>
                {/* Past the last day it offers, a free day read as a day with nothing to offer (C1). */}
                {d.beyondOffer
                  ? <span className="ag-none">not offered yet — it offers times up to {offer.days} days ahead</span>
                  : windows.length ? windows.map((w) => <span key={w.label} className="ag-window">{w.label}</span>) : <span className="ag-none">{service && service.consultFirst ? "the receptionist offers a consultation for this, not the service" : "nothing the receptionist would offer"}</span>}
              </AgendaOpen>
            )}
          </div>
        );
      })}
    </div>
  );
};

const CalendarReal = ({ initialDay = null }) => {
  const C = useCalendar();
  // A link can name a day (calendar/<YYYY-MM-DD>), which opens in Day view; a phone opens on the agenda.
  const [view, setView] = React.useState(() => (initialDay ? "day" : crPhone() ? "agenda" : "week"));
  const [anchorKey, setAnchorKey] = React.useState(initialDay);
  const [openId, setOpenId] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  // The span a read failed for: while it is the one on screen, its days say so, with a Retry.
  const [failedSpan, setFailedSpan] = React.useState(null);
  const [serviceName, setServiceName] = React.useState("");
  // The owner's Refresh on its way (C2): its button says so, and a second press waits for it.
  const [refreshing, setRefreshing] = React.useState(false);
  // The hours, the booking rules and the calendar's source wait under the board until asked for.
  const [aboutOpen, setAboutOpen] = React.useState(false);
  // Hours and rules open under the board, where a phone has scrolled them out of sight: opening brings them into view,
  // smoothly, and closing folds them away while the page glides back up with them (calendar.css), never a blank left
  // at the foot. It held still before (data-bits holdStill), so the panel opened below the screen and, closed, left the
  // room it had taken under everything (Ruben, 24 Sep).
  const aboutRef = React.useRef(null);
  const toggleAbout = () => {
    const opening = !aboutOpen;
    const flush = window.ReactDOM && window.ReactDOM.flushSync;
    if (flush) flush(() => setAboutOpen(opening));
    else setAboutOpen(opening);
    const panel = aboutRef.current;
    if (!opening || !panel || !panel.scrollIntoView) return;
    const still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    panel.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  };
  const [toastNode, flash] = window.usePPToast();
  const vm = C ? C.vm : null;
  const cal = window.__calendar;
  const anchor = anchorKey || (vm ? vm.today : null);

  // A second door to a day while the page is open moves it there.
  React.useEffect(() => {
    if (initialDay) { setAnchorKey(initialDay); setView("day"); }
  }, [initialDay]);

  // What the view needs, from the anchor alone; whether the window has it.
  const span = vm && cal ? cal.spanFor(view, anchor) : null;
  const covered = !!(vm && cal && span && cal.covers(vm.days, span.from, span.days));
  // What Ask is told is on screen (legacy-bridge/ask/context.ts): the span drawn ("YYYY-MM-DD/<days>") and the people its
  // appointments name, in the board's order, forty at most.
  React.useEffect(() => {
    const at = span && vm ? vm.days.findIndex((d) => d.key === span.from) : -1;
    const days = at >= 0 ? vm.days.slice(at, at + span.days) : [];
    const named = new Map();
    for (const d of days) for (const b of [...(d.allDay || []), ...(d.blocks || [])]) if (b.person && !named.has(b.person.id)) named.set(b.person.id, b.person.name || "");
    const ids = [...named.keys()].slice(0, 40);
    window.__askOnScreen = { key: "calendar", ids, labels: ids.map((id) => named.get(id)), view: span ? `${span.from}/${span.days}` : null };
    // Taken back when the board goes: its people are no longer on screen.
    return () => { if (window.__askOnScreen && window.__askOnScreen.key === "calendar") window.__askOnScreen = null; };
  });

  // Read only when the window does not cover the view. The frames below
  // already have their shape, so nothing jumps when the read lands. A read
  // that fails names its span, and those days say so with a Retry; a toast
  // said it once and faded, over days still dimmed as if loading.
  const spanKey = span ? `${span.from}+${span.days}` : null;
  const readSeq = React.useRef(0);
  const read = () => {
    const mine = ++readSeq.current;
    const land = (ok) => {
      if (mine !== readSeq.current) return;
      setPending(false);
      setFailedSpan(ok ? null : spanKey);
    };
    setPending(true);
    cal.ensure(view, anchor).then((ok) => { land(ok); }, () => land(false));
  };
  React.useEffect(() => {
    if (!vm || !cal) return undefined;
    if (covered) { setPending(false); return undefined; }
    read();
    return () => { readSeq.current += 1; };
  }, [view, anchor, covered]); // eslint-disable-line react-hooks/exhaustive-deps

  // The board keeps itself current while it is open: every five minutes, in
  // a visible tab, the loaded window is read again, so the now line, the
  // next open time and the open times follow the clock.
  React.useEffect(() => {
    if (!cal || !cal.refresh) return undefined;
    const id = setInterval(() => { if (document.visibilityState === "visible") cal.refresh(); }, CR_REFRESH_MS);
    return () => clearInterval(id);
  }, [cal]);

  // ← → move, T is today — unless the person is typing, or an appointment is
  // open: the board holds still behind the dialog, and Escape closes it. One
  // listener for the page's life, reading what the latest render left in
  // `keys`; it was added and removed again on every render.
  const keys = React.useRef(null);
  React.useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;
      // A key something took before the window heard it (a group of choices in the deal sheet) is not the board's.
      if (!k || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || crTyping()) return;
      if (k.open) { if (e.key === "Escape") { e.preventDefault(); k.close(); } return; }
      // Anything else open over the page has the keys, the deal sheet among them: ←, → and T moved the board behind it.
      if (document.querySelector && document.querySelector(CR_OVERLAY)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); k.move(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); k.move(1); }
      else if (e.key === "t" || e.key === "T") { e.preventDefault(); k.today(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Leaving the page takes the loaded weeks back to today's: Today's day and its next open time read the same
  // surface, and a board left on another month took them with it (C1).
  React.useEffect(() => () => { if (window.__calendar && window.__calendar.home) window.__calendar.home(); }, []);

  if (!vm || !cal) { keys.current = null; return null; }

  const byKey = new Map(vm.days.map((d) => [d.key, d]));
  const frames = [];
  for (let i = 0; i < span.days; i++) {
    const k = cal.shiftKey(span.from, i);
    frames.push(byKey.get(k) || { ...cal.frameOf(k, vm.today), loading: true, closed: { yes: false, note: null }, bands: [], blocks: [], allDay: [], windows: [] });
  }
  // Days a failed read left out are not loading: they could not be read.
  const unread = !covered && !pending && failedSpan === spanKey;
  if (unread) for (const f of frames) if (f.loading) { f.loading = false; f.unread = true; }
  const shown = view === "day" ? frames.filter((f) => f.key === anchor) : frames;
  const feedOk = vm.feed.state === "ok";
  const service = vm.services.find((s) => s.name === serviceName) || null;
  // The phone tool's and the assistant's rule (offerFor): a service's own length, or a consultation's when it needs one first (C5b).
  const fit = (w) => !service || !service.offerMinutes || w.dur >= service.offerMinutes;
  const monthKey = view === "month" ? anchor.slice(0, 7) : null;

  const move = (n) => setAnchorKey(crStep(view, anchor, n, cal));
  // A swipe across the days walks them on a phone (data-bits touchSwipe, a page that stays): the step ‹ and › take,
  // drawn at once so the next days are what comes in. Never from what keeps its own touch: the strips' one list
  // (surface-tabs.jsx ST_OWN_TOUCH -- a dialog, a sheet, a menu, a toast).
  const swipePages = (el, from) =>
    from && from.closest && window.ST_OWN_TOUCH && from.closest(window.ST_OWN_TOUCH)
      ? null
      : {
          prev: true,
          next: true,
          stays: true,
          go: (step) => {
            const flush = window.ReactDOM && window.ReactDOM.flushSync;
            if (flush) flush(() => move(step));
            else move(step);
          },
        };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(vm.bookingLink); flash({ msg: <>Booking link copied.</> }); }
    catch { flash({ tone: "warn", msg: <>Could not copy — the link is {vm.bookingLink}</> }); }
  };
  const openDay = (key) => { setAnchorKey(key); setView("day"); };
  // The owner's Refresh (C2): the calendar itself, now, and what came of it, in the words the read found -- the board
  // read itself every five minutes and offered no way to ask sooner. One read at a time.
  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    let landed = false;
    try { landed = await cal.refresh({ fresh: true }); } catch { landed = false; } finally { setRefreshing(false); }
    const f = window.__CALENDAR && window.__CALENDAR.vm ? window.__CALENDAR.vm.feed : null;
    if (!landed || !f) { flash({ tone: "warn", msg: <>Couldn't reach Chanlytics — the board is as it was.</> }); return; }
    if (f.state === "ok" && !f.stale) { flash({ msg: <>Read your calendar just now.</> }); return; }
    const why = f.problem ? ` ${f.problem}` : "";
    flash({ tone: "warn", msg: f.state === "ok" ? <>Couldn't refresh your calendar — showing the last good read.{why}</> : <>Still couldn't read your calendar.{why}</> });
  };
  const first = frames[0];
  const last = frames[frames.length - 1];
  const label = view === "day" && shown[0] ? `${shown[0].dow} · ${shown[0].date}` : view === "month" ? cal.monthLabel(anchor) : `${first.date} – ${last.key.slice(0, 7) === first.key.slice(0, 7) ? last.date.replace(/^[A-Za-z]+ /, "") : last.date}`;
  const onToday = view === "month" ? anchor.slice(0, 7) === vm.today.slice(0, 7) : view === "week" ? shown.some((d) => d.today) : anchor === vm.today;
  const openBlock = openId ? vm.days.flatMap((d) => [...d.blocks, ...d.allDay].map((b) => ({ b, d }))).find((x) => x.b.id === openId) : null;
  keys.current = { open: !!openBlock, move, today: () => setAnchorKey(null), close: () => setOpenId(null) };

  return (
    // Days on their way dim by the one rule every page uses (components.css [data-loading] [data-dims]): after a beat,
    // so a window the tab holds, painted at once, never flickers.
    <div className="calendar" data-testid="calendar-real" data-loading={pending ? "" : undefined}>
      {/* The calendar first: one bar of controls over the board, and the hours, the booking rules, the calendar's source
          and Refresh one tap away under it. A title the top bar already says, a paragraph, three stat cards and five rows
          of controls came first, and on a phone the first day sat below the fold. A line of counts stood under the bar
          until 22 Sep ("This week 30 on your calendar · Open times 1 that fit Haircut · Next open time tomorrow 4 PM"):
          the board draws every one of those -- the appointments, the open times the service picker leaves, the next of
          them -- and Today's day says the next open time in words. Days that could not be read and days on their way
          keep their own lines (cal-failed with its Retry, cal-reading), which never needed the counts. */}
      <div className="cal-head">
        <div className="cal-bar" data-testid="cal-bar">
          <div className="cal-when">
            <div className="cal-steps">
              <button className="btn btn-ghost btn-icon btn-sm cal-nav" title="Previous" aria-label="Previous" onClick={() => move(-1)} data-testid="cal-prev"><Icon name="chevron" size={14} className="cal-flip" /></button>
              <button className="btn btn-ghost btn-sm cal-today-btn" onClick={() => setAnchorKey(null)} disabled={onToday} data-testid="cal-today">Today</button>
              <button className="btn btn-ghost btn-icon btn-sm cal-nav" title="Next" aria-label="Next" onClick={() => move(1)} data-testid="cal-next"><Icon name="chevron" size={14} /></button>
            </div>
            {/* The range says which days are on screen, and opens a date picker: the date field was a control of its own. */}
            <label className="cal-title" title="Go to a date">
              <span className="cal-title-range" aria-live="polite" data-testid="cal-range">{label}</span>
              <Icon name="chevron-down" size={12} />
              <input className="cal-jump" type="date" aria-label="Go to a date" value={anchor} onChange={(e) => { if (e.target.value) setAnchorKey(e.target.value); }} onClick={crOpenPicker} onKeyDown={(e) => { if (e.key === "Enter") crOpenPicker(e); }} data-testid="cal-jump" />
            </label>
          </div>
          <div className="cal-tools">
            {vm.services.length > 0 && (
              <select className="tpl-select cal-service" value={serviceName} onChange={(e) => setServiceName(e.target.value)} aria-label="Open times that fit a service" title="Show only the open times long enough for a service" data-testid="cal-service">
                <option value="">Any service</option>
                {vm.services.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
              </select>
            )}
            <div className="cl-tabs cal-views" role="group" aria-label="View">
              {/* A view is a different height under the tabs (fourteen cards, six weeks, a day): they hold still. */}
              {CR_VIEWS.map(([id, l]) => <button key={id} className={`cl-tab ${view === id ? "active" : ""}`} aria-pressed={view === id} onClick={(e) => (window.holdStill ? window.holdStill(e && e.currentTarget, () => setView(id)) : setView(id))} data-testid={`cal-view-${id}`}>{l}</button>)}
            </div>
          </div>
        </div>
      </div>
      {/* On a phone the bar stands over the days and only they scroll and pull (mobile.css .cal-pane), as every page's
          strip does, and a swipe across them walks to the next or previous days; on a desk this box is display:
          contents and the page scrolls as one. */}
      <div className="cal-pane" data-testid="cal-pane" {...(window.touchSwipe ? window.touchSwipe({ pages: swipePages, when: crPhone }) : {})}>
      {service && service.consultFirst && (
        <div className="cal-feed-card" data-testid="cal-consult-note">
          <Icon name="shield" size={14} />
          <span><b>{service.name} needs a consultation first.</b> The receptionist does not offer times for it; it offers the consultation and {vm.bookingLink ? "sends the booking link" : "takes their details"}. The open times here are for a consultation{service.offerMinutes ? `, about ${service.offerMinutes} minutes` : ""}.</span>
        </div>
      )}
      {vm.feed.state !== "ok" && (
        <div className="cal-feed-card" data-testid="cal-feed-card">
          <Icon name="calendar" size={14} />
          {vm.feed.state === "none" ? (
            <span>
              <b>No calendar connected.</b> Paste the private iCal address of the calendar your appointments land in — Google, Apple or Outlook; Booksy, Calendly and the rest sync into one — under Settings › Business.
              Until then the receptionist {vm.bookingLink ? "sends the booking link but " : ""}never names an open time, and this board shows only your hours and closures.
            </span>
          ) : (
            <span><b>Your calendar could not be read.</b> {vm.feed.problem || CR_FEED_WORDS.unavailable}{vm.feed.problem ? ` Until it reads, the receptionist ${vm.bookingLink ? "sends the booking link but " : ""}never names an open time.` : ""}</span>
          )}
          {/* A calendar that can't be read: its only way back was Settings (C2). */}
          {vm.feed.state === "unavailable" && (
            <button type="button" className="btn btn-sm" onClick={refreshNow} disabled={refreshing} data-testid="cal-feed-retry">{refreshing ? "Retrying…" : "Retry"}</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("workspace"))}>{vm.feed.state === "none" ? "Paste the address" : "Check the address"}</button>
        </div>
      )}
      {vm.feed.state === "ok" && vm.feed.stale && (
        <div className="cal-feed-card" data-testid="cal-feed-stale">
          <Icon name="calendar" size={14} />
          <span><b>Showing the last good read.</b> {vm.feed.problem || CR_FEED_WORDS.stale} The receptionist is using this read too; it tries again every few minutes.</span>
          <button type="button" className="btn btn-sm" onClick={refreshNow} disabled={refreshing} data-testid="cal-feed-stale-retry">{refreshing ? "Retrying…" : "Retry"}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("workspace"))}>Check the address</button>
        </div>
      )}
      {feedOk && vm.feed.notes.map((n) => (
        <div key={n.id} className={`cal-feed-card cal-feed-note ${n.id}`} data-testid={`cal-feed-note-${n.id}`}>
          <Icon name={n.id === "repeats" ? "alert" : "calendar"} size={14} />
          <span><b>{n.title}</b> {n.body}</span>
        </div>
      ))}
      {!covered && failedSpan === spanKey && (
        <FailedRead kind="line" what="those days" body="What was already on screen is still current, and the receptionist reads your calendar on its own." onRetry={read} busy={pending} className="cal-failed" testid="cal-failed" />
      )}
      {/* A read on its way says so in words; the board only dimmed (C2). */}
      {pending && (
        <div className="cal-reading" role="status" data-testid="cal-reading">Reading those days…</div>
      )}

      <div key={view} className="cal-body" data-dims aria-busy={pending ? "true" : "false"} data-testid="cal-body">
        {view === "month" && <CrMonth frames={frames} monthKey={monthKey} feedOk={feedOk} fit={fit} onDay={openDay} />}
        {view === "agenda" && <CrAgenda frames={frames} feedOk={feedOk} fit={fit} service={service} offer={vm.offer} onOpen={(b) => setOpenId(b.id)} />}
        {(view === "week" || view === "day") && <CrBoard frames={shown} hours={vm.hours} now={vm.now} wide={view === "day"} fit={fit} onDay={openDay} onOpen={(b) => setOpenId(b.id)} />}
      </div>

      <div className="cal-foot">
        <div className="cal-foot-row">
          <div className="cal-legend" data-testid="cal-legend">
            <span><i className="cal-legend-swatch taken" /> Taken, from your calendar</span>
            <span><i className="cal-legend-swatch open" /> Open — the receptionist would offer it{service ? (service.consultFirst ? " for a consultation" : ` for ${service.name}`) : ""}, through {vm.offer.label}</span>
            <span><i className="cal-legend-swatch closed" /> Outside your hours, or closed</span>
            <span className="cal-legend-rules">Times are {vm.zoneCity} time</span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm cal-about-toggle" aria-expanded={aboutOpen} aria-controls="cal-about" onClick={toggleAbout} data-testid="cal-about-toggle">
            Hours and rules <Icon name="chevron-down" size={12} />
          </button>
        </div>
        {/* The hours and the rules were a card over the board, and the calendar's pill and Refresh sat among the controls:
            they are one tap away here. A calendar that can't be read still says so over the board, with its Retry. */}
        <div className="cal-about" id="cal-about" ref={aboutRef} data-open={aboutOpen ? "true" : "false"} aria-hidden={aboutOpen ? undefined : "true"} inert={aboutOpen ? undefined : true} data-testid="cal-about">
          {/* What the receptionist works from, as one sheet: a term and its value, each value on lines of its own. It
              was a run of labels and sentences ("From your calendar · read just now · 36 events") with a Refresh that
              read as a word (Ruben, 24 Sep: "less copy ... the refresh button does not even look like a button"). */}
          <div className="cal-about-in">
            <div className="cal-rules" data-testid="cal-rules">
              <dl className="cal-rules-list">
                <div className="cal-rules-group">
                  <dt className="cal-rules-label">Hours</dt>
                  <dd className="cal-rules-value">
                    {vm.hoursLines.length ? vm.hoursLines.map((l) => <span key={l} className="cal-rules-line">{l}</span>) : "Not set yet"}
                  </dd>
                </div>
                <div className="cal-rules-group">
                  <dt className="cal-rules-label">Closed</dt>
                  <dd className="cal-rules-value">
                    {vm.closuresAhead.length
                      ? vm.closuresAhead.map((c) => <span key={c.label} className="cal-rules-line">{`${c.label}${c.note ? ` (${c.note})` : ""}`}</span>)
                      : "None ahead"}
                    {vm.closuresMore > 0 && <span className="cal-rules-line cal-rules-more">+{vm.closuresMore} more</span>}
                  </dd>
                </div>
                <div className="cal-rules-group">
                  <dt className="cal-rules-label">Booking</dt>
                  <dd className="cal-rule-parts cal-rules-value">{vm.ruleParts.map((p) => <span key={p} className="cal-rule" data-testid="cal-rule">{p}</span>)}</dd>
                </div>
                {/* Which services wait for a consultation was said only inside the service picker (C1). */}
                {vm.consultFirst.length > 0 && (
                  <div className="cal-rules-group" data-testid="cal-rules-consult">
                    <dt className="cal-rules-label">Consultation first</dt>
                    <dd className="cal-rules-value">{vm.consultFirst.join(" · ")}</dd>
                  </div>
                )}
                <div className="cal-rules-group">
                  {/* The Business tab's name for it, word for word (spec §10): one name for one thing on both pages. */}
                  <dt className="cal-rules-label">Calendar it reads</dt>
                  <dd className="cal-rules-value cal-rules-feed">
                    {/* The state in the pill Connections and Setup use (C3), and beside it only when it was read: where
                        it reads from and how many events it found are Settings' to say. Something wrong keeps the whole
                        detail, when it was tried and when it was last read. */}
                    <span className="cal-feed-chip" data-testid="cal-feed">
                      <StatePill kind="calendar" value={vm.feed.health} testid="cal-feed-state" />
                      {(vm.feed.state === "ok" && !vm.feed.stale ? vm.feed.read : vm.feed.detail) && (
                        <span className="cal-feed-detail">{vm.feed.state === "ok" && !vm.feed.stale ? vm.feed.read : vm.feed.detail}</span>
                      )}
                    </span>
                    {vm.feed.present && (
                      <button type="button" className="btn btn-sm cal-refresh" onClick={refreshNow} disabled={refreshing} aria-busy={refreshing ? "true" : "false"} data-testid="cal-refresh">
                        <Icon name="refresh" size={12} />{refreshing ? "Reading…" : "Refresh"}
                      </button>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="cal-rules-links">
                <span className="cal-about-note">{vm.bookingLink ? "Customers book through your booking link." : "Customers book with your team."}</span>
                <span className="cal-rules-doors">
                  {vm.bookingLink && <button type="button" className="cl-bucket-link" title={vm.bookingLink} onClick={copyLink} data-testid="cal-copy-link"><Icon name="copy" size={11} />Copy booking link</button>}
                  <button type="button" className="cl-bucket-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("workspace"))}>Edit in Settings › Business <Icon name="arrow-right" size={10} /></button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {openBlock && <CrPanel b={openBlock.b} day={openBlock.d} todayKey={vm.today} source={vm.feed.source || "your calendar"} bookingLink={vm.bookingLink} onCopyLink={copyLink} onClose={() => setOpenId(null)} />}
      {toastNode}
    </div>
  );
};

window.CalendarPage = (props) => {
  const Seed = window.CalendarSeed;
  if (window.__CALENDAR) return <CalendarReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};

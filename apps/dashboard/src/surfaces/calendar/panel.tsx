/**
 * One appointment, opened (moved from legacy/pages/calendar.jsx CrPanel, decision 0015): who it is for (by a phone in the
 * event, else a whole name), what the calendar wrote, and the one rule: nothing changes here. A person is never added from
 * here by hand: an appointment that carries a phone puts its person in People on its own, when an owner opens this board
 * and every hour by the sweep, and a person nobody wants is deleted from their profile.
 */
import { useEffect, useReducer, useRef } from "react";
import type { CalendarBlockVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { gate, leaving, navigate, trapFocus } from "../legacy-verbs";
import { askDealSheet, dealSheetInstalled, onPeopleMoved, peopleRead, routeTo, statePill } from "./shell-verbs";
import type { CalendarFrame } from "./types";
import { calendar } from "./verbs";
import { crDur, crNotesWorth, crWhen } from "./words";

type Person = CalendarBlockVM["person"];
type Deal = ReturnType<typeof calendar.peekDeal>;

/** When it is: the day relative to now first, then the date and the time, how long, and that it is done when its day has gone. */
function whenLine(p: { b: CalendarBlockVM; day: CalendarFrame; when: string | null }) {
  const { b, day, when } = p;
  // A time that has gone is said so: an owner reading a finished appointment should not be deciding about it.
  const state = day.past ? { text: "Done", tone: "past" } : null;
  return (
    <div className="cal-ev-when" data-testid="cal-panel-when">
      {when && <b className="cal-ev-when-rel">{when}</b>}
      <span>{when ? day.date || day.long : day.long}</span>
      <span>{b.time}</span>
      {b.dur > 0 && <span className="cal-ev-when-dur">{crDur(b.dur)}</span>}
      {state && (
        <span className={`cal-ev-state ${state.tone}`} data-testid="cal-panel-state">
          {state.text}
        </span>
      )}
    </div>
  );
}

/** Who it is for: the person People matched, else the numbers and addresses the event carried, else the name it gave. */
function whoLine(p: { b: CalendarBlockVM; person: Person; deal: Deal; e164: string[]; found: string[] }) {
  const { b, person, deal, e164, found } = p;
  const namedInTitle = !!(
    person &&
    person.name &&
    String(b.title || "")
      .toLowerCase()
      .includes(String(person.name).toLowerCase())
  );
  const Pill = statePill();
  return person ? (
    <div className="cal-ev-who" data-testid="cal-panel-person">
      <Icon name="users" size={12} />
      {namedInTitle ? (
        <span>In People</span>
      ) : (
        <>
          <b>{person.name}</b> is in People
        </>
      )}
      {deal && deal.stage && <Pill kind="deal" value={deal.stage} testid="cal-panel-deal" />}
      {person.via && <span className="cal-ev-via">matched by {person.via}</span>}
    </div>
  ) : found.length > 0 ? (
    <div className="cal-ev-who" data-testid="cal-panel-contact">
      <Icon name="users" size={12} />{" "}
      {b.guess ? (
        <>
          <b>{b.guess}</b> is{" "}
        </>
      ) : (
        ""
      )}
      {e164.length ? "Not in People yet — added within the hour" : "Not in People"}
      <span className="cal-ev-via">{found.join(" · ")}</span>
    </div>
  ) : b.guess ? (
    <div className="cal-ev-who" data-testid="cal-panel-guess">
      <Icon name="users" size={12} /> <b>{b.guess}</b>, as the calendar names them — no number on the event, so not in
      People
    </div>
  ) : null;
}

/** The dialog's foot: the way on to People and to their thread, the booking link, the deal sheet's own act, and Close. */
function panelFoot(p: {
  person: Person;
  bookingLink: string | null;
  start: Deal["start"];
  textLink: () => void;
  startProposal: () => void;
  onCopyLink: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { person, bookingLink, start, textLink, startProposal, onCopyLink, onClose } = p;
  return (
    <footer className="st-modal-foot">
      <div className="cal-ev-foot-left">
        {person && (
          <Button variant="quiet" size="sm" onClick={() => navigate(routeTo.person(person.id))}>
            Open in People <Icon name="arrow-right" size={10} />
          </Button>
        )}
        {person && person.threadId && bookingLink && (
          <Button
            variant="quiet"
            size="sm"
            data-testid="cal-panel-text-link"
            title={
              person.replyOpen
                ? "Opens their thread with the link ready to send"
                : "Only an approved message reaches them until they write again; their thread offers the one with the link"
            }
            onClick={textLink}
          >
            <Icon name="calendar" size={12} /> {person.replyOpen ? "Text the booking link" : "Send the booking link"}
          </Button>
        )}
      </div>
      <div className="st-modal-foot-actions">
        {bookingLink && (
          <Button variant="quiet" size="sm" data-testid="cal-panel-copy-link" title={bookingLink} onClick={onCopyLink}>
            Copy the booking link
          </Button>
        )}
        {/* The dialog's primary act, gated as the sheet's Save is: a role that may not record a deal is told why here. */}
        {start && (
          <Button
            variant="primary"
            size="sm"
            onClick={startProposal}
            data-testid="cal-panel-propose"
            {...gate("approve", "record a deal")}
          >
            {start.act.label}
          </Button>
        )}
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </footer>
  );
}

export function CrPanel({
  b,
  day,
  todayKey,
  source,
  bookingLink,
  onCopyLink,
  onClose,
}: {
  b: CalendarBlockVM;
  day: CalendarFrame;
  todayKey: string;
  source: string;
  bookingLink: string | null;
  onCopyLink: () => void | Promise<void>;
  onClose: () => void;
}) {
  // A dialog: focus goes into it as it opens and back to what opened it as it closes, and Tab stays inside (data-bits
  // trapFocus: the one helper every modal takes); Escape (the page's key handler) closes it. It was a borrowed modal
  // with none of that, over a board the arrows moved.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => trapFocus(boxRef.current), []);
  // The person's deal is People's (0008), which can land after the dialog opens and moves when a proposal is recorded:
  // the dialog draws again whenever People does.
  const [, peopleMoved] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onPeopleMoved(peopleMoved), []);
  // Their deal's stage beside their name, and, once a consultation is over with no proposal since, the sheet's own act
  // that starts one: contracts' rule, words and mode (calendarPeekDeal, through the bridge), nothing where deals are off
  // or People does not hold them. The act opens the one deal sheet, so it is offered only where the sheet is installed.
  const deal = calendar.peekDeal(b, peopleRead(), Date.now());
  const start = deal.start && dealSheetInstalled() ? deal.start : null;
  // The sheet takes over from the dialog, and focus with it. The dialog closes first and gives focus back to the
  // appointment that opened it; the sheet opens on the next task, takes focus, and has that appointment as its way
  // back. Opened in the same press, the dialog's way back ran after the sheet had taken focus and took it out again.
  const startProposal = () => {
    if (!start) return;
    const { act, personId, service } = start;
    onClose();
    setTimeout(() => askDealSheet({ personId, mode: act.mode, service }), 0);
  };
  const contacts = b.contacts || { phones: [], e164: [], emails: [] };
  const e164 = contacts.e164 || [];
  // The day before and after this board's today, so "Tomorrow" can be said without a second clock.
  const when = crWhen(day, todayKey);
  const { person } = b;
  const notes = crNotesWorth(b.description, person, { ...contacts, e164 });
  const found = [...contacts.phones, ...contacts.emails];
  // The link into their thread, the way the People rows and the profile hand it over:
  // a plain text while any message reaches them, the approved message once only that does.
  const textLink = () => {
    if (!person || !person.threadId) return;
    if (person.replyOpen) {
      try {
        sessionStorage.setItem(
          "chanlytics-compose",
          JSON.stringify({
            threadId: person.threadId,
            text: `Here's the link to book your appointment: ${bookingLink}`,
          }),
        );
      } catch {
        /* nothing to carry */
      }
    }
    navigate(routeTo.thread(person.threadId));
  };
  return (
    <div
      className="ask-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      ref={leaving("cal-ev")}
    >
      <div
        ref={boxRef}
        className="ask-modal cal-ev"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cal-panel-title"
        tabIndex={-1}
        data-testid="cal-panel"
      >
        <section className="st-modal-section">
          <div className="st-modal-name" id="cal-panel-title">
            {b.title}
          </div>
          {whenLine({ b, day, when })}
          {whoLine({ b, person, deal, e164, found })}
          {b.location && (
            <div className="cal-ev-detail" data-testid="cal-panel-where">
              <span className="cal-ev-detail-key">Where</span>
              <span>{b.location}</span>
            </div>
          )}
          {notes && (
            <div className="cal-ev-detail" data-testid="cal-panel-desc">
              <span className="cal-ev-detail-key">Notes</span>
              <span className="cal-ev-desc">{notes}</span>
            </div>
          )}
          <div className="cal-ev-note">
            From {source}. The receptionist treats this time as taken; to change or cancel it, edit it there.
          </div>
        </section>
        {panelFoot({ person, bookingLink, start, textLink, startProposal, onCopyLink, onClose })}
      </div>
    </div>
  );
}

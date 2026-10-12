/**
 * One appointment, opened (moved from legacy/pages/calendar.jsx CrPanel, decision 0015): who it is for (by a phone in the
 * event, else a whole name), what the calendar wrote, and the one rule: nothing about the booking changes here. Reading
 * the board adds nobody to People (a read never writes: decision 0047, lane 6): an appointment that carries a phone puts
 * its person in People on its own every hour, by the sweep, and one the board cannot match offers "Add to People" here,
 * through the door "Add a person" uses; a person nobody wants is deleted from their profile. What a member may say here
 * is what became of the visit (decision 0002 step 8): kept, missed or cancelled, on the record's row.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import {
  ADD_TO_PEOPLE_WORDS,
  addToPeopleOf,
  appointmentWords,
  visitLineOfBlock,
  type CalendarBlockVM,
  type VisitLineVM,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { carryReply } from "../inbox/carried-reply";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { StoppedMark } from "../kit/pill/stopped-mark";
import { gate, leaving, navigate, touchSwipe, trapFocus } from "../legacy-verbs";
import { crPhone } from "./board-dom";
import { askDealSheet, dealSheetInstalled, onPeopleMoved, peopleRead, routeTo, statePill } from "./shell-verbs";
import type { CalendarFrame } from "./types";
import { calendar } from "./verbs";
import { crDur, crNotesWorth, crWhen } from "./words";
import { VisitActs, VisitState, visitWordHere } from "../visit-line";

type Person = CalendarBlockVM["person"];
type Deal = ReturnType<typeof calendar.peekDeal>;

/**
 * When it is: the day relative to now first, then the date and the time, how long, and how it stands: the visit line's state
 * (contracts visitLineOf), what a member said became of it, else that it is past once it has ended. Never "done": the
 * record does not know they came (0002's answer 3).
 */
function whenLine(p: { b: CalendarBlockVM; day: CalendarFrame; when: string | null; line: VisitLineVM }) {
  const { b, day, when, line } = p;
  return (
    <div className="cal-ev-when" data-testid="cal-panel-when">
      {when && <b className="cal-ev-when-rel">{when}</b>}
      <span>{when ? day.date || day.long : day.long}</span>
      <span>{b.time}</span>
      {b.dur > 0 && <span className="cal-ev-when-dur">{crDur(b.dur)}</span>}
      {/* The kit's pill in a block of its own, so the dot between the parts of this line is not drawn before it. */}
      {line.state && (
        <div className="cal-ev-when-state">
          <VisitState state={line.state} unmarked={line.unmarked} testid="cal-panel-state" />
        </div>
      )}
    </div>
  );
}

/** Who it is for: the person People matched, else the numbers and addresses the event carried, else the name it gave. */
function whoLine(p: {
  b: CalendarBlockVM;
  person: Person;
  deal: Deal;
  e164: string[];
  found: string[];
  line: VisitLineVM;
}) {
  const { b, person, deal, e164, found, line } = p;
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
      {/* They asked to stop: said on the person's line, where a reminder or a booking link would otherwise be reached for. */}
      {person.stopped && <StoppedMark testid="cal-panel-stopped" />}
      {line.match && <span className="cal-ev-via">{line.match}</span>}
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

/**
 * The press that adds the person this visit names, when People has no match for it (addToPeopleOf says whether and by
 * what). It goes through the door "Add a person" uses (POST contacts: an existing number or address returns that person,
 * and consent stays unknown, so nobody is messaged by it); People and the board read again behind it (refresh-map.ts), and
 * the dialog says the answer meanwhile. The door is the operator's, gated here as the visit's acts are.
 */
function AddToPeople({ b }: { b: CalendarBlockVM }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const add = addToPeopleOf(b);
  if (!add) return null;
  const press = async () => {
    setBusy(true);
    setProblem(null);
    try {
      // People and the board read again behind the answer, not before it: the dialog says what happened at once.
      const r = await api()("POST contacts", {
        body: {
          ...(add.phone ? { phone: add.phone } : {}),
          ...(add.email ? { email: add.email } : {}),
          ...(add.name ? { name: add.name } : {}),
        },
        refresh: "behind",
      });
      if (!r.ok) setProblem(r.message);
      else setSaid(r.data.existed ? ADD_TO_PEOPLE_WORDS.existed(add.name) : ADD_TO_PEOPLE_WORDS.added(add.name));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cal-ev-detail" data-testid="cal-panel-add">
      <span className="cal-ev-detail-key">People</span>
      {said ? (
        <span data-testid="cal-panel-added">{said}</span>
      ) : (
        <span className="cal-ev-visit-acts">
          <Button
            variant="quiet"
            size="sm"
            data-testid="cal-panel-add-person"
            disabled={busy}
            onClick={() => void press()}
            {...gate("approve", ADD_TO_PEOPLE_WORDS.gate)}
          >
            {busy ? ADD_TO_PEOPLE_WORDS.busy : ADD_TO_PEOPLE_WORDS.act}
          </Button>
        </span>
      )}
      {problem && (
        <span className="cal-ev-visit-refused" role="alert" data-testid="cal-panel-add-refused">
          {problem}
        </span>
      )}
    </div>
  );
}

/**
 * What became of the visit, said by a member (decision 0002 step 8): the acts contracts allows now (the visit line's `acts`,
 * the door's own rules), drawn by the part every page shares (surfaces/visit-line.tsx), each gated as a deal's is, with the
 * door's refusal in its own sentence. The board reads again when it answers (refresh-map.ts), and the state beside the time
 * says the new word.
 */
function visitSection(b: CalendarBlockVM, line: VisitLineVM) {
  if (!b.visit || line.acts.length === 0) return null;
  return (
    <div className="cal-ev-detail" data-testid="cal-panel-visit">
      <span className="cal-ev-detail-key">
        {b.visit.status === "kept" || b.visit.status === "missed" ? "Correct it" : "What happened"}
      </span>
      <VisitActs mark={b.visit} acts={line.acts} testid="cal-panel-visit" />
    </div>
  );
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
        {/* The act is the person's own (contracts bookingLinkAction, the one rule People's row and page ask): its short
            words by the wire they are reached on (the foot must not wrap on a phone, 10 Oct 2026), and none at all for
            someone who asked to stop. */}
        {person && person.threadId && bookingLink && person.bookingLinkAction.offered && (
          <Button
            variant="quiet"
            size="sm"
            data-testid="cal-panel-text-link"
            title={person.bookingLinkAction.title}
            onClick={textLink}
          >
            <Icon name="calendar" size={12} /> {person.bookingLinkAction.short}
          </Button>
        )}
      </div>
      <div className="st-modal-foot-actions">
        {/* The copy is a glyph with its name and its tip: four worded presses in one foot wrapped to three lines on a
            phone (Ruben, 10 Oct 2026). */}
        {bookingLink && (
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            aria-label="Copy the booking link"
            data-tip="Copy the booking link"
            data-testid="cal-panel-copy-link"
            onClick={onCopyLink}
          >
            <Icon name="copy" size={12} />
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
  // The visit as the one visit line every page draws (contracts visitLineOf), judged now: its state, its match, its acts.
  const line = visitLineOfBlock(b, Date.now());
  const notes = crNotesWorth(b.description, person, { ...contacts, e164 });
  const found = [...contacts.phones, ...contacts.emails];
  // The link into their thread, the way the People rows and the profile hand it over:
  // carried in while any message reaches them, the approved message once only that does.
  const textLink = () => {
    if (!person || !person.threadId) return;
    if (person.bookingLinkAction.ready && bookingLink)
      carryReply(person.threadId, appointmentWords(visitWordHere()).bookingLink(bookingLink));
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
        // On a phone the card stands at the screen's foot, and a pull down from its top lets it go, as every sheet's
        // does (data-bits touchSwipe; Ruben, 8 October 2026). Close, a press on the wash and Escape are as they were.
        {...touchSwipe({ onDown: onClose, when: crPhone })}
      >
        <section className="st-modal-section">
          <div className="st-modal-name" id="cal-panel-title">
            {b.title}
          </div>
          {whenLine({ b, day, when, line })}
          {whoLine({ b, person, deal, e164, found, line })}
          <AddToPeople b={b} />
          {/* A booking that arrived by email states what the calendar's title only hints at: the service, who with, the price. */}
          {b.tool && (
            <div className="cal-ev-detail" data-testid="cal-panel-booked">
              <span className="cal-ev-detail-key">Booked</span>
              <span>{[b.service, b.staff ? `with ${b.staff}` : null, b.price].filter(Boolean).join(" · ")}</span>
            </div>
          )}
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
          {visitSection(b, line)}
          {/* Where it came from, and where it changes: the receptionist treats every time here as taken, which the
              calendar itself says by drawing it (Ruben, 10 Oct 2026: a sentence of what the page already shows). */}
          <div className="cal-ev-note">
            {b.tool ? `Booked in ${b.tool}. Change or cancel it there.` : `From ${source}. Change or cancel it there.`}
          </div>
        </section>
        {panelFoot({ person, bookingLink, start, textLink, startProposal, onCopyLink, onClose })}
      </div>
    </div>
  );
}

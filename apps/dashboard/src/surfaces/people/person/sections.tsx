/**
 * The person page's sections (moved from legacy/pages/client-profile.jsx, decision 0015, step 5; the one page, 17 Nov
 * 2026): Coming up (their visits that have not ended, each a door to its day, and the campaigns they are in), History on
 * the page (its line and newest rows) and in full (its own view, with the filters), and the record's groups: Reach them,
 * Where they came from, their appointments, and what campaigns sent them. Each is a function of the page's context
 * returning an element, never a component of its own.
 */
import {
  NOTE_WORDS,
  PERSON_ABOUT_WORDS,
  PERSON_CALL_WORDS,
  PERSON_PART_WORDS,
  PERSON_WASH_WORDS,
  VISITS_TAB_WORDS,
  appointmentWords,
  personTabRoute,
  personTabWord,
  type PersonAboutFact,
  type PersonVM,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import type { MenuItem } from "../../kit";
import { Wash } from "../../kit/motion/wash";
import { Press } from "../../kit/press";
import { routeDoor } from "../../frame-verbs";
import { visitWordHere } from "../../workspace-word";
import { doubtRows, writeOn } from "./hero";
import { FactNotices } from "./notices/fact-notices";
import { PersonEmail } from "./name";
import { PersonNotes } from "./notes";
import { PersonTimeline } from "./timeline";
import type { PageCtx } from "./ctx";

/**
 * Coming up: their visits that have not ended, each a door to its day, then the campaigns they are in now (0060) with
 * when the next message goes. Each visit is the one visit line (contracts visitLineOf): how it was matched when that was
 * a guess, in the words every page says it in. Drawn for everyone (the one page): with nothing ahead it says so, with
 * the booking link a press away where it can go.
 */
export function comingUpSection(ctx: PageCtx) {
  const { p } = ctx;
  const comingUp = p.comingUp || [];
  const nothing = comingUp.length === 0 && p.inSequences.length === 0;
  return (
    <section
      className="cl-prof-section cl-prof-up"
      aria-labelledby="person-coming-up-title"
      data-testid="person-coming-up"
    >
      <h2 className="cl-prof-section-title" id="person-coming-up-title">
        {PERSON_PART_WORDS.comingUp}
      </h2>
      {comingUp.length > 0 ? (
        <div className="cl-prof-up-list">
          {/* Each a door to its visit (a link: a long press or a new tab opens it). Whether they came is Now's to ask. */}
          {comingUp.map((v) => (
            <div key={v.id} className="cl-prof-up-item">
              <a className="cl-prof-up-visit" {...routeDoor(v.to)} data-testid="person-visit-ahead">
                <span className="cl-prof-up-leaf" aria-hidden="true">
                  <span className="cl-prof-up-month">{v.month}</span>
                  <span className="cl-prof-up-date">{v.date}</span>
                </span>
                <span className="cl-prof-up-words">
                  <span className="cl-prof-up-title">{v.title}</span>
                  <span className="cl-prof-up-when">
                    {v.day} · {v.time}
                    {v.match ? ` · ${v.match}` : ""}
                  </span>
                </span>
                <span className="cl-prof-up-go" aria-hidden="true">
                  <Icon name="chevron" size={12} />
                </span>
              </a>
            </div>
          ))}
        </div>
      ) : null}
      {sequenceRows(p)}
      {nothing ? (
        <p className="cl-prof-rest" data-testid="person-coming-up-none">
          <span className="cl-prof-rest-title">{PERSON_PART_WORDS.nothingBooked}</span>
          {bookingDoor(ctx)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The booking link from Coming up with nothing booked: their conversation opened with it ready to send, as More's
 * Send booking link does, for someone who may send it, where it can go.
 */
function bookingDoor(ctx: PageCtx) {
  const { p } = ctx;
  const link = p.bookingLink;
  if (!ctx.canRecord || !link || !p.bookingLinkAction.offered || !p.bookingLinkAction.ready || p.openThread === null)
    return null;
  return (
    <LinkButton
      className="cl-prof-door"
      onClick={() => ctx.compose(appointmentWords(visitWordHere()).bookingLink(link))}
      data-testid="person-coming-up-booking"
    >
      {PERSON_PART_WORDS.sendBooking} <Icon name="chevron" size={10} />
    </LinkButton>
  );
}

/** History's tab of their notes, which the Overview's "All notes ›" opens (canvas A). */
export const NOTES_FILTER = "notes";

/**
 * The History: the timeline without the visits ahead, narrowed by the filter the page holds; its Notes, every note with
 * its acts, for anyone who has some or may write one.
 */
export function historySection(c: PageCtx, past: PersonVM["timeline"]) {
  const { p, tlFilter, setTlFilter, tlAll, setTlAll } = c;
  const notes =
    p.noteList.length > 0 || c.canRecord
      ? {
          id: NOTES_FILTER,
          label: NOTE_WORDS.title,
          body: <PersonNotes p={p} canEdit={c.canRecord} isOwner={c.isOwner} flash={c.flash} onChanged={c.load} />,
        }
      : null;
  return (
    <section className="cl-prof-section cl-prof-history" aria-labelledby="person-history-title">
      <div className="cl-prof-section-head">
        <h2 className="cl-prof-section-title" id="person-history-title">
          {/* Its newest row someone else added while the page is open: the heading washes (canvas A's wash). */}
          <Wash scope={p.id} value={past[0]?.id ?? ""} said={PERSON_WASH_WORDS.history}>
            History
          </Wash>
        </h2>
      </div>
      <PersonTimeline
        items={past}
        initials={p.initials}
        name={p.name}
        filter={tlFilter}
        onFilter={setTlFilter}
        showAll={tlAll}
        onShowAll={() => setTlAll(true)}
        word={p.word}
        fresh={c.fresh}
        notes={notes}
      />
    </section>
  );
}

/** How many of History's newest rows the page shows; "All N" opens the rest. */
const NEWEST = 4;

/** What History's line counts: the conversation's messages, the calls and the visits. */
function historyCounts(past: PersonVM["timeline"]) {
  const n = { messages: 0, calls: 0, visits: 0 };
  for (const t of past) {
    if (t.kind === "customer" || t.kind === "receptionist" || t.kind === "team") n.messages += 1;
    else if (t.kind === "call") n.calls += 1;
    else if (t.kind === "visit") n.visits += 1;
  }
  return n;
}

/**
 * History on the page (the one page): its line of counts, the numbers the tiles said, said once; then the newest rows,
 * with the dots of what is new since the reader last looked; and "All N", their own view at the history address, with
 * every row and the filters. Drawn for everyone: the first thing of theirs is always there.
 */
export function historyPart(ctx: PageCtx, past: PersonVM["timeline"]) {
  const { p } = ctx;
  const toAll = () => {
    ctx.setTlFilter("all");
    ctx.goTab("history");
  };
  // Their calls as the record counts them (every call of theirs, as the tiles said), the rest as History holds them.
  const counted = historyCounts(past);
  const line = PERSON_PART_WORDS.historyLine(
    { ...counted, calls: Math.max(counted.calls, p.calls) },
    appointmentWords(p.word),
  );
  return (
    <section
      className="cl-prof-section cl-prof-history"
      aria-labelledby="person-history-title"
      data-testid="person-history"
    >
      <div className="cl-prof-section-head">
        <h2 className="cl-prof-section-title" id="person-history-title">
          {/* Its newest row someone else added while the page is open: the heading washes (canvas A's wash). */}
          <Wash scope={p.id} value={past[0]?.id ?? ""} said={PERSON_WASH_WORDS.history}>
            {PERSON_PART_WORDS.history}
          </Wash>
        </h2>
        {past.length > NEWEST ? (
          <LinkButton
            {...routeDoor(personTabRoute(p.id, "history"), toAll)}
            className="cl-prof-door"
            data-testid="person-history-all"
          >
            {PERSON_PART_WORDS.all(past.length)} <Icon name="chevron" size={10} />
          </LinkButton>
        ) : null}
      </div>
      {line ? <p className="cl-prof-history-line">{line}</p> : null}
      <PersonTimeline
        items={past.slice(0, NEWEST)}
        initials={p.initials}
        name={p.name}
        showAll
        word={p.word}
        fresh={ctx.fresh}
      />
    </section>
  );
}

/**
 * Their appointments as one group of the record (the one page, D7: the Visits tab's line): what was kept and missed, how
 * often they come or when they last did, what waits for a word, and the door to every one of them, their own view at the
 * visits address. Nothing for someone with none.
 */
export function visitsGroup(ctx: PageCtx) {
  const { p } = ctx;
  const visits = p.visitTab;
  const head = visits.head;
  if (head.kept + head.missed + head.toMark + visits.ahead.length + visits.past.length === 0) return null;
  const W = VISITS_TAB_WORDS;
  const line = [
    head.kept ? W.kept(head.kept) : null,
    head.missed ? W.missed(head.missed) : null,
    head.toMark ? W.toMarkN(head.toMark) : null,
    head.cadence ? W.cadence(head.cadence) : head.lastKept ? W.lastKept(head.lastKept) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="cl-prof-rail-section" aria-labelledby="person-visits-row-title" data-testid="person-visits-row">
      <h3 className="cl-prof-rail-label" id="person-visits-row-title">
        {personTabWord("visits", p.word)}
      </h3>
      <p className="cl-prof-fromline">
        {line ? `${line} ` : null}
        <LinkButton
          {...routeDoor(personTabRoute(p.id, "visits"), () => ctx.goTab("visits"))}
          data-testid="person-visits-all"
        >
          {PERSON_PART_WORDS.seeAll} <Icon name="chevron" size={10} />
        </LinkButton>
      </p>
    </section>
  );
}

/** A fact the profile said, by its key (contracts aboutOf), or nothing where it said none. */
const factOf = (c: PageCtx, k: string): PersonAboutFact | undefined => c.p.about.find((a) => a.k === k);

/** Call, from the number's row: a phone dials and asks how it went when the app is back; a desk opens Call's popover. */
function ring(c: PageCtx) {
  const vm = c.call.vm;
  if (!vm?.rings) return;
  if (!c.phone) {
    c.call.setOpen(true);
    return;
  }
  window.location.href = vm.tel;
  if (c.canRecord) c.call.dialled();
}

/**
 * Their number (canvas A, D1): the whole row is the press, the number over what it is and since when, and it opens its
 * acts (a sheet from the foot on a phone, a menu on a desk): Call, Text them, Copy the number.
 */
function numberRow(c: PageCtx) {
  const { p } = c;
  const W = PERSON_ABOUT_WORDS;
  if (!p.phone) return null;
  const items: MenuItem[] = [];
  if (c.call.vm?.rings)
    items.push({ label: W.callIt, glyph: <Icon name="phone" size={13} />, onSelect: () => ring(c) });
  // Text them as More says it: drawn and disabled with its reason where nothing can be sent (contracts personActs).
  const text = c.canRecord ? p.acts.find((a) => a.id === "text") : undefined;
  if (text)
    items.push({
      label: W.textIt,
      glyph: <Icon name="chat" size={13} />,
      title: text.off ?? undefined,
      disabled: !!text.off,
      onSelect: () => writeOn(p, "sms"),
    });
  // Copying says so in place (the kit's copy), never a toast; open to every reader.
  items.push({ label: W.copyNumber, glyph: <Icon name="copy" size={13} />, copy: { text: p.phone, said: W.copied } });
  if (c.canRecord && c.call.vm)
    items.push({ label: PERSON_CALL_WORDS.logPast, glyph: <Icon name="clock" size={13} />, onSelect: c.call.logPast });
  return (
    <Menu
      label={p.phone}
      align="start"
      groups={[{ items }]}
      trigger={
        <Press className="cl-prof-reach" data-opens="sheet" data-testid="person-reach-phone">
          <span className="cl-prof-reach-l">
            <span className="cl-prof-reach-v">{p.phone}</span>
            <span className="cl-prof-reach-src">{p.reach.phone}</span>
          </span>
          <Icon name="chevron" size={12} />
        </Press>
      }
    />
  );
}

/**
 * Reach them (canvas A): their number as a row of its own, their WhatsApp name, and their address, added and changed in
 * place (name.tsx PersonEmail), on a line of its own under a hairline.
 */
function reachGroup(c: PageCtx) {
  const { p, canRecord, flash } = c;
  const W = PERSON_ABOUT_WORDS;
  return (
    <section className="cl-prof-rail-section" aria-labelledby="person-reach-title" data-testid="person-reach">
      <h3 className="cl-prof-rail-label" id="person-reach-title">
        {W.reach}
      </h3>
      {numberRow(c)}
      {p.waName ? <p className="cl-prof-reach-line">{W.waName(p.waName)}</p> : null}
      {p.email || canRecord ? (
        <div className="cl-prof-reach-email">
          <PersonEmail p={p} canEdit={canRecord} flash={flash} />
          {/* What the address is and where it came from (contracts reachRowsOf), as the number says it. */}
          {p.email ? <span className="cl-prof-reach-src">{p.reach.email}</span> : null}
        </div>
      ) : null}
      {doubtRows(c)}
      <FactNotices c={c} home="reach" />
    </section>
  );
}

/**
 * Where they came from (canvas A, C3): one line, how they first reached you or came to be here and when (contracts
 * personOriginOf), else the About fact it replaces, and the way back to the lead the finder found them as; under it,
 * what another system said of them before Chanlytics (decision 0073, R22: personBeforeOf), where one did.
 */
function originGroup(c: PageCtx) {
  const { p } = c;
  const fact = factOf(c, "Added") ?? factOf(c, "First contact");
  const line = p.origin ?? (fact && fact.v !== "—" ? fact.v : null);
  if (!line && !p.before) return null;
  const lead = p.lead;
  return (
    <section className="cl-prof-rail-section" aria-labelledby="person-from-title" data-testid="person-from">
      <h3 className="cl-prof-rail-label" id="person-from-title">
        {PERSON_ABOUT_WORDS.cameFrom}
      </h3>
      {line ? (
        <p className="cl-prof-fromline">
          {line}
          {lead ? (
            <>
              {" "}
              <LinkButton {...routeDoor(lead.to)} title={lead.name} data-testid="fact-lead">
                {PERSON_ABOUT_WORDS.openLead} <Icon name="chevron" size={10} />
              </LinkButton>
            </>
          ) : null}
        </p>
      ) : null}
      {p.before ? (
        <p className="cl-prof-fromline cl-prof-before" data-testid="person-before">
          {p.before}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The rail's first groups (canvas A): Reach them, then Where they came from. The next visit is Coming up's, their counts
 * the figures', and the proposal the deal's: each said once, there.
 */
export function aboutGroups(c: PageCtx) {
  return (
    <>
      {reachGroup(c)}
      {originGroup(c)}
    </>
  );
}

/**
 * What campaigns sent them, and what came of it, as one group of the record: each row opens the run's own report. The
 * campaigns they are in now are Coming up's (the one page). Nothing where nothing was sent to them.
 */
export function campaignsGroup(person: PersonVM) {
  if (person.campaigns.length === 0) return null;
  return (
    <div className="cl-prof-rail-section" data-testid="person-campaigns">
      <div className="cl-prof-rail-label">{PERSON_ABOUT_WORDS.campaigns}</div>
      {campaignRows(person)}
    </div>
  );
}

/** The sequences they are in now (0060), each a door to it: where they are in it, and when the next goes. */
function sequenceRows(p: PersonVM) {
  if (p.inSequences.length === 0) return null;
  return (
    <div className="cl-prof-attr-list" data-testid="person-sequences">
      {p.inSequences.map((q) => (
        <a key={q.id} className="cl-prof-attr cl-prof-run" {...routeDoor(q.to)} data-testid="person-sequence">
          <span className="cl-prof-attr-key">{PERSON_ABOUT_WORDS.inSequence}</span>
          <span className="cl-prof-attr-val">
            <span className="cl-prof-run-title">{q.name}</span>
            <span className="cl-prof-run-out">{q.line}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

/** The rows of what went to them, each a door to its run's report (a link: a long press or a new tab opens it). */
function campaignRows(p: PersonVM) {
  return (
    <div className="cl-prof-attr-list">
      {p.campaigns.map((c) => (
        <a key={c.id} className="cl-prof-attr cl-prof-run" {...routeDoor(c.to)} data-testid="person-campaign">
          <span className="cl-prof-attr-key">{c.when}</span>
          <span className="cl-prof-attr-val">
            <span className="cl-prof-run-title">{c.title}</span>
            <span className="cl-prof-run-out" data-tone={c.tone}>
              {c.line}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}

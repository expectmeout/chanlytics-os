/**
 * One visit, opened (the Calendar's lane E): the parts the phone's sheet and the desk's peek both draw (visit-sheet.tsx),
 * from contracts' visitSheetOf, which decides every word and act. Its head says what it is, when, and how it stands; its
 * person line who it is for, as a door to their page, with the Message and Call circles that reach them; its rows what
 * nothing above says; its footnote where it changes; its foot More and one act by how it stands, or, for a visit over and
 * not marked, the ask "Did Maria come yesterday?" over Missed and Kept, as Today's sheet asks it (11 Nov 2026). A word said
 * here is answered here, as Today's row answers it: the visit stands as it was told at once, the foot says what the word
 * sets going (the sequence that thanks them, or offers another time) and offers the other word as the way back.
 *
 * Every act is a door that already exists: a visit's word is the Calendar's (POST calendar/visits/[id]), the thread is the
 * Inbox's (or a new conversation), the booking link is carried into the thread as People's row carries it, a proposal is
 * the one deal sheet, a step the one step sheet, a note and a call their page's own (asked on the way there, so a call is
 * rung from the member's phone and logged, never a bare tel: link), and Add to People the door "Add a person" uses.
 * Nothing about the booking itself changes here: the calendar or the tool keeps it, as the footnote says.
 */
import { useState, type ReactNode } from "react";
import {
  ADD_TO_PEOPLE_WORDS,
  BOOKING_REQUEST_WORDS,
  VISIT_ASK_WORDS,
  VISIT_WORDS,
  addToPeopleOf,
  addressOf,
  appointmentWords,
  formatPhoneDisplay,
  type CalendarBlockVM,
  type VisitWord,
} from "@chanlytics/contracts";
import { CALENDAR_VISIT_SHEET_WORDS as W, type VisitMoreAct, type VisitSheetVM } from "./sheet-view";
import type { VisitCtx } from "./context";
import { VisitOutcome, sayHere } from "./outcome";
import { commitVerb } from "@/bridge/verbs/commit";
import { carryReply } from "../../inbox/carried-reply";
import { openNewConversation } from "../../inbox/new-conversation/store";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { CopyButton } from "../../kit/copy-button/copy-button";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu, type MenuItem } from "../../kit/menu/menu";
import { StatePill } from "../../kit/pill/state-pill";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import { gate, navigate, openDealSheet, type DealSheetAsk } from "../../frame-verbs";
import { openStepSheet } from "../../people/deal/deal-verbs";
import { sayVisit } from "../../visit-line";
import { answerRequest } from "../../booking-request";

/** "Thu, Oct 15 · 12:30 – 1:30 PM · 1h · Repeats", with Today, Tomorrow or Yesterday first where it is one. */
export function whenWords(vm: VisitSheetVM): string {
  const w = vm.when;
  return [w.rel, w.date, w.time, w.dur, w.repeats ? W.repeats : null].filter(Boolean).join(" · ");
}

/** How it stands, said once: the kit's pill in its tone, a request's dashed ring and a plain ring for not marked yet. */
function VisitStatePill({ vm }: { vm: VisitSheetVM }) {
  const s = vm.state;
  if (!s) return null;
  return (
    <span className="cal-visit-state" data-ring={s.ring ?? undefined}>
      <StatePill kind="tone" value={s.tone} label={s.word} testid="cal-visit-state" />
    </span>
  );
}

/** The person it is for: a door to their page's visits, their standing, business, stop and deal; else what the event names. */
function visitPersonLine(c: VisitCtx) {
  const p = c.vm.person;
  if (!p) return null;
  if (!p.known)
    return (
      <div className="cal-visit-who" data-testid="cal-visit-contact">
        <Face person={{ name: p.name ?? p.number ?? p.email ?? "", initials: p.initials || undefined }} size="sm" />
        <div className="cal-visit-who-words">
          <span className="cal-visit-name">{p.name ?? p.number ?? p.email}</span>
          <span className="cal-visit-quiet">{W.notInPeople}</span>
        </div>
        {p.number ? <CopyButton text={p.number} label={p.number} testid="cal-visit-copy-number" /> : null}
      </div>
    );
  const under = p.business || p.match;
  return (
    <div className="cal-visit-who" data-testid="cal-visit-person">
      <Face person={{ name: p.name, initials: p.initials }} size="sm" />
      <span className="cal-visit-who-head">
        <LinkButton className="cal-visit-name" onClick={() => navigate(p.route)} data-testid="cal-visit-door">
          {p.name}
        </LinkButton>
        {p.state && p.stateWord ? <StatePill kind="person" value={p.state} label={p.stateWord} /> : null}
        {p.stopped ? <StoppedMark testid="cal-visit-stopped" /> : null}
      </span>
      {visitReach(c)}
      {under || p.deal ? (
        <div className="cal-visit-who-lines">
          {under ? <span className="cal-visit-quiet">{[p.business, p.match].filter(Boolean).join(" · ")}</span> : null}
          {p.deal ? (
            <LinkButton
              className="cal-visit-deal"
              onClick={() => navigate(addressOf({ kind: "person", id: p.id, tab: "deals" }))}
              data-testid="cal-visit-deal"
            >
              {p.deal}
            </LinkButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * How they are reached, beside their name: the Message and Call circles. Message is a circle wherever it is not the
 * foot's lead, and while the sheet asks whether they came, when the foot holds the two answers and no lead.
 */
function visitReach(visitCtx: VisitCtx) {
  const { vm, block } = visitCtx;
  const message = vm.circles.message ?? (vm.ask && vm.primary?.act === "message" ? vm.primary.label : null);
  const call = vm.circles.call;
  if (!message && !call) return null;
  return (
    <span className="cal-visit-reach">
      {message ? (
        <Button
          variant="quiet"
          iconOnly
          className="cal-visit-circle"
          aria-label={message}
          data-tip={message}
          onClick={() => messageThem(block)}
          data-testid="cal-visit-message"
        >
          <Icon name="chat" size={16} />
        </Button>
      ) : null}
      {call ? (
        <Button
          variant="quiet"
          iconOnly
          className="cal-visit-circle"
          aria-label={call}
          data-tip={call}
          onClick={() => callThem(block)}
          data-testid="cal-visit-call"
        >
          <Icon name="phone" size={16} />
        </Button>
      ) : null}
    </span>
  );
}

/**
 * "Did Maria come yesterday?" over its two answers, in the foot, as Today's sheet asks it (one sheet, 9 Nov 2026; here
 * 11 Nov): More, then the quiet answer, then the answer that is its act, the two equal. The same door Today and their
 * page press, each named for a screen reader with who and when. Once the door has written, the sheet keeps its answer
 * (sayHere) and draws the visit as it was told: the question goes, and the foot says what follows (outcome.tsx VisitOutcome).
 */
function VisitAskFoot({ c, more }: { c: VisitCtx; more: ReactNode }) {
  const ask = c.vm.ask;
  const [busy, setBusy] = useState<VisitWord | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!ask || !ask.line.mark) return null;
  const say = async (status: VisitWord) => {
    setBusy(status);
    setProblem(null);
    try {
      const answer = await sayHere(c, status);
      if (answer && !answer.ok) setProblem(answer.message);
    } finally {
      setBusy(null);
    }
  };
  // Its two words as the line asks them (visitLineOf's `asks`): the first is its act and stands last, at the thumb.
  const [act, second] = ask.line.asks;
  const answer = (status: VisitWord, variant: "primary" | "secondary") => (
    <Button
      variant={variant}
      className="cal-visit-answer"
      disabled={busy !== null}
      aria-label={`${VISIT_WORDS[status]}: ${ask.question}`}
      onClick={() => void say(status)}
      data-testid={`cal-visit-ask-${status}`}
      {...gate("approve", VISIT_ASK_WORDS.gate)}
    >
      {VISIT_WORDS[status]}
    </Button>
  );
  return (
    <section className="cal-visit-ask" aria-label={ask.question} data-testid="cal-visit-ask">
      <p className="cal-visit-ask-question">{ask.question}</p>
      {problem ? (
        <p className="cal-visit-refused" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="cal-visit-acts" data-foot-acts="">
        {more}
        {second ? answer(second, "secondary") : null}
        {act ? answer(act, "primary") : null}
      </div>
    </section>
  );
}

/** The rows that say something the head does not, a key and its value each; a value with an address is its door. */
function visitRows(vm: VisitSheetVM) {
  if (!vm.rows.length) return null;
  return (
    <dl className="cal-visit-rows" data-testid="cal-visit-rows">
      {vm.rows.map(({ key, label, value, route }) => (
        <div key={key} className="cal-visit-row" data-testid={`cal-visit-row-${key}`}>
          <dt>{label}</dt>
          <dd className={key === "notes" ? "cal-visit-notes" : undefined}>
            {route ? (
              <LinkButton onClick={() => navigate(route)} data-testid={`cal-visit-row-${key}-door`}>
                {value}
              </LinkButton>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The person's own add (the person_add verb, which People's "Add a person" commits too: contracts
 * personAddSpec), for a visit People cannot match.
 */
function useAddToPeople(c: VisitCtx) {
  const [busy, setBusy] = useState(false);
  const add = addToPeopleOf(c.block);
  const press = async () => {
    if (!add) return;
    setBusy(true);
    try {
      const r = await commitVerb(
        "person_add",
        {
          ...(add.phone ? { phone: add.phone } : {}),
          ...(add.email ? { email: add.email } : {}),
          ...(add.name ? { name: add.name } : {}),
        },
        { refresh: "behind" },
      );
      const existed = r.ok && !!r.data && typeof r.data === "object" && Reflect.get(r.data, "existed") === true;
      c.flash(
        !r.ok ? r.message : existed ? ADD_TO_PEOPLE_WORDS.existed(add.name) : ADD_TO_PEOPLE_WORDS.added(add.name),
      );
    } finally {
      setBusy(false);
    }
  };
  return { busy, press };
}

/** A visit's thread (`th-<conversation>`, calendar.ts) as the record's one address. */
const visitThreadRoute = (threadId: string): string =>
  addressOf({ kind: "conversation", id: threadId.replace(/^th-/, "") });

/** Their thread, where they have one; else a new conversation with them, as their page's Message opens one. */
function messageThem(b: CalendarBlockVM): void {
  const p = b.person;
  if (!p) return;
  if (p.threadId) navigate(visitThreadRoute(p.threadId));
  else openNewConversation(p.id);
}

/** The booking link carried into their thread in the words for how the visit went, then the thread. */
function carryLink(c: VisitCtx, words: (link: string) => string): void {
  const p = c.block.person;
  if (!p?.threadId || !c.bookingLink) return messageThem(c.block);
  if (p.bookingLinkAction.ready) carryReply(p.threadId, words(c.bookingLink));
  navigate(visitThreadRoute(p.threadId));
}

/** Their page's Call, asked on the way there: it rings from the member's phone and asks how it went. */
function callThem(b: CalendarBlockVM): void {
  const p = b.person;
  if (!p) return;
  void import("../../people/person/call").then((m) => {
    m.askPersonCall(p.id);
    navigate(addressOf({ kind: "person", id: p.id }));
  });
}

/**
 * A sheet that takes over from the visit, and focus with it: the visit closes first and gives focus back to its block, and
 * the sheet opens after. The deal's and the step's are record sheets, which stand on the page: opened over the visit's
 * modal, the step's was drawn hidden behind it, and nothing seemed to happen.
 */
function handOff(c: VisitCtx, open: () => void): void {
  c.close();
  setTimeout(open, 0);
}

/**
 * A time a customer picked by text, answered from its visit (decision 0061): Booked it opens their thread with the reply
 * drafted for the member to send; Can't leaves the thread waiting on their reply.
 */
function answerVisit(c: VisitCtx, booked: boolean): void {
  const threadId = c.block.request?.threadId;
  if (!threadId) return;
  void answerRequest(threadId, booked, c.block.person?.name ?? c.block.guess ?? "They").then((r) => {
    if (!r.ok) return c.flash(r.message);
    if (!booked) return c.flash(r.receipt);
    const to = addressOf({ kind: "hold", conversationId: threadId });
    if (r.reply) carryReply(to, r.reply);
    c.close();
    navigate(to);
    return undefined;
  });
}

/** The same visit with its lead act quiet: where the ask's answers lead and the act stands under them. */
function withQuietLead(visitCtx: VisitCtx): VisitCtx {
  const { vm } = visitCtx;
  if (!vm.primary) return visitCtx;
  return { ...visitCtx, vm: { ...vm, primary: { ...vm.primary, quiet: true } } };
}

/** The lead act, by how the visit stands. */
function PrimaryAct({ c }: { c: VisitCtx }) {
  const { vm, block } = c;
  const adding = useAddToPeople(c);
  const words = appointmentWords(c.word);
  const pa = vm.primary;
  if (!pa) return null;
  const press = () => {
    if (pa.act === "booked") return answerVisit(c, true);
    if (pa.act === "message") return messageThem(block);
    if (pa.act === "link") return carryLink(c, words.nextLink);
    if (pa.act === "new_time") return carryLink(c, words.newTimeLink);
    if (pa.act === "add") return void adding.press();
    const ask = vm.proposal;
    if (!ask) return undefined;
    handOff(c, () => openDealSheet(ask as DealSheetAsk));
    return undefined;
  };
  const gated =
    pa.act === "booked"
      ? gate("approve", BOOKING_REQUEST_WORDS.gate)
      : pa.act === "proposal"
        ? gate("approve", "record a deal")
        : pa.act === "add"
          ? gate("approve", ADD_TO_PEOPLE_WORDS.gate)
          : pa.act === "message"
            ? {}
            : gate("approve", "send them the booking link");
  return (
    <Button
      variant={pa.quiet ? "secondary" : "primary"}
      className="cal-visit-lead"
      disabled={pa.act === "add" && adding.busy}
      onClick={press}
      data-testid={`cal-visit-primary-${pa.act}`}
      {...gated}
    >
      {pa.act === "add" && adding.busy ? ADD_TO_PEOPLE_WORDS.busy : pa.label}
    </Button>
  );
}

/** What More's press does, by its act; the copy and the cancel are drawn as their own items. */
function moreItem(c: VisitCtx, m: { act: VisitMoreAct; label: string; danger: boolean }, ask: () => void): MenuItem {
  const { act, label, danger } = m;
  const p = c.block.person;
  const said = (status: VisitWord) => () => {
    void sayHere(c, status).then((answer) => {
      if (answer) c.flash(answer.ok ? VISIT_WORDS[status] : answer.message);
    });
  };
  switch (act) {
    case "copy": {
      const phone = c.vm.phone ?? "";
      return {
        label,
        glyph: <Icon name="copy" size={13} />,
        copy: { text: formatPhoneDisplay(phone) ?? phone, said: "Copied" },
      };
    }
    case "step":
      return {
        label,
        glyph: <Icon name="flag" size={13} />,
        onSelect: () => p && handOff(c, () => openStepSheet({ personId: p.id })),
      };
    case "note":
      // The note sheet, over the calendar: a note without leaving it (the sheets as verbs: it was their page's composer).
      return {
        label,
        glyph: <Icon name="note" size={13} />,
        onSelect: () => p && handOff(c, () => openStepSheet({ personId: p.id, note: true })),
      };
    case "deal":
      return {
        label,
        glyph: <Icon name="deal" size={13} />,
        onSelect: () => p && navigate(addressOf({ kind: "person", id: p.id, tab: "deals" })),
      };
    case "kept":
    case "missed":
      return {
        label,
        glyph: <Icon name="check" size={13} />,
        onSelect: said(act),
        gate: gate("approve", VISIT_ASK_WORDS.gate),
      };
    case "cancel":
      return { label, onSelect: ask, tone: danger ? "danger" : undefined, gate: gate("approve", VISIT_ASK_WORDS.gate) };
    case "cant":
      return {
        label,
        onSelect: () => answerVisit(c, false),
        tone: danger ? "danger" : undefined,
        gate: gate("approve", BOOKING_REQUEST_WORDS.gate),
      };
    case "page":
      return {
        label,
        glyph: <Icon name="arrow-right" size={13} />,
        onSelect: () => p && navigate(addressOf({ kind: "person", id: p.id, tab: "visits" })),
      };
  }
}

/**
 * The foot: More and the lead act, or the ask over its two answers; over them, what a word just said here sets going;
 * and, once asked, the cancel's question.
 */
export function VisitFoot({ c }: { c: VisitCtx }) {
  const { vm } = c;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (vm.nobody) return null;
  const mark = vm.line.mark;
  const cancel = async () => {
    if (!mark) return;
    setBusy(true);
    const r = await sayVisit(mark.id, "cancelled");
    setBusy(false);
    setAsking(false);
    c.flash(r.ok ? VISIT_WORDS.cancelled : r.message);
  };
  const items = vm.more.map((m) => moreItem(c, m, () => setAsking(true)));
  // More is a word with a caret at the row's start, never three dots (Ruben, 20 Oct 2026): the same menu, the same items.
  const more = items.length ? (
    <Menu
      align="start"
      label={W.more}
      groups={[{ items }]}
      trigger={
        <Button variant="quiet" className="cal-visit-more" data-testid="cal-visit-more">
          {W.more}
          <Icon name="chevron-down" size={12} />
        </Button>
      }
    />
  ) : null;
  return (
    <div className="cal-visit-foot" data-testid="cal-visit-foot">
      {asking ? (
        <Confirm
          question={appointmentWords(c.word).cancelAsk}
          detail={VISIT_ASK_WORDS.cancel.detail}
          yes={VISIT_ASK_WORDS.cancel.yes}
          no={VISIT_ASK_WORDS.cancel.no}
          danger
          busy={busy}
          onYes={() => void cancel()}
          onNo={() => setAsking(false)}
          testid="cal-visit-cancel"
        />
      ) : vm.ask ? (
        <>
          <VisitAskFoot c={c} more={more} />
          {/* A lead that is not the thread's (Add to People, for someone the board could not match) still stands while
              the sheet asks: under the answers, and quiet, so the one coral is the answer's. */}
          {vm.primary && vm.primary.act !== "message" ? (
            <div className="cal-visit-acts">
              <PrimaryAct c={withQuietLead(c)} />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <VisitOutcome visit={c} />
          <div className="cal-visit-acts" data-foot-acts="">
            {more}
            <PrimaryAct c={c} />
          </div>
        </>
      )}
      {vm.shut ? <p className="cal-visit-quiet">{vm.shut}</p> : null}
    </div>
  );
}

/** The body: how it stands, who it is for, the rows and the footnote. The ask is the foot's. */
export function VisitBody({ c }: { c: VisitCtx }) {
  const { vm } = c;
  return (
    <div className="cal-visit" data-testid="cal-visit">
      <VisitStatePill vm={vm} />
      {visitPersonLine(c)}
      {visitRows(vm)}
      <p className="cal-visit-foot-note" data-testid="cal-visit-footnote">
        {vm.footnote}
      </p>
    </div>
  );
}

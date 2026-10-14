/**
 * One visit, opened (the Calendar's lane E): the parts the phone's sheet and the desk's peek both draw (visit-sheet.tsx),
 * from contracts' visitSheetOf, which decides every word and act. Its head says what it is, when, and how it stands; its
 * person line who it is for, as a door to their page; its ask "Did Maria come yesterday?" with Kept and Missed; its rows
 * what nothing above says; its footnote where it changes; its foot one act by how it stands, a Message and a Call circle,
 * and More.
 *
 * Every act is a door that already exists: a visit's word is the Calendar's (POST calendar/visits/[id]), the thread is the
 * Inbox's (or a new conversation), the booking link is carried into the thread as People's row carries it, a proposal is
 * the one deal sheet, a step the one step sheet, a note and a call their page's own (asked on the way there, so a call is
 * rung from the member's phone and logged, never a bare tel: link), and Add to People the door "Add a person" uses.
 * Nothing about the booking itself changes here: the calendar or the tool keeps it, as the footnote says.
 */
import { useState } from "react";
import {
  ADD_TO_PEOPLE_WORDS,
  CALENDAR_VISIT_SHEET_WORDS as W,
  VISIT_ASK_WORDS,
  VISIT_WORDS,
  addToPeopleOf,
  addressOf,
  appointmentWords,
  formatPhoneDisplay,
  type AppointmentWord,
  type CalendarBlockVM,
  type VisitMoreAct,
  type VisitSheetVM,
  type VisitWord,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
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
import { gate, navigate, openDealSheet, type DealSheetAsk } from "../../legacy-verbs";
import { openStepSheet } from "../../people/deal/deal-verbs";
import { sayVisit } from "../../visit-line";

/** What the parts are drawn from, and what they do. */
export interface VisitCtx {
  b: CalendarBlockVM;
  vm: VisitSheetVM;
  word: AppointmentWord;
  bookingLink: string | null;
  /** Close the sheet or the peek (the address goes back with it). */
  close: () => void;
  /** Say something once, at the foot of the page (the board's toast). */
  flash: (text: string) => void;
}

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
        <Face initials={p.initials || "?"} size="sm" />
        <div className="cal-visit-who-words">
          <span className="cal-visit-name">{p.name ?? p.number ?? p.email}</span>
          <span className="cal-visit-quiet">{W.notInPeople}</span>
        </div>
        {p.number ? <CopyButton text={p.number} label={p.number} testid="cal-visit-copy-number" /> : null}
      </div>
    );
  return (
    <div className="cal-visit-who" data-testid="cal-visit-person">
      <Face person={{ name: p.name, initials: p.initials }} size="sm" />
      <div className="cal-visit-who-words">
        <span className="cal-visit-who-head">
          <LinkButton className="cal-visit-name" onClick={() => navigate(p.route)} data-testid="cal-visit-door">
            {p.name}
          </LinkButton>
          {p.state && p.stateWord ? <StatePill kind="person" value={p.state} label={p.stateWord} /> : null}
          {p.stopped ? <StoppedMark testid="cal-visit-stopped" /> : null}
        </span>
        <span className="cal-visit-quiet">{[p.business, p.match].filter(Boolean).join(" · ") || null}</span>
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
    </div>
  );
}

/**
 * "Did Maria come yesterday?", with Kept and Missed, equal and 44px tall: the same door Today and their page press,
 * each named for a screen reader with who and when. Once the door has written, the word stands in place of the presses
 * until the board reads again.
 */
function VisitAskRow({ c }: { c: VisitCtx }) {
  const ask = c.vm.ask;
  const [busy, setBusy] = useState<VisitWord | null>(null);
  const [said, setSaid] = useState<VisitWord | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const mark = ask?.line.mark;
  if (!ask || !mark) return null;
  const say = async (status: VisitWord) => {
    setBusy(status);
    setProblem(null);
    try {
      const r = await sayVisit(mark.id, status);
      if (r.ok) setSaid(status);
      else setProblem(r.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="cal-visit-ask" aria-label={ask.question} data-testid="cal-visit-ask">
      <p className="cal-visit-ask-question">{ask.question}</p>
      {said ? (
        <p className="cal-visit-ask-said" role="status" data-testid="cal-visit-ask-said">
          {VISIT_WORDS[said]}
        </p>
      ) : (
        <div className="cal-visit-ask-acts">
          {ask.line.asks.map((status) => (
            <Button
              key={status}
              variant={status === "kept" ? "primary" : "secondary"}
              disabled={busy !== null}
              aria-label={`${VISIT_WORDS[status]}: ${ask.question}`}
              onClick={() => void say(status)}
              data-testid={`cal-visit-ask-${status}`}
              {...gate("approve", VISIT_ASK_WORDS.gate)}
            >
              {VISIT_WORDS[status]}
            </Button>
          ))}
        </div>
      )}
      {problem ? (
        <p className="cal-visit-refused" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

/** The rows that say something the head does not, a key and its value each. */
function visitRows(vm: VisitSheetVM) {
  if (!vm.rows.length) return null;
  return (
    <dl className="cal-visit-rows" data-testid="cal-visit-rows">
      {vm.rows.map((r) => (
        <div key={r.key} className="cal-visit-row" data-testid={`cal-visit-row-${r.key}`}>
          <dt>{r.label}</dt>
          <dd className={r.key === "notes" ? "cal-visit-notes" : undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The person's own add (POST contacts, the door "Add a person" uses), for a visit People cannot match. */
function useAddToPeople(c: VisitCtx) {
  const [busy, setBusy] = useState(false);
  const add = addToPeopleOf(c.b);
  const press = async () => {
    if (!add) return;
    setBusy(true);
    try {
      const r = await api()("POST contacts", {
        body: {
          ...(add.phone ? { phone: add.phone } : {}),
          ...(add.email ? { email: add.email } : {}),
          ...(add.name ? { name: add.name } : {}),
        },
        refresh: "behind",
      });
      c.flash(
        !r.ok
          ? r.message
          : r.data.existed
            ? ADD_TO_PEOPLE_WORDS.existed(add.name)
            : ADD_TO_PEOPLE_WORDS.added(add.name),
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
  const p = c.b.person;
  if (!p?.threadId || !c.bookingLink) return messageThem(c.b);
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

/** Their page, with its note's composer brought into view. */
function noteOnThem(b: CalendarBlockVM): void {
  const p = b.person;
  if (!p) return;
  navigate(addressOf({ kind: "person", id: p.id }));
  void import("../../people/person/notes").then((m) => m.askNoteFocus());
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

/** The lead act, by how the visit stands. */
function PrimaryAct({ c }: { c: VisitCtx }) {
  const { vm, b } = c;
  const adding = useAddToPeople(c);
  const words = appointmentWords(c.word);
  const pa = vm.primary;
  if (!pa) return null;
  const press = () => {
    if (pa.act === "message") return messageThem(b);
    if (pa.act === "link") return carryLink(c, words.nextLink);
    if (pa.act === "new_time") return carryLink(c, words.newTimeLink);
    if (pa.act === "add") return void adding.press();
    const ask = vm.proposal;
    if (!ask) return undefined;
    handOff(c, () => openDealSheet(ask as DealSheetAsk));
    return undefined;
  };
  const gated =
    pa.act === "proposal"
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
  const p = c.b.person;
  const mark = c.vm.line.mark;
  const said = (status: VisitWord) => () => {
    if (!mark) return;
    void sayVisit(mark.id, status).then((r) => c.flash(r.ok ? VISIT_WORDS[status] : r.message));
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
      return { label, glyph: <Icon name="note" size={13} />, onSelect: () => noteOnThem(c.b) };
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
    case "page":
      return {
        label,
        glyph: <Icon name="arrow-right" size={13} />,
        onSelect: () => p && navigate(addressOf({ kind: "person", id: p.id, tab: "visits" })),
      };
  }
}

/** The foot: the lead act, the Message and Call circles, and More; and, once asked, the cancel's question. */
export function VisitFoot({ c }: { c: VisitCtx }) {
  const { vm, b } = c;
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
      ) : (
        <div className="cal-visit-acts">
          <PrimaryAct c={c} />
          {vm.circles.message ? (
            <Button
              variant="quiet"
              iconOnly
              className="cal-visit-circle"
              aria-label={vm.circles.message}
              data-tip={vm.circles.message}
              onClick={() => messageThem(b)}
              data-testid="cal-visit-message"
            >
              <Icon name="chat" size={16} />
            </Button>
          ) : null}
          {vm.circles.call ? (
            <Button
              variant="quiet"
              iconOnly
              className="cal-visit-circle"
              aria-label={vm.circles.call}
              data-tip={vm.circles.call}
              onClick={() => callThem(b)}
              data-testid="cal-visit-call"
            >
              <Icon name="phone" size={16} />
            </Button>
          ) : null}
          {items.length ? (
            <Menu
              align="end"
              label={W.more}
              groups={[{ items }]}
              trigger={
                <Button
                  variant="quiet"
                  iconOnly
                  className="cal-visit-circle"
                  aria-label={W.more}
                  data-tip={W.more}
                  data-testid="cal-visit-more"
                >
                  <Icon name="more" size={16} />
                </Button>
              }
            />
          ) : null}
        </div>
      )}
      {vm.shut ? <p className="cal-visit-quiet">{vm.shut}</p> : null}
    </div>
  );
}

/** The body: how it stands, who it is for, the ask, the rows and the footnote. */
export function VisitBody({ c }: { c: VisitCtx }) {
  const { vm } = c;
  return (
    <div className="cal-visit" data-testid="cal-visit">
      <VisitStatePill vm={vm} />
      {visitPersonLine(c)}
      <VisitAskRow c={c} />
      {visitRows(vm)}
      <p className="cal-visit-foot-note" data-testid="cal-visit-footnote">
        {vm.footnote}
      </p>
    </div>
  );
}

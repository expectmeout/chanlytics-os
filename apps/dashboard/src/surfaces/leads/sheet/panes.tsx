/**
 * The lead sheet's five lines (the canvas "Lead sheet, redesigned", 1 Nov 2026): Fit, Contact, Company or About, Sequence
 * and History, the same five in the same order on every lead, each saying its answer closed, one open at a time so the
 * card stays in reach. Fit: what did not pass first, with why, the rest under it, one legend for the marks. Contact: the
 * address the sequence writes to and how it checked, the phone, the site, the people there with Write here, every other
 * link. Company: their own words cut short, then each fact once. Sequence: the record's steps, a row each, read from the
 * same place, with Take out and the record a press away, and their preview. History: how we found them and what happened.
 *
 * Hookless: the sheet hands down the lead, its facts, its acts and which line is open. Every word is contracts'.
 */
import type { ReactNode } from "react";
import {
  LEAD_SHEET_CARD_WORDS as CW,
  LEAD_SHEET_WORDS as W,
  PLACE_RAIL_WORDS,
  leadSheetAboutOf,
  leadSheetExceptionWords,
  type LeadCardEmailVM,
  type LeadCardStepVM,
  type LeadLineId,
  type LeadLineVM,
  type LeadPeekVM,
  type LeadSheetCheckVM,
  type LeadSheetFactVM,
  type LeadSheetWhyVM,
  type PlaceRailStepVM,
} from "@chanlytics/contracts";
import { EmailAs } from "../../campaigns/sequences/place/email-as";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { gate } from "../../legacy-verbs";
import { LeadCallMenu } from "../cells/call-menu";
import { ldCheckMark } from "../peek/hint";
import { LeadPeekParts } from "../peek/info";
import { LeadPeekCompany, LeadPeekPeople } from "../peek/people";
import type { PeekActs } from "../peek/types";
import type { SheetFacts } from "./facts";
import { SheetPreview } from "./preview";

/* ------------------------------------------------------------------------------------------------------- fit -- */

/** One check: its mark (seen, read, couldn't tell, failed), its words, and why it did not pass where that is known. */
const checkRow = (c: LeadSheetCheckVM, exception = false) => (
  <div
    key={`${c.how}-${c.key}`}
    className={`lw-ck ${c.how}${c.answer === "no" ? " no" : ""}`}
    data-testid={`peek-check-${c.key}-open`}
  >
    {ldCheckMark(c.how, c.answer)}
    <span>{exception ? leadSheetExceptionWords(c.key, c.label) : c.label}</span>
    {exception && c.reason ? <span className="lw-ck-why">{c.reason}</span> : null}
  </div>
);

/** Fit: what did not pass first, each with why, then what passed, and the legend where a check was read. */
const fitOf = (why: LeadSheetWhyVM) => (
  <div className="lw-cks" data-testid="peek-checks-open">
    {why.exceptions.map((c) => checkRow(c, true))}
    {why.passed.map((c) => checkRow(c))}
    {why.legend ? (
      <p className="lw-legend">
        <span>
          {ldCheckMark("seen", "yes")}
          {CW.seen}
        </span>
        <span>
          {ldCheckMark("read", "yes")}
          {why.legend}
        </span>
      </p>
    ) : null}
  </div>
);

/* --------------------------------------------------------------------------------------------------- contact -- */

/** A way to reach them: its glyph, its value, how it was checked, and what can be done with it. */
const reachRow = (p: {
  icon: string;
  value: string;
  line: string;
  acts?: ReactNode;
  testid: string;
  warn?: boolean;
}) => (
  <div className="lw-rr" data-testid={p.testid}>
    <Icon name={p.icon} size={14} />
    <span className="lw-rr-w">
      <span className="lw-rr-v" data-testid={`${p.testid}-value`}>
        {p.value}
      </span>
      <span className={p.warn ? "lw-rr-s lw-amber" : "lw-rr-s"} data-testid={`${p.testid}-words`}>
        {p.line}
      </span>
    </span>
    {p.acts ? <span className="lw-rr-a">{p.acts}</span> : null}
  </div>
);

/** How the address it writes to checked, said once. */
const emailLineOf = (f: SheetFacts) =>
  `${W.writesHere} · ${f.email.tone === "ok" ? W.checkedMailbox.toLowerCase() : f.email.words.toLowerCase()}`;

/**
 * Contact: the address the sequence writes to and how its mailbox checked; the phone, not confirmed in amber, with Call;
 * the site; the people there (a company's, each with Write here; People's, each a door); and every other link.
 */
function contactOf(vm: LeadPeekVM, f: SheetFacts, on: PeekActs) {
  const phone = vm.reach.phone;
  const email = vm.reach.email;
  return (
    <>
      {email.address
        ? reachRow({
            icon: "mail",
            value: email.address,
            line: emailLineOf(f),
            warn: f.email.tone === "warn",
            testid: "peek-email",
          })
        : reachRow({ icon: "mail", value: email.value, line: email.tip, testid: "peek-email" })}
      {phone
        ? reachRow({
            icon: "phone",
            value: phone.value,
            line: phone.wrong ? phone.tip : vm.slots.phone.state === "ok" ? phone.tip : W.notConfirmed,
            warn: !phone.wrong && vm.slots.phone.state !== "ok",
            testid: "peek-phone",
            acts: phone.wrong ? null : (
              <LeadCallMenu
                name={vm.name}
                number={phone.value}
                onDial={() => on.onCall(vm.id)}
                onCopy={() => on.onCopyPhone(vm.id)}
                onLog={() => on.onLogCall(vm.id)}
                look={{ variant: "quiet", size: "sm", iconOnly: true, className: "" }}
                heading={false}
                size={13}
                testid="peek-act-call"
              />
            ),
          })
        : null}
      {vm.links.website
        ? reachRow({
            icon: "globe",
            value: vm.links.website.label,
            line: email.address && email.value ? W.emailOnSite : "",
            testid: "peek-site",
          })
        : null}
      <LeadPeekCompany key={`${vm.id}-company`} company={vm.company} lead={vm} on={on} />
      <LeadPeekPeople lead={vm} on={on} />
      {LeadPeekParts.others(vm)}
      {LeadPeekParts.links(vm)}
    </>
  );
}

/* ----------------------------------------------------------------------------------------------------- about -- */

/** A fact about them, on the line's own column; a tip folds under it where a press says more. */
const factRow = (r: LeadSheetFactVM) => (
  <div key={`${r.k}-${r.v}`} className="lw-kv">
    <span className="lw-kv-k">{r.k}</span>
    <span className="lw-kv-v">
      {r.v}
      {r.tip ? (
        <details className="lw-kv-tip">
          <summary className="lw-kv-tip-s">{W.whatWeKeep}</summary>
          <p>{r.tip}</p>
        </details>
      ) : null}
    </span>
  </div>
);

/** Company, or About: their own words cut short, then each fact once. */
function aboutOf(vm: LeadPeekVM) {
  const about = leadSheetAboutOf(vm);
  return (
    <>
      {about.text ? (
        <p className="lw-blurb" data-testid="peek-about-text">
          {about.text}
        </p>
      ) : null}
      {about.rows.length ? (
        <div className="lw-kvs" data-testid="peek-about">
          {about.rows.map(factRow)}
        </div>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------------------------------- sequence -- */

/** What the Sequence line's record door, Take out and a step opened do. */
interface SequenceActs {
  onOpenRecord: (sequenceId: string) => void;
  onTakeOut: (() => void) | null;
  /** A step pressed: the email as they get it, opened under it. */
  onOpenStep: (place: number) => void;
  openStep: number | null;
  busy: boolean;
}

/** One step's email for this lead, as a step opened draws it. */
const stepEmail = (s: LeadCardStepVM): LeadCardEmailVM => ({
  head: s.label,
  to: null,
  subject: s.subject,
  body: s.body,
  when: null,
  note: null,
  blocked: null,
  instead: null,
});

/** A step in a row: its number, a tick once it went; what it is, a press where it opens; and what it is doing for them. */
function stepRow(s: PlaceRailStepVM, a: SequenceActs) {
  const need = s.state?.tone === "need";
  const done = s.state?.tone === "done";
  return (
    <div key={s.id} className="lw-rung" data-testid={`lead-sheet-rail-${s.place}`}>
      <span className={`lw-rung-n${done ? " is-done" : need ? " is-need" : ""}`} aria-hidden="true">
        {done ? <Icon name="check" size={10} /> : s.place}
      </span>
      {s.hand ? (
        <span className="lw-rung-t">{s.title}</span>
      ) : (
        <LinkButton
          size="inherit"
          className="lw-rung-t"
          onClick={() => a.onOpenStep(s.place)}
          data-testid={`sq-step-open-${s.place}`}
        >
          {s.title}
        </LinkButton>
      )}
      {s.state ? (
        <span className={need ? "lw-rung-at lw-amber" : "lw-rung-at"} data-testid={`lead-sheet-rail-now-${s.place}`}>
          {s.state.words}
        </span>
      ) : null}
    </div>
  );
}

/** Sequence: the record's steps a row each, the record and Take out under them, and their preview. */
function sequenceOf(f: SheetFacts, a: SequenceActs, leadId: string) {
  const rail = f.rail;
  const open = rail && a.openStep !== null ? rail.steps.get(a.openStep) : null;
  const stands = f.place && f.place.place.group !== "left" && f.place.place.group !== "done";
  if (!rail) return <p className="lw-note">{f.state === "phone" ? W.noEmailToWrite : W.noPick}</p>;
  return (
    <>
      {rail.lens === "preview" ? <p className="lw-note">{PLACE_RAIL_WORDS.ifAdded}</p> : null}
      <div className="lw-rungs" data-testid="lead-sheet-rail">
        {rail.vm.steps.map((s) => stepRow(s, a))}
      </div>
      {open && f.card.email ? (
        <EmailAs email={{ ...f.card.email, ...stepEmail(open) }} whole testid="lead-sheet-step-email" />
      ) : null}
      <p className="lw-note">{rail.vm.end.head}</p>
      <div className="lw-seq-foot">
        <LinkButton onClick={() => a.onOpenRecord(rail.sequence.id)} data-testid="lead-sheet-every-step">
          {W.openSequence(rail.sequence.name)}
        </LinkButton>
        {a.onTakeOut && stands ? (
          <Button
            size="sm"
            variant="quiet"
            disabled={a.busy}
            onClick={a.onTakeOut}
            data-testid="lead-sheet-take-out-press"
            {...gate("approve", "take this lead out")}
          >
            {PLACE_RAIL_WORDS.takeOut(rail.sequence.name)}
          </Button>
        ) : null}
      </div>
      <SheetPreview leadId={leadId} />
    </>
  );
}

/* --------------------------------------------------------------------------------------------------- history -- */

/** History: how we found them, then what happened, each on the line's own column. */
const historyOf = (f: SheetFacts) => (
  <ol className="lw-found" data-testid="peek-found">
    {f.history.map((h) => (
      <li key={`${h.at}-${h.what}`} className="lw-found-i">
        <span className="lw-kv-k">{h.at}</span>
        <span>{h.what}</span>
      </li>
    ))}
  </ol>
);

/* ------------------------------------------------------------------------------------------------- the lines -- */

/** What a line says closed: Fit's dots, its answer, a quieter word, and a tick where its address checked out. */
const lineValue = (l: LeadLineVM) => (
  <>
    {l.dots ? (
      <span className="lw-dots" aria-hidden="true">
        {l.dots.map((d, i) => (
          <i key={i} className={d} />
        ))}
      </span>
    ) : null}
    <span className="lw-line-v">{l.value}</span>
    {l.tick ? <Icon name="check" size={12} className="lw-green" /> : null}
    {l.note ? <span className="lw-line-q">{l.note}</span> : null}
    {l.warn ? <span className="lw-line-q lw-amber">{l.warn}</span> : null}
  </>
);

/** The five lines, and what each holds open. */
export function SheetLines(p: {
  vm: LeadPeekVM;
  facts: SheetFacts;
  on: PeekActs;
  seq: SequenceActs;
  open: LeadLineId | null;
  onOpen: (id: LeadLineId) => void;
}) {
  const holds: Record<LeadLineId, () => ReactNode> = {
    fit: () => (p.facts.why ? fitOf(p.facts.why) : null),
    contact: () => contactOf(p.vm, p.facts, p.on),
    about: () => aboutOf(p.vm),
    sequence: () => sequenceOf(p.facts, p.seq, p.vm.id),
    history: () => historyOf(p.facts),
  };
  return (
    <div className="lw-lines" data-testid="lead-sheet-record">
      {p.facts.lines.map((l) => (
        <RecordDisclosure
          key={l.id}
          id={`lead-sheet-${l.id}`}
          look="row"
          label={l.label}
          value={lineValue(l)}
          open={p.open === l.id}
          onToggle={() => p.onOpen(l.id)}
          testid={`lead-sheet-sec-${l.id}`}
        >
          {p.open === l.id ? holds[l.id]() : null}
        </RecordDisclosure>
      ))}
    </div>
  );
}

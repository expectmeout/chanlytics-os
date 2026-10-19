/**
 * The lead sheet raised: a record of the lead, one scroll, nothing behind a tab (the canvas "Lead to sequence,
 * redesigned", its PhoneFull, PhoneFullMore and PhoneInIt boards). Fit: the verdict's checks, what did not pass first and
 * the rest folded under "N passed". About: what its listing says, said once. Contact: the address the sequence writes to
 * and how it checked, the people there with Write here, the phone and the site. Sequence: their place, on the record's
 * rail drawn for one lead, with Take out under it and the record a press away; before a sequence has them, the rail as
 * they'd get it from the pick. How we found them: the trail, one small section.
 *
 * Hookless: the sheet hands down the lead, its facts and its acts. Every word is contracts'.
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
  type LeadPeekVM,
  type LeadSheetCheckVM,
  type LeadSheetWhyVM,
} from "@chanlytics/contracts";
import { EmailAs } from "../../campaigns/sequences/place/email-as";
import { PlaceRail } from "../../campaigns/sequences/place/rail";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { gate } from "../../legacy-verbs";
import { LeadCallMenu } from "../cells/call-menu";
import { ldCheckMark } from "../peek/hint";
import { LeadPeekParts } from "../peek/info";
import { LeadPeekCompany, LeadPeekPeople } from "../peek/people";
import type { PeekActs } from "../peek/types";
import type { SheetFacts } from "./facts";

/** A section's heading, with a quiet word at its end. */
const sectionHeadOf = (words: string, end?: ReactNode) => (
  <div className="lw-h">
    <span>{words}</span>
    {end ? <span className="lw-h-s">{end}</span> : null}
  </div>
);

/** One check: its mark (seen, read, couldn't tell, failed), its words, and its source. */
const checkRow = (c: LeadSheetCheckVM, exception = false) => (
  <div
    key={`${c.how}-${c.key}`}
    className={`lw-ck ${c.how}${c.answer === "no" ? " no" : ""}`}
    data-testid={`peek-check-${c.key}-open`}
  >
    {ldCheckMark(c.how, c.answer)}
    <span>{exception ? leadSheetExceptionWords(c.key, c.label) : c.label}</span>
    <span className="lw-src">{c.source}</span>
  </div>
);

/** Fit: what did not pass first, the rest folded under "N passed", and the legend where a check was read. */
const fitOf = (why: LeadSheetWhyVM) => (
  <section className="lw-sec" aria-label={W.sections.fit} id="lead-sheet-fit" data-testid="lead-sheet-sec-fit">
    {sectionHeadOf(W.sections.fit, W.fitChecks(why.passed.length, why.passed.length + why.exceptions.length))}
    <div className="lw-cks" data-testid="peek-checks-open">
      {why.exceptions.map((c) => checkRow(c, true))}
      {why.passed.length ? (
        <details className="lw-fold" open={!why.exceptions.length} data-testid="lead-sheet-passed">
          <summary className="lw-fold-s">
            <Icon name="check" size={11} />
            {W.passed(why.passed.length)}
          </summary>
          {why.passed.map((c) => checkRow(c))}
          {why.legend ? (
            <p className="lw-legend">
              <span>
                {ldCheckMark("seen", "yes")}
                {CW.seen}
              </span>
              <span>
                {ldCheckMark("read", "yes")}
                {CW.read}
              </span>
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  </section>
);

/** About: what its listing says, said once (the rating is the head's), its own words first. */
const aboutSectionOf = (vm: LeadPeekVM, on: PeekActs) => {
  const about = leadSheetAboutOf(vm);
  if (!about.text && !about.rows.length && !vm.company) return null;
  return (
    <section className="lw-sec" aria-label={about.head} data-testid="lead-sheet-sec-about">
      {sectionHeadOf(about.head, about.from)}
      {about.text ? (
        <p className="lw-say" data-testid="peek-about-text">
          {about.text}
        </p>
      ) : null}
      {about.rows.length ? (
        <div className="lw-kv" data-testid="peek-about">
          {about.rows.map((r) => (
            <div key={`${r.k}-${r.v}`} className="lw-kv-r">
              <span className="lw-kv-k">{r.k}</span>
              <span>{r.v}</span>
              <span className="lw-src">{r.from ?? ""}</span>
            </div>
          ))}
        </div>
      ) : null}
      <LeadPeekCompany key={`${vm.id}-company`} company={vm.company} lead={vm} on={on} />
    </section>
  );
};

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
    <Icon name={p.icon} size={16} />
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

/**
 * Contact: the address the sequence writes to and how its mailbox checked; the people there (a company's, each with Write
 * here; People's, each a door); the phone, not confirmed in amber, with Call; the site and the other addresses on it.
 */
const contactOf = (vm: LeadPeekVM, f: SheetFacts, on: PeekActs) => {
  const phone = vm.reach.phone;
  const email = vm.reach.email;
  return (
    <section
      className="lw-sec"
      aria-label={W.sections.contact}
      id="lead-sheet-contact"
      data-testid="lead-sheet-sec-contact"
    >
      {sectionHeadOf(W.sections.contact)}
      <div className="lw-group">
        {email.address
          ? reachRow({
              icon: "mail",
              value: email.address,
              line: `${W.writesHere} · ${f.email.tone === "ok" ? W.checkedMailbox : f.email.words.toLowerCase()}`,
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
              acts: (
                <Button
                  variant="quiet"
                  size="sm"
                  iconOnly
                  href={vm.links.website.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={W.quick.website}
                  title={W.quick.website}
                  data-testid="peek-website"
                >
                  <Icon name="external" size={13} />
                </Button>
              ),
            })
          : null}
      </div>
      <LeadPeekPeople lead={vm} on={on} />
      {LeadPeekParts.others(vm)}
    </section>
  );
};

/** What the Sequence section's record door, Take out and a step opened do. */
interface SequenceActs {
  onOpenRecord: (sequenceId: string) => void;
  onTakeOut: (() => void) | null;
  /** A step pressed: the email as they get it, opened in the section. */
  onOpenStep: (place: number) => void;
  openStep: number | null;
  busy: boolean;
}

/** One step's email for this lead, as the rail's few lines draw it. */
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

/** Their place, or the rail as they'd get it; the record a door away, Take out under it while their place stands. */
function sequenceOf(f: SheetFacts, a: SequenceActs) {
  const rail = f.rail;
  const head = rail ? (
    <LinkButton
      size="inherit"
      className="lw-every"
      onClick={() => a.onOpenRecord(rail.sequence.id)}
      data-testid="lead-sheet-every-step"
    >
      {rail.sequence.name}
      {rail.lens === "one" ? " · Leads" : ""} <Icon name="chevron" size={11} />
    </LinkButton>
  ) : null;
  const words = rail
    ? new Map([...rail.steps].map(([place, s]) => [place, <EmailAs key={place} email={stepEmail(s)} short />]))
    : undefined;
  const open = rail && a.openStep !== null ? rail.steps.get(a.openStep) : null;
  const stands = f.place && f.place.place.group !== "left" && f.place.place.group !== "done";
  return (
    <section
      className="lw-sec"
      aria-label={W.sections.sequence}
      id="lead-sheet-sequence"
      data-testid="lead-sheet-sec-sequence"
    >
      {sectionHeadOf(
        rail ? (rail.lens === "one" ? PLACE_RAIL_WORDS.theirPlace : PLACE_RAIL_WORDS.ifAdded) : W.sections.sequence,
        head ?? (f.place ? null : W.notInOne),
      )}
      {rail ? (
        <PlaceRail
          vm={rail.vm}
          words={rail.lens === "preview" ? words : undefined}
          onOpen={a.onOpenStep}
          foot={
            a.onTakeOut && stands ? (
              <div className="lw-take" data-testid="lead-sheet-take-out">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={a.busy}
                  onClick={a.onTakeOut}
                  data-testid="lead-sheet-take-out-press"
                  {...gate("approve", "take this lead out")}
                >
                  {PLACE_RAIL_WORDS.takeOut(rail.sequence.name)}
                </Button>
              </div>
            ) : null
          }
        />
      ) : (
        <p className="lw-say quiet">{f.state === "phone" ? W.noEmailToWrite : W.noPick}</p>
      )}
      {open && f.card.email ? (
        <EmailAs
          email={{ ...f.card.email, subject: open.subject, body: open.body }}
          whole
          testid="lead-sheet-step-email"
        />
      ) : null}
    </section>
  );
}

/** How we found them: the trail, one small section, folded. */
const foundOf = (vm: LeadPeekVM) =>
  vm.found.length ? (
    <details className="lw-sec lw-fold" data-testid="lead-sheet-sec-found">
      <summary className="lw-fold-s">
        <Icon name="chevron" size={11} />
        {W.sections.found}
        {vm.foundSummary ? <span className="lw-h-s">{` · ${vm.foundSummary}`}</span> : null}
      </summary>
      <ol className="lw-found" data-testid="peek-found">
        {vm.found.map((f) => (
          <li key={f.what} className="lw-found-i">
            <i aria-hidden="true" />
            <span>{f.what}</span>
            <span className="lw-src">{f.at}</span>
          </li>
        ))}
      </ol>
      {LeadPeekParts.links(vm)}
    </details>
  ) : null;

/** The record of the lead under the quick look: Fit, About, Contact, Sequence, How we found them. */
export function SheetRecord(p: { vm: LeadPeekVM; facts: SheetFacts; on: PeekActs; seq: SequenceActs }) {
  return (
    <div className="lw-record" data-testid="lead-sheet-record" aria-label={W.label}>
      {p.facts.why ? fitOf(p.facts.why) : null}
      {aboutSectionOf(p.vm, p.on)}
      {contactOf(p.vm, p.facts, p.on)}
      {sequenceOf(p.facts, p.seq)}
      {foundOf(p.vm)}
    </div>
  );
}

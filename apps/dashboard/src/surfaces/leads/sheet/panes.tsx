/**
 * The lead sheet at full height (the refined canvas, 17 Oct 2026: three tabs, in Sequences' words). Why: the checks,
 * what did not pass first and the rest folded under "N passed", with one legend for a mark seen and a mark read (its
 * decision 07); the listing's reasons and its own facts, the company, and how it was found. Contact: where the sequence writes, each way in and how it was checked with its acts, the people there, the
 * address and the week, the links. Sequence: where they stand in it on the record's rail of days, Take out under it and
 * the record a press away; before a sequence has them, the email they would get, its steps and its variables. The dock
 * stays under them, so a decision is one thumb away on every tab.
 *
 * Hookless: the sheet hands down the lead, its card, its acts and what the tabs read. Every word is contracts'.
 */
import type { ReactNode } from "react";
import {
  LEAD_CARD_TABS,
  LEAD_CARD_WORDS,
  LEAD_SHEET_CARD_WORDS as CW,
  LEAD_SHEET_WORDS as W,
  LEAD_WORDS,
  leadSheetAboutOf,
  leadSheetReasonsOf,
  type LeadCardTab,
  type LeadPeekVM,
  type LeadPlaceVM,
  type LeadSheetBoxVM,
  type LeadSheetCheckVM,
  type LeadSheetTrackVM,
  type LeadSheetWhyVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { CopyButton } from "../../kit/copy-button/copy-button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { gate } from "../../legacy-verbs";
import { LeadCallMenu } from "../cells/call-menu";
import { ldCheckMark } from "../peek/hint";
import { LeadPeekParts } from "../peek/info";
import { LeadPeekCompany, LeadPeekPeople } from "../peek/people";
import type { PeekActs } from "../peek/types";
import type { LeadCardFacts } from "../pile/card";
import { SheetMail, SheetParts, SheetTrack } from "./parts";

/** The tabs' own words. */
const TAB_WORDS = W.panes;

/** What the panes read beside the lead: its card, its acts, its place in a sequence, and the email's head. */
interface PaneProps {
  vm: LeadPeekVM;
  card: LeadCardFacts;
  /** Why's checks: what did not pass, the rest, their count and whether a legend is owed. */
  why: LeadSheetWhyVM | null;
  on: PeekActs;
  stand: { title: string; line: string };
  /** The email's head: the sequence's name and what follows it, and its Change. */
  mail: { head: string; sub: string; canChange: boolean; onChange: () => void } | null;
  track: LeadSheetTrackVM | null;
  place: LeadPlaceVM | null;
  box: LeadSheetBoxVM;
  /** The record, opened with the way back to this lead. */
  onOpenRecord: (rootId: string) => void;
  /** Take out of the sequence they are in: the leave verb, whose undo is Put back. */
  onTakeOut: (() => void) | null;
  busy: boolean;
}

/** A pane's heading, with a quiet word at its end. */
const paneHeadOf = (words: string, end?: string | null) => (
  <div className="lw-h">
    <span>{words}</span>
    {end ? <span className="lw-h-s">{end}</span> : null}
  </div>
);

/** What is known of them, as text to paste elsewhere: the name, where, the phone, the email and the site. */
const allOf = (vm: LeadPeekVM) =>
  [
    vm.name,
    vm.sub,
    vm.where ? vm.where.line : null,
    vm.reach.phone ? vm.reach.phone.value : null,
    vm.reach.email.address,
    vm.links.website ? vm.links.website.href : null,
  ]
    .filter(Boolean)
    .join("\n");

/** One check: its mark (seen, read, couldn't tell, failed), its words, and its source. */
const checkRow = (c: LeadSheetCheckVM) => (
  <div
    key={`${c.how}-${c.key}`}
    className={`lw-ck ${c.how}${c.answer === "no" ? " no" : ""}`}
    data-testid={`peek-check-${c.key}-open`}
  >
    {ldCheckMark(c.how, c.answer)}
    <span>{c.label}</span>
    <span className="lw-src">{c.source}</span>
  </div>
);

/** Why's checks: what did not pass first, the rest folded under "N passed", and the legend where a check was read. */
const whyChecksOf = (why: LeadSheetWhyVM) => (
  <>
    {paneHeadOf(CW.checksHead, why.count)}
    <div className="lw-cks" data-testid="peek-checks-open">
      {why.exceptions.map(checkRow)}
      {why.passed.length ? (
        <details className="lw-fold" open={!why.exceptions.length} data-testid="lead-sheet-passed">
          <summary className="lw-fold-s">
            <Icon name="chevron" size={11} />
            {why.fold}
          </summary>
          {why.passed.map(checkRow)}
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
  </>
);

/** Why: the checks, the listing's reasons and facts, the company, and how it was found. */
const whyPane = ({ vm, on, why }: PaneProps) => {
  const reasons = leadSheetReasonsOf(vm);
  // The listing's own facts, each said once: the address and the week are Contact's.
  const listing = leadSheetAboutOf(vm).rows.filter((r) => r.k !== "Address" && r.k !== "Hours");
  return (
    <>
      {why ? whyChecksOf(why) : null}
      {reasons.length ? (
        <>
          {paneHeadOf(W.why.reasons)}
          <div className="lw-sigs">
            {reasons.map((r) => (
              <span key={r.text} className={`lw-sig ${r.tone}`}>
                <i aria-hidden="true" />
                {r.text}
                <small>{r.from}</small>
              </span>
            ))}
          </div>
        </>
      ) : null}
      {listing.length ? (
        <>
          {paneHeadOf(vm.company ? TAB_WORDS.company : TAB_WORDS.listing)}
          <div className="lw-kv" data-testid="peek-about">
            {listing.map((r) => (
              <div key={`${r.k}-${r.v}`} className="lw-kv-r">
                <span className="lw-kv-k">{r.k}</span>
                <span>{r.v}</span>
                <span className="lw-src">{r.from ?? ""}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <LeadPeekCompany key={`${vm.id}-company`} company={vm.company} lead={vm} on={on} />
      {paneHeadOf(W.activity.found, vm.foundSummary)}
      <ol className="lw-found" data-testid="peek-found">
        {vm.found.map((f) => (
          <li key={f.what} className="lw-found-i">
            <i aria-hidden="true" />
            <span>{f.what}</span>
            <span className="lw-src">{f.at}</span>
          </li>
        ))}
      </ol>
      <div className="lw-quiet">
        <CopyButton text={allOf(vm)} label={W.copyAll} said={W.copied} testid="lead-sheet-copy-all" />
      </div>
    </>
  );
};

/** A way to reach them: its glyph, its value, how it was checked, and what can be done with it. */
const reachRow = (p: {
  icon: string;
  value: string;
  line: string;
  acts?: ReactNode;
  testid: string;
  wrong?: boolean;
}) => (
  <div className="lw-rr" data-testid={p.testid}>
    <Icon name={p.icon} size={16} />
    <span className="lw-rr-w">
      <span className={`lw-rr-v${p.wrong ? " wrong" : ""}`} data-testid={`${p.testid}-value`}>
        {p.value}
      </span>
      <span className="lw-rr-s" data-testid={`${p.testid}-words`}>
        {p.line}
      </span>
    </span>
    {p.acts ? <span className="lw-rr-a">{p.acts}</span> : null}
  </div>
);

/** The email's own acts: Copy it, and a draft for your own inbox. */
const emailActs = ({ vm, on }: PaneProps) =>
  vm.reach.email.canDraft ? (
    <>
      <Button
        variant="quiet"
        size="sm"
        iconOnly
        aria-label={LEAD_WORDS.copyAria}
        data-tip={LEAD_WORDS.copyAria}
        onClick={() => on.onCopy(vm.id)}
        data-testid="peek-copy"
      >
        <Icon name="copy" size={13} />
      </Button>
      <Button
        variant="quiet"
        size="sm"
        iconOnly
        aria-label={LEAD_WORDS.draftAria}
        data-tip={LEAD_WORDS.draftAria}
        onClick={() => void on.onDraft(vm.id)}
        data-testid="peek-draft"
      >
        <Icon name="edit" size={13} />
      </Button>
    </>
  ) : null;

/**
 * Contact: where the sequence writes first (the address its email goes to), then the people there, the phone (Call from
 * your phone, Copy), the site and the rest, the address with the week, and the links.
 */
const contactPane = (p: PaneProps) => {
  const { vm, on } = p;
  const phone = vm.reach.phone;
  const email = vm.reach.email;
  const about = leadSheetAboutOf(vm).rows.filter((r) => r.k === "Address");
  return (
    <>
      {paneHeadOf(TAB_WORDS.writesTo)}
      <div className="lw-group">
        {reachRow({ icon: "mail", value: email.value, line: email.tip, testid: "peek-email", acts: emailActs(p) })}
      </div>
      <LeadPeekPeople lead={vm} on={on} />
      {paneHeadOf(W.reach.head, W.reach.sub)}
      <div className="lw-group">
        {phone
          ? reachRow({
              icon: "phone",
              value: phone.value,
              line: phone.tip,
              wrong: phone.wrong,
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
              line: vm.links.instagram ? LEAD_WORDS.instagram : "",
              testid: "peek-site",
            })
          : null}
        {reachRow({ icon: "chat", value: vm.reach.locked.title, line: vm.reach.locked.line, testid: "peek-locked" })}
      </div>
      {LeadPeekParts.others(vm)}
      {about.length || vm.week.length ? paneHeadOf(TAB_WORDS.where, vm.weekSummary || null) : null}
      {about.length ? (
        <div className="lw-kv" data-testid="peek-where">
          {about.map((r) => (
            <div key={r.k} className="lw-kv-r">
              <span className="lw-kv-k">{r.k}</span>
              <span>{r.v}</span>
              <span className="lw-src">{r.from ?? ""}</span>
            </div>
          ))}
        </div>
      ) : null}
      {vm.week.length ? (
        <div className="lw-kv" data-testid="peek-week">
          {vm.week.map((d) => (
            <div key={d.day} className={`lw-kv-r${d.today ? " today" : ""}`} data-testid="peek-day">
              <span className="lw-kv-k">{d.day}</span>
              <span>{d.short}</span>
              <span />
            </div>
          ))}
        </div>
      ) : null}
      {paneHeadOf(W.about.links)}
      {LeadPeekParts.links(vm)}
    </>
  );
};

/** Before a sequence has them: the email they would get, in full, with Change; its steps; each variable with its source. */
const wouldGetOf = ({ card, mail }: PaneProps) => {
  if (!card.email || !mail)
    return <p className="lw-say quiet">{card.firstPile ? LEAD_CARD_WORDS.firstPile : W.emails.none}</p>;
  return (
    <>
      <SheetMail
        email={card.email}
        head={mail.head}
        sub={mail.sub}
        canChange={mail.canChange}
        onChange={mail.onChange}
        full
      />
      {card.steps.length > 1 ? (
        <>
          {paneHeadOf(W.emails.steps)}
          <ol className="lw-steps" data-testid="lead-sheet-steps">
            {card.steps.map((s, i) => (
              <li key={s.id} className="lw-step">
                <span className={`lw-step-n${i === 0 ? " next" : ""}`}>{i + 1}</span>
                <span className="lw-step-w">
                  <b>{s.label}</b>
                  <span className="lw-step-b">
                    <SheetParts parts={s.body.slice(0, 6)} />
                  </span>
                </span>
                <span className="lw-step-a">{s.after ?? ""}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {card.slots.length ? (
        <>
          {paneHeadOf(W.emails.vars(card.peek ? card.peek.short : ""))}
          <div className="lw-vars" data-testid="lead-sheet-slots">
            {card.slots.map((s) => (
              <div
                key={s.key}
                className={`lw-var ${s.look}`}
                data-testid={`lead-sheet-slot-${s.key.replace(/ /g, "-")}`}
              >
                <span className="lw-var-k">{s.label}</span>
                <span>{s.value ?? ""}</span>
                <span className="lw-var-s">{s.from}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
};

/**
 * Sequence: where they stand. In one, their steps on the record's rail of days, Take out under it while their place
 * stands, and every step and who else is in it a press away (the record, with the way back here); else the email they
 * would get. Their story's doors (the thread, a reply's undo) follow.
 */
const sequencePane = (p: PaneProps) => {
  const { track, place, box, on, stand } = p;
  const out = place && (place.group === "left" || place.group === "done");
  return (
    <>
      {track ? (
        <>
          {paneHeadOf(TAB_WORDS.steps, stand.title)}
          <SheetTrack track={track} />
          {p.onTakeOut && !out ? (
            <div className="lw-take" data-testid="lead-sheet-take-out">
              <Button
                size="sm"
                variant="secondary"
                disabled={p.busy}
                onClick={p.onTakeOut}
                data-testid="lead-sheet-take-out-press"
                {...gate("approve", "take this lead out")}
              >
                {TAB_WORDS.takeOut}
              </Button>
              <span className="lw-take-s">{TAB_WORDS.takeOutLine}</span>
            </div>
          ) : null}
          <LinkButton
            className="lw-every"
            onClick={() => p.onOpenRecord(track.rootId)}
            data-testid="lead-sheet-every-step"
          >
            {TAB_WORDS.everyStep(track.name)} <Icon name="chevron" size={11} />
          </LinkButton>
        </>
      ) : (
        <>
          <div className="lw-stand" data-testid="lead-sheet-stand">
            <b>{stand.title}</b>
            <span>{stand.line}</span>
          </div>
          {box.rootId && box.name ? (
            <LinkButton
              className="lw-every"
              onClick={() => box.rootId && p.onOpenRecord(box.rootId)}
              data-testid="lead-sheet-every-step"
            >
              {TAB_WORDS.everyStep(box.name)} <Icon name="chevron" size={11} />
            </LinkButton>
          ) : null}
          {wouldGetOf(p)}
        </>
      )}
      {on.reachOut}
    </>
  );
};

/** The open tab's pane. */
export const SheetPane = ({ tab, ...p }: PaneProps & { tab: LeadCardTab }) => (
  <div
    className="lw-pane"
    role="region"
    aria-label={LEAD_CARD_TABS.find((t) => t.id === tab)?.label}
    data-testid={`lead-sheet-pane-${tab}`}
  >
    {tab === "why" ? whyPane(p) : tab === "contact" ? contactPane(p) : sequencePane(p)}
  </div>
);

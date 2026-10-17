/**
 * The lead sheet at full height (canvas B v2, "Pulled up, the card reads in five tabs"): Why (every check with its mark
 * and source, the reasons to write now, the people there), Reach (each way in and how it was checked, with its acts),
 * Emails (email 1 in full, every step after it, each variable with its source), About (the place or the company as its
 * source knows it, its week and its links), and Activity (where it stands with a sequence, its story and doors, how it
 * was found). The rail stays under them, so a decision is one thumb away on every tab.
 *
 * Hookless: the sheet hands down the lead, its card, its acts and what the tabs read. Every word is contracts'.
 */
import {
  LEAD_CARD_TABS,
  LEAD_CARD_WORDS,
  LEAD_SHEET_WORDS as W,
  LEAD_WORDS,
  leadSheetAboutOf,
  leadSheetChecksOf,
  leadSheetReasonsOf,
  type LeadCardTab,
  type LeadPeekVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { CopyButton } from "../../kit/copy-button/copy-button";
import { Icon } from "../../kit/icon/icon";
import { LeadCallMenu } from "../cells/call-menu";
import { ldCheckMark } from "../peek/hint";
import { LeadPeekParts } from "../peek/info";
import { LeadPeekCompany, LeadPeekPeople } from "../peek/people";
import type { PeekActs } from "../peek/types";
import type { LeadCardFacts } from "../pile/card";
import { SheetMail, SheetParts } from "./parts";

/** What the panes read beside the lead: its card, its acts, where it stands, and the email's head. */
interface PaneProps {
  vm: LeadPeekVM;
  card: LeadCardFacts;
  on: PeekActs;
  stand: { title: string; line: string };
  /** The email's head: the sequence's name and what follows it, and its Change. */
  mail: { head: string; sub: string; canChange: boolean; onChange: () => void } | null;
}

/** A pane's heading, with a quiet word at its end. */
const paneHeadOf = (words: string, end?: string | null) => (
  <div className="lw-h">
    <span>{words}</span>
    {end ? <span className="lw-h-s">{end}</span> : null}
  </div>
);

/** Why: the judge's line, every check with its mark and its source, the listing's own reasons, the people there. */
const whyPane = ({ vm, on }: PaneProps) => {
  const reasons = leadSheetReasonsOf(vm);
  return (
    <>
      {paneHeadOf(W.why.head, vm.checkDots.length ? leadSheetChecksOf(vm) : null)}
      {vm.fit.sentence ? (
        <p className="lw-say" data-testid="peek-fit">
          {vm.fit.sentence}
        </p>
      ) : null}
      <div className="lw-cks" data-testid="peek-checks-open">
        {vm.groups.flatMap((g) =>
          g.checks.map((c) => (
            <div
              key={`${g.how}-${c.key}`}
              className={`lw-ck ${g.how}${c.answer === "no" ? " no" : ""}`}
              data-testid={`peek-check-${c.key}-open`}
            >
              {ldCheckMark(g.how, c.answer)}
              <span>{c.label}</span>
              <span className="lw-src">{c.source}</span>
            </div>
          )),
        )}
      </div>
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
      <LeadPeekCompany key={`${vm.id}-company`} company={vm.company} lead={vm} on={on} />
      <LeadPeekPeople lead={vm} on={on} />
    </>
  );
};

/** A way to reach them: its glyph, its value, how it was checked, and what can be done with it. */
const reachRow = (p: {
  icon: string;
  value: string;
  line: string;
  acts?: React.ReactNode;
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

/** Reach: the email (Copy, a draft for your own inbox), the phone (Call from your phone, Copy), the site, the rest. */
const reachPane = ({ vm, on }: PaneProps) => {
  const phone = vm.reach.phone;
  const email = vm.reach.email;
  return (
    <>
      {paneHeadOf(W.reach.head, W.reach.sub)}
      <div className="lw-group">
        {reachRow({
          icon: "mail",
          value: email.value,
          line: email.tip,
          testid: "peek-email",
          acts: email.canDraft ? (
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
          ) : null,
        })}
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
    </>
  );
};

/** Emails: email 1 in full, with Change; the steps after it; each variable with its value here and where it came from. */
const emailsPane = ({ card, mail }: PaneProps) => {
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

/** About: the place or the company as its source knows it, each fact with its source; its week; its links. */
const aboutPane = ({ vm }: PaneProps) => {
  const about = leadSheetAboutOf(vm);
  return (
    <>
      {paneHeadOf(about.head, about.from)}
      <div className="lw-kv" data-testid="peek-about">
        {about.rows.map((r) => (
          <div key={`${r.k}-${r.v}`} className="lw-kv-r">
            <span className="lw-kv-k">{r.k}</span>
            <span>{r.v}</span>
            <span className="lw-src">{r.from ?? ""}</span>
          </div>
        ))}
      </div>
      {vm.week.length ? (
        <>
          {paneHeadOf(W.about.hours)}
          <div className="lw-kv" data-testid="peek-week">
            {vm.week.map((d) => (
              <div key={d.day} className={`lw-kv-r${d.today ? " today" : ""}`} data-testid="peek-day">
                <span className="lw-kv-k">{d.day}</span>
                <span>{d.short}</span>
                <span />
              </div>
            ))}
          </div>
        </>
      ) : null}
      {paneHeadOf(W.about.links)}
      {LeadPeekParts.links(vm)}
    </>
  );
};

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

/** Activity: where they stand with a sequence, its story and its doors (Stop writing, the reply's undo), how it was found. */
const activityPane = ({ vm, on, stand }: PaneProps) => (
  <>
    {paneHeadOf(W.activity.stand)}
    <div className="lw-stand" data-testid="lead-sheet-stand">
      <b>{stand.title}</b>
      <span>{stand.line}</span>
    </div>
    {on.reachOut}
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

/** The open tab's pane. */
export const SheetPane = ({ tab, ...p }: PaneProps & { tab: LeadCardTab }) => (
  <div
    className="lw-pane"
    role="tabpanel"
    aria-label={LEAD_CARD_TABS.find((t) => t.id === tab)?.label}
    data-testid={`lead-sheet-pane-${tab}`}
  >
    {tab === "why"
      ? whyPane(p)
      : tab === "reach"
        ? reachPane(p)
        : tab === "emails"
          ? emailsPane(p)
          : tab === "about"
            ? aboutPane(p)
            : activityPane(p)}
  </div>
);

/**
 * The peek's body while it is just showing the lead (moved from legacy/pages/leads-peek.jsx, decision 0015): the stage and
 * Not a fit on the top row, the verdict and its evidence, how to reach them, what was found and when, the week, the links,
 * and the act that never scrolls away. Hookless: the page's state and the acts it built arrive as props.
 */
import { LEAD_WORDS as W } from "@chanlytics/contracts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { statePillPart } from "../../legacy-parts";
import { gate } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { lookNow } from "../../kit/look/look";
import { LeadCallAsk, LeadPeekAsk, LeadPeekMore, LeadSentAsk } from "./asks";
import { leadCallMenuPart, leadSlotShapePart } from "./doors";
import { LeadEvidenceBar, PkHint, ldCheckMark, pkScrolling } from "./hint";
import type { Armed, Deck, PeekActs, PeekMode } from "./types";

interface InfoProps {
  vm: LeadPeekVM;
  mode: PeekMode | null;
  armed?: Armed | null;
  busy: boolean;
  on: PeekActs;
  deck?: Deck | null;
}

/** The top row: the stage as a segmented control and Not a fit, or a lead left out and Put back; then the ⋯. */
function peekTop({ vm, on, busy }: InfoProps) {
  return (
    <div className="pk-top">
      {vm.canStage ? (
        <>
          <div className="seg" role="radiogroup" aria-label={W.stageLabel} data-testid="peek-stage">
            {vm.stages.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.on}
                className={s.on ? "on" : ""}
                disabled={busy}
                data-testid={`peek-stage-${s.id}`}
                onClick={() => on.onStage(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="sp" />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="peek-not-a-fit"
            onClick={on.onNotAFit}
            {...gate("find", "set this lead aside")}
          >
            {W.notFit}
          </button>
        </>
      ) : (
        <>
          <span className="pk-out-note" data-testid="peek-left-out">
            {W.leftOut}
          </span>
          <span className="sp" />
          <button
            type="button"
            className="btn btn-sm"
            data-testid="peek-put-back"
            onClick={() => on.onPutBack(vm.id)}
            {...gate("find", "put this lead back")}
          >
            {W.putBack}
          </button>
        </>
      )}
      <LeadPeekMore on={on} />
    </div>
  );
}

/**
 * The verdict (D8): the fit as the pill its row wears (StatePill, the one vocabulary: Strong fit in the ok tone, Needs
 * review in the warn), the evidence as a pipeline beside it, and one line of why. No box round it: the pill carries the
 * tone, so the verdict is not an alert. The checks were a fold of their own below; their list is what the bar says when it
 * is pointed at or focused. The bar is drawn anew for each lead, so its pipeline runs once per lead the peek opens on.
 */
function peekVerdict(vm: LeadPeekVM) {
  const StatePill = statePillPart();
  return (
    <div className={`pk-verdict ${vm.fit.cls}`} data-testid="peek-verdict">
      <div className="pk-verdict-head">
        <StatePill
          kind={vm.cls === "qualified" ? "lead_fit" : "lead_class"}
          value={vm.cls === "qualified" ? vm.fit.cls : vm.cls}
          label={vm.fit.word}
          className="pk-fit-word"
          testid="peek-fit-word"
        />
        {vm.checkDots.length ? (
          <PkHint
            id={`${vm.id}-checks`}
            label={vm.checksSummary}
            mark={<LeadEvidenceBar key={vm.id} dots={vm.checkDots} />}
            testid="peek-checks-summary"
            card
          >
            {checkList(vm)}
          </PkHint>
        ) : null}
      </div>
      <p className="pk-fit" data-testid="peek-fit">
        {vm.fit.sentence}
      </p>
      {/* Glass (canvas L2): the checks stand open under the verdict, each with where it came from; the bar's card says the same. */}
      {lookNow() === "glass" && vm.groups.length ? (
        <div className="pk-checks-open" data-testid="peek-checks-open">
          {checkList(vm, "open")}
        </div>
      ) : null}
    </div>
  );
}

/** The checks in their two groups, each with its mark, its words and where it came from: the bar's card, and in Glass the open list. */
function checkList(vm: LeadPeekVM, where: "card" | "open" = "card") {
  const tag = where === "open" ? "-open" : "";
  return vm.groups.map((g) => (
    <span key={g.how} className={`pk-group pk-group-${g.how}`} data-testid={`peek-checks-${g.how}${tag}`}>
      {g.checks.map((c) => (
        <span
          key={c.key}
          className={`pk-ck ${g.how}${c.answer === "no" ? " no" : c.answer === "unknown" ? " warn" : ""}`}
          data-testid={`peek-check-${c.key}${tag}`}
        >
          {ldCheckMark(g.how, c.answer)}
          <span className="pk-ck-t">{c.label}</span>
          <span className="from">{c.source}</span>
        </span>
      ))}
    </span>
  ));
}

/** In Glass a row's mark has its words under the value too (canvas L2: "words for glyphs"); Classic keeps them in the mark's tip. */
function rowWords(words: string, testid: string) {
  return lookNow() === "glass" ? (
    <span className="pk-rr-note" data-testid={testid}>
      {words}
    </span>
  ) : null;
}

/** A section's name, in Glass alone (canvas L2): Classic's rows and folds say it by their shape. */
function eyebrow(words: string) {
  return lookNow() === "glass" ? <span className="pk-eyebrow">{words}</span> : null;
}

/** Keep and Exclude, for a lead that needs review. */
function peekDecide(vm: LeadPeekVM, on: PeekActs) {
  return vm.cls === "review" ? (
    <div className="pk-decide" data-testid="peek-decide">
      <button
        type="button"
        className="btn btn-sm"
        data-testid="peek-keep"
        onClick={() => on.onKeep(vm.id)}
        {...gate("find", "keep this lead")}
      >
        {W.keep}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-testid="peek-exclude"
        onClick={() => on.onExclude(vm.id)}
        {...gate("find", "exclude this lead")}
      >
        {W.exclude}
      </button>
    </div>
  ) : null;
}

/**
 * How to reach them (D8): a line a channel -- its mark, its value, what to press. Each note that was a sentence under its
 * line is what the mark says when pointed at, focused or tapped. What a line does is a quiet mark named on hover (the
 * shared data-tip), because the act that matters is pinned at the foot: Call when there is a number, else Draft. So the
 * phone's line copies the number rather than offer a second Call.
 */
function peekReach(vm: LeadPeekVM, on: PeekActs) {
  const LeadSlotShape = leadSlotShapePart();
  return (
    <div className="pk-reach">
      {eyebrow(W.reachHeading)}
      {vm.reach.phone ? (
        <div className="pk-rr" data-testid="peek-phone">
          <Icon name="phone" />
          <span className={`pk-rv${vm.reach.phone.wrong ? " wrong" : ""}`} data-testid="peek-phone-value">
            {vm.reach.phone.value}
          </span>
          <PkHint
            id={`${vm.id}-phone-note`}
            label={`Phone: ${vm.slots.phone.word}`}
            mark={<LeadSlotShape state={vm.slots.phone.state} />}
            testid="peek-phone-note"
          >
            {vm.reach.phone.tip}
          </PkHint>
          {rowWords(vm.reach.phone.tip, "peek-phone-words")}
          <span className="sp" />
          {vm.reach.phone.wrong ? null : (
            <span className="pk-rr-acts">
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={W.copyPhoneAria}
                data-tip={W.copyPhoneAria}
                data-testid="peek-copy-phone"
                onClick={() => on.onCopyPhone(vm.id)}
              >
                <Icon name="copy" size={13} />
              </button>
            </span>
          )}
        </div>
      ) : null}
      <div className={`pk-rr${vm.reach.email.address ? "" : " none"}`} data-testid="peek-email">
        <Icon name="mail" />
        <span className="pk-rv" title={vm.reach.email.address || undefined} data-testid="peek-email-value">
          {vm.reach.email.value}
        </span>
        <PkHint
          id={`${vm.id}-email-note`}
          label={`Email: ${vm.reach.email.word}`}
          mark={<LeadSlotShape state={vm.slots.mailbox.state} />}
          testid="peek-email-note"
        >
          {vm.reach.email.tip}
        </PkHint>
        {rowWords(vm.reach.email.tip, "peek-email-words")}
        <span className="sp" />
        {vm.reach.email.canDraft ? (
          <span className="pk-rr-acts">
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label={W.copyAria}
              data-tip={W.copyAria}
              data-testid="peek-copy"
              onClick={() => on.onCopy(vm.id)}
            >
              <Icon name="copy" size={13} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label={W.draftAria}
              data-tip={W.draftAria}
              data-testid="peek-draft"
              onClick={() => on.onDraft(vm.id)}
            >
              <Icon name="edit" size={13} />
            </button>
          </span>
        ) : null}
      </div>
      <div className="pk-rr locked" data-testid="peek-locked">
        <Icon name="chat" />
        <span className="pk-rv">{vm.reach.locked.title}</span>
        <PkHint id={`${vm.id}-locked-note`} label={vm.reach.locked.title} testid="peek-locked-line">
          {vm.reach.locked.line}
        </PkHint>
        {rowWords(vm.reach.locked.line, "peek-locked-words")}
      </div>
    </div>
  );
}

/** The other addresses on their site, folded behind one line. */
function peekOthers(vm: LeadPeekVM) {
  return vm.others ? (
    <details className="pk-box pk-alt" data-testid="peek-others">
      <summary className="pk-box-head" data-testid="peek-others-summary">
        <span className="pk-box-line">
          <Icon name="mail" size={12} />
          <span className="pk-box-sum">{vm.others.summary}</span>
          <Icon name="chevron-down" size={12} />
        </span>
      </summary>
      <ul>
        {vm.others.items.map((o) => (
          <li key={o.email}>{`${o.email} — ${o.why}`}</li>
        ))}
      </ul>
      {vm.others.picked ? (
        <p className="pk-alt-why" data-testid="peek-others-why">
          {vm.others.picked}
        </p>
      ) : null}
    </details>
  ) : null;
}

/** How it was found folds the same way: one line says it, and the three steps are behind it. */
function peekFound(vm: LeadPeekVM) {
  return (
    <details className="pk-box" data-testid="peek-found" open={lookNow() === "glass" || undefined}>
      {eyebrow(W.fromListing)}
      <summary className="pk-box-head" data-testid="peek-found-summary">
        <span className="pk-box-line">
          <Icon name="clock" size={12} />
          <span className="pk-box-sum">{vm.foundSummary}</span>
          <Icon name="chevron-down" size={12} />
        </span>
      </summary>
      <ol className="pk-steps">
        {vm.found.map((f) => (
          <li key={f.what} className="pk-step" title={f.at}>
            {f.what}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** The week folds like everything else (D7), in its short hours (D8). */
function peekWeek(vm: LeadPeekVM) {
  return vm.weekSummary ? (
    <details className="pk-box" data-testid="peek-week" open={lookNow() === "glass" || undefined}>
      <summary className="pk-box-head" data-testid="peek-week-summary">
        <span className="pk-box-line">
          <Icon name="calendar" size={12} />
          <span className="pk-box-sum">{vm.weekSummary}</span>
          <Icon name="chevron-down" size={12} />
        </span>
      </summary>
      <div className="pk-week">
        {vm.week.map((d) => (
          <div key={d.day} className={`pk-day${d.today ? " today" : ""}`} data-testid="peek-day">
            <span className="d">{d.day.slice(0, 3)}</span>
            <span className="pk-day-track">
              {d.bar ? <span className="pk-day-bar" style={{ left: `${d.bar.x}%`, width: `${d.bar.w}%` }} /> : null}
            </span>
            <span className="h">{d.short}</span>
          </div>
        ))}
      </div>
    </details>
  ) : null;
}

/** The links the listing gave: the site (or that it has none), Instagram, and the rest as quiet buttons. */
const OTHER_LINKS = [
  ["facebook", "globe"],
  ["linkedin", "globe"],
  ["tiktok", "globe"],
  ["maps", "pin"],
] as const;
function peekLinks(vm: LeadPeekVM) {
  return (
    <div className="pk-links" data-testid="peek-links">
      {vm.links.website ? (
        <a
          className="btn btn-ghost btn-sm"
          href={vm.links.website.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="peek-website"
        >
          <Icon name="external" size={12} />
          {vm.links.website.label}
        </a>
      ) : (
        <span className="pk-rn" data-testid="peek-no-website">
          {W.noWebsite}
        </span>
      )}
      {vm.links.instagram ? (
        <a
          className="btn btn-ghost btn-sm"
          href={vm.links.instagram.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="peek-instagram"
        >
          <Icon name="instagram" size={12} />
          {W.instagram}
        </a>
      ) : null}
      {/* The address above is already the link to the map: on a phone this one is not drawn again (leads.css). */}
      {OTHER_LINKS.map(([k, icon]) => {
        const link = vm.links[k];
        return link ? (
          <a
            key={k}
            className="btn btn-ghost btn-sm"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`peek-${k}`}
            data-said={k === "maps" && vm.where && vm.where.href ? "address" : undefined}
          >
            <Icon name={icon} size={12} />
            {link.label}
          </a>
        ) : null;
      })}
    </div>
  );
}

/**
 * The act never scrolls away (D5): Call when there is a number, else the draft. Copy is the email row's (D8). Call asks
 * how, as it does on the lead's row (LeadCallMenu): from your phone, copy the number, or log a call you already made --
 * the button says the number, so the menu does not say it again.
 */
function peekFoot(vm: LeadPeekVM, on: PeekActs) {
  const LeadCallMenu = leadCallMenuPart();
  return (
    <div className="pk-foot pk-act" data-testid="peek-act">
      {vm.reach.phone && vm.reach.phone.tel ? (
        <LeadCallMenu
          name={vm.name}
          number={vm.reach.phone.value}
          onDial={() => on.onCall(vm.id)}
          onCopy={() => on.onCopyPhone(vm.id)}
          onLog={() => on.onLogCall(vm.id)}
          btnClass="btn btn-primary pk-act-main"
          label={
            <>
              <Icon name="phone" size={13} />
              {`${W.call} ${vm.reach.phone.value}`}
            </>
          }
          heading={false}
          size={13}
          testid="peek-act-call"
        />
      ) : vm.reach.email.canDraft ? (
        <button
          type="button"
          className="btn btn-primary pk-act-main"
          data-testid="peek-act-draft"
          onClick={() => on.onDraft(vm.id)}
        >
          <Icon name="edit" size={13} />
          {W.draft}
        </button>
      ) : (
        <span className="pk-rn pk-act-none" data-testid="peek-act-none">
          Nothing to press yet: no number and no address.
        </span>
      )}
    </div>
  );
}

export const LeadPeekInfo = (p: InfoProps) => {
  const { vm, armed, busy, on, deck } = p;
  return (
    <>
      {peekTop(p)}
      <LeadPeekAsk vm={vm} mode={p.mode} busy={busy} on={on} />
      <div className="pk-body" data-testid="peek-body" onScroll={pkScrolling}>
        {armed && armed.asked && armed.kind === "sent" ? <LeadSentAsk busy={busy} on={on} /> : null}
        {armed && armed.asked && armed.kind === "call" ? (
          <LeadCallAsk armed={armed} busy={busy} on={on} deck={deck} />
        ) : null}
        {peekVerdict(vm)}
        {on.reachOut}
        {peekDecide(vm, on)}
        {peekReach(vm, on)}
        {peekOthers(vm)}
        {peekFound(vm)}
        {peekWeek(vm)}
        {peekLinks(vm)}
      </div>
      {peekFoot(vm, on)}
    </>
  );
};

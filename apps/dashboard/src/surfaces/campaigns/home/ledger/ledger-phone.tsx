/**
 * Campaigns on a phone (≤900px; spec 2026-10-09 §4.4; decision 16): one list on the journey's line. The Moments head says
 * one meta line (how many moments are on, who can hear you) and the channels' standing only where one is closed; past
 * seven rows a sticky strip of chips (All, Needs you, each moment, Lists, Reach-outs, each above zero) and a search circle;
 * then the groups, each moment's head its node on the line (glyph ring, caps, figure, state; an empty one's Turn on), its
 * rows under it, and Lists & offers, Reach-outs and one-offs off the line after them. A row is the kit's ListRow wearing
 * its kind as a mark (never a face: a face is someone), its name the door to its drawer, its state a pill in the phone's
 * words, its moment, next run and people in one line (contracts ledgerPhoneLine), its channels and what came back. What
 * a row decides stands under it at its whole width: Approve and Skip, Resume's question (its press at the row's end), a
 * chain's door to its run. One choice at a time (a moment, or a status), the order Next, and no page swipe: the strip
 * scrolls across under a thumb and walks no view. Every word is the view model's.
 */
import { useState } from "react";
import type { ReactNode, RefObject } from "react";
import { LIFECYCLE_WORDS, ledgerPhoneLine } from "@chanlytics/contracts";
import type {
  LifecycleGroup,
  LifecycleHome,
  LifecycleLedger,
  LifecycleRow,
  LifecycleStage,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { EmptyState } from "../../../kit/empty/empty";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ListRow } from "../../../kit/list-row/list-row";
import { useSwapMotion } from "../../../kit/motion/use-swap-motion";
import { Panel } from "../../../kit/panel/panel";
import { StatePill } from "../../../kit/pill/state-pill";
import { SubTabs } from "../../../kit/sub-tabs/sub-tabs";
import type { SubTab } from "../../../kit/sub-tabs/sub-tabs";
import { editorBox, focusAsDrawn, routeDoor } from "../../../legacy-verbs";
import { ChannelMarks, ChannelsLine } from "../../parts/channels-line";
import { CmDot, cmRowPress } from "../../parts/head";
import { HomeFailed } from "../failed";
import { firstDayStage, nodeGlyph } from "../rail";
import { TileRead } from "../tiles";
import { AddAct, ResumePress, ResumeQuestion, WaitingActs, useResumeAsk } from "./ledger-acts";
import type { LedgerActs } from "./ledger-acts";
import type { RowMark } from "./ledger-keys";
import { RowName, resultsWords, rowOpens } from "./ledger-row";
import { SentOnce, ToolSay } from "./ledger-tools";
import type { LedgerView } from "./use-ledger-view";

/** What the phone reads of the home. */
type PhoneHome = Pick<LifecycleHome, "rail" | "reach" | "head" | "failed" | "ledger">;

/** One meta line under Moments: how many are on and who can hear you; the channels' standing only where one is closed. */
function PhoneMeta({ home }: { home: PhoneHome }) {
  const phone = home.reach.phone;
  const on = home.rail.phoneWords;
  const closed = (home.head.channels ?? []).some((c) => !c.open);
  return (
    <div className="cmh-meta" role="group" aria-label={LIFECYCLE_WORDS.reach.title} data-testid="cmh-reach">
      <TileRead read={home.reach.read} failed={home.failed.reach} testid="cmh-reach" />
      <p className="cmh-meta-line">
        {on ? <span>{on}</span> : null}
        {on && phone ? <CmDot /> : null}
        {phone ? <span>{phone.words}</span> : null}
        {phone ? <StatePill kind="tone" value={phone.offers.tone} label={phone.offers.words} /> : null}
      </p>
      {phone?.yes ? (
        <LinkButton className="cmh-meta-yes" {...routeDoor(phone.yes.route)} data-testid="cmh-phone-yes">
          {phone.yes.label}
        </LinkButton>
      ) : null}
      {closed ? <ChannelsLine parts={home.head.channels} testid="cmh-channels" /> : null}
    </div>
  );
}

/**
 * The chips: All, Needs you where something waits (its figure the one a phone keeps), and each group with rows but the
 * one-offs, a chip only above zero. A group's chip carries no figure: the strip's quiet figures keep the warn one alone,
 * and First contact's rows are no campaigns to count.
 */
function chipsOf(ledger: LifecycleLedger): SubTab[] {
  const W = ledger.words;
  return [
    { id: "all", label: W.tabs.all, testid: "cmh-chip-all" },
    ...(ledger.counts.needs > 0
      ? [
          {
            id: "needs",
            label: W.tabs.needs,
            count: ledger.counts.needs,
            tone: "warn" as const,
            hint: W.needsOf(ledger.counts.needs),
            testid: "cmh-chip-needs",
          },
        ]
      : []),
    ...ledger.groups
      .filter((g) => g.id !== "sent_once" && g.rows.length > 0)
      .map((g): SubTab => ({ id: `in:${g.id}`, label: g.caps, testid: `cmh-chip-${g.id}` })),
  ];
}

interface StripProps {
  ledger: LifecycleLedger;
  view: LedgerView;
  searchRef: RefObject<HTMLInputElement | null>;
}

/**
 * Past seven rows: the strip of chips, one choice (a group writes the address and lets go of the status), and the circle
 * that reveals the search. It scrolls across under a thumb, so it takes its own touch: no swipe starts on it.
 */
function PhoneStrip({ ledger, view, searchRef }: StripProps) {
  const [finding, setFinding] = useState(view.query !== "");
  const W = ledger.words;
  const value = view.group !== null ? `in:${view.group}` : view.status === "needs" ? "needs" : "all";
  const pick = (id: string) => {
    if (id.startsWith("in:")) view.setGroup(id.slice("in:".length));
    else if (id === "needs") view.setStatus("needs");
    else view.clearAll();
  };
  return (
    <div className="cmh-phone-strip" data-own-drag data-testid="cmh-phone-strip">
      {/* The kit's chips stand unclipped under 900px, where the frame's strip scrolls them: here this box does. */}
      <div className="cmh-phone-scroll" data-testid="cmh-phone-scroll">
        <SubTabs label={W.strip} value={value} tabs={chipsOf(ledger)} onSelect={pick} quietCounts dense />
      </div>
      {finding ? (
        // A search its button revealed: ready to type under a mouse and keys, waiting for a tap on a touch screen
        // (legacy-verbs focusAsDrawn; Ruben, 8 and 9 Oct 2026), where its box holds the focus the circle had.
        <span className="cmh-phone-find" {...editorBox}>
          <Field
            type="search"
            aria-label={W.search(ledger.counts.all)}
            placeholder={W.search(ledger.counts.all)}
            value={view.query}
            onValueChange={view.setQuery}
            ref={searchRef}
            // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the search opens on a press that asked for it; not on a touch screen
            autoFocus={focusAsDrawn()}
            data-testid="cmh-ledger-search"
          />
        </span>
      ) : (
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={W.find}
          onClick={() => setFinding(true)}
          data-testid="cmh-phone-find"
        >
          <Icon name="search" size={14} />
        </Button>
      )}
    </div>
  );
}

interface HeadProps {
  g: LifecycleGroup;
  stage: LifecycleStage | null;
  acts: LedgerActs;
  W: LifecycleLedger["words"];
}

/** A group's head: a moment's node on the line (its glyph or clock or check, caps, figure, state, or Turn on), or a group off the line. */
function PhoneHead({ g, stage, acts, W }: HeadProps) {
  const turnOn = g.add && g.rows.length === 0 ? g.add : null;
  return (
    <div
      className="cmh-spine-head"
      data-group={g.id}
      data-stage={stage ? stage.id : undefined}
      data-state={stage ? stage.state : undefined}
      data-hint={stage?.hint ? "true" : undefined}
      data-waits={stage?.waits ? "true" : undefined}
      data-testid="cmh-group-head"
    >
      <span className="cmh-node" aria-hidden="true">
        <Icon name={stage ? nodeGlyph(stage) : g.glyph} size={13} />
      </span>
      <span className="cmh-group-caps">{g.caps}</span>
      {stage ? (
        <span className="cmh-figure tabular" data-testid="cmh-people">
          {stage.people === null ? W.dash : stage.people}
        </span>
      ) : (
        <span className="cmh-dim">{g.meta}</span>
      )}
      {turnOn ? (
        <AddAct act={turnOn} acts={acts} testid="cmh-turn-on" />
      ) : stage ? (
        <StatePill kind="tone" value={stage.tone} label={stage.phoneWords} />
      ) : (
        <span />
      )}
    </div>
  );
}

interface PhoneRowProps {
  r: LifecycleRow;
  g: LifecycleGroup;
  W: LifecycleLedger["words"];
  acts: LedgerActs;
  mark: "settled" | "arrived" | null;
}

/**
 * One row: the kit's ListRow wearing its group's glyph as a mark, the whole row its press, its state once (its pill, in
 * the phone's words, or Resume where it is paused), its one line (contracts ledgerPhoneLine), and what it decides under
 * it at its whole width. A row with nothing to say in the phone's words (the call's text while its templates are unread
 * or failed) wears no pill, never an empty one.
 */
function PhoneRow({ r, g, W, acts, mark }: PhoneRowProps) {
  const resume = r.act && r.act.kind === "resume" ? r.act : null;
  const door = r.act && r.act.kind === "route" ? r.act : null;
  const ask = useResumeAsk();
  return (
    <div
      className="cmh-phone-row"
      data-row={r.id}
      data-kind={r.kind}
      data-state={r.status}
      data-opens={rowOpens(r, acts) ? "true" : undefined}
      data-settled={mark === "settled" ? "true" : undefined}
      data-arrived={mark === "arrived" ? "true" : undefined}
      data-testid="cmh-row"
    >
      <ListRow
        mark={<Icon name={g.glyph} size={13} />}
        name={<RowName r={r} acts={acts} />}
        end={(place) =>
          resume ? (
            <ResumePress act={resume} ask={ask} gated={acts.gated} className={`${place} cmh-row-resume`} />
          ) : r.phoneWords ? (
            <StatePill kind="tone" value={r.tone} label={r.phoneWords} className={place} />
          ) : null
        }
        said={ledgerPhoneLine(r, g.caps)}
        facts={[<ChannelMarks key="by" marks={r.channels} />, resultsWords(r, W).words]}
        className="cmh-phone-line"
        role="presentation"
        onClick={cmRowPress}
      />
      {r.waiting ? (
        <WaitingActs r={r} w={r.waiting} approve={W.approve(r.waiting.people)} approval={acts.approval} />
      ) : null}
      {resume ? <ResumeQuestion act={resume} ask={ask} onAct={acts.onAct} className="cmh-row-ask" /> : null}
      {door ? (
        <div className="cmh-row-door">
          <AddAct act={door} acts={acts} testid="cmh-row-run" />
        </div>
      ) : null}
    </div>
  );
}

/** A moment the line runs solid through: always on (the receptionist) or on. */
const isOn = (s: LifecycleStage | null): boolean => !!s && (s.state === "always" || s.state === "on");

interface LedgerPhoneProps {
  home: PhoneHome;
  view: LedgerView;
  acts: LedgerActs;
  mark: RowMark;
  searchRef: RefObject<HTMLInputElement | null>;
  /**
   * The first day's door (home-page.tsx), a slot drawn under the hinted moment's Turn on at the list's width, where
   * there is no rail; the list never imports Ask.
   */
  firstDayDoor?: ReactNode;
}

/** The phone's list: the Moments head and its meta line, the strip past seven rows, the groups on the journey's line. */
export function LedgerPhone({ home, view, acts, mark, searchRef, firstDayDoor = null }: LedgerPhoneProps) {
  const ledger = home.ledger;
  const W = ledger.words;
  const doorAt = firstDayDoor ? firstDayStage(home.rail.stages) : null;
  const list = useSwapMotion<HTMLDivElement>(`${view.status}|${view.group ?? ""}`, ".cmh-group");
  const stageOf = (id: string) => home.rail.stages.find((s) => s.id === id) ?? null;
  const markOf = (id: string) => (mark && mark.id === id ? mark.kind : null);
  const chainsAlone =
    !view.filtered && !view.visibleGroups.some((g) => g.id === "reach_out") ? home.failed.chains : null;
  return (
    <Panel
      as="section"
      size="flush"
      className="cmh-block cmh-spine-block"
      aria-label={home.rail.title}
      data-testid="cmh-rail"
    >
      <header className="cmh-block-head">
        <h2 className="cmh-h">{LIFECYCLE_WORDS.phone.moments}</h2>
      </header>
      <PhoneMeta home={home} />
      {home.failed.counts ? <HomeFailed failed={home.failed.counts} testid="pb-counts-failed" /> : null}
      {ledger.tools ? <PhoneStrip ledger={ledger} view={view} searchRef={searchRef} /> : null}
      {/* Under seven rows no strip says what narrows the list: a group the address names (a card's door, the bell's
          reach-out day) is said as the desk says it, with how many and its Clear. */}
      {!ledger.tools && view.chosen ? (
        <div className="cmh-phone-say">
          <ToolSay view={view} W={W} />
        </div>
      ) : null}
      <div
        ref={list}
        className="cmh-spine"
        aria-label={W.label}
        data-tools={ledger.tools ? "true" : undefined}
        data-testid="cmh-ledger"
      >
        {view.rows.length === 0 && view.filtered ? (
          <EmptyState
            kind="line"
            title={W.empty}
            action={{ label: W.clear, onClick: view.clearAll }}
            testid="cmh-ledger-none"
          />
        ) : null}
        {view.visibleGroups.map((g) => (
          <section
            key={g.id}
            className="cmh-group"
            data-group={g.id}
            data-line={stageOf(g.id) ? "true" : undefined}
            // The line runs solid through a moment that is on: said here, so no :has() restyles the page (campaigns.css).
            data-on={isOn(stageOf(g.id)) ? "true" : undefined}
            aria-label={g.caps}
            data-testid="cmh-group"
          >
            <PhoneHead g={g} stage={stageOf(g.id)} acts={acts} W={W} />
            {g.id === doorAt ? <div className="cmh-first-ask-row">{firstDayDoor}</div> : null}
            {g.rows.map((r) => (
              <PhoneRow
                key={markOf(r.id) === "arrived" ? `${r.id}:arrived` : r.id}
                r={r}
                g={g}
                W={W}
                acts={acts}
                mark={markOf(r.id)}
              />
            ))}
            {g.id === "first_contact" && home.failed.templates ? (
              <HomeFailed failed={home.failed.templates} testid="cmh-templates-failed" />
            ) : null}
            {g.id === "reach_out" && home.failed.chains ? (
              <HomeFailed failed={home.failed.chains} testid="pb-chains-failed" />
            ) : null}
          </section>
        ))}
        {chainsAlone ? <HomeFailed failed={chainsAlone} testid="pb-chains-failed" /> : null}
        <SentOnce ledger={ledger} acts={acts} />
      </div>
    </Panel>
  );
}

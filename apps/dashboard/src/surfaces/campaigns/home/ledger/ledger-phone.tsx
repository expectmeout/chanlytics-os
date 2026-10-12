/**
 * Campaigns on a phone (≤900px; spec 2026-10-09 §4.4; decision 16): one list on the journey's line. The Moments head says
 * how many moments are on beside its name, who can hear you on one line (its amber "0 to offers" the door to getting that
 * yes), and the channels as a chip each with one Set up; where nothing can send, one card says so in their place; past
 * seven rows a sticky strip of chips (All, Needs you, each moment, Lists, Reach-outs, each above zero) and a search circle;
 * then the groups, each moment's head its node on the line (glyph ring, its name and how many, a state where the node does
 * not say it, and an empty one's Turn on on a line of its own under the name), its rows under it, and Lists & offers,
 * Reach-outs and one-offs off the line after them. A row is the kit's ListRow with nothing in its first column (`bare`:
 * the moment's line beside it says what it is, where the same glyph stood on every row of a moment), its name the door
 * to its drawer, its state a pill in the phone's words, its next run and people in one line (contracts ledgerPhoneLine,
 * without the moment it sits under), its channels and what came back where anything did. What a row decides stands under
 * it at its whole width: Approve and Skip, Resume's question (its press at the row's end), a chain's door to its run.
 * (Ruben, 11 Oct 2026: the list made calmer and more compact.) One choice at a time (a moment, or a status), the order Next, and no page swipe: the strip
 * scrolls across under a thumb and walks no view. Every word is the view model's.
 */
import { useState } from "react";
import type { ReactNode, RefObject } from "react";
import { LIFECYCLE_WORDS, ledgerPhoneLine, ledgerPhoneWhat } from "@chanlytics/contracts";
import type {
  LifecycleAct,
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
import {
  ChannelChips,
  ChannelMarks,
  ChannelsLine,
  channelsDoor,
  channelsNone,
  channelsPaused,
} from "../../parts/channels-line";
import { CmDot, cmRowPress } from "../../parts/head";
import { HomeFailed } from "../failed";
import { nodeGlyph } from "../rail";
import { TileRead } from "../tiles";
import { AddAct, ResumePress, ResumeQuestion, WaitingActs, useResumeAsk } from "./ledger-acts";
import type { LedgerActs } from "./ledger-acts";
import type { RowMark } from "../../parts/ledger-keys";
import { RowName, resultsWords, rowOpens } from "./ledger-row";
import { SentOnce, ToolSay } from "./ledger-tools";
import type { LedgerView } from "./use-ledger-view";

/** What the phone reads of the home. */
type PhoneHome = Pick<LifecycleHome, "rail" | "reach" | "head" | "failed" | "ledger">;

/**
 * Who can hear you, in one line: "All 3 can hear you", and who said yes to offers beside it. Where nobody has, the amber
 * words are themselves the door to how that yes is got (they stood apart as "Get their yes" on a line of their own);
 * nobody in People is no line at all (contracts lifecycleReach).
 */
function PhoneReach({ phone }: { phone: NonNullable<PhoneHome["reach"]["phone"]> }) {
  if (!phone.words) return null;
  const offers = phone.offers;
  const asks = offers && offers.tone === "warn" ? phone.yes : null;
  return (
    <p className="cmh-meta-line">
      <span>{phone.words}</span>
      {offers && asks ? (
        <LinkButton
          className="cmh-offers-door"
          {...routeDoor(asks.route)}
          aria-label={`${offers.words}: ${asks.label}`}
          data-testid="cmh-phone-yes"
        >
          <StatePill kind="tone" value={offers.tone} label={offers.words} />
          <Icon name="chevron" size={11} />
        </LinkButton>
      ) : offers && offers.tone === "warn" ? (
        <StatePill kind="tone" value={offers.tone} label={offers.words} />
      ) : offers ? (
        <>
          <CmDot />
          <span>{offers.words}</span>
        </>
      ) : null}
    </p>
  );
}

/** Nothing can send at all: one card in the reach line's place, with its one door to Settings › Connections. */
function PhoneNone({ door }: { door: string | null }) {
  const W = LIFECYCLE_WORDS.channels.none;
  return (
    <div className="cmh-none" data-testid="cmh-channels-none">
      <p className="cmh-none-title">{W.title}</p>
      <p className="cmh-none-body">{W.body}</p>
      {door ? (
        <Button size="sm" {...routeDoor(door)} data-testid="cmh-channels-none-door">
          {W.act}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The Moments head under its name (Ruben, 11 Oct 2026): who can hear you, then the channels as chips; or, where nothing
 * can send, the one card in their place over the chips. The workspace's pause is its one line, with Billing's door.
 */
function PhoneMeta({ home }: { home: PhoneHome }) {
  const phone = home.reach.phone;
  const parts = home.head.channels ?? null;
  const none = channelsNone(parts);
  return (
    <div className="cmh-meta" role="group" aria-label={LIFECYCLE_WORDS.reach.title} data-testid="cmh-reach">
      <TileRead read={home.reach.read} failed={home.failed.reach} testid="cmh-reach" />
      {none ? <PhoneNone door={channelsDoor(parts)} /> : phone ? <PhoneReach phone={phone} /> : null}
      {channelsPaused(parts) ? (
        <ChannelsLine parts={parts} testid="cmh-channels" />
      ) : (
        <ChannelChips parts={parts} testid="cmh-channels" withDoor={!none} />
      )}
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

/**
 * A group's head: a moment's node on the line (its glyph or clock or check), its name and how many, and its state where
 * the node does not say it; or a group off the line, its name and its meta. A label, never a press: everything pressed
 * on the list is a row (Ruben, 11 Oct 2026: the heads, a Turn on under one and a door under another, read as a page of
 * different things to press). A moment that is on says so with its node's filled check. Nobody counted is nothing.
 */
function PhoneHead({ g, stage, W }: HeadProps) {
  const figure = stage ? (stage.people === null ? null : stage.people) : null;
  // A group off the line says how its campaigns stand, and "No campaign yet" only where it holds no row and offers none.
  const meta = !stage && g.meta && !(g.meta === W.none && (g.rows.length > 0 || g.add)) ? g.meta : null;
  const offered = g.rows.length === 0 && !!g.add;
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
      <span className="cmh-spine-title">
        <span className="cmh-group-caps">{g.caps}</span>
        {figure !== null ? (
          <span className="cmh-figure tabular" data-testid="cmh-people">
            {figure}
          </span>
        ) : meta ? (
          <span className="cmh-dim">{meta}</span>
        ) : null}
      </span>
      {stage && !offered && !isOn(stage) ? <StatePill kind="tone" value={stage.tone} label={stage.phoneWords} /> : null}
    </div>
  );
}

interface OfferedProps {
  g: LifecycleGroup;
  stage: LifecycleStage | null;
  act: LifecycleAct;
  acts: LedgerActs;
}

/**
 * A moment with no campaign yet: the campaign it offers as a row of its own, off, its line what it does ("Win-back · Off ·
 * Brings back people who've gone quiet"), pressed to turn it on (the composer) or, where the moment needs the calendar
 * first, to connect it ("Appointment reminder · Needs your calendar"). A group off the line offers its act by its words
 * ("Find businesses to write to"). Its name is the press the row's own press finds (cmRowPress), as a campaign's is.
 */
function PhoneOffered({ g, stage, act, acts }: OfferedProps) {
  const O = LIFECYCLE_WORDS.offered;
  const needsCalendar = act.kind === "route" && !!stage && act.label === LIFECYCLE_WORDS.needsCalendar.door;
  const name = stage ? stage.name : act.label;
  // What it needs first leads its line, in the amber, where a pill that long cut its name short; "Off" is its pill.
  const state = stage && !needsCalendar ? O.off : null;
  const what = stage ? (O[stage.id] ?? null) : null;
  const door = acts.door(act);
  const press = door ? { ...door } : { onClick: () => acts.onAct(act), ...(act.kind === "turn_on" ? acts.gated : {}) };
  return (
    <div
      className="cmh-phone-row"
      data-row={`offered:${g.id}`}
      data-kind="offered"
      data-opens="true"
      data-testid="cmh-offered"
    >
      <ListRow
        bare
        name={
          <LinkButton {...press} size="inherit" className="cmh-row-name" data-row-open data-testid="cmh-offered-open">
            {name}
          </LinkButton>
        }
        end={(place) => (
          <span className={`${place} cmh-row-end`}>
            {state ? <StatePill kind="tone" value="plain" label={state} /> : null}
            <Icon name="chevron" size={12} />
          </span>
        )}
        said={
          needsCalendar ? (
            <>
              <span className="cmh-offered-needs">{LIFECYCLE_WORDS.needsCalendar.none}</span>
              {what ? ` · ${what}` : null}
            </>
          ) : (
            what
          )
        }
        className="cmh-phone-line"
        role="presentation"
        onClick={cmRowPress}
      />
    </div>
  );
}

interface PhoneRowProps {
  r: LifecycleRow;
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
function PhoneRow({ r, W, acts, mark }: PhoneRowProps) {
  const resume = r.act && r.act.kind === "resume" ? r.act : null;
  const door = r.act && r.act.kind === "route" ? r.act : null;
  // A row that is not a campaign yet (the month's offer, off) turns on where it stands: its name is that press, as a
  // campaign's name is its drawer's, so the row opens something as every row does.
  const turnOn = !r.open && r.act && r.act.kind === "turn_on" ? r.act : null;
  const opens = rowOpens(r, acts) || !!turnOn;
  const ask = useResumeAsk();
  const results = resultsWords(r, W).words;
  return (
    <div
      className="cmh-phone-row"
      data-row={r.id}
      data-kind={r.kind}
      data-state={r.status}
      data-opens={opens ? "true" : undefined}
      data-settled={mark === "settled" ? "true" : undefined}
      data-arrived={mark === "arrived" ? "true" : undefined}
      data-testid="cmh-row"
    >
      <ListRow
        bare
        name={
          turnOn ? (
            <LinkButton
              onClick={() => acts.onAct(turnOn)}
              {...acts.gated}
              size="inherit"
              className="cmh-row-name"
              data-row-open
              data-testid="cmh-row-open"
            >
              {r.name}
            </LinkButton>
          ) : (
            <RowName r={r} acts={acts} plain />
          )
        }
        end={(place) =>
          resume ? (
            <ResumePress act={resume} ask={ask} gated={acts.gated} className={`${place} cmh-row-resume`} />
          ) : (
            // Its state, and the chevron that says the row opens something, as every row on the list does now.
            <span className={`${place} cmh-row-end`}>
              {r.phoneWords ? <StatePill kind="tone" value={r.tone} label={r.phoneWords} /> : null}
              {opens ? <Icon name="chevron" size={12} /> : null}
            </span>
          )
        }
        // What a First contact row does, then its next run and its people; the moment is the head over the row. What came
        // back only where anything did (a dash on every quiet row was a line of nothing).
        said={[ledgerPhoneWhat(r), ledgerPhoneLine(r, "")].filter(Boolean).join(" · ")}
        facts={[<ChannelMarks key="by" marks={r.channels} />, results === W.dash ? null : results]}
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
        {home.rail.phoneWords ? (
          <span className="cmh-dim" data-testid="cmh-on">
            {home.rail.phoneWords}
          </span>
        ) : null}
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
        {/* The first day's door, once, at the list's top: it stood under the moment it hinted, and read as that moment's. */}
        {firstDayDoor && !view.filtered ? <div className="cmh-first-ask-top">{firstDayDoor}</div> : null}
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
            {g.rows.length === 0 && g.add ? <PhoneOffered g={g} stage={stageOf(g.id)} act={g.add} acts={acts} /> : null}
            {g.rows.map((r) => (
              <PhoneRow
                key={markOf(r.id) === "arrived" ? `${r.id}:arrived` : r.id}
                r={r}
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

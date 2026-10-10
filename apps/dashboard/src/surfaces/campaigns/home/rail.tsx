/**
 * Campaigns' home, the rail (canvas A): "Your customer, start to finish", five moments in order with how many people are at
 * each, whether it is covered, and the yes it needs; and under it the ledger, every campaign in one place
 * (ledger/ledger.tsx), which a card's body narrows to its moment. On a phone the same moments are the heads of the one list
 * (ledger/ledger-phone.tsx). Every word and number is the view model's (contracts campaignsHomeOf); this draws it and
 * presses.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { LifecycleAct, LifecycleBar, LifecycleHome, LifecycleStage } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Meter } from "../../kit/meter/meter";
import { Panel } from "../../kit/panel/panel";
import { StatePill } from "../../kit/pill/state-pill";
import type { RouteDoor } from "../../legacy-verbs";
import { ChannelMarks, ChannelsLine } from "../parts/channels-line";
import { HomeFailed } from "./failed";
import { ResumeAct } from "./ledger/ledger-acts";

/** What a press on the rail does: the page decides (home-page.tsx), the rail only says which. */
export interface RailActs {
  onAct: (act: LifecycleAct) => void;
  /** The door a name is where its act opens a page: a moment's drawer, pushed so Back closes it. */
  door: (act: LifecycleAct) => RouteDoor | null;
  /** Whether the role may turn a moment on, resume one or open the composer; the buttons are gated where it may not. */
  gated: Record<string, unknown>;
  /** The group the ledger shows alone (`campaigns/in:<group>`), which a card wears chosen; null for every group. */
  chosen: string | null;
  /** A card's body pressed: narrow the ledger to its moment, or let go of it. */
  onChoose: (group: string | null) => void;
}

/** A state as a pill, in the tone the view model gave it. */
function StateWords({ tone, words, testid }: { tone: "ok" | "warn" | "plain"; words: string; testid?: string }) {
  return <StatePill kind="tone" value={tone} label={words} testid={testid} />;
}

/**
 * A moment's node on the line: a clock while a run of one of its campaigns waits for the owner (the pill beside it says
 * "Waiting on you"), the check once it is covered, else the moment's own glyph. The phone's spine draws it too.
 */
export const nodeGlyph = (s: LifecycleStage) => (s.waits ? "clock" : s.covered ? "check" : s.glyph);

/**
 * A moment's bar, where it holds two or more (lane 2's `LifecycleBar`): on in the ok tone, waiting in the warn, paused in
 * the Meter's rest; never animated (the kit's Meter has no transition). It says to a screen reader what the card's
 * summary says ("3 campaigns · 2 on · 1 paused").
 */
function StageBar({ bar, label }: { bar: LifecycleBar; label: string }) {
  const parts = [
    { share: bar.on, tone: "ok" as const },
    { share: bar.waiting, tone: "warn" as const },
    { share: bar.paused, tone: "rest" as const },
  ];
  return <Meter size="sm" className="cmh-stage-bar" parts={parts} aria-label={label} />;
}

type ResumeOf = Extract<LifecycleAct, { kind: "resume" }>;

/**
 * A paused moment's Resume (spec §4.2): its lead's own row's act in the ledger, asked in the same words (when, to about
 * how many, the mode in full under `auto`). Lane 2's stage keeps its `act` the drawer's door, so the name still opens it.
 */
function leadResume(home: LifecycleHome, s: LifecycleStage): ResumeOf | null {
  if (s.state !== "paused" || !s.playbookId) return null;
  const act = home.ledger.groups.find((g) => g.id === s.id)?.rows.find((r) => r.id === s.playbookId)?.act;
  return act && act.kind === "resume" ? act : null;
}

/** What a moment says under its name: Turn on where it holds nothing, its state, and Resume (asked) where it is paused. */
function momentFoot(s: LifecycleStage, acts: RailActs, resume: ResumeOf | null) {
  const act = s.act;
  if (s.state === "off" && act && act.kind === "turn_on") {
    return (
      <Button
        size="sm"
        variant={s.hint ? "primary" : "secondary"}
        className="cmh-turn-on"
        onClick={() => acts.onAct(act)}
        data-testid="cmh-turn-on"
        {...acts.gated}
      >
        <Icon name="plus" size={12} /> {act.label}
      </Button>
    );
  }
  return (
    <>
      <StateWords tone={s.tone} words={s.stateWords} testid="cmh-state" />
      {resume ? <ResumeAct act={resume} onAct={acts.onAct} gated={acts.gated} testid="cmh-stage-resume" /> : null}
    </>
  );
}

interface StageProps {
  s: LifecycleStage;
  acts: RailActs;
  resume: ResumeOf | null;
  /** What a cell says where nobody counted: the ledger's own word for it, never a dash typed here. */
  dash: string;
}

/**
 * One moment on the desk's rail. Its caps, figure, unit and summary are one press (a quiet button, `aria-pressed`) that
 * narrows the ledger to the moment, and lets go pressed again (decision 12: the body filters, the name opens). The
 * lead's name, the door to its drawer, and Turn on stand beside it, never inside it: a button holds no button.
 */
function Stage({ s, acts, resume, dash }: StageProps) {
  const chosen = acts.chosen === s.id;
  // The name is a door where the moment's act opens something: its lead's drawer, or, for a moment of the appointment
  // with no calendar ("Needs your calendar", decision 44), the calendar's setting.
  const door = s.act && (s.act.kind === "open" || s.act.kind === "route") ? acts.door(s.act) : null;
  return (
    <li
      className="cmh-stage"
      data-stage={s.id}
      data-state={s.state}
      data-hint={s.hint ? "true" : undefined}
      data-waits={s.waits ? "true" : undefined}
      data-chosen={chosen ? "true" : undefined}
      data-testid="cmh-stage"
    >
      <Button
        variant="quiet"
        size="text"
        className="cmh-stage-press"
        aria-pressed={chosen}
        onClick={() => acts.onChoose(chosen ? null : s.id)}
        data-testid="cmh-stage-press"
      >
        <span className="cmh-caps">{s.caps}</span>
        <span className="cmh-figure tabular" data-testid="cmh-people">
          {s.people === null ? dash : s.people}
        </span>
        <span className="cmh-unit">{s.unit}</span>
        {/* The summary where the moment holds two or more ("3 campaigns · 2 on · 1 paused"); one campaign's summary is
            its name and clock, which its name's door and its state say beside the toggle already. */}
        {s.bar && s.summary ? <span className="cmh-summary">{s.summary}</span> : null}
      </Button>
      <span className="cmh-track" aria-hidden="true">
        <span className="cmh-node">
          <Icon name={nodeGlyph(s)} size={14} />
        </span>
      </span>
      <div className="cmh-moment" data-state={s.state}>
        {door ? (
          <LinkButton {...door} className="cmh-moment-name" data-row-open data-testid="cmh-open">
            {s.name}
          </LinkButton>
        ) : (
          <span className="cmh-moment-name">{s.name}</span>
        )}
        {momentFoot(s, acts, resume)}
        {s.bar ? <StageBar bar={s.bar} label={s.summary ?? s.stateWords} /> : null}
        <ChannelMarks marks={s.channels} testid="cmh-chans" />
        <span className="cmh-needs" data-needs={s.needs}>
          <Icon name="shield" size={12} />
          {s.needsWords}
        </span>
      </div>
    </li>
  );
}

/**
 * Whether the line of moments is wider than its pane, as the browser lays it out: only then do its edges fade (J3), so
 * a rail that fits draws its first and last card whole. Measured as the pane resizes, and again when the number of
 * moments changes (the line is drawn once they are read); nothing where nothing measures.
 */
function useOverflows<T extends HTMLElement>(count: number): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const look = () => setOver(el.scrollWidth > el.clientWidth + 1);
    const watch = new ResizeObserver(look);
    watch.observe(el);
    return () => watch.disconnect();
  }, [count]);
  return [ref, over];
}

/**
 * The desk's rail, and the ledger under it in the same pane (`children`, home-page.tsx). Under 1100px of page it keeps
 * one line and scrolls across (J3, campaigns.css), its edges fading while it is wider than the pane.
 */
export function Rail({ home, acts, children }: { home: LifecycleHome; acts: RailActs; children?: ReactNode }) {
  const { rail } = home;
  const [line, overflows] = useOverflows<HTMLOListElement>(rail.stages.length);
  if (rail.stages.length === 0 && !children) return null;
  return (
    <Panel
      as="section"
      size="flush"
      className="cmh-block cmh-rail-block"
      aria-label={rail.title}
      data-testid="cmh-rail"
    >
      <header className="cmh-block-head">
        <h2 className="cmh-h">{rail.title}</h2>
        {rail.coveredWords ? <span className="cmh-dim">{rail.coveredWords}</span> : null}
        {/* Where the workspace stands on its channels, at the rail's right on a desk: the frame keeps the head's own line
            for a screen reader (a tab's list opens on its acts alone), so the page says it where the eye is. */}
        <ChannelsLine parts={home.head.channels} testid="cmh-channels-rail" />
      </header>
      {home.failed.counts ? <HomeFailed failed={home.failed.counts} testid="pb-counts-failed" /> : null}
      {rail.stages.length > 0 ? (
        // Under 1100px of page the line scrolls across under a thumb, so it takes its own touch: no swipe starts on it.
        <ol
          ref={line}
          className="cmh-rail"
          data-n={rail.stages.length}
          data-overflows={overflows ? "true" : undefined}
          data-own-drag
        >
          {rail.stages.map((s) => (
            <Stage key={s.id} s={s} acts={acts} resume={leadResume(home, s)} dash={home.ledger.words.dash} />
          ))}
        </ol>
      ) : null}
      {children}
    </Panel>
  );
}

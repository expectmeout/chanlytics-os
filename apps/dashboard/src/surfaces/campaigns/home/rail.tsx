/**
 * Campaigns' home, the rail (canvas A): "Your customer, start to finish", five moments in order with how many people are at
 * each, whether it is covered, and the yes it needs; and under it one quiet line for every other playbook or campaign. On a
 * phone the same moments stand one under another on a line down the left (A4). Every word and number is the view model's
 * (contracts campaignsHomeOf); this draws it and presses.
 */
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type {
  LifecycleAct,
  LifecycleFailed,
  LifecycleHome,
  LifecycleStage,
  LifecycleStrip,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Panel } from "../../kit/panel/panel";
import { StatePill } from "../../kit/pill/state-pill";
import { ChannelMarks, ChannelsLine } from "../parts/channels-line";
import { cmRowPress } from "../parts/head";
import { HomeFailed } from "./failed";
import { PhoneReachLine } from "./tiles";

/** What a press on a stage, a line or a button does: the page decides (home-page.tsx), the rail only says which. */
export interface RailActs {
  onAct: (act: LifecycleAct) => void;
  /** Whether the role may turn a moment on, resume one or open the composer; the buttons are gated where it may not. */
  gated: Record<string, unknown>;
}

/** A state as a pill, in the tone the view model gave it. */
function StateWords({ tone, words, testid }: { tone: "ok" | "warn" | "plain"; words: string; testid?: string }) {
  return <StatePill kind="tone" value={tone} label={words} testid={testid} />;
}

/**
 * A moment's node on the line: a clock while a run of its playbook waits for the owner (it is on, and it waits: the
 * pill beside it says "Waiting on you"), the check once it is covered, else the moment's own glyph.
 */
const nodeGlyph = (s: LifecycleStage) => (s.waits ? "clock" : s.covered ? "check" : s.glyph);

/** What a moment says under its name: its state, or the Turn on that makes it one. */
function momentFoot(s: LifecycleStage, { onAct, gated }: RailActs) {
  const act = s.act;
  if (s.state === "off" && act && act.kind === "turn_on") {
    return (
      <Button
        size="sm"
        variant={s.hint ? "primary" : "secondary"}
        className="cmh-turn-on"
        onClick={() => onAct(act)}
        data-testid="cmh-turn-on"
        {...gated}
      >
        <Icon name="plus" size={12} /> {act.label}
      </Button>
    );
  }
  return <StateWords tone={s.tone} words={s.stateWords} testid="cmh-state" />;
}

/** One moment on the desk's rail: its people, its node on the line, and its card. */
function Stage({ s, acts }: { s: LifecycleStage; acts: RailActs }) {
  const open = s.act && s.act.kind === "open" ? s.act : null;
  return (
    <li
      className="cmh-stage"
      data-stage={s.id}
      data-state={s.state}
      data-hint={s.hint ? "true" : undefined}
      data-waits={s.waits ? "true" : undefined}
      data-testid="cmh-stage"
    >
      <span className="cmh-caps">{s.caps}</span>
      <span className="cmh-figure tabular" data-testid="cmh-people">
        {s.people === null ? "—" : s.people}
      </span>
      <span className="cmh-unit">{s.unit}</span>
      <span className="cmh-track" aria-hidden="true">
        <span className="cmh-node">
          <Icon name={nodeGlyph(s)} size={14} />
        </span>
      </span>
      <div className="cmh-moment" data-state={s.state} role="presentation" onClick={open ? cmRowPress : undefined}>
        {open ? (
          <LinkButton className="cmh-moment-name" onClick={() => acts.onAct(open)} data-row-open data-testid="cmh-open">
            {s.name}
          </LinkButton>
        ) : (
          <span className="cmh-moment-name">{s.name}</span>
        )}
        {momentFoot(s, acts)}
        <ChannelMarks marks={s.channels} testid="cmh-chans" />
        <span className="cmh-needs" data-needs={s.needs}>
          <Icon name="shield" size={12} />
          {s.needsWords}
        </span>
      </div>
    </li>
  );
}

/** One line under the rail: what it is, its state, and the one act at its right. */
function StripLine({ l, acts }: { l: LifecycleStrip; acts: RailActs }) {
  const act = l.act;
  const resumes = act.kind === "resume" || act.kind === "turn_on";
  return (
    <li className="cmh-strip" data-kind={l.kind} data-testid="cmh-strip" data-strip={l.id}>
      <Icon name={l.glyph} size={16} />
      <span className="cmh-strip-words">
        <LinkButton onClick={() => acts.onAct(l.open)} className="cmh-strip-name" data-testid="cmh-strip-open">
          {l.name}
        </LinkButton>
        <span className="cmh-dim cmh-strip-more">{l.words}</span>
        <ChannelMarks marks={l.channels} testid="cmh-strip-chans" />
      </span>
      {l.stateWords ? <StateWords tone={l.tone} words={l.stateWords} /> : null}
      <Button size="sm" onClick={() => acts.onAct(act)} data-testid="cmh-strip-act" {...(resumes ? acts.gated : {})}>
        {act.kind === "resume" ? <Icon name="play" size={12} /> : null}
        {act.label}
      </Button>
    </li>
  );
}

/**
 * The lines under the rail, each its own. A read that failed is said where its data would be: the templates' in the call's
 * text's place, the reach-outs' where their chains would follow.
 */
function StripLines({
  strips,
  failed,
  acts,
}: {
  strips: readonly LifecycleStrip[];
  failed: LifecycleFailed;
  acts: RailActs;
}) {
  return (
    <>
      {strips.map((l) =>
        l.kind === "call_text" && failed.templates ? (
          <li key={l.id} className="cmh-strip-failed">
            <HomeFailed failed={failed.templates} testid="cmh-templates-failed" />
          </li>
        ) : (
          <StripLine key={l.id} l={l} acts={acts} />
        ),
      )}
      {failed.chains ? (
        <li className="cmh-strip-failed">
          <HomeFailed failed={failed.chains} testid="pb-chains-failed" />
        </li>
      ) : null}
    </>
  );
}

/** The desk's rail and the lines under it. */
export function Rail({ home, acts }: { home: LifecycleHome; acts: RailActs }) {
  const { rail, strips } = home;
  if (rail.stages.length === 0) return null;
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
      <ol className="cmh-rail" data-n={rail.stages.length}>
        {rail.stages.map((s) => (
          <Stage key={s.id} s={s} acts={acts} />
        ))}
      </ol>
      {strips.length > 0 ? (
        <ul className="cmh-strips" aria-label={LIFECYCLE_WORDS.alsoRunning}>
          <StripLines strips={strips} failed={home.failed} acts={acts} />
        </ul>
      ) : null}
    </Panel>
  );
}

/** One moment on the phone's rail: a node on the line, its name and what it stands at, and its state or Turn on. */
function PhoneStage({ s, acts }: { s: LifecycleStage; acts: RailActs }) {
  const act = s.act;
  const turnOn = s.state === "off" && act && act.kind === "turn_on" ? act : null;
  const open = act && act.kind === "open" ? act : null;
  return (
    <li
      className="cmh-vstage"
      data-stage={s.id}
      data-state={s.state}
      data-hint={s.hint ? "true" : undefined}
      data-waits={s.waits ? "true" : undefined}
      data-testid="cmh-stage"
    >
      <span className="cmh-node" aria-hidden="true">
        <Icon name={nodeGlyph(s)} size={13} />
      </span>
      <span className="cmh-vwords">
        {open ? (
          <LinkButton className="cmh-moment-name" onClick={() => acts.onAct(open)} data-testid="cmh-open">
            {s.name}
          </LinkButton>
        ) : (
          <span className="cmh-moment-name">{s.name}</span>
        )}
        <span className="cmh-dim">
          {s.caps} · <span className="tabular">{s.people === null ? "—" : s.people}</span> {s.unit}
          <ChannelMarks marks={s.channels} testid="cmh-chans" />
        </span>
      </span>
      {turnOn ? (
        <Button
          size="sm"
          variant={s.hint ? "primary" : "secondary"}
          onClick={() => acts.onAct(turnOn)}
          data-testid="cmh-turn-on"
          {...acts.gated}
        >
          {s.hint ? <Icon name="plus" size={12} /> : null} {LIFECYCLE_WORDS.phone.turnOn}
        </Button>
      ) : (
        <StateWords tone={s.tone} words={s.phoneWords} />
      )}
    </li>
  );
}

/** The phone's rail: the moments down a line, and under it the other lines as one list ("Also"). */
export function PhoneRail({ home, acts }: { home: LifecycleHome; acts: RailActs }) {
  const { rail, strips } = home;
  if (rail.stages.length === 0) return null;
  return (
    <>
      <Panel
        as="section"
        size="flush"
        className="cmh-block cmh-vrail-block"
        aria-label={rail.title}
        data-testid="cmh-rail"
      >
        <header className="cmh-block-head">
          <h2 className="cmh-h">{LIFECYCLE_WORDS.phone.moments}</h2>
          {rail.phoneWords ? <span className="cmh-dim">{rail.phoneWords}</span> : null}
        </header>
        {/* Who can hear you, and where the workspace stands on its channels: a line in the head (8 Oct 2026), so the
            moments are the first thing on the page. It was a tile of its own over them. */}
        <PhoneReachLine tile={home.reach} failed={home.failed.reach} channels={home.head.channels} />
        {home.failed.counts ? <HomeFailed failed={home.failed.counts} testid="pb-counts-failed" /> : null}
        <ol className="cmh-vrail">
          {rail.stages.map((s) => (
            <PhoneStage key={s.id} s={s} acts={acts} />
          ))}
        </ol>
      </Panel>
      {strips.length > 0 ? (
        <Panel
          as="section"
          size="flush"
          className="cmh-block cmh-also-block"
          aria-label={LIFECYCLE_WORDS.phone.also}
          data-testid="cmh-also"
        >
          <ul className="cmh-strips">
            <StripLines strips={strips} failed={home.failed} acts={acts} />
          </ul>
        </Panel>
      ) : null}
    </>
  );
}

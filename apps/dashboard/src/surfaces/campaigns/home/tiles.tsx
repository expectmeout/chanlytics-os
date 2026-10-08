/**
 * Campaigns' home, the three tiles under the rail (canvas A): who can hear you, what is coming in the next seven days, and what
 * came back. Each draws its part of the view model (contracts campaignsHomeOf) and nothing it was not told: a tile whose read
 * is still out says it is reading (after the standard beat), one whose read failed is the kit's failed read with its Retry, a
 * number that could not be counted is not drawn, and a zero is a zero. The phone draws the first as one short tile (A4) and
 * the other two the same as the desk.
 */
import { useEffect, useRef } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type {
  ChannelStandingPart,
  LifecycleComing,
  LifecycleComingTile,
  LifecycleFailed,
  LifecycleFailedRead,
  LifecycleReachTile,
  LifecycleResultsTile,
  LifecycleRung,
  LifecycleTileRead,
} from "@chanlytics/contracts";
import { routeDoor } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { Meter } from "../../kit/meter/meter";
import { Panel } from "../../kit/panel/panel";
import { cmChannelColour } from "../parts/channels";
import { ChannelsLine } from "../parts/channels-line";
import { HomeFailed, HomeReading } from "./failed";
import type { RailActs } from "./rail";

/**
 * A bar of one share of a whole (0 to 1), in the ink (or the green of a reply), the rest of it the hairline's. The rest is
 * a part of its own: the kit's `rest` grows as one more share, so a whole share drew as half the bar (3 Oct, on the page).
 */
function Bar({ share, label, tone }: { share: number; label: string; tone?: "ok" }) {
  const part = Math.min(1, Math.max(0, share));
  return (
    <Meter
      size="sm"
      className="cmh-bar"
      parts={[
        tone === "ok" ? { share: part, tone: "ok" } : { share: part, color: "var(--ink)" },
        { share: 1 - part, color: "var(--line-strong)" },
      ]}
      aria-label={label}
    />
  );
}

/**
 * A rung's bar: one part in the ink, or, where the count knows its channels and more than one reaches someone, a part per
 * channel in the channel's own colour (the chart palette Reports draws it in), the parts together being the rung's share;
 * the rest of everyone in the hairline's colour.
 */
function RungBar({ r }: { r: LifecycleRung }) {
  if (!r.parts) return <Bar share={r.share} label={r.meter} />;
  const shown = r.parts.reduce((sum, p) => sum + p.share, 0);
  return (
    <Meter
      size="sm"
      className="cmh-bar"
      parts={[
        ...r.parts.map((p) => ({ share: p.share, color: cmChannelColour(p.channel) })),
        { share: Math.max(0, 1 - shown), color: "var(--line-strong)" },
      ]}
      aria-label={r.meter}
      data-testid="cmh-rung-bar"
    />
  );
}

/** A tile's head: its name, what it covers, and the door to where it goes on. */
function BlockHead({ title, note, door }: { title: string; note?: string; door?: { label: string; to: string } }) {
  return (
    <header className="cmh-block-head">
      <h2 className="cmh-h">{title}</h2>
      {note ? <span className="cmh-dim">{note}</span> : null}
      {door ? (
        <LinkButton className="cmh-more" {...routeDoor(door.to)}>
          {door.label} <Icon name="chevron" size={12} />
        </LinkButton>
      ) : null}
    </header>
  );
}

/**
 * What a tile says where its read has not landed: quietly that it is reading, or the kit's failed read with its Retry; nothing
 * for a read that landed. `testid` names the tile (`cmh-coming` says `cmh-coming-reading` or `cmh-coming-failed`).
 */
function TileRead({
  read,
  failed,
  testid,
}: {
  read: LifecycleTileRead;
  failed: LifecycleFailedRead | null;
  testid: string;
}) {
  if (read === "reading") return <HomeReading testid={`${testid}-reading`} />;
  if (read === "failed" && failed) return <HomeFailed failed={failed} testid={`${testid}-failed`} />;
  return null;
}

interface ReachActs extends RailActs {
  /** Copies the phrase a customer sends to say yes to offers. */
  onCopy: (phrase: string) => void;
}

interface ReachProps {
  tile: LifecycleReachTile;
  /** The broadcasts read's failure in this tile, where it failed. */
  failed: LifecycleFailedRead | null;
}

/** The ladder: In People, can get your messages, said yes to offers, each with what its yes opens; then how the yes is got. */
export function ReachBlock({ tile, failed, acts }: ReachProps & { acts: ReachActs }) {
  const W = LIFECYCLE_WORDS.reach;
  return (
    <Panel as="section" size="flush" className="cmh-block" aria-label={W.title} data-testid="cmh-reach">
      <BlockHead title={W.title} door={{ label: W.link, to: "clients" }} />
      <TileRead read={tile.read} failed={failed} testid="cmh-reach" />
      {tile.rungs ? (
        <ul className="cmh-ladder">
          {tile.rungs.map((r) => (
            <li key={r.id} className="cmh-rung" data-rung={r.id} data-tone={r.tone} data-testid="cmh-rung">
              <span className="cmh-rung-k">{r.label}</span>
              <span className="cmh-rung-v tabular">{r.n}</span>
              <RungBar r={r} />
              {r.byWords ? (
                <span className="cmh-dim cmh-rung-w cmh-rung-by" data-testid="cmh-rung-by">
                  {r.byWords}
                </span>
              ) : null}
              {r.opens ? <span className="cmh-dim cmh-rung-w">{r.opens}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {tile.yes ? <Yes yes={tile.yes} acts={acts} /> : null}
    </Panel>
  );
}

/** The receptionist asks for the yes to offers, and the two doors that get it at the desk. */
function Yes({ yes, acts }: { yes: NonNullable<LifecycleReachTile["yes"]>; acts: ReachActs }) {
  return (
    <div className="cmh-yes" data-testid="cmh-yes">
      <p className="cmh-yes-note">{yes.note}</p>
      <div className="cmh-yes-acts">
        <Button size="sm" onClick={() => acts.onAct(yes.code)} data-testid="cmh-code">
          <Icon name="external" size={12} /> {yes.code.label}
        </Button>
        <Button size="sm" variant="quiet" onClick={() => acts.onCopy(yes.phrase)} data-testid="cmh-copy">
          <Icon name="copy" size={12} /> {yes.copy}
        </Button>
      </div>
    </div>
  );
}

/**
 * The phone's one short tile: how many can hear you, the offers pill, a meter and a line; its read, where there is none
 * yet. The head's channel line is drawn here on a phone, where the frame draws no sentence under the page's name.
 */
export function PhoneReach({
  tile,
  failed,
  channels,
}: ReachProps & { channels: readonly ChannelStandingPart[] | null }) {
  const phone = tile.phone;
  return (
    <Panel
      as="section"
      size="flush"
      className="cmh-block cmh-phone-reach"
      aria-label={LIFECYCLE_WORDS.reach.title}
      data-testid="cmh-reach"
    >
      <TileRead read={tile.read} failed={failed} testid="cmh-reach" />
      {phone ? (
        <>
          <p className="cmh-phone-hear">
            <span className="cmh-figure tabular">{phone.n}</span>
            <span className="cmh-phone-of">{phone.of}</span>
            <StatePill kind="tone" value={phone.offers.tone} label={phone.offers.words} />
          </p>
          <Bar share={phone.share} label={phone.meter} />
          <ChannelsLine parts={channels} testid="cmh-channels" />
          {phone.note ? <span className="cmh-dim">{phone.note}</span> : null}
        </>
      ) : null}
    </Panel>
  );
}

/**
 * What a waiting run's line presses (home-page.tsx decides; the tile only says which): approve it, or skip it once the
 * question is answered. One run at a time: while one is being answered, every such line's buttons wait.
 */
export interface ComingApproval {
  /** The run a press is working on now. */
  busy: string | null;
  /** The run whose Skip was pressed and waits for its answer. */
  asking: string | null;
  onAsk: (runId: string | null) => void;
  onApprove: (r: LifecycleComing) => Promise<void>;
  onSkip: (r: LifecycleComing) => Promise<void>;
  /** Whether the role may approve or skip a run; Approve is drawn for every role and says who may (`gated`). */
  canAct: boolean;
  gated: Record<string, unknown>;
}

/**
 * A waiting run's acts, under its words: Approve and Skip, or the question Skip asks in their place (the kit's Confirm, as
 * Sent's row asks it). Where the verb would refuse an approval (its day has passed, or the workspace is paused: the
 * line's own words say which, `refusal`) Skip is the act left, and a role that may not skip has nothing to press. Each
 * act names its run to a screen reader, since two rows may wait; a No on the question hands the keyboard back to the
 * Skip that asked it; and while another row's press is with the server this row's Yes waits for it, in sight.
 */
function WaitingActs({ r, approval }: { r: LifecycleComing; approval: ComingApproval }) {
  const w = r.waiting;
  const asking = !!w && approval.canAct && approval.asking === w.runId;
  const skip = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current && !asking) skip.current?.focus();
    asked.current = asking;
  }, [asking]);
  if (!w) return null;
  const W = LIFECYCLE_WORDS.coming.approval;
  const busy = approval.busy === w.runId;
  const inFlight = approval.busy !== null;
  if (asking) {
    return (
      <div className="cmh-coming-acts" data-testid="cmh-waiting-acts">
        <Confirm
          question={W.question(r.what)}
          detail={W.detail}
          yes={W.yes}
          danger
          busy={busy}
          ready={!inFlight || busy}
          onYes={() => void approval.onSkip(r)}
          onNo={() => approval.onAsk(null)}
          testid="cmh-skip"
        />
      </div>
    );
  }
  if (w.refusal && !approval.canAct) return null;
  return (
    <div className="cmh-coming-acts" data-testid="cmh-waiting-acts">
      {w.refusal ? null : (
        <Button
          variant="primary"
          size="sm"
          disabled={inFlight}
          onClick={() => approval.onApprove(r)}
          aria-label={busy ? undefined : W.approveOf(r.what)}
          data-testid="cmh-approve"
          {...approval.gated}
        >
          <Icon name="check" size={12} /> {busy ? W.approving : W.approve}
        </Button>
      )}
      {approval.canAct ? (
        <Button
          ref={skip}
          size="sm"
          disabled={inFlight}
          onClick={() => approval.onAsk(w.runId)}
          aria-label={W.skipOf(r.what)}
          data-testid="cmh-skip"
        >
          {W.skip}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One line of "Coming up": when, what, who will get it, and its act. Where the verb would refuse a waiting run's
 * approval, what the line says is the verb's whole sentence (its day has passed, or the workspace is paused): it takes
 * the line's width under the name, as the acts do, since beside the pill it was four lines in a column a third as wide.
 */
function ComingLine({ r, acts, approval }: { r: LifecycleComing; acts: RailActs; approval: ComingApproval }) {
  const turnOn = r.act.kind === "turn_on";
  const refused = !!r.waiting?.refusal;
  return (
    <li className="cmh-coming-line" data-kind={r.kind} data-testid="cmh-coming-line">
      <span className="cmh-when">
        <span>{r.when.day}</span>
        <span>{r.when.at}</span>
      </span>
      <span className="cmh-what">
        {turnOn ? (
          <span className="cmh-what-name">{r.what}</span>
        ) : (
          <LinkButton className="cmh-what-name" onClick={() => acts.onAct(r.act)} data-testid="cmh-coming-open">
            {r.what}
          </LinkButton>
        )}
        {refused ? null : <span className="cmh-dim">{r.why}</span>}
      </span>
      {r.pill ? <StatePill kind="tone" value={r.pill.tone} label={r.pill.label} /> : null}
      {turnOn ? (
        <Button size="sm" onClick={() => acts.onAct(r.act)} data-testid="cmh-coming-turn-on" {...acts.gated}>
          {r.act.label}
        </Button>
      ) : null}
      {refused ? (
        <span className="cmh-coming-why cmh-dim" data-testid="cmh-coming-refusal">
          {r.why}
        </span>
      ) : null}
      <WaitingActs r={r} approval={approval} />
    </li>
  );
}

/** "Coming up": the next seven days. Its runs are the broadcasts' read: while that is out or failed it says so, never "nothing". */
export function ComingBlock({
  tile,
  failed,
  acts,
  approval,
}: {
  tile: LifecycleComingTile | null;
  failed: LifecycleFailedRead | null;
  acts: RailActs;
  approval: ComingApproval;
}) {
  const W = LIFECYCLE_WORDS.coming;
  if (!tile) return null;
  return (
    <Panel as="section" size="flush" className="cmh-block" aria-label={W.title} data-testid="cmh-coming">
      <BlockHead title={W.title} note={W.window} door={{ label: W.link, to: "calendar" }} />
      <TileRead read={tile.read} failed={failed} testid="cmh-coming" />
      {tile.rows.length > 0 ? (
        <ul className="cmh-coming-list">
          {tile.rows.map((r) => (
            <ComingLine key={r.id} r={r} acts={acts} approval={approval} />
          ))}
        </ul>
      ) : tile.empty !== null ? (
        <p className="cmh-dim cmh-quiet" data-testid="cmh-coming-empty">
          {tile.empty}
        </p>
      ) : null}
      <p className="cmh-dim cmh-rules" data-testid="cmh-rules">
        {tile.rules}
      </p>
    </Panel>
  );
}

/** The funnel, as four short bars one under another. */
function Funnel({ tile }: { tile: LifecycleResultsTile }) {
  if (!tile.funnel) return null;
  return (
    <ul className="cmh-funnel" aria-label={tile.funnelLabel ?? LIFECYCLE_WORDS.results.funnelLabel}>
      {tile.funnel.map((f) => (
        <li key={f.id} className="cmh-fstep" data-step={f.id}>
          <span className="cmh-fk">{f.label}</span>
          <Bar share={f.share} label={f.meter} tone={f.id === "replied" ? "ok" : undefined} />
          <span className="cmh-fv tabular">{f.n}</span>
        </li>
      ))}
    </ul>
  );
}

interface ResultsProps {
  tile: LifecycleResultsTile;
  /**
   * The reads that failed in this tile: the campaign report, said in the numbers' place (the runs below stand), and the
   * broadcasts read itself, said in the whole tile's.
   */
  failed: Pick<LifecycleFailed, "report" | "results">;
  /** Open a run on its page. */
  onOpen: (route: string) => void;
}

/** "What came back": the last thirty days. */
export function ResultsBlock({ tile, failed, onOpen }: ResultsProps) {
  const W = LIFECYCLE_WORDS.results;
  return (
    <Panel as="section" size="flush" className="cmh-block" aria-label={W.title} data-testid="cmh-results">
      <BlockHead title={W.title} note={tile.note} door={{ label: W.link, to: "broadcasts" }} />
      <TileRead read={tile.read} failed={failed.results} testid="cmh-results" />
      {tile.headline ? (
        <p className="cmh-headline">
          <span className="cmh-figure tabular" data-testid="cmh-replied">
            {tile.headline.n}
          </span>
          <span>{tile.headline.words}</span>
        </p>
      ) : tile.read === "read" && failed.report ? (
        <HomeFailed failed={failed.report} testid="cmh-report-failed" />
      ) : null}
      <Funnel tile={tile} />
      {tile.byChannel ? (
        <p className="cmh-yes-line" data-testid="cmh-by-channel">
          {tile.byChannel}
        </p>
      ) : null}
      {tile.readNote ? (
        <p className="cmh-yes-line" data-testid="cmh-read-note">
          {tile.readNote}
        </p>
      ) : null}
      {tile.yes ? (
        <p className="cmh-yes-line" data-testid="cmh-yes-line">
          {tile.yes}
        </p>
      ) : null}
      {tile.quiet ? (
        <p className="cmh-dim cmh-quiet" data-testid="cmh-quiet">
          {W.quiet}
        </p>
      ) : null}
      {tile.runs.length > 0 ? (
        <ul className="cmh-runs">
          {tile.runs.map((r) => (
            <li key={r.id} className="cmh-run" data-testid="cmh-run">
              <LinkButton className="cmh-what-name" onClick={() => onOpen(r.route)} data-testid="cmh-run-open">
                {r.name}
              </LinkButton>
              <span className="cmh-run-result">{r.result}</span>
              <span className="cmh-dim cmh-run-words">{r.words}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

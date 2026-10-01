/**
 * Campaigns › Playbooks: the parts of the page's one column (moved from legacy/pages/outbound.jsx, decision 0015): the
 * head that says how the moments stand, the table of playbooks and reach-outs, the moments nothing is doing yet, the
 * three rules that shape every run, and the pb* helpers the page reads its rows through.
 */
import { Fragment } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ReachOutChainDto } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { gate } from "../../legacy-verbs";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { useSurface } from "../../use-surface";
import { CmDot, CmHead } from "../parts/head";
import { ReachOutRow } from "../reach-out/row";
import { PlaybookSlot, PlaybookTile } from "./card";
import type { Flash } from "./card-detail";
import type { PlaybookCardVM, PlaybookTriggerOption } from "./surface";
import { pbReach, pbSpell } from "./words";

// The head counts the chains with the moments (Reach out Part 4 PR 8): a chain is one thing, running, waiting on you
// or paused.
function pbStanding(rows: readonly PlaybookCardVM[], chains: readonly ReachOutChainDto[]) {
  return {
    runningN:
      rows.filter((p) => p.state === "running" && !p.totals.waiting).length +
      chains.filter((c) => c.state === "running" && !c.next.waiting_run_id).length,
    waitingN:
      rows.filter((p) => p.totals.waiting).length +
      chains.filter((c) => c.state === "running" && c.next.waiting_run_id).length,
    pausedN: rows.filter((p) => p.state === "paused").length + chains.filter((c) => c.state !== "running").length,
  };
}

// A link to a playbook is "gone" only once the chains were read: unread, a chain's id is not yet known to be missing.
export const pbChainHere = (chains: readonly ReachOutChainDto[], id: string | null) =>
  !!id && chains.some((c) => c.root_id === id);
export const pbGone = (id: string | null, rows: readonly PlaybookCardVM[], chainHere: boolean, chainsRead: boolean) =>
  !!id && !rows.some((p) => p.id === id) && chainsRead && !chainHere;

/**
 * Every moment, in its own order: the playbooks doing one, as rows, and under them the moments nothing is doing yet, as
 * a compact group -- so a first day still names every moment it could act on, and a busy one shows which is idle
 * without an idle moment taking a working playbook's room.
 */
export function pbCards(rows: readonly PlaybookCardVM[], triggers: readonly PlaybookTriggerOption[]) {
  const known = new Set(triggers.map((t) => t.id));
  const cards: PlaybookCardVM[] = [];
  for (const t of triggers) rows.filter((p) => p.trigger === t.id).forEach((p) => cards.push(p));
  rows.filter((p) => !known.has(p.trigger)).forEach((p) => cards.push(p));
  return cards;
}

// The reach-outs' read failed, which is said once over the rows, and whose Retry reads the reach_outs surface again.
export function PbChainsFailed() {
  const reachOuts = useSurface("reach_outs");
  return reachOuts === null ? (
    <FailedRead
      kind="line"
      what="your reach-outs"
      body="The moments below are current."
      surface="reach_outs"
      testid="pb-chains-failed"
    />
  ) : null;
}

interface ChainsProps {
  chains: readonly ReachOutChainDto[];
  canAct: boolean;
  flash: Flash;
  tz: string;
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
  focusId: string | null;
}

// The reach-outs, each a chain drawn as one row above the moments (reach-out/row.tsx).
function PbChains({ chains, canAct, flash, tz, openId, setOpenId, focusId }: ChainsProps) {
  return chains.map((c) => (
    <ReachOutRow
      key={c.root_id}
      chain={c}
      canAct={canAct}
      flash={flash}
      tz={tz}
      open={openId === c.root_id}
      onOpen={() => setOpenId((o) => (o === c.root_id ? null : c.root_id))}
      focus={c.root_id === focusId}
    />
  ));
}

// The three rules that quietly shape every run, under the rows they shape: one quiet line, each rule's longer words
// its hover (they were a 78px card of three headed columns) -- the sending hours, the weekly breath across playbooks,
// and the gap before the same playbook reaches the same person again, the one number a playbook sets itself.
export function PbAlwaysOn({ rows }: { rows: readonly PlaybookCardVM[] }) {
  const hours = pageClock().hours;
  const gaps = [...new Set(rows.map((p) => p.gap_days))];
  return (
    <p className="pb-rules" data-testid="pb-always">
      <span className="pb-rules-k">Always on</span>
      {/* Each rule's longer words are its hover, and a focus's: reachable from a keyboard and read to a screen
          reader (aria-description), as the composer's Guardrails are. */}
      {[
        {
          icon: "clock",
          words: `Sends ${hours.range}`,
          more: "A run that would land outside them waits for the morning",
        },
        { icon: "wave", words: "One a week, per person", more: "Across every playbook, not per playbook" },
        {
          icon: "refresh",
          words: gaps.length === 1 ? `${gaps[0]} days between repeats` : "Days between repeats",
          more:
            gaps.length === 1
              ? "The same playbook will not reach the same person sooner"
              : "Each playbook keeps its own gap before reaching the same person again",
        },
      ].map((r) => (
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- as the JSX drew it (decision 0015)
        <span key={r.icon} className="pb-rule" tabIndex={0} data-tip={r.more} aria-description={r.more}>
          <Icon name={r.icon} size={12} />
          {r.words}
        </span>
      ))}
    </p>
  );
}

interface HeadIn {
  rows: readonly PlaybookCardVM[];
  chains: readonly ReachOutChainDto[];
  triggers: readonly PlaybookTriggerOption[];
  unused: readonly PlaybookTriggerOption[];
  startNew: () => void;
  /** Glass draws the page's act as the canvas does: a capsule of the control layer, coral kept for the composer's one act. */
  glass: boolean;
}

/**
 * One line, the way every Campaigns tab opens: the tab says "Playbooks", so the name is a screen reader's alone (CmHead
 * quiet). The line is how the moments stand -- running, waiting on you, paused, not set up -- in the numbers the rows
 * below add up to; it was a headline, a two-line sentence and a tally of big figures saying them twice. A running
 * playbook with nobody to send to is the one thing the rows alone would not say at a glance, and on a workspace whose
 * list has emptied it is true of every one of them: it rides the line, in the tone of something to look at. The act is
 * at the right, where Broadcasts and Templates keep theirs; it was the top bar's.
 */
export function pbHead({ rows, chains, triggers, unused, startNew, glass }: HeadIn) {
  const { runningN, waitingN, pausedN } = pbStanding(rows, chains);
  const nobody = rows.filter(
    (p) => pbReach({ state: p.state, candidates: p.candidates, held: p.held, waiting: p.totals.waiting }) === "nobody",
  );
  const reachesNobody = nobody.length;
  // How the moments stand, as the head's one line: the numbers the rows below add up to.
  const tally = [
    { n: runningN, k: "running", tone: "plain" },
    ...(waitingN > 0 ? [{ n: waitingN, k: "waiting on you", tone: "warn" }] : []),
    ...(pausedN > 0 ? [{ n: pausedN, k: "paused", tone: "plain" }] : []),
    ...(unused.length > 0 ? [{ n: unused.length, k: "not set up", tone: "dim" }] : []),
  ];
  return (
    <CmHead
      title="Playbooks"
      quiet
      testid="pb-standing"
      sub={
        <span
          className="pb-standing"
          data-tip="Standing rules your receptionist runs — one approved template to newly eligible people who said yes, on your clock, under Settings › Autonomy. Replies land in the Inbox."
        >
          {rows.length === 0 && chains.length === 0 ? (
            <span>
              {triggers.length > 0 ? `${pbSpell(triggers.length, true)} moments, none set up yet` : "No playbook yet"}
            </span>
          ) : (
            tally.map((t, i) => (
              <Fragment key={t.k}>
                {i > 0 && <CmDot />}
                <span className="pb-tally-cell" data-tone={t.tone}>
                  <span className="pb-tally-n tabular">{t.n}</span>
                  <span className="pb-tally-k">{t.k}</span>
                </span>
              </Fragment>
            ))
          )}
          {reachesNobody > 0 && (
            <>
              {/* In its tone and a step apart, with no dot before it: where the line wraps, a dot was left at
                  the end of the numbers pointing at nothing. One is named -- "Welcome has nobody to send to"
                  says which row to open, where "One running with nobody to send to" left the owner to find it. */}
              <span className="pb-standing-warn" data-testid="pb-reaches-nobody">
                {reachesNobody === 1
                  ? `${nobody[0].name} has nobody to send to`
                  : reachesNobody === runningN + waitingN
                    ? "None of them has anyone to send to"
                    : `${pbSpell(reachesNobody, true)} have nobody to send to`}
              </span>
            </>
          )}
        </span>
      }
      right={
        <button
          className={glass ? "btn" : "btn btn-primary"}
          onClick={startNew}
          data-testid="pb-new"
          {...gate("approve", "start a playbook")}
        >
          <Icon name="plus" size={12} />{" "}
          <span>
            New<span className="cm-act-noun"> playbook</span>
          </span>
        </button>
      }
    />
  );
}

interface ListIn {
  cards: readonly PlaybookCardVM[];
  chains: readonly ReachOutChainDto[];
  canAct: boolean;
  flash: Flash;
  tz: string;
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
  initialPlaybook: string | null;
  onEdit: (e: PlaybookCardVM) => void;
}

/** The playbooks, as People's table: the columns named once above the rows; a reach-out's chain first. */
export function pbList(l: ListIn) {
  const { cards, chains, canAct, flash, tz, openId, setOpenId, initialPlaybook, onEdit } = l;
  return (
    (cards.length > 0 || chains.length > 0) && (
      <div className="pb-list">
        <div className="pb-list-head" aria-hidden="true">
          <span>Playbook</span>
          <span>State</span>
          <span>Reaches</span>
          <span>Next run</span>
          <span className="pb-list-head-runs">Runs</span>
        </div>
        <PbChains
          chains={chains}
          canAct={canAct}
          flash={flash}
          tz={tz}
          openId={openId}
          setOpenId={setOpenId}
          focusId={initialPlaybook}
        />
        {cards.map((p) => (
          <PlaybookTile
            key={p.id}
            p={p}
            canAct={canAct}
            flash={flash}
            open={openId === p.id}
            onOpen={() => setOpenId((o) => (o === p.id ? null : p.id))}
            focus={p.id === initialPlaybook}
            onEdit={onEdit}
          />
        ))}
      </div>
    )
  );
}

/**
 * The moments nothing is doing yet, in their own order. They stay where they are while the composer is open: it opens
 * beside the page, and the page does not move under it.
 */
export function pbMore(unused: readonly PlaybookTriggerOption[], startAt: (id: string) => void) {
  return (
    unused.length > 0 && (
      <section className="pb-more" aria-label="Not set up">
        <div className="pb-more-head" aria-hidden="true">
          <span className="pb-more-k">Not set up</span>
          <span className="tally">{unused.length}</span>
        </div>
        <div className="pb-more-list">
          {unused.map((t) => (
            <PlaybookSlot key={`slot:${t.id}`} t={t} onStart={startAt} />
          ))}
        </div>
      </section>
    )
  );
}

/** No moment to name and no playbook: what one is for, and the one press that makes the first. */
export function pbEmpty() {
  return (
    <EmptyState
      kind="card"
      glyph="bolt"
      title="No playbook yet"
      body="Win-back for anyone quiet 30 days, welcome for anyone new this week, save our number for anyone who only ever phoned, or the month's offer for everyone who said yes."
      action={{
        label: "New playbook",
        onClick: () => window.dispatchEvent(new CustomEvent("playbooks:new")),
        gate: { ...gate("approve", "start a playbook") },
      }}
      testid="pb-empty"
    />
  );
}

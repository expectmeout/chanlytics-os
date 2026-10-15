/**
 * One sequence open beside the list (decision 0060, the canvas's record): its head says what it is, how big and how old
 * (contracts sequenceHeadLine), with its one act (Pause, or Turn on); then at most one notice, the most pressing thing
 * that needs you with its act (D8, contracts sequenceNotice); then the same three tabs for every sequence (D5): Steps,
 * People (Leads for a sequence to leads) and History. Each tab is an address of its own, so Back walks them.
 */
import { useCallback, useEffect, useState } from "react";
import {
  SEQUENCES_ROUTE,
  SEQUENCE_WORDS,
  peopleTabWord,
  sequenceHeadLine,
  sequenceNotice,
  sequenceRoute,
  sequenceStateTone,
  sequenceStateWords,
  type SequenceRecordDto,
  type SequenceTab,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Notice } from "../../kit/notice/notice";
import { StatePill } from "../../kit/pill/state-pill";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { FailedRead } from "../../kit/empty/empty";
import { gate, navigate, replaceRoute, routeDoor, useLegacyToast } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { CmPane } from "../parts/split";
import { SequenceHistory } from "./history";
import { SequencePeople } from "./people";
import { SequenceSteps } from "./steps";
import { useSequenceRead } from "./use-record";
import { pressed, sequenceVerbs as verbs } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** A draft's head act: Start, its first step running through the campaign's own door, so it is on (`sequence_start`). */
function StartAct({ rec, flash, moved }: { rec: SequenceRecordDto; flash: Flash; moved: () => void }) {
  const [busy, setBusy] = useState(false);
  const row = rec.sequence;
  const start = async () => {
    setBusy(true);
    await pressed("sequence_start", { sequence_id: row.id, name: row.name }, flash, moved);
    setBusy(false);
  };
  return (
    <Button
      size="sm"
      variant="primary"
      onClick={() => void start()}
      disabled={busy}
      data-testid="sq-start"
      {...gate("approve")}
    >
      <Icon name="play" size={12} /> {SEQUENCE_WORDS.start}
    </Button>
  );
}

/**
 * A draft's one notice (D8): nothing of it goes until it is started, and Discard lets it go whole, asked once, since
 * nothing of it was ever sent.
 */
function DraftNotice({ rec, flash }: { rec: SequenceRecordDto; flash: Flash }) {
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const row = rec.sequence;
  const discard = async () => {
    setBusy(true);
    const gone = await pressed("sequence_discard", { sequence_id: row.id }, flash, () => undefined);
    setBusy(false);
    if (gone) navigate(SEQUENCES_ROUTE);
  };
  if (sure)
    return (
      <Confirm
        question={`Discard “${row.name}”?`}
        detail="Nothing of it has gone; its steps go with it."
        yes={SEQUENCE_WORDS.discard}
        danger
        busy={busy}
        onYes={() => void discard()}
        onNo={() => setSure(false)}
        testid="sq-discard"
      />
    );
  return (
    <Notice
      line
      label={SEQUENCE_WORDS.notStarted}
      testid="sq-notice"
      fact={SEQUENCE_WORDS.notStarted}
      act={
        <Button
          size="sm"
          variant="quiet"
          onClick={() => setSure(true)}
          data-testid="sq-discard-ask"
          {...gate("approve")}
        >
          {SEQUENCE_WORDS.discard}
        </Button>
      }
    />
  );
}

/** The head's one act: Pause while it runs, Turn on while it is paused; a one-off's batch is decided on its notice. */
function StateAct({ rec, flash, moved }: { rec: SequenceRecordDto; flash: Flash; moved: () => void }) {
  const [busy, setBusy] = useState(false);
  const row = rec.sequence;
  if (row.state === "draft") return <StartAct rec={rec} flash={flash} moved={moved} />;
  if (row.starts === "date" || row.state === "ended") return null;
  const on = row.state === "on";
  const press = async () => {
    setBusy(true);
    // A sequence's state is its first step's, the campaign's own verb (its receipt, its undo).
    await pressed(
      "playbook_change",
      { playbook_id: row.id, name: row.name, state: on ? "paused" : "running" },
      flash,
      moved,
    );
    setBusy(false);
  };
  return (
    <Button size="sm" onClick={() => void press()} disabled={busy} data-testid="sq-state" {...gate("approve")}>
      <Icon name={on ? "pause" : "play"} size={12} /> {on ? SEQUENCE_WORDS.pause : SEQUENCE_WORDS.resume}
    </Button>
  );
}

/** The one notice (D8): what needs you most, and its act where it has one here. */
function OneNotice({ rec, flash, moved }: { rec: SequenceRecordDto; flash: Flash; moved: () => void }) {
  const [busy, setBusy] = useState(false);
  const notice = sequenceNotice(rec.sequence, rec.steps, rec.timezone, Date.now());
  if (!notice) return null;
  const batch = notice.batchId;
  const approve = async () => {
    if (!batch) return;
    setBusy(true);
    // A batch waiting for an OK is a run's, approved through the run's own verb (its receipt, and Cancel as its undo).
    const waiting = rec.sequence.needs.batches.find((b) => b.id === batch);
    await pressed(
      "run",
      { broadcast_id: batch, verb: "approve", name: rec.sequence.name, people: waiting?.people ?? 0 },
      flash,
      moved,
    );
    setBusy(false);
  };
  const people = rec.sequence.id;
  return (
    <Notice
      line
      label={notice.words}
      testid="sq-notice"
      fact={
        <>
          <StatePill kind="tone" value="warn" label={SEQUENCE_WORDS.filters.needs} /> {notice.words}
        </>
      }
      act={
        notice.kind === "waiting" && batch ? (
          <>
            <Button size="sm" {...routeDoor(sequenceRoute(people, "people"))} data-testid="sq-look">
              {SEQUENCE_WORDS.lookFirst}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void approve()}
              disabled={busy}
              data-testid="sq-approve"
              {...gate("approve")}
            >
              {notice.act}
            </Button>
          </>
        ) : notice.kind === "held" || notice.kind === "to_send" ? (
          <Button size="sm" {...routeDoor(sequenceRoute(people, "people"))} data-testid="sq-look">
            {SEQUENCE_WORDS.lookFirst}
          </Button>
        ) : null
      }
    />
  );
}

interface SequenceRecordProps {
  id: string;
  tab: SequenceTab;
}

export function SequenceRecord({ id, tab }: SequenceRecordProps) {
  const [again, setAgain] = useState(0);
  const moved = useCallback(() => setAgain((n) => n + 1), []);
  const [toast, flash] = useLegacyToast();
  const read = useSequenceRead(id, verbs.record, verbs.peekRecord, again);
  const close = () => navigate(SEQUENCES_ROUTE);
  // An address that named one of its parts (a step's id, a run's) is replaced by the sequence's own.
  const named = read.state === "read" ? read.data.sequence.id : null;
  useEffect(() => {
    if (named && named !== id) replaceRoute(sequenceRoute(named, tab));
  }, [named, id, tab]);
  if (read.state !== "read") {
    return (
      <CmPane title={SEQUENCE_WORDS.title} onClose={close} testid="sq-record">
        {read.state === "failed" ? (
          <FailedRead what="this sequence" why={read.why} onRetry={moved} testid="sq-record-failed" />
        ) : (
          <div className="sq-reading" aria-busy="true" />
        )}
        {toast}
      </CmPane>
    );
  }
  const rec = read.data;
  const row = rec.sequence;
  return (
    <CmPane
      title={row.name}
      badge={<StatePill kind="tone" value={sequenceStateTone(row)} label={sequenceStateWords(row)} />}
      sub={sequenceHeadLine(row, rec.word, rec.timezone, Date.now())}
      tools={<StateAct rec={rec} flash={flash} moved={moved} />}
      onClose={close}
      testid="sq-record"
    >
      {row.state === "draft" ? (
        <DraftNotice rec={rec} flash={flash} />
      ) : (
        <OneNotice rec={rec} flash={flash} moved={moved} />
      )}
      <SubTabs
        label={row.name}
        value={tab}
        onSelect={(t) => navigate(sequenceRoute(row.id, t === "people" || t === "history" ? t : "steps"))}
        tabs={[
          { id: "steps", label: SEQUENCE_WORDS.tabs.steps, href: routeDoor(sequenceRoute(row.id)).href },
          {
            id: "people",
            label: peopleTabWord(row),
            count: row.in_it || undefined,
            href: routeDoor(sequenceRoute(row.id, "people")).href,
          },
          {
            id: "history",
            label: SEQUENCE_WORDS.tabs.history,
            href: routeDoor(sequenceRoute(row.id, "history")).href,
          },
        ]}
      />
      {tab === "steps" ? <SequenceSteps rec={rec} flash={flash} moved={moved} /> : null}
      {tab === "people" ? <SequencePeople rec={rec} flash={flash} again={again} moved={moved} /> : null}
      {tab === "history" ? <SequenceHistory rec={rec} again={again} /> : null}
      {toast}
    </CmPane>
  );
}

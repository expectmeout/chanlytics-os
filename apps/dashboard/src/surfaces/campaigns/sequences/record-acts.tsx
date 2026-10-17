/**
 * A sequence's acts around its tabs (decision 0060; the phone review of 16 Oct 2026). The head's one act on a desk (Start,
 * Pause, or Turn on, which asks first: decision 7) and its More: on a phone Pause or Turn on and Skip first, then Cancel
 * this send for a one-off waiting for its day, Run now where its first step runs today, Rename, Who approves (its class,
 * said, changed in Autonomy) and Ask about it, so the head stays Back, a name and More. The one notice (D8) says what needs
 * you most: on a desk above the tabs with its acts, on a phone in the dock at the foot (phoneFootOf): its line, its one
 * fact and at most two acts, the dock gone where nothing needs you. A question an act asks stands where the notice stood,
 * or in a phone's dock. Every press is a verb (verbs.ts `pressed`): the campaign's own for a state, a name and a run now,
 * the run's for a batch, the sequence's for a draft.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  PLAYBOOK_NAME_MAX,
  SEQUENCES_ROUTE,
  SEQUENCE_ACT_WORDS as A,
  SEQUENCE_FLOW_WORDS as F,
  SEQUENCE_WORDS,
  sequenceCancels,
  sequenceNotice,
  sequencePausedDock,
  sequenceRepliesRoute,
  sequenceResumeAsk,
  sequenceRoute,
  sequenceRunsNow,
  sequenceTwinOf,
  sequenceWhoApprovesHint,
  type AskScope,
  type SequenceRecordDto,
  type SequenceTab,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Menu, type MenuItem } from "../../kit/menu/menu";
import { Notice } from "../../kit/notice/notice";
import { StatePill } from "../../kit/pill/state-pill";
import { askAbout, gate, navigate, openAutonomy, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { pressed } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** A question an act asks before it acts: Skip a batch, Turn on, Discard a draft, Cancel a one-off's send. */
type Asking = "skip" | "resume" | "discard" | "cancel";

/**
 * The record's acts and what they share, held once for the head, the notice and a phone's dock: the notice and the batch
 * it is about, the twin it is sent beside, the question standing, Rename, and each press. `editStep` opens a step's
 * editor in place (the record holds which), for the notice of new words turned down.
 */
export function useRecordActs(rec: SequenceRecordDto, flash: Flash, moved: () => void, editStep: (id: string) => void) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [renaming, setRenaming] = useState(false);
  const row = rec.sequence;
  // A twin is the list's to know (sequenceTwinOf): another sequence on this visit moment, which the list beside it holds.
  const list = useSurface("sequences");
  const twin = list ? sequenceTwinOf(list.sequences, row) : null;
  const notice = sequenceNotice(row, rec.steps, { tz: rec.timezone, nowMs: Date.now() }, twin);
  // The batch waiting for an OK the notice is about, decided through the run's own verb.
  const waiting = notice?.kind === "waiting" ? notice.batchId : null;
  const press = async (kind: Parameters<typeof pressed>[0], payload: Record<string, unknown>) => {
    setBusy(true);
    const ok = await pressed(kind, payload, flash, moved);
    setBusy(false);
    return ok;
  };
  return {
    rec,
    row,
    notice,
    twin,
    waiting,
    busy,
    asking,
    setAsking,
    renaming,
    setRenaming,
    editStep,
    /** A batch approved (its receipt, and Cancel as its undo), or skipped, which sends none of it. */
    decide: async (verb: "approve" | "skip") => {
      if (!waiting) return;
      const batch = row.needs.batches.find((b) => b.id === waiting);
      await press("run", { broadcast_id: waiting, verb, name: row.name, people: batch?.people ?? 0 });
      setAsking(null);
    },
    /** A one-off waiting for its day, let go of through the run's own door: nobody gets it. */
    cancelSend: async () => {
      if (!row.date) return;
      await press("run", { broadcast_id: row.date.batch_id, verb: "skip", name: row.name, people: row.date.people });
      setAsking(null);
    },
    /** Paused, or on again: a sequence's state is its first step's, the campaign's own verb (its receipt, its undo). */
    turn: async (state: "paused" | "running") => {
      await press("playbook_change", { playbook_id: row.id, name: row.name, state });
      setAsking(null);
    },
    start: () => press("sequence_start", { sequence_id: row.id, name: row.name }),
    runNow: () =>
      press("playbook_run", { playbook_id: row.first?.id ?? row.id, name: row.name, timezone: rec.timezone }),
    rename: async (name: string) => {
      if (await press("playbook_change", { playbook_id: row.id, name })) setRenaming(false);
    },
    discard: async () => {
      setBusy(true);
      const gone = await pressed("sequence_discard", { sequence_id: row.id }, flash, () => undefined);
      setBusy(false);
      if (gone) navigate(SEQUENCES_ROUTE);
    },
  };
}
type RecordActs = ReturnType<typeof useRecordActs>;

/** Whether its state changes here: a sequence that runs on, never a one-off (decided on its notice) or one that ended. */
const turns = (a: RecordActs) => a.row.starts !== "date" && (a.row.state === "on" || a.row.state === "paused");

/** What Ask is opened on: the campaign a moment's or a list's sequence runs as, else the sequence's own page. */
const askScopeOf = (a: RecordActs): AskScope =>
  (a.row.starts === "moment" || a.row.starts === "list") && a.row.first
    ? { kind: "playbook", id: a.row.first.id, label: a.row.name }
    : { kind: "page", id: sequenceRoute(a.row.id), label: a.row.name };

/** A desk's head act: Start a draft, Pause one that is on, Turn on one that is paused (asked first, decision 7). */
function StateAct({ a }: { a: RecordActs }) {
  if (a.row.state === "draft")
    return (
      <Button
        size="sm"
        variant="primary"
        onClick={() => void a.start()}
        disabled={a.busy}
        data-testid="sq-start"
        {...gate("approve")}
      >
        <Icon name="play" size={12} /> {SEQUENCE_WORDS.start}
      </Button>
    );
  if (!turns(a)) return null;
  const on = a.row.state === "on";
  return (
    <Button
      size="sm"
      onClick={() => (on ? void a.turn("paused") : a.setAsking("resume"))}
      disabled={a.busy || a.asking === "resume"}
      data-testid="sq-state"
      {...gate("approve")}
    >
      <Icon name={on ? "pause" : "play"} size={12} /> {on ? SEQUENCE_WORDS.pause : SEQUENCE_WORDS.resume}
    </Button>
  );
}

/** What a phone's More holds first: the state (Pause, Turn on…), Skip a batch waiting, Discard a draft. */
function phoneItems(a: RecordActs): MenuItem[] {
  const allowed = gate("approve");
  const items: MenuItem[] = [];
  if (turns(a))
    items.push(
      a.row.state === "on"
        ? {
            label: SEQUENCE_WORDS.pause,
            glyph: <Icon name="pause" size={13} />,
            disabled: a.busy,
            gate: allowed,
            onSelect: () => void a.turn("paused"),
          }
        : {
            label: SEQUENCE_WORDS.resumeAsk,
            glyph: <Icon name="play" size={13} />,
            disabled: a.busy,
            gate: allowed,
            onSelect: () => a.setAsking("resume"),
          },
    );
  if (a.waiting)
    items.push({
      label: `${SEQUENCE_WORDS.skip}…`,
      glyph: <Icon name="x" size={13} />,
      disabled: a.busy,
      gate: allowed,
      onSelect: () => a.setAsking("skip"),
    });
  if (a.row.state === "draft")
    items.push({
      label: `${SEQUENCE_WORDS.discard}…`,
      glyph: <Icon name="x" size={13} />,
      tone: "danger",
      disabled: a.busy,
      gate: allowed,
      onSelect: () => a.setAsking("discard"),
    });
  return items;
}

/**
 * The head's More: on a phone its state, Skip and Discard first; then Cancel this send, Run now, Rename, Who approves
 * (how, and the Autonomy row it is set on for the whole class) and Ask about it.
 */
function More({ a, phone }: { a: RecordActs; phone: boolean }) {
  const row = a.row;
  const allowed = gate("approve");
  const items: MenuItem[] = phone ? phoneItems(a) : [];
  if (sequenceCancels(row))
    items.push({
      label: F.cancelSend,
      glyph: <Icon name="ban" size={13} />,
      tone: "danger",
      disabled: a.busy,
      gate: allowed,
      onSelect: () => a.setAsking("cancel"),
    });
  if (sequenceRunsNow(row, { tz: a.rec.timezone, nowMs: Date.now() }))
    items.push({
      label: A.runNow,
      glyph: <Icon name="bolt" size={13} />,
      title: A.runNowTip,
      disabled: a.busy,
      gate: allowed,
      onSelect: () => void a.runNow(),
    });
  if (row.starts !== "date")
    items.push({
      label: A.rename,
      glyph: <Icon name="pencil" size={13} />,
      gate: allowed,
      onSelect: () => a.setRenaming(true),
    });
  if (row.state !== "draft")
    items.push({
      label: SEQUENCE_WORDS.whoApproves,
      glyph: <Icon name="shield" size={13} />,
      hint: sequenceWhoApprovesHint(a.rec.mode, row.first?.policy_class),
      onSelect: openAutonomy,
    });
  return (
    <Menu
      label={A.more(row.name)}
      trigger={
        <Button
          variant="quiet"
          size={phone ? "touch" : "sm"}
          iconOnly
          aria-label={A.more(row.name)}
          data-testid="sq-more"
        >
          <Icon name="more" size={phone ? 18 : 14} />
        </Button>
      }
      groups={[
        // A phone draws the menu as a sheet, headed by what it is about.
        { header: phone ? row.name : undefined, items },
        {
          items: [
            {
              label: A.askAbout,
              glyph: <Icon name="three" size={13} />,
              onSelect: () => askAbout({ about: askScopeOf(a) }),
            },
          ],
        },
      ]}
    />
  );
}

/** The head's acts: a desk's one act beside More; a phone's More alone, its acts in the dock. */
export function HeadActs({ a, phone }: { a: RecordActs; phone: boolean }) {
  return (
    <>
      {phone ? null : <StateAct a={a} />}
      <More a={a} phone={phone} />
    </>
  );
}

/** Turn on, asked: when it runs next and to about how many, from the playbooks surface, read as the question opens. */
function TurnOnQuestion({ a }: { a: RecordActs }) {
  const playbooks = useSurface("playbooks");
  const ask = sequenceResumeAsk(a.row, playbooks, { tz: a.rec.timezone, nowMs: Date.now(), mode: a.rec.mode });
  return (
    <Confirm
      question={ask.question}
      detail={ask.detail}
      yes={ask.yes}
      busy={a.busy}
      onYes={() => void a.turn("running")}
      onNo={() => a.setAsking(null)}
      testid="sq-resume"
    />
  );
}

/** The question standing, where it was asked: Skip this batch, Turn on, Discard a draft, or Cancel a one-off's send. */
export function RecordQuestion({ a }: { a: RecordActs }) {
  if (a.asking === "resume") return <TurnOnQuestion a={a} />;
  if (a.asking === "skip")
    return (
      <Confirm
        question={SEQUENCE_WORDS.skipAsk}
        detail={SEQUENCE_WORDS.skipDetail}
        yes={SEQUENCE_WORDS.skip}
        danger
        busy={a.busy}
        onYes={() => void a.decide("skip")}
        onNo={() => a.setAsking(null)}
        testid="sq-skip"
      />
    );
  if (a.asking === "cancel")
    return (
      <Confirm
        question={F.cancelAsk}
        detail={F.cancelDetail}
        yes={F.cancelYes}
        danger
        busy={a.busy}
        onYes={() => void a.cancelSend()}
        onNo={() => a.setAsking(null)}
        testid="sq-cancel"
      />
    );
  if (a.asking === "discard")
    return (
      <Confirm
        question={`Discard “${a.row.name}”?`}
        detail="Nothing of it has gone; its steps go with it."
        yes={SEQUENCE_WORDS.discard}
        danger
        busy={a.busy}
        onYes={() => void a.discard()}
        onNo={() => a.setAsking(null)}
        testid="sq-discard"
      />
    );
  return null;
}

/** Rename, in place of the notice: its name in a field, kept by the campaign's own verb (its receipt, its undo). */
export function RenameForm({ a }: { a: RecordActs }) {
  const [name, setName] = useState(a.row.name);
  const said = name.trim();
  // Rename was pressed to type: the box takes the keys as it opens.
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.select(), []);
  return (
    <form
      className="sq-rename"
      data-testid="sq-rename"
      onSubmit={(e) => {
        e.preventDefault();
        if (said && said !== a.row.name) void a.rename(said);
      }}
    >
      <Field ref={box} label={A.name} value={name} onValueChange={setName} maxLength={PLAYBOOK_NAME_MAX} />
      <Button size="sm" onClick={() => a.setRenaming(false)} data-testid="sq-rename-cancel">
        {A.cancel}
      </Button>
      <Button
        size="sm"
        variant="primary"
        type="submit"
        disabled={a.busy || !said || said === a.row.name}
        data-testid="sq-rename-save"
        {...gate("approve")}
      >
        {A.save}
      </Button>
    </form>
  );
}

/** Look first: the People tab, where what the notice counts is laid out; none while that tab is the one open. */
const lookFirst = (a: RecordActs, tab: SequenceTab) =>
  tab === "people" ? null : routeDoor(sequenceRoute(a.row.id, "people"));

/**
 * The notice's act, beside Approve on a waiting batch: Turn this off for a twin, Edit step N for words turned down, Answer
 * for replies (the Inbox, its threads that answered), Review for the emails held or to send (People). Null where it has
 * none of these. `size` is the place's: a desk's notice, a phone's dock.
 */
function NoticeAct({ a, tab, phone }: { a: RecordActs; tab: SequenceTab; phone: boolean }) {
  const n = a.notice;
  if (!n?.act) return null;
  const size = phone ? "md" : "sm";
  if (n.kind === "twin")
    return (
      <Button
        size={size}
        onClick={() => void a.turn("paused")}
        disabled={a.busy}
        data-testid="sq-twin-off"
        {...gate("approve")}
      >
        {n.act}
      </Button>
    );
  if (n.kind === "words" && n.stepId) {
    const id = n.stepId;
    return (
      <Button size={size} onClick={() => a.editStep(id)} data-testid="sq-words-edit" {...gate("approve")}>
        {n.act}
      </Button>
    );
  }
  if (n.kind === "replies")
    return (
      <Button size={size} {...routeDoor(sequenceRepliesRoute(a.row.id, "all"))} data-testid="sq-answer">
        {n.act}
      </Button>
    );
  const look = lookFirst(a, tab);
  if ((n.kind === "held" || n.kind === "to_send") && look)
    return (
      <Button size={size} {...look} data-testid="sq-look">
        {n.act}
      </Button>
    );
  return null;
}

/**
 * The one notice on a desk (D8): what needs you most, with its acts here (Look first, Skip asked, Approve; or the
 * notice's own act). A draft's says nothing of it goes yet, with Discard, asked once. A phone says it in the dock.
 */
export function RecordNotice({ a, tab }: { a: RecordActs; tab: SequenceTab }) {
  const n = a.notice;
  if (a.row.state === "draft")
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
            onClick={() => a.setAsking("discard")}
            data-testid="sq-discard-ask"
            {...gate("approve")}
          >
            {SEQUENCE_WORDS.discard}
          </Button>
        }
      />
    );
  if (!n) return null;
  const look = lookFirst(a, tab);
  const acts =
    n.kind === "waiting" && a.waiting ? (
      <>
        {look ? (
          <Button size="sm" variant="quiet" {...look} data-testid="sq-look">
            {SEQUENCE_WORDS.lookFirst}
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => a.setAsking("skip")}
          disabled={a.busy}
          data-testid="sq-skip-ask"
          {...gate("approve")}
        >
          {SEQUENCE_WORDS.skip}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void a.decide("approve")}
          disabled={a.busy}
          data-testid="sq-approve"
          {...gate("approve")}
        >
          {n.act}
        </Button>
      </>
    ) : (
      <NoticeAct a={a} tab={tab} phone={false} />
    );
  return (
    <Notice
      line
      label={n.words}
      testid="sq-notice"
      fact={
        <>
          <StatePill kind="tone" value="warn" label={SEQUENCE_WORDS.filters.needs} /> {n.words}
        </>
      }
      act={acts}
    />
  );
}

/** The dock's words: its line (amber where it needs you) and the one fact under it. */
function DockSaid({ line, fact, warn }: { line: string; fact: string | null; warn: boolean }) {
  return (
    <span className="sq-dock-said">
      <span className={warn ? "sq-dock-line sq-needs" : "sq-dock-line"}>{line}</span>
      {fact ? <span className="sq-dock-fact">{fact}</span> : null}
    </span>
  );
}

/**
 * A phone's dock (the canvas's state boards): the question an act asked; else what needs you, its line, its one fact and
 * at most two acts -- a batch's Look first (the eye) and Approve N; a twin's Turn this off; words turned down, Edit step N;
 * held or to send, Review; replies, Answer -- a paused sequence's Turn on…, or a draft's Start. Null where none of them
 * stands, so the pane draws no foot at all.
 */
export function phoneFootOf(a: RecordActs, tab: SequenceTab): ReactNode {
  if (a.asking) return <RecordQuestion a={a} />;
  if (a.renaming) return null;
  if (a.row.state === "draft")
    return (
      <div className="sq-foot">
        <DockSaid line={SEQUENCE_WORDS.notStarted} fact={null} warn={false} />
        <Button
          variant="primary"
          onClick={() => void a.start()}
          disabled={a.busy}
          data-testid="sq-start"
          {...gate("approve")}
        >
          <Icon name="play" size={12} /> {SEQUENCE_WORDS.start}
        </Button>
      </div>
    );
  const n = a.notice;
  if (n?.kind === "waiting" && a.waiting) {
    const look = lookFirst(a, tab);
    return (
      <div className="sq-foot">
        {look ? (
          <Button
            iconOnly
            variant="quiet"
            size="touch"
            aria-label={SEQUENCE_WORDS.lookFirst}
            {...look}
            data-testid="sq-look"
          >
            <Icon name="eye" size={16} />
          </Button>
        ) : null}
        <DockSaid line={n.line} fact={n.fact} warn={false} />
        <Button
          variant="primary"
          onClick={() => void a.decide("approve")}
          disabled={a.busy}
          data-testid="sq-approve"
          {...gate("approve")}
        >
          {n.act}
        </Button>
      </div>
    );
  }
  if (n)
    return (
      <div className="sq-foot">
        <DockSaid line={n.line} fact={n.fact} warn />
        <NoticeAct a={a} tab={tab} phone />
      </div>
    );
  const paused = sequencePausedDock(a.row);
  if (paused)
    return (
      <div className="sq-foot">
        <DockSaid line={paused.line} fact={paused.fact} warn={false} />
        <Button
          variant="primary"
          onClick={() => a.setAsking("resume")}
          disabled={a.busy}
          data-testid="sq-resume-ask"
          {...gate("approve")}
        >
          {SEQUENCE_WORDS.resumeAsk}
        </Button>
      </div>
    );
  return null;
}

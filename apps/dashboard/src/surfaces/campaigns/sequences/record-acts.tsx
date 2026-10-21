/**
 * A sequence's acts around its tabs (decision 0060; the phone review of 16 Oct 2026). The head's one act on a desk (Start,
 * Pause, or Turn on, which asks first: decision 7) and its More: on a phone Pause or Turn on and Skip first, then Cancel
 * this send for a one-off waiting for its day, Send it again for a one-off that went, Run now where its first step runs
 * today, Rename, Who approves (its class, said, changed in Autonomy) and Ask about it, so the head stays Back, a name and More. The one notice (D8) says what needs
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
  leadDraftDockOf,
  sequenceCancels,
  sequenceNotice,
  sequencePausedDock,
  sequenceRepliesRoute,
  sequenceResumeAsk,
  sequenceRoute,
  sequenceRunsNow,
  sequenceTwinOf,
  sequenceWhoApprovesHint,
  sendOnceRoute,
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
import { keepTabDraft } from "../../kit/record/work";
import { askAbout, gate, navigate, refusalToast, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { runDetail } from "../broadcasts/detail-read";
import { keptSendOf } from "./new/kept-send";
import { useSequenceRead } from "./use-record";
import { pressed, sequenceVerbs as verbs } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** A question an act asks before it acts: Skip a batch, Turn on, Discard a draft, Cancel a one-off's send, End it. */
type Asking = "skip" | "resume" | "discard" | "cancel" | "end";

/**
 * The record's acts and what they share, held once for the head, the notice and a phone's dock: the notice and the batch
 * it is about, the twin it is sent beside, the question standing, Rename, and each press. `opens.step` opens a step's
 * editor in place (the record holds which), for the notice of new words turned down; `opens.how` opens How it runs on
 * Steps, where Before each batch is set (decision 0064).
 */
export function useRecordActs(
  rec: SequenceRecordDto,
  flash: Flash,
  moved: () => void,
  opens: { step: (id: string) => void; how: () => void },
) {
  const { step: editStep, how: openHow } = opens;
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [renaming, setRenaming] = useState(false);
  const row = rec.sequence;
  // A twin is the list's to know (sequenceTwinOf): another sequence on this visit moment, which the list beside it holds.
  const list = useSurface("sequences");
  const twin = list ? sequenceTwinOf(list.sequences, row) : null;
  // What needs you most, a run that did nothing among it (the loop review's item 8: its last run's reason, said until one goes).
  const notice = sequenceNotice(row, rec.steps, twin, {
    off: rec.last_run_off,
    for: rec.last_run_for,
    tz: rec.timezone,
    nowMs: Date.now(),
  });
  // The batch waiting for an OK the notice is about, decided through the run's own verb.
  const waiting = notice?.kind === "waiting" ? notice.batchId : null;
  // A draft to leads with an email still to write: the dock asks for it before Start (the canvas's board A).
  const unwritten = leadDraftDockOf(row, rec.chain);
  const unwrittenId = unwritten
    ? ([...(rec.chain?.steps ?? [])].sort((x, y) => x.n - y.n)[unwritten.place - 1]?.id ?? null)
    : null;
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
    /** How it runs, opened on Steps: where Before each batch is set (decision 0064). */
    openHow,
    unwritten,
    /** Write step N: the step still to write, opened in its sheet. */
    writeUnwritten: () => {
      if (unwrittenId) editStep(unwrittenId);
    },
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
    /**
     * Send it again (a one-off that went): its last run read for what it sent, kept for the tab as the send New opens on,
     * and New's Send once opened, where it is checked against what can go now and sent as a new one-off.
     */
    sendAgain: async () => {
      if (!row.last) return;
      setBusy(true);
      const r = await runDetail(row.last.id);
      setBusy(false);
      if (!r.ok) {
        flash(refusalToast(r));
        return;
      }
      keepTabDraft("broadcast", keptSendOf(r.data.broadcast));
      navigate(sendOnceRoute());
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
    /** End it (a customer's sequence that has sent): it sends nothing more, its History stays. Nothing undoes it. */
    end: async () => {
      await press("sequence_end", { sequence_id: row.id, name: row.name });
      setAsking(null);
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

/**
 * Whether End it is offered: a customer's sequence (a moment's or a list's) that runs or is paused. A draft is discarded
 * instead, a one-off ends with its day, and a sequence to leads is paused (its door refuses an end).
 */
const ends = (row: RecordActs["row"]) =>
  (row.starts === "moment" || row.starts === "list") && (row.state === "on" || row.state === "paused");

/** Whether its state changes here: a sequence that runs on, never a one-off (decided on its notice) or one that ended. */
const turns = (a: RecordActs) => a.row.starts !== "date" && (a.row.state === "on" || a.row.state === "paused");

/** What Ask is opened on: the campaign a moment's or a list's sequence runs as, else the sequence's own page. */
const askScopeOf = (a: RecordActs): AskScope =>
  (a.row.starts === "moment" || a.row.starts === "list") && a.row.first
    ? { kind: "playbook", id: a.row.first.id, label: a.row.name }
    : { kind: "page", id: sequenceRoute(a.row.id), label: a.row.name };

/** A desk's head act: Start a draft, Pause one that is on, Turn on one that is paused (asked first, decision 7). */
function StateAct({ a }: { a: RecordActs }) {
  if (a.unwritten)
    return (
      <Button size="sm" variant="primary" onClick={a.writeUnwritten} data-testid="sq-write-step" {...gate("approve")}>
        <Icon name="pencil" size={12} /> {a.unwritten.act}
      </Button>
    );
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
 * The head's More: on a phone its state, Skip and Discard first; then Cancel this send, Send it again, Run now, Rename, Who
 * approves (how, and the Autonomy row it is set on for the whole class), End it, asked first, and Ask about it. On a desk it rides
 * the head's act as its caret (Ruben, 20 Oct 2026: no three dots where a pill can carry it), or is its own pill, its word
 * and a caret, where no act stands; a phone's head is the caret alone, its acts in the dock.
 */
function More({ a, phone, look }: { a: RecordActs; phone: boolean; look: "glyph" | "caret" | "word" }) {
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
  if (row.starts === "date" && row.last)
    items.push({
      label: A.sendAgain,
      glyph: <Icon name="send" size={13} />,
      title: A.sendAgainTip,
      disabled: a.busy,
      gate: gate("approve", "send a message"),
      onSelect: () => void a.sendAgain(),
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
  if (row.starts !== "date" && row.state !== "ended")
    items.push({
      label: A.rename,
      glyph: <Icon name="pencil" size={13} />,
      gate: allowed,
      onSelect: () => a.setRenaming(true),
    });
  if (row.starts !== "date" && row.state !== "ended")
    items.push({
      label: SEQUENCE_WORDS.whoApproves,
      glyph: <Icon name="shield" size={13} />,
      hint: sequenceWhoApprovesHint(row.mode),
      onSelect: a.openHow,
    });
  if (ends(row))
    items.push({
      label: `${SEQUENCE_WORDS.end}…`,
      glyph: <Icon name="ban" size={13} />,
      tone: "danger",
      disabled: a.busy,
      gate: allowed,
      onSelect: () => a.setAsking("end"),
    });
  return (
    <Menu
      label={A.more(row.name)}
      trigger={
        look === "caret" ? (
          <Button
            variant={stateActIsPrimary(a) ? "primary" : "secondary"}
            size="sm"
            iconOnly
            className="sq-head-caret"
            aria-label={A.more(row.name)}
            data-testid="sq-more"
          >
            <Icon name="chevron-down" size={12} />
          </Button>
        ) : look === "word" ? (
          <Button size="sm" aria-label={A.more(row.name)} data-testid="sq-more">
            {A.moreWord} <Icon name="chevron-down" size={12} />
          </Button>
        ) : (
          <Button
            variant="quiet"
            size={phone ? "touch" : "sm"}
            iconOnly
            aria-label={A.more(row.name)}
            data-testid="sq-more"
          >
            {/* No three dots (Ruben, 20 Oct 2026): the caret every menu of the record opens from. */}
            <Icon name="chevron-down" size={phone ? 18 : 14} />
          </Button>
        )
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

/** Whether a desk's head has its one act (StateAct): Write step N, Start, Pause or Turn on. */
const hasStateAct = (a: RecordActs) => !!a.unwritten || a.row.state === "draft" || turns(a);
/** Whether that act is the filled one (Write step N, Start), which its caret matches. */
const stateActIsPrimary = (a: RecordActs) => !!a.unwritten || a.row.state === "draft";

/**
 * The head's acts: a desk's one act with More as its caret, one split pill (the To send row's `Your mail app ⌄`), or More
 * as a pill of its own where no act stands; a phone's More alone, its acts in the dock.
 */
export function HeadActs({ a, phone }: { a: RecordActs; phone: boolean }) {
  if (phone) return <More a={a} phone look="glyph" />;
  if (!hasStateAct(a)) return <More a={a} phone={false} look="word" />;
  return (
    <span className="sq-head-split">
      <StateAct a={a} />
      <More a={a} phone={false} look="caret" />
    </span>
  );
}

/**
 * Turn on, asked: when it runs next, from the record, and to about how many, from its reach (GET sequences/:id/reach), read
 * as the question opens. A sequence to leads reads nothing more: its question says what a reach-out's Resume says.
 */
function TurnOnQuestion({ a }: { a: RecordActs }) {
  const counted = a.row.starts === "moment" || a.row.starts === "list";
  const read = useSequenceRead(counted ? a.row.id : null, verbs.reach, verbs.peekReach);
  const reach = read.state === "read" ? read.data : undefined;
  const ask = sequenceResumeAsk(a.rec, reach, { tz: a.rec.timezone, nowMs: Date.now() });
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
  if (a.asking === "end")
    return (
      <Confirm
        question={SEQUENCE_WORDS.endAsk(a.row.name)}
        detail={SEQUENCE_WORDS.endDetail}
        yes={SEQUENCE_WORDS.end}
        danger
        busy={a.busy}
        onYes={() => void a.end()}
        onNo={() => a.setAsking(null)}
        testid="sq-end"
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
  if (n.kind === "off" && n.off) {
    const mends = n.off.mends;
    if (mends === "door" && n.off.to)
      return (
        <Button size={size} {...routeDoor(n.off.to)} data-testid="sq-off-mend">
          {n.act}
        </Button>
      );
    if (mends === "end")
      return (
        <Button size={size} onClick={() => a.setAsking("end")} data-testid="sq-off-end" {...gate("approve")}>
          {n.act}
        </Button>
      );
    return null;
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
        label={a.unwritten ? a.unwritten.line : SEQUENCE_WORDS.notStarted}
        testid="sq-notice"
        fact={
          a.unwritten ? (
            <>
              <span className="sq-needs">{a.unwritten.line}</span> · {a.unwritten.fact}
            </>
          ) : (
            SEQUENCE_WORDS.notStarted
          )
        }
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
  if (a.unwritten)
    return (
      <div className="sq-foot">
        <DockSaid line={a.unwritten.line} fact={a.unwritten.fact} warn />
        <Button variant="primary" onClick={a.writeUnwritten} data-testid="sq-write-step" {...gate("approve")}>
          {a.unwritten.act}
        </Button>
      </div>
    );
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

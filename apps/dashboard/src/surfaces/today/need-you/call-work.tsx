/**
 * The rows of Need you that are not a reply to write (decision 0071; one sheet, 9 Nov 2026). A call back: what they want, their
 * real call to hear or read, and what the record holds of them, no model's notes about any of it (his call D13); the coral reads
 * the clock (his call D6); and how it went after the call, with what to remember kept on their page. A step due: the job, what
 * was last said, and what to write, which becomes its message (his call D10); Done, or Not now, which moves its day. Yesterday's
 * visit is visit-work.tsx's, a time asked for by text request-work.tsx's.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  NEED_YOU_OLD_MS,
  NEED_YOU_WORDS as W,
  NOTE_WORDS,
  callDays,
  callMomentOf,
  callWhoOf,
  stepDays,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";
import { Button, Segmented } from "../../kit";
import { Icon } from "../../kit/icon/icon";
import type { PeopleSurface } from "../../people/surface";
import { appNavigate, borrowed, gate } from "../shell";
import { AskLine } from "./ask-line";
import { rewriteDraft, useDraft } from "./drafts";
import { Acts, Done, Note, NotNow, State, Words, startKind, whoseWords, type WorkProps } from "./parts";
import { openClockOf, useThreadSaid } from "./reads";
import { useMarkDone, useNotNow, type Snoozed } from "./reply-work";
import { useRowState } from "./row-state";
import { sendWords, undoSend, useSend } from "./sends";
import { Said, SaidLines } from "./said";

/** How the call went, once it was made. */
type Went = "reached" | "no_answer" | "didnt";

/** What the record holds of a caller, in a line: when they were last here and when they are next, or that this is their first. */
function recordOf(personId: string | null): string | null {
  if (!personId) return W.call.firstTime;
  const person = borrowed<PeopleSurface>("__PEOPLE")?.rows.find((r) => r.id === personId);
  if (!person) return null;
  const parts = [
    person.lastVisit ? W.call.lastHere(person.lastVisit) : "",
    person.nextVisit ? W.call.nextHere(person.nextVisit) : "",
  ].filter(Boolean);
  return parts.join(" ") || W.call.neverHere;
}

/** The call itself: its press to hear it where it was kept, how long, and the door to read it. */
function CallRow({
  call,
  who,
  to,
  tz,
}: {
  call: NonNullable<TodayQueueRowVM["call"]>;
  who: string;
  to: string;
  tz: string;
}) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const play = () => {
    if (!audio.current) {
      const href = window.__href ? window.__href("GET calls/[id]/recording", { id: call.id }) : null;
      if (!href) return;
      audio.current = new Audio(href);
      audio.current.onended = () => setPlaying(false);
      audio.current.onerror = () => setPlaying(false);
    }
    if (playing) audio.current.pause();
    else void audio.current.play();
    setPlaying(!playing);
  };
  return (
    <div className="ny-callrow">
      {call.recorded ? (
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          className="ny-play"
          aria-label={playing ? W.call.pause : W.call.play}
          onClick={play}
        >
          <Icon name={playing ? "pause" : "play"} size={13} />
        </Button>
      ) : null}
      <span className="ny-callrow-words">
        <b>{W.call.theirCall(who)}</b>
        <span>{W.call.whenLong(call.at_ms, call.duration_ms, tz)}</span>
      </span>
      <Button variant="quiet" size="text" onClick={() => appNavigate(to)}>
        {W.call.readIt}
        <Icon name="chevron" size={11} />
      </Button>
    </div>
  );
}

/** Whether this call reads as someone selling to the business, not a customer: the one thing a model is still asked of a call. */
function useSelling(row: TodayQueueRowVM): { selling: boolean; what: string | null } {
  const want =
    row.conversationId && row.writes
      ? {
          conversationId: row.conversationId,
          kind: "brief" as const,
          forMessageId: row.writes.for_message_id,
          expected: false,
          askedAtMs: row.writes.for_message_at_ms ?? null,
        }
      : null;
  const read = useDraft(want);
  return read?.state === "pitch" ? { selling: true, what: read.what } : { selling: false, what: null };
}

/** A call back's own doing: how it went, once it was made, and what each answer does; what to remember, on their page. */
function useCallAfter(p: WorkProps, notNow: ReturnType<typeof useNotNow>) {
  const { row, tz, flash, keep, unkeep } = p;
  // Kept by the row, not by this part: the sheet on a phone draws the same row's work after the page does (row-state.ts).
  const [phase, setPhase] = useRowState<"idle" | "how" | "reached" | "again">(row.id, "phase", "idle");
  const [went, setWent] = useRowState<Went>(row.id, "went", "reached");
  const [note, setNote] = useRowState<string>(row.id, "note", "");
  const [undoOf, setUndoOf] = useRowState<Record<string, unknown> | null>(row.id, "undo", null);
  const [saving, setSaving] = useState(false);
  // Reached: the call did what they asked, so the thread goes back to the receptionist and its hold resolves with it
  // (core handBack, one transaction); a resolve alone left the thread the team's, still counted as waiting on you.
  const reached = async () => {
    if (!row.conversationId) return setPhase("reached");
    keep(row);
    const r = await commitVerb("thread_verb", { verb: "hand_back", conversation_id: row.conversationId, who: row.who });
    if (!r.ok) {
      unkeep(row);
      return flash({ tone: "danger", msg: <>{r.message}</> });
    }
    setUndoOf(r.undo);
    setPhase("reached");
  };
  const undoReached = async () => {
    if (!undoOf) return;
    const r = await undoVerb("thread_verb", undoOf);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setPhase("how");
    unkeep(row);
  };
  const again = async () => {
    const tomorrow = callDays(Date.now(), tz).find((d) => d.label === "Tomorrow");
    if (!row.person_id || !tomorrow) return void notNow.choose(notNow.choices.findIndex((c) => c.key === "tomorrow"));
    keep(row);
    const r = await commitVerb("note", {
      contact_id: row.person_id,
      body: W.call.againStep,
      team_only: true,
      due_on: tomorrow.key,
      who: row.who,
    });
    if (!r.ok) {
      unkeep(row);
      return flash({ tone: "danger", msg: <>{r.message}</> });
    }
    setUndoOf(r.undo);
    setPhase("again");
  };
  const undoAgain = async () => {
    if (!undoOf) return;
    const r = await undoVerb("note", undoOf);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setPhase("how");
    unkeep(row);
  };
  /** What they said to remember, on their page: a note, for the team alone. */
  const remember = async (words: string) => {
    if (!row.person_id) {
      flash({ tone: "warn", msg: <>{W.call.noPage}</> });
      return false;
    }
    const r = await commitVerb("note", { contact_id: row.person_id, body: words, team_only: true, who: row.who });
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message}</> });
      return false;
    }
    setNote([note, words].filter(Boolean).join(" "));
    return true;
  };
  const finish = async () => {
    setSaving(true);
    if (went === "reached") await reached();
    else if (went === "no_answer") await again();
    else setPhase("idle");
    setSaving(false);
  };
  return { phase, setPhase, went, setWent, note, undoOf, saving, undoReached, undoAgain, remember, finish };
}

/** How the call went, asked once it was made, with what to remember. Called, not drawn. */
function howItWent(p: WorkProps, after: ReturnType<typeof useCallAfter>) {
  const { row, main, may } = p;
  return (
    <>
      <State>{W.call.how}</State>
      <Segmented
        label={W.call.how}
        value={after.went}
        onValueChange={(v: Went) => after.setWent(v)}
        options={[
          { value: "reached", label: W.call.reached },
          { value: "no_answer", label: W.call.noAnswer },
          { value: "didnt", label: W.call.didNot },
        ]}
      />
      {after.note ? <Words label={W.call.onTheirPage} text={after.note} who={row.who} onChange={null} /> : null}
      {may ? <AskLine placeholder={after.note ? W.call.rememberMore : W.call.remember} onSay={after.remember} /> : null}
      <Acts
        foot={p.foot}
        end={
          <Button
            variant={main}
            disabled={after.saving}
            aria-busy={after.saving || undefined}
            onClick={() => void after.finish()}
            {...gate("approve", "say how the call went")}
          >
            {W.done}
          </Button>
        }
      />
    </>
  );
}

/** A call's presses, by what the moment asks (his call D6). Called, not drawn. */
function callActsOf(
  p: WorkProps,
  moment: ReturnType<typeof callMomentOf>,
  a: { notNow: ReturnType<typeof useNotNow>; marked: ReturnType<typeof useMarkDone>; onCall: () => void },
) {
  const { row, main, may } = p;
  const { notNow, marked, onCall } = a;
  const quiet = startKind(p.foot);
  const call = (variant: WorkProps["main"] | "quiet" | "secondary", label: string, phone = true) => (
    <Button variant={variant} href={`tel:${row.phone ?? ""}`} onClick={onCall}>
      {phone ? <Icon name="phone" size={15} /> : null}
      {label}
    </Button>
  );
  const notNowPress: ReactNode =
    row.conversationId && may ? (
      <NotNow
        who={row.who}
        choices={notNow.choices}
        caption={W.backSooner(row.who)}
        onOpen={notNow.fresh}
        onChoose={(i) => void notNow.choose(i)}
        busy={notNow.busy}
        markDone={marked.mark}
        foot={p.foot}
      />
    ) : null;
  if (moment.lead === "open")
    return (
      <Acts
        foot={p.foot}
        start={notNowPress}
        end={
          <Button variant={main} onClick={() => appNavigate(row.cta.to)}>
            {W.open}
          </Button>
        }
      />
    );
  if (moment.lead === "mark")
    return (
      <Acts
        foot={p.foot}
        start={call(quiet, W.call.callAnyway, false)}
        end={
          marked.mark ? (
            <Button variant={main} onClick={marked.mark}>
              {W.oldDone.yes}
            </Button>
          ) : null
        }
      />
    );
  if (moment.lead === "wait")
    return (
      <Acts
        foot={p.foot}
        start={call(quiet, W.call.callNow, false)}
        end={
          <Button
            variant={main}
            disabled={notNow.busy}
            onClick={() => void notNow.until(moment.until, moment.back.replace(/^Back /, ""))}
          >
            {moment.back}
          </Button>
        }
      />
    );
  return <Acts foot={p.foot} start={notNowPress} end={call(main, W.call.callWho(callWhoOf(row.who)))} />;
}

/** What a call back came to, where it has come to something. Called, not drawn. */
function callEnded(
  p: WorkProps,
  a: {
    marked: ReturnType<typeof useMarkDone>;
    snoozed: Snoozed | null;
    setSnoozed: (s: Snoozed | null) => void;
    after: ReturnType<typeof useCallAfter>;
  },
): ReactNode {
  const { row, unkeep } = p;
  const { marked, snoozed, after } = a;
  if (marked.done)
    return (
      <Done
        words={W.oldDone.done(1)}
        detail={W.oldDone.detail}
        act={{ label: W.undo, onPress: marked.undo }}
        foot={p.foot}
      />
    );
  if (snoozed)
    return (
      <Done
        tone="rest"
        words={W.notNow}
        detail={W.back(snoozed.back)}
        foot={p.foot}
        act={{
          label: W.wake,
          onPress: () =>
            void undoVerb("thread_verb", snoozed.record).then((r) => {
              if (!r.ok) return;
              a.setSnoozed(null);
              unkeep(row);
            }),
        }}
      />
    );
  if (after.phase === "reached")
    return (
      <Done
        tone="ok"
        words={W.call.reachedDone}
        foot={p.foot}
        act={after.undoOf ? { label: W.undo, onPress: () => void after.undoReached() } : null}
      />
    );
  if (after.phase === "again")
    return (
      <Done
        tone="rest"
        words={W.call.again}
        foot={p.foot}
        act={after.undoOf ? { label: W.undo, onPress: () => void after.undoAgain() } : null}
      />
    );
  return after.phase === "how" ? howItWent(p, after) : null;
}

/** A call back: what they want, their call, their record, the press the moment asks for, then how it went. */
export function CallWork(p: WorkProps) {
  const { row, tz } = p;
  const { selling } = useSelling(row);
  const [snoozed, setSnoozed] = useRowState<Snoozed | null>(row.id, "snoozed", null);
  const notNow = useNotNow(p, setSnoozed);
  const marked = useMarkDone(p);
  const after = useCallAfter(p, notNow);
  const ended = callEnded(p, { marked, snoozed, setSnoozed, after });
  if (ended) return ended;
  const moment = callMomentOf(row, { nowMs: Date.now(), tz, open: openClockOf(), selling });
  const acts = callActsOf(p, moment, { notNow, marked, onCall: () => after.setPhase("how") });
  // A phone's Up next says the row's words above it, and its one press: the sheet holds the rest.
  if (!p.whole) return acts;
  const old = row.waitedMs >= NEED_YOU_OLD_MS;
  const record = recordOf(row.person_id);
  return (
    <>
      <State small={old ? W.staleCall : null}>{row.sentence}</State>
      {selling ? <Note tone="warn">{W.call.selling}</Note> : null}
      {row.call ? <CallRow call={row.call} who={row.who} to={row.cta.to} tz={tz} /> : null}
      {record ? (
        <div className="ny-record">
          <span>{W.call.onRecord}</span>
          <span>{record}</span>
        </div>
      ) : null}
      {p.pulled ? <Said row={row} pulled /> : null}
      {acts}
    </>
  );
}

/** A step's day: moved through the note's own edit, and moved back. */
function useStepDay(p: WorkProps) {
  const { row, tz, keep, unkeep } = p;
  // Kept by the row, not by this part: the walk's sheet and the page's row say the same (row-state.ts).
  const [moved, setMoved] = useRowState<string | null>(row.id, "moved", null);
  const [refused, setRefused] = useRowState<string | null>(row.id, "refused", null);
  // The days as they stand when the menu opens (its trigger's press), and again at the press that moves it: a Today left
  // open past midnight offers, and writes, the new day's.
  const [at, setAt] = useState(() => Date.now());
  const daysAt = (ms: number) => stepDays(ms, tz).filter((d) => d.key !== "pick" && d.label !== "Today");
  const days = daysAt(at);
  // The step's day, moved through the note's own edit, as People's step sheet moves it (its author's to change): its words
  // and whom it is for sent as they are, since the door sets both from what it is sent; only the day differs. Undo moves it
  // back to today, where it was due. A refusal (a step a teammate wrote) is said in the row.
  const dueOn = async (key: string) =>
    row.step
      ? commitVerb("note", {
          contact_id: row.step.person_id,
          note_id: row.step.note_id,
          body: row.sentence,
          for_user_id: row.step.for_user_id,
          team_only: true,
          due_on: key,
          who: row.who,
        })
      : null;
  const move = async (i: number) => {
    const d = daysAt(Date.now()).find((x) => x.label === days[i]?.label) ?? days[i];
    if (!d) return;
    setRefused(null);
    keep(row);
    const r = await dueOn(d.key);
    if (r && !r.ok) {
      unkeep(row);
      return setRefused(r.message);
    }
    if (r) setMoved(d.title);
  };
  const back = async () => {
    const today = stepDays(Date.now(), tz).find((d) => d.label === "Today");
    const r = today ? await dueOn(today.key) : null;
    if (r && !r.ok) return setRefused(r.message);
    if (r) setMoved(null);
  };
  return { moved, refused, days, move, back, fresh: () => setAt(Date.now()) };
}

/** What to write for a step, as Ask makes it on this person's thread; its send finishes the job. */
function useStepWords(p: WorkProps & { onDone: () => void }, threadId: string | null) {
  const { row, flash, keep, unkeep } = p;
  const [mine, setMine] = useRowState<string | null>(row.id, "mine", null);
  const [why, setWhy] = useRowState<string | null>(row.id, "askWhy", null);
  const [writing, setWriting] = useState(false);
  const write = async (words: string) => {
    if (!threadId) return false;
    setWriting(true);
    setWhy(null);
    const r = await rewriteDraft({ conversationId: threadId, kind: "reply" }, words, mine ?? undefined);
    setWriting(false);
    if (!r.ok) {
      setWhy(r.why);
      return false;
    }
    setMine(r.words);
    return true;
  };
  const sendIt = async () => {
    if (!threadId || !mine?.trim()) return;
    keep(row);
    const r = await sendWords(row.id, {
      kind: "reply",
      payload: { conversation_id: threadId, text: mine },
      who: row.who,
      wire: "",
    });
    if (!r.ok) {
      unkeep(row);
      flash({ tone: "danger", msg: <>{r.message}</> });
    }
  };
  // Gone, the job is done: the message was the job.
  const { s: send, seconds } = useSend(row.id);
  const finished = useRef(false);
  useEffect(() => {
    if (send?.state === "gone" && !finished.current) {
      finished.current = true;
      p.onDone();
    }
  }, [send?.state, p]);
  return { mine, setMine, why, writing, write, sendIt, send, seconds };
}

/**
 * A step due: the job, what was last said to them, and what to write, which Ask makes into a message; Send finishes the job.
 * Done (the page's own, with its toast and Undo), or Not now, which moves its day.
 */
export function StepWork(p: WorkProps & { onDone: () => void }) {
  const { row, main, may, unkeep } = p;
  const day = useStepDay(p);
  const person = borrowed<PeopleSurface>("__PEOPLE")?.rows.find((r) => r.id === row.person_id);
  const threadId = person?.threadId?.replace(/^th-/, "") ?? null;
  const words = useStepWords(p, threadId);
  const { mine } = words;
  if (day.moved)
    return (
      <Done
        tone="rest"
        words={W.step.moved(day.moved)}
        act={{ label: W.undo, onPress: () => void day.back() }}
        foot={p.foot}
      />
    );
  if (words.send?.state === "going")
    return (
      <Done
        words={W.sendingIn(words.seconds)}
        detail={row.who}
        act={{ label: W.undo, onPress: () => void undoSend(row.id).then(() => unkeep(row)) }}
        foot={p.foot}
      />
    );
  const whoseMine = whoseWords(mine ?? "", mine, () => words.setMine(null));
  return (
    <>
      {p.whole ? <State>{row.sentence}</State> : null}
      {p.whole && threadId ? <ThreadLast conversationId={threadId} pulled={p.pulled} /> : null}
      {mine !== null ? (
        <Words
          label={W.drafted}
          asks
          text={mine}
          who={row.who}
          onChange={may ? words.setMine : null}
          onRestore={whoseMine.onRestore}
          busy={words.writing}
        />
      ) : null}
      {p.whole && may && threadId ? (
        <AskLine
          placeholder={mine !== null ? W.say.tell : W.step.write(row.who)}
          onSay={words.write}
          busy={words.writing}
          why={words.why}
        />
      ) : null}
      {day.refused ? <Note tone="danger">{day.refused}</Note> : null}
      <Acts
        foot={p.foot}
        start={
          may ? (
            <NotNow
              who={row.who}
              label={W.step.moveFor}
              choices={day.days.map((d) => ({ label: d.label, when: d.title }))}
              caption={null}
              onOpen={day.fresh}
              onChoose={(i) => void day.move(i)}
              foot={p.foot}
            />
          ) : null
        }
        end={
          mine?.trim() ? (
            <Button variant={main} onClick={() => void words.sendIt()} {...gate("approve", "send a reply")}>
              {W.step.sendDone}
            </Button>
          ) : (
            // Several rows say Done: a reader hears whose, as the thread header's does (NOTE_WORDS.markDone).
            <Button
              variant={main}
              onClick={p.onDone}
              {...gate("approve", "mark a step done")}
              aria-label={NOTE_WORDS.markDone(row.sentence)}
            >
              {row.cta.label}
            </Button>
          )
        }
      />
    </>
  );
}

/** What was last said to the person a to-do is about, read as the sheet opens on them. */
function ThreadLast({ conversationId, pulled }: { conversationId: string; pulled?: boolean }) {
  const said = useThreadSaid(conversationId);
  return said?.length ? <SaidLines said={said} pulled={pulled} /> : null;
}

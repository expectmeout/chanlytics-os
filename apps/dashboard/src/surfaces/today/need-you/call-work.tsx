/**
 * The rows of Need you that are not a reply to write (decision 0071, E6), each with what Ask prepared and its follow
 * through in the row: a call back (Ask's brief, Call from the member's own phone, then how it went: Reached hands the
 * thread back to the receptionist, its hold resolved, and No answer puts a call on tomorrow's steps); a time picked by
 * text (Booked it, and the confirmation it drafts sent from the row); a step due (Done, or Not now, which moves its day).
 * Yesterday's visit is visit-work.tsx's.
 */
import { useState } from "react";
import { BOOKING_REQUEST_WORDS, NEED_YOU_WORDS as W, NOTE_WORDS, callDays, stepDays } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/legacy-bridge/verbs/commit";
import { answerRequest } from "../../booking-request";
import { Button } from "../../kit";
import { appNavigate, gate } from "../shell";
import { useDraft } from "./drafts";
import { Acts, BriefBox, Done, Note, NotNow, Writing, type WorkProps } from "./parts";
import { ReplyWork, useNotNow, type Snoozed } from "./reply-work";
import { useRowState } from "./row-state";

/** A call back: Ask's brief, Call, then how it went. */
export function CallWork(p: WorkProps) {
  const { row, main, may, tz, flash, keep } = p;
  const want =
    row.conversationId && row.writes
      ? { conversationId: row.conversationId, kind: "brief" as const, forMessageId: row.writes.for_message_id }
      : null;
  const draft = useDraft(want, may);
  // Kept by the row, not by this part: the sheet on a phone draws the same row's work after the page does (row-state.ts).
  const [phase, setPhase] = useRowState<"idle" | "how" | "reached" | "again">(row.id, "phase", "idle");
  const [undoOf, setUndoOf] = useRowState<Record<string, unknown> | null>(row.id, "undo", null);
  const [snoozed, setSnoozed] = useRowState<Snoozed | null>(row.id, "snoozed", null);
  const notNow = useNotNow(p, setSnoozed);

  // Reached: the call did what they asked, so the thread goes back to the receptionist and its hold resolves with it
  // (core handBack, one transaction); a resolve alone left the thread the team's, still counted as waiting on you.
  const reached = async () => {
    if (!row.conversationId) return setPhase("reached");
    keep(row);
    const r = await commitVerb("thread_verb", { verb: "hand_back", conversation_id: row.conversationId, who: row.who });
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setUndoOf(r.undo);
    setPhase("reached");
  };
  const undoReached = async () => {
    if (!undoOf) return;
    const r = await undoVerb("thread_verb", undoOf);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    else setPhase("how");
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
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setUndoOf(r.undo);
    setPhase("again");
  };
  const undoAgain = async () => {
    if (!undoOf) return;
    const r = await undoVerb("note", undoOf);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    else setPhase("how");
  };

  if (snoozed)
    return (
      <Done
        tone="rest"
        words={W.notNow}
        detail={W.back(snoozed.back)}
        act={{
          label: W.wake,
          onPress: () =>
            void undoVerb("thread_verb", snoozed.record).then((r) => (r.ok ? setSnoozed(null) : undefined)),
        }}
      />
    );
  if (phase === "reached")
    return (
      <Done
        tone="ok"
        words={W.call.reachedDone}
        act={undoOf ? { label: W.undo, onPress: () => void undoReached() } : null}
      />
    );
  if (phase === "again")
    return (
      <Done tone="rest" words={W.call.again} act={undoOf ? { label: W.undo, onPress: () => void undoAgain() } : null} />
    );
  if (phase === "how")
    return (
      <>
        <Note>{W.call.how}</Note>
        <div className="ny-picks">
          <Button onClick={() => void reached()} {...gate("approve", "hand the thread back")}>
            {W.call.reached}
          </Button>
          <Button onClick={() => void again()} {...gate("approve", "set a step")}>
            {W.call.noAnswer}
          </Button>
          <Button variant="quiet" onClick={() => setPhase("idle")}>
            {W.call.didNot}
          </Button>
        </div>
      </>
    );
  return (
    <>
      {draft?.state === "ready" && draft.draft.words.brief ? (
        <BriefBox brief={draft.draft.words.brief} onRead={p.read} />
      ) : draft?.state === "writing" ? (
        <Writing />
      ) : null}
      <Acts
        foot={p.foot}
        start={
          row.conversationId && may ? (
            <NotNow
              who={row.who}
              choices={notNow.choices}
              caption={W.backSooner(row.who)}
              onOpen={notNow.fresh}
              onChoose={(i) => void notNow.choose(i)}
              busy={notNow.busy}
            />
          ) : null
        }
        end={
          row.phone ? (
            <Button variant={main} href={`tel:${row.phone}`} onClick={() => setPhase("how")}>
              {W.call.call}
            </Button>
          ) : (
            <Button variant={main} onClick={() => appNavigate(row.cta.to)}>
              {W.open}
            </Button>
          )
        }
      />
    </>
  );
}

/** A time the customer picked by text: Booked it, and the confirmation it drafts, sent from the row; or Can't. */
export function RequestWork(p: WorkProps) {
  const { row, main, may, flash, keep } = p;
  const [said, setSaid] = useRowState<{ booked: boolean; reply: string | null; receipt: string } | null>(
    row.id,
    "said",
    null,
  );
  const [busy, setBusy] = useState(false);
  const answer = async (booked: boolean) => {
    if (!row.request) return;
    setBusy(true);
    keep(row);
    const r = await answerRequest(row.request.conversationId, booked, row.who);
    setBusy(false);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setSaid({ booked, reply: r.reply, receipt: r.receipt });
  };
  if (said?.booked && said.reply)
    return (
      <ReplyWork
        {...p}
        row={{ ...row, prepared: said.reply }}
        what={W.booked.confirmation}
        start={
          <Button variant="quiet" onClick={() => setSaid({ ...said, reply: null })}>
            {W.booked.dontSend}
          </Button>
        }
      />
    );
  if (said) return <Done words={said.receipt} />;
  return (
    <Acts
      foot={p.foot}
      start={
        <Button
          variant="quiet"
          onClick={() => void answer(false)}
          disabled={busy}
          data-testid="queue-request-cant"
          {...gate("approve", BOOKING_REQUEST_WORDS.gate)}
          aria-label={`${BOOKING_REQUEST_WORDS.cant_it}: ${row.who}`}
        >
          {BOOKING_REQUEST_WORDS.cant_it}
        </Button>
      }
      end={
        <Button
          variant={main}
          onClick={() => void answer(true)}
          disabled={busy || !may}
          aria-busy={busy || undefined}
          data-testid="queue-request-booked"
          {...gate("approve", BOOKING_REQUEST_WORDS.gate)}
          aria-label={`${BOOKING_REQUEST_WORDS.booked_it}: ${row.who}`}
        >
          {BOOKING_REQUEST_WORDS.booked_it}
        </Button>
      }
    />
  );
}

/** A step due: Done (the page's own, with its toast and Undo), or Not now, which moves its day. */
export function StepWork(p: WorkProps & { onDone: () => void }) {
  const { row, main, may, tz, keep } = p;
  const [moved, setMoved] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
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
    if (r && !r.ok) return setRefused(r.message);
    if (r) setMoved(d.title);
  };
  const back = async () => {
    const today = stepDays(Date.now(), tz).find((d) => d.label === "Today");
    const r = today ? await dueOn(today.key) : null;
    if (r && !r.ok) return setRefused(r.message);
    if (r) setMoved(null);
  };
  if (moved)
    return <Done tone="rest" words={W.step.moved(moved)} act={{ label: W.undo, onPress: () => void back() }} />;
  return (
    <>
      {refused ? <Note tone="danger">{refused}</Note> : null}
      <Acts
        foot={p.foot}
        start={
          may ? (
            <NotNow
              who={row.who}
              label={W.step.moveFor}
              choices={days.map((d) => ({ label: d.label, when: d.title }))}
              caption={null}
              onOpen={() => setAt(Date.now())}
              onChoose={(i) => void move(i)}
            />
          ) : null
        }
        end={
          // Several rows say Done: a reader hears whose, as the thread header's does (NOTE_WORDS.markDone).
          <Button
            variant={main}
            onClick={p.onDone}
            {...gate("approve", "mark a step done")}
            aria-label={NOTE_WORDS.markDone(row.sentence)}
          >
            {row.cta.label}
          </Button>
        }
      />
    </>
  );
}

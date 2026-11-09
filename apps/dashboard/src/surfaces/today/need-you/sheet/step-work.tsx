/**
 * A step due (one sheet, 9 Nov 2026): the job, what was last said to them, and what to write, which Ask makes into a message on
 * their thread and whose send finishes the job (his call D10); Done, with the page's toast and Undo, or Not now, which moves its day.
 */
import { useEffect, useRef, useState } from "react";
import { NEED_YOU_WORDS as W, NOTE_WORDS, stepDays } from "@chanlytics/contracts";
import { commitVerb } from "@/bridge/verbs/commit";
import { Button } from "../../../kit";
import type { PeopleSurface } from "../../../people/surface";
import { borrowed, gate } from "../../shell";
import { rewriteDraft } from "../drafts";
import { Acts, Done, Note, NotNow, State, Words, whoseWords, type WorkProps } from "../parts";
import { useRowState } from "../row-state";
import { sendWords, undoSend, useSend } from "../sends";
import { SayToAsk } from "./ask-line";
import { useThreadSaid } from "./reads";
import { SaidLines } from "./said";

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
        <SayToAsk
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

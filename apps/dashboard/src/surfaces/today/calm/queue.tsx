/**
 * Need you's rows as Today, calm draws them (19 Nov 2026, D1): the one in the page's card, drawn whole with the row's own
 * work and presses (need-you/rows.tsx `workOf`, unchanged: a reply is still written in its conversation, a reply going on
 * its own keeps its Stop, a visit is still asked in place), and every other row a line whose press opens it the way its
 * row always did: their conversation where its answer is written there, its own door where it has no work on Today, and
 * for the rest it rises into the card.
 */
import { useEffect, useState } from "react";
import { NEED_YOU_WORDS as W, NOTE_WORDS, addressOf, namesAPerson, type TodayQueueRowVM } from "@chanlytics/contracts";
import { routeDoor } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Face, type FaceProps } from "../../kit/face/face";
import { SAYS_WHEN } from "../../kit/says-when";
import { Done } from "../need-you/parts";
import { openInThread, VerbWords, type NeedYouRowsCtx } from "../need-you/people-rows";
import { useDraft } from "../need-you/drafts";
import { answersInThread, draftWantOf, shortLabel, workOf, worksInPlace } from "../need-you/rows";
import { TODAY_LINE_WORDS } from "../model/lines";
import { rowWords } from "../need-you/sheet/row-words";
import { useTodayOnPhone } from "../phone";
import { Lead, CardActs } from "./lead";
import { CalmRow, type CalmLine } from "./lines";

/** Who a row is about, as the kit's face draws them: a person by what contracts says they are, else its initials. */
const queueFaceOf = (row: TodayQueueRowVM): FaceProps =>
  namesAPerson(row) ? { person: { name: row.who, initials: row.initials } } : { initials: row.initials };

/** A row's one sentence as a line or a title says it: their own words in quotes, after what they are about. */
function queueSaidOf(row: TodayQueueRowVM): string {
  const words = rowWords(row);
  const line = words.quoted ? `“${words.sentence}”` : words.sentence;
  return words.lead ? `${words.lead}: ${line}` : line;
}

/** The card's words for what its press does. */
const CARD_WORDS = TODAY_LINE_WORDS.card;

/** The dot between two facts of a row's sentence, as the rows' words join them. */
const FACT_DOT = " · ";

/** A sentence with the words that are its warning in the warning's tone (a to-do's "overdue since Thu"), the rest plain. */
function toned(text: string, on: string | null, tone: "warn" | "danger" | null) {
  const at = on && tone ? text.indexOf(on) : -1;
  if (at < 0 || !on) return text;
  return (
    <>
      {text.slice(0, at)}
      <span data-tone={tone ?? undefined}>{on}</span>
      {text.slice(at + on.length)}
    </>
  );
}

/** Their conversation's address, where a row's answer is written there (need-you/rows.ts answersInThread). */
const queueThreadOf = (row: TodayQueueRowVM, ctx: NeedYouRowsCtx): string | null =>
  answersInThread(row) && row.conversationId && !ctx.kept.has(row.id) ? row.conversationId : null;

/**
 * A to-do past its day, as its line says it at its end, where a wait stands (the second look, L2): the day it was due,
 * "Sat", in the wait's amber, so the line under its name says whose number and whose to-do it is and is never cut. Null
 * for any other row, and for one not late.
 */
const lateOf = (row: TodayQueueRowVM): string | null =>
  row.kind === "step" && row.warn ? (row.step?.late ?? null) : null;

/**
 * Why the card is yours and what its press does (Working for you, W20): why AI did not finish it ("AI held it: booking a
 * time needs you.", contracts heldBecause; else the row's own few words), then, where AI wrote the reply, that it is
 * there to read, and on a call back, that AI cannot make the call. What happened is the card's title. Null with neither.
 */
function cardWhyOf(row: TodayQueueRowVM, drafted: boolean): string | null {
  const press = row.kind === "callback" ? CARD_WORDS.cantCall : drafted && !row.failed ? CARD_WORDS.drafted : null;
  const held = row.failed ? (row.why ?? null) : (row.heldBecause ?? row.why ?? null);
  return [held, press].filter(Boolean).join(" ") || null;
}

/**
 * A row of Need you as a line: who, what they said, how long. Its press is the row's own: their conversation, with AI's
 * draft asked for its box (D8 of 17 Nov); its door, where nothing of it is worked on Today; else it takes the card.
 */
export function queueLine(row: TodayQueueRowVM, ctx: NeedYouRowsCtx): CalmLine {
  const words = rowWords(row);
  const conversationId = queueThreadOf(row, ctx);
  // A visit to mark says when it was ("Wed, Nov 18, 10:30 – 11 AM"), not how long anyone has waited: that is its first
  // fact under the name, so the name keeps its room, and the slot at the line's end stays for a wait.
  const was = row.kind === "visit" && words.wait ? words.wait.words : null;
  const late = lateOf(row);
  const base = {
    first: { face: queueFaceOf(row) },
    name: words.trail ? `${words.name} · ${words.trail}` : words.name,
    // What was said, fact by fact (who, since when, whose): each whole or not there, the warning in its tone.
    facts: [
      ...(was ? [was] : []),
      ...queueSaidOf(row)
        .split(FACT_DOT)
        // How late a to-do is stands at the line's end, said once.
        .filter((fact) => !(late && fact === words.saidToneOn))
        .map((fact) => toned(fact, words.saidToneOn, words.saidTone)),
    ],
    wait: late ? { words: late, long: true } : was ? null : words.wait,
    // One line for who or what, one for what was said: the whole of it is in the card, or behind the press.
    tight: true,
    testid: words.testid,
  };
  if (conversationId) {
    const to = addressOf({ kind: "conversation", id: conversationId });
    const door = routeDoor(to, () => openInThread(row, conversationId, ctx.nav));
    return { ...base, door };
  }
  if (!worksInPlace(row)) return { ...base, door: routeDoor(row.cta.to, ctx.nav) };
  return { ...base, press: () => ctx.open(row.id) };
}

/**
 * A row's own work, as its part draws it (need-you/rows.tsx `workOf`): its presses while it waits, and once it is
 * finished what became of it, with its Undo. Its words are a title over it already (the card's, a line's name), so the
 * work stands under them and never under a second copy of what was said.
 */
const workIn = (row: TodayQueueRowVM, ctx: NeedYouRowsCtx, main: "primary" | "secondary", titled = false) =>
  workOf(
    row,
    {
      main,
      may: ctx.may,
      tz: ctx.tz,
      flash: ctx.flash,
      keep: ctx.keep,
      unkeep: ctx.unkeep,
      read: null,
      whole: false,
      titled,
    },
    { word: ctx.word, stepDone: () => ctx.stepDone(row) },
  );

/**
 * Whether a line drawn a moment ago has had its first frame: folded on it, open from the next, so it folds open where it
 * stands. A finished line is drawn only after a press, never as Today opens.
 */
function useArrived(): boolean {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    // No frames to wait for (a server, a test): it is open at once.
    if (typeof requestAnimationFrame !== "function") {
      setArrived(true);
      return undefined;
    }
    // Two frames: the first paints it folded, the second opens it, so the fold has a start to move from.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setArrived(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  return arrived;
}

/**
 * A row finished on this visit, as a line (D6: a finished thing says so where it stands): who or what it was, and under
 * it what became of it, with its Undo, for as long as the page is open.
 */
export function ActedLine({ row, ctx }: { row: TodayQueueRowVM; ctx: NeedYouRowsCtx }) {
  const words = rowWords(row);
  const arrived = useArrived();
  return (
    <CalmRow
      first={{ face: queueFaceOf(row) }}
      name={words.name}
      // It opens where it stands, as a line folds (the second look, M1), never landing whole in one frame.
      folded={!arrived}
      tight
      under={<div className="calm-under calm-receipt">{workIn(row, ctx, "secondary")}</div>}
      testid={words.testid}
    />
  );
}

/**
 * The row in the card: who and how long, what they said, why it was handed to you, then its press where its answer is
 * written in its conversation, else its work, in place, as the row drew it.
 */
export function QueueLead({
  row,
  ctx,
  holder,
  done = false,
}: {
  row: TodayQueueRowVM;
  ctx: NeedYouRowsCtx;
  holder: "queue" | "todo";
  /**
   * Finished a moment ago by a press in the card (D6): it says so where its presses stood, for a beat, before the next
   * thing takes the card. A row kept in its place says what became of it itself; one that left its list says Done.
   */
  done?: boolean;
}) {
  const phone = useTodayOnPhone();
  const words = rowWords(row);
  const coral = row.id === ctx.coral;
  const conversationId = queueThreadOf(row, ctx);
  // A person waiting is who, then what they said; a to-do is what to do, then whose it is and since when.
  const todo = holder === "todo";
  const kind = (
    <>
      <Face {...queueFaceOf(row)} size="sm" />
      {todo ? <span>{W.todo.title}</span> : <b className="calm-who">{words.name}</b>}
      {words.wait ? (
        <span className="calm-wait tabular" data-long={words.wait.long || undefined} {...SAYS_WHEN}>
          {words.wait.words}
        </span>
      ) : null}
    </>
  );
  const draft = useDraft(draftWantOf(row));
  const reason = todo
    ? toned(queueSaidOf(row), words.saidToneOn, words.saidTone)
    : cardWhyOf(row, draft?.state === "ready");
  return (
    <Lead
      holder={holder}
      id={row.id}
      label={words.name}
      kind={kind}
      title={
        // A to-do's words open what it is about, as its row's did ("Call Di" opens Di: their number is there).
        todo && row.cta.to ? (
          <a className="calm-title-door" {...routeDoor(row.cta.to, ctx.nav)} data-testid="today-card-door">
            {words.name}
          </a>
        ) : todo ? (
          words.name
        ) : (
          queueSaidOf(row)
        )
      }
      why={reason}
      testid={words.testid}
    >
      {done ? (
        <div className="calm-work" data-testid="today-card-done">
          {ctx.kept.has(row.id) ? workIn(row, ctx, "secondary") : <Done words={NOTE_WORDS.done} />}
        </div>
      ) : conversationId ? (
        <CardActs>
          <Button
            variant={coral ? "primary" : "secondary"}
            size={phone ? "touch" : "lg"}
            onClick={() => openInThread(row, conversationId, ctx.nav)}
            data-testid="today-card-act"
          >
            <VerbWords row={row} words={shortLabel(row)} />
          </Button>
        </CardActs>
      ) : (
        <div className="calm-work" data-testid="today-card-work">
          {workIn(row, ctx, coral ? "primary" : "secondary", true)}
        </div>
      )}
    </Lead>
  );
}

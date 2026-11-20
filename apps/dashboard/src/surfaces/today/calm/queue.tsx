/**
 * Need you's rows as Today, calm draws them (19 Nov 2026, D1): the one in the page's card, drawn whole with the row's own
 * work and presses (need-you/rows.tsx `workOf`, unchanged: a reply is still written in its conversation, a reply going on
 * its own keeps its Stop, a visit is still asked in place), and every other row a line whose press opens it the way its
 * row always did: their conversation where its answer is written there, its own door where it has no work on Today, and
 * for the rest it rises into the card.
 */
import { NEED_YOU_WORDS as W, NOTE_WORDS, addressOf, namesAPerson, type TodayQueueRowVM } from "@chanlytics/contracts";
import { routeDoor } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Face, type FaceProps } from "../../kit/face/face";
import { SAYS_WHEN } from "../../kit/says-when";
import { Done } from "../need-you/parts";
import { openInThread, VerbWords, type NeedYouRowsCtx } from "../need-you/people-rows";
import { answersInThread, shortLabel, workOf, worksInPlace } from "../need-you/rows";
import { rowWords } from "../need-you/sheet/row-words";
import { useTodayOnPhone } from "../phone";
import { Lead, LeadActs } from "./lead";
import { CalmRow, type CalmLine } from "./lines";

/** Who a row is about, as the kit's face draws them: a person by what contracts says they are, else its initials. */
const faceOf = (row: TodayQueueRowVM): FaceProps =>
  namesAPerson(row) ? { person: { name: row.who, initials: row.initials } } : { initials: row.initials };

/** A row's one sentence as a line or a title says it: their own words in quotes, after what they are about. */
function saidOf(row: TodayQueueRowVM): string {
  const words = rowWords(row);
  const said = words.quoted ? `“${words.sentence}”` : words.sentence;
  return words.lead ? `${words.lead}: ${said}` : said;
}

/** The dot between two facts of a row's sentence, as the rows' words join them. */
const FACT_DOT = " · ";

/** A sentence with the words that are its warning in the warning's tone (a to-do's "overdue since Thu"), the rest plain. */
function toned(said: string, on: string | null, tone: "warn" | "danger" | null) {
  const at = on && tone ? said.indexOf(on) : -1;
  if (at < 0 || !on) return said;
  return (
    <>
      {said.slice(0, at)}
      <span data-tone={tone ?? undefined}>{on}</span>
      {said.slice(at + on.length)}
    </>
  );
}

/** Their conversation's address, where a row's answer is written there (need-you/rows.ts answersInThread). */
const threadOf = (row: TodayQueueRowVM, ctx: NeedYouRowsCtx): string | null =>
  answersInThread(row) && row.conversationId && !ctx.kept.has(row.id) ? row.conversationId : null;

/**
 * A row of Need you as a line: who, what they said, how long. Its press is the row's own: their conversation, with AI's
 * draft asked for its box (D8 of 17 Nov); its door, where nothing of it is worked on Today; else it takes the card.
 */
export function queueLine(row: TodayQueueRowVM, ctx: NeedYouRowsCtx): CalmLine {
  const words = rowWords(row);
  const conversationId = threadOf(row, ctx);
  const base = {
    first: { face: faceOf(row) },
    name: words.trail ? `${words.name} · ${words.trail}` : words.name,
    // What was said, fact by fact (who, since when, whose): each whole or not there, the warning in its tone.
    facts: saidOf(row)
      .split(FACT_DOT)
      .map((fact) => toned(fact, words.saidToneOn, words.saidTone)),
    wait: words.wait,
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
const workIn = (row: TodayQueueRowVM, ctx: NeedYouRowsCtx, main: "primary" | "secondary") =>
  workOf(
    row,
    { main, may: ctx.may, tz: ctx.tz, flash: ctx.flash, keep: ctx.keep, unkeep: ctx.unkeep, read: null, whole: false },
    { word: ctx.word, stepDone: () => ctx.stepDone(row) },
  );

/**
 * A row finished on this visit, as a line (D6: a finished thing says so where it stands): who or what it was, and under
 * it what became of it, with its Undo, for as long as the page is open.
 */
export function ActedLine({ row, ctx }: { row: TodayQueueRowVM; ctx: NeedYouRowsCtx }) {
  const words = rowWords(row);
  return (
    <CalmRow
      first={{ face: faceOf(row) }}
      name={words.name}
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
  const conversationId = threadOf(row, ctx);
  // A person waiting is who, then what they said; a to-do is what to do, then whose it is and since when.
  const todo = holder === "todo";
  const kind = (
    <>
      <Face {...faceOf(row)} size="sm" />
      {todo ? <span>{W.todo.title}</span> : <b className="calm-who">{words.name}</b>}
      {words.wait ? (
        <span className="calm-wait tabular" data-long={words.wait.long || undefined} {...SAYS_WHEN}>
          {words.wait.words}
        </span>
      ) : null}
    </>
  );
  const why = todo ? toned(saidOf(row), words.saidToneOn, words.saidTone) : (row.why ?? null);
  return (
    <Lead
      holder={holder}
      id={row.id}
      label={words.name}
      kind={kind}
      title={todo ? words.name : saidOf(row)}
      why={why}
      testid={words.testid}
    >
      {done ? (
        <div className="calm-work" data-testid="today-card-done">
          {ctx.kept.has(row.id) ? workIn(row, ctx, "secondary") : <Done words={NOTE_WORDS.done} />}
        </div>
      ) : conversationId ? (
        <LeadActs>
          <Button
            variant={coral ? "primary" : "secondary"}
            size={phone ? "touch" : "lg"}
            onClick={() => openInThread(row, conversationId, ctx.nav)}
            data-testid="today-card-act"
          >
            <VerbWords row={row} words={shortLabel(row)} />
          </Button>
        </LeadActs>
      ) : (
        <div className="calm-work" data-testid="today-card-work">
          {workIn(row, ctx, coral ? "primary" : "secondary")}
        </div>
      )}
    </Lead>
  );
}

/**
 * Ask found (Today in three zones, 2 Nov 2026), Today's third zone: what is worth a look and waits on nobody, one ranked
 * list of three (contracts askFoundOf): what the workspace's own counts say leaks, what Ask noticed, a call worth a listen,
 * a lead who tried their receptionist, and Ask's ideas from its morning, last. Each row says what it is, its one act and
 * its sentence; a press on the sentence opens why (the arithmetic, a campaign's rules, what Approve changes), who a rule
 * names and Ask why, beside Not today, which rests the row a week for the member (views.ask_found) and, for an idea, is
 * kept on its turn for everyone. A card's act is its own verb walk (need-you/idea-work.tsx useIdeaActs), or the door it
 * names; what it came to is said in its place with its Undo, and the row is kept there for the visit. Under them, what
 * came of an idea approved lately. Where Need you draws no pane it leads the page, wide, its rows three across, and its
 * first act takes the coral where nothing before it in the walk did; else it stands under the day and takes none. Both are
 * Today's arrangement's to say (today/arrangement.ts), which reads what Ask found will draw (useFoundModel) in the same
 * pass as the pane. A read it ranks from that failed is said in its place.
 */
import { useState } from "react";
import { MIN_MS, NEED_YOU_WORDS as W, needYouGroupsOf, type AskMorningCard } from "@chanlytics/contracts";
import { ASK_FOUND_WORDS as F, askFoundOf, type AskFoundRowVM } from "./found-rows";
import type { PeopleListsLike } from "../leaks";
import { refreshSurfaces } from "@/bridge/surface-runner";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { usePartShown, useSurface, useSurfaceFailed, useWaitFor } from "../../use-surface";
import { askMorningOverride } from "../ask-morning-surface";
import { TODAY_HELPERS } from "../helpers";
import { Done } from "../need-you/parts";
import { CardSheet, dismissedOnTurn, restoreOnTurn, useIdeaActs } from "../need-you/idea-work";
import { useRests } from "../need-you/rests";
import { useRowState } from "../need-you/row-state";
import { appNavigate, askAbout, borrowed, doorGlyph, gate, useMoved, useToast, type Flash } from "../shell";

/** How often Ask's morning is read again while Ask writes it: a turn takes up to two minutes. */
const MORNING_POLL_MS = 8_000;

/** The rules asked for whole (contracts todayLeaks' cap): Ask found's own ranking draws three of everything. */
const EVERY_RULE = Number.POSITIVE_INFINITY;

/** Ask's morning read again while it writes, through the runner at the one wait's pace; the surface stops the wait when it lands. */
function useMorningWait(writing: boolean) {
  useWaitFor(writing, { everyMs: MORNING_POLL_MS, read: () => refreshSurfaces([askMorningOverride]) });
}

/** Where Ask found keeps what was pressed this visit, among the rows' states. */
const FOUND_STATE = "ask-found";
const NO_CARDS: readonly AskMorningCard[] = [];

type Headline = NonNullable<Parameters<typeof TODAY_HELPERS.leaks>[0]>;
type NoReply = Parameters<typeof TODAY_HELPERS.withoutWrongPerson>[0];
type Rules = ReturnType<typeof TODAY_HELPERS.leaks>["rows"];

const NO_REPLY: NoReply = [];

/** The rules last worked out, with the reads and the minute they were worked out from. */
let rulesHeld: { headline: Headline; people: PeopleListsLike; noReply: NoReply; minute: number; rows: Rules } | null =
  null;

/**
 * Every rule that holds over the page's reads, worked out once a read and a minute: the page's arrangement and the pane
 * both read Ask found in the same pass, and People's rows are everyone the workspace has.
 */
function rulesOf(headline: Headline, people: PeopleListsLike, noReply: NoReply): Rules {
  const minute = Math.floor(Date.now() / MIN_MS);
  const held = rulesHeld;
  if (
    held &&
    held.headline === headline &&
    held.people === people &&
    held.noReply === noReply &&
    held.minute === minute
  )
    return held.rows;
  const rows = TODAY_HELPERS.leaks(headline, people, TODAY_HELPERS.withoutWrongPerson(noReply), {
    max: EVERY_RULE,
    nowMs: minute * MIN_MS,
  }).rows;
  rulesHeld = { headline, people, noReply, minute, rows };
  return rows;
}

/**
 * The rows of Ask found, how a row is set aside for a week and how a card pressed keeps its place: everything it reads,
 * the page already holds. `broke`: a read the rules stand on that failed (People first: nothing else on the page says it,
 * where the foot says Reports), said in Ask found's place. `draws`: whether the pane draws (a row, or a read that failed),
 * and `acts`: whether it draws a row whose act may be the coral. Read by the page's arrangement as well as the pane.
 */
export function useFoundModel() {
  useMoved(["today", "ask_morning", "people", "reach_out_replies"]);
  const morning = surfaceValue("ask_morning")?.dto ?? null;
  const headline = useSurface("reports_headline");
  const people = borrowed<PeopleListsLike>("__PEOPLE");
  const headlineFailed = useSurfaceFailed("reports_headline");
  const peopleFailed = useSurfaceFailed("people");
  const vm = surfaceValue("today");
  // Kept for the visit by Ask found, not by the part drawing it: the pane moves between the columns as Need you comes and
  // goes (zones/page.tsx), and what was pressed stays pressed (row-state.ts).
  const { rested, today, rest: restIt } = useRests();
  // The cards pressed this visit, kept in their place: a card with an outcome leaves the morning's next read, and its
  // receipt and Undo with it (morning.ts waitingCards).
  const [kept, setKept] = useRowState<readonly AskMorningCard[]>(FOUND_STATE, "kept", NO_CARDS);
  const broke = !people && peopleFailed ? "People" : !headline && headlineFailed ? "Reports" : null;
  // Every rule that holds, never the old pane's two: Ask found ranks them with the rest, draws three, and says the others.
  const rules = headline && people ? rulesOf(headline, people, vm?.noReply ?? NO_REPLY) : [];
  const read = morning?.offered ? [...(morning.findings ?? []), ...morning.cards] : [];
  const found = askFoundOf({
    rules,
    cards: [...kept, ...read.filter((c) => !kept.some((k) => k.id === c.id))],
    found: vm ? needYouGroupsOf(TODAY_HELPERS.withReplies(vm.queue.rows)).found : [],
    lately: morning?.lately ?? [],
    rested,
    today,
  });
  const rest = (key: string, flash: (f: Flash) => void, onUndone: () => void) => restIt({ key, flash, onUndone });
  const keep = (card: AskMorningCard) => setKept((was) => (was.some((k) => k.id === card.id) ? was : [...was, card]));
  return {
    found,
    morning,
    rest,
    keep,
    broke,
    // Drawn once the rules' reads are in, or one of them has failed: Today's last part, People being its heaviest read.
    shown: !!broke || (!!headline && !!people),
    draws: found.rows.length > 0 || !!broke,
    acts: found.rows.length > 0,
  };
}

/** What a row's parts are handed: its place, whether its act is the coral, and how it is set aside. */
interface RowPorts {
  row: AskFoundRowVM;
  coral: boolean;
  open: boolean;
  onToggle: () => void;
  rest: (onUndone: () => void) => Promise<void>;
  flash: (f: Flash) => void;
}

/** A row's tag, with Ask's three where it is Ask's own idea. Called, not drawn. */
const foundTag = (row: AskFoundRowVM) => (
  <span className="tz-idea-kind">
    {row.source === "idea" ? <Icon name="three" size={12} /> : null}
    {row.tag}
  </span>
);

/** Why, as a press opens it: a new campaign's rules where its card has them; else the arithmetic, or what Approve changes. */
function foundWhy(row: AskFoundRowVM) {
  const sheet = row.card?.line && row.card.sheet?.rows.length ? row.card : null;
  return sheet ? <CardSheet card={sheet} /> : row.why ? <small>{row.why}</small> : <small />;
}

/** Who a rule names, under why: the words that say who they are, then each a door to their page. Called, not drawn. */
function foundPeople(row: AskFoundRowVM) {
  if (!row.people.length) return null;
  return (
    <span className="tz-idea-people" data-testid="today-found-people">
      {row.peopleLead ? <small>{row.peopleLead}</small> : null}
      {row.people.map((p) => (
        <Button key={p.id} variant="quiet" size="sm" onClick={() => appNavigate(p.to)} title={p.title}>
          {p.name}
        </Button>
      ))}
    </span>
  );
}

/**
 * A row's sentence, which opens on a press: why, beside Ask why (a rule's) and Not today, and under them who it names.
 * Called, not drawn.
 */
function foundSentence(p: RowPorts, notToday: () => void, busy = false) {
  const ask = p.row.ask;
  return (
    <>
      <Button
        variant="quiet"
        size="text"
        className="tz-idea-s"
        aria-expanded={p.open}
        onClick={p.onToggle}
        data-testid="today-found-sentence"
      >
        <span>{p.row.sentence}</span>
      </Button>
      {p.open ? (
        <div className="tz-idea-why">
          {foundWhy(p.row)}
          <span className="tz-idea-acts">
            {ask ? (
              <Button variant="quiet" size="sm" onClick={() => askAbout({ prompt: ask })} data-testid="today-found-ask">
                {F.askWhy}
              </Button>
            ) : null}
            <Button variant="quiet" size="sm" onClick={notToday} disabled={busy} data-testid="today-found-rest">
              {F.notToday}
            </Button>
          </span>
          {foundPeople(p.row)}
        </div>
      ) : null}
    </>
  );
}

/**
 * A row whose act is a door: a rule, a call worth a listen, a lead who tried, a card that names where it is mended. Not
 * today rests it for the member; one of Ask's ideas (`turn`) is kept on its turn besides, as an idea pressed is.
 */
function DoorRow(p: RowPorts & { turn: { card: AskMorningCard; messageId: string | null } | null }) {
  const [gone, setGone] = useState(false);
  const { row, turn } = p;
  if (gone) return <Done tone="rest" words={W.idea.gone} />;
  const to = row.act.to;
  return (
    <div className="tz-idea" data-testid={`today-found-${row.source}`} data-key={row.key}>
      {foundTag(row)}
      {to ? (
        <Button
          variant={p.coral ? "primary" : "quiet"}
          size="sm"
          className="tz-idea-act"
          onClick={() => appNavigate(to)}
          data-testid="today-found-act"
        >
          {row.act.label}
          <Icon name={doorGlyph()} size={11} />
        </Button>
      ) : null}
      {foundSentence(p, () => {
        setGone(true);
        // The member's rest, then the turn's word, whatever the rest came to: the idea's own Not today (idea-work.tsx). Its
        // toast's Undo takes back both.
        void p
          .rest(() => {
            setGone(false);
            if (turn) void restoreOnTurn(turn.messageId, turn.card);
          })
          .catch(() => undefined)
          .then(() => (turn ? dismissedOnTurn(turn.messageId, turn.card) : false));
      })}
    </div>
  );
}

/**
 * A card whose act is its own (Ask's idea, or what Ask noticed that a press changes: a mode one step on): Approve through
 * the verb walk, or Open in Ask for a step of a plan. What it came to is said in its place with its Undo, the card kept
 * there for the visit (`keep`); Not today rests it, and an idea's is kept on its turn besides.
 */
function CardRow(
  p: RowPorts & { card: AskMorningCard; messageId: string | null; threadId: string | null; keep: () => void },
) {
  const { card } = p;
  const acts = useIdeaActs({
    card,
    messageId: p.messageId,
    threadId: p.threadId,
    keep: p.keep,
    flash: p.flash,
    rest: p.rest,
  });
  const testid = `today-found-${p.row.source}`;
  if (acts.said)
    return (
      <div className="tz-idea" data-testid={testid} data-key={p.row.key}>
        {foundTag(p.row)}
        <Done
          tone={acts.said.tone}
          words={acts.said.words}
          act={acts.said.undo ? { label: W.undo, onPress: () => void acts.undo() } : null}
        />
      </div>
    );
  return (
    <div className="tz-idea" data-testid={testid} data-key={p.row.key}>
      {foundTag(p.row)}
      <Button
        variant={p.coral ? "primary" : "quiet"}
        size="sm"
        className="tz-idea-act"
        disabled={acts.busy}
        aria-busy={acts.busy || undefined}
        onClick={() => (card.plan ? acts.open() : void acts.approve())}
        data-testid="today-found-act"
        {...(card.plan ? {} : gate("approve", "approve Ask's card"))}
      >
        {p.row.act.label}
        <Icon name={doorGlyph()} size={11} />
      </Button>
      {foundSentence(p, () => void acts.notToday(), acts.busy)}
    </div>
  );
}

/** "2 more", which opens them in place: it was a count with no door. Called, not drawn. */
function moreDoor(more: number, everyRow: boolean, turn: () => void) {
  if (!more) return null;
  return (
    <Button
      variant="quiet"
      size="text"
      className="tz-found-more"
      aria-expanded={everyRow}
      onClick={turn}
      data-testid="today-found-more"
    >
      {everyRow ? F.fewer : F.more(more)}
      <Icon name="chevron-down" size={12} />
    </Button>
  );
}

/**
 * Ask found's pane: its name and how many more there are, a read that failed, its three rows, and what came of an idea
 * lately. `wide` where it leads the page, its rows three across; `coral` where its first act is the page's coral, as
 * Today's arrangement gave it (today/arrangement.ts): it leads, and nothing before it in the walk took it.
 */
export function AskFound({ wide, coral }: { wide: boolean; coral: boolean }) {
  const { found, morning, rest, keep, broke, shown } = useFoundModel();
  useMorningWait(morning?.state === "writing");
  usePartShown("today", "look", shown);
  const [toastNode, flash] = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [everyRow, setEveryRow] = useState(false);
  if (!found.rows.length && !broke) return toastNode;
  return (
    <section
      className={`tz-pane tz-found${wide ? " tz-found-wide" : ""}`}
      data-testid="today-ask-found"
      aria-labelledby="today-found-title"
    >
      <div className="tz-head">
        <h2 className="tz-name" id="today-found-title">
          {F.title}
        </h2>
        {moreDoor(found.more, everyRow, () => setEveryRow(!everyRow))}
      </div>
      {broke ? (
        <FailedRead
          kind="line"
          what={broke}
          body="The rest of the page is current."
          surface={broke === "People" ? "people" : "reports_headline"}
          testid="today-found-failed"
        />
      ) : null}
      <div className="tz-ideas">
        {(everyRow ? [...found.rows, ...found.rest] : found.rows).map((row, i) => {
          const ports: RowPorts = {
            row,
            coral: coral && i === 0,
            open: open === row.key,
            onToggle: () => setOpen((was) => (was === row.key ? null : row.key)),
            rest: (onUndone) => rest(row.key, flash, onUndone),
            flash,
          };
          const card = row.card;
          // A card with no door is pressed through its own verb walk; what Ask noticed rides no turn, so it is kept on none.
          return card && !row.act.to ? (
            <CardRow
              key={row.key}
              {...ports}
              card={card}
              messageId={row.source === "idea" ? (morning?.message_id ?? null) : null}
              threadId={morning?.thread_id ?? null}
              keep={() => keep(card)}
            />
          ) : (
            <DoorRow
              key={row.key}
              {...ports}
              turn={card && row.source === "idea" ? { card, messageId: morning?.message_id ?? null } : null}
            />
          );
        })}
      </div>
      {found.came ? (
        <div className="tz-came" data-testid="today-found-came">
          <span>
            <b>{F.came}</b> {found.came}
          </span>
        </div>
      ) : null}
      {toastNode}
    </section>
  );
}

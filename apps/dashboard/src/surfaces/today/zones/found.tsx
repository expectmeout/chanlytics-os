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
import { useEffect, useState, type ReactNode } from "react";
import {
  MIN_MS,
  NEED_YOU_WORDS as W,
  TODAY_LINE_WORDS as L,
  needYouGroupsOf,
  type AskMorningCard,
  type AskMorningDto,
} from "@chanlytics/contracts";
import { ASK_FOUND_SHOWN, ASK_FOUND_WORDS as F, askFoundOf, type AskFoundRowVM } from "./found-rows";
import { routeDoor } from "../../frame-verbs";
import { Lead, LeadActs } from "../calm/lead";
import { CalmList, CalmRow } from "../calm/lines";
import type { PeopleListsLike } from "../leaks";
import { refreshSurfaces } from "@/bridge/surface-runner";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { useWaitsOnToday } from "../../needs-you";
import { surfaceValue } from "../../surface-values";
import { usePartShown, useSurface, useSurfaceFailed, useWaitFor } from "../../use-surface";
import { askMorningOverride } from "../ask-morning-surface";
import { TODAY_HELPERS, peopleForToday } from "../helpers";
import { Done } from "../need-you/parts";
import { CardSheet, dismissedOnTurn, restoreOnTurn, useIdeaActs } from "../need-you/idea-work";
import { useRests } from "../need-you/rests";
import { useRowState } from "../need-you/row-state";
import { TODAY_PEOPLE_HEARD } from "../people-read";
import { appNavigate, askAbout, gate, useMoved, useToast, type Flash } from "../shell";

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
let rulesHeld: {
  headline: Headline;
  people: PeopleListsLike;
  noReply: NoReply;
  olderStands: boolean;
  minute: number;
  rows: Rules;
} | null = null;

/**
 * Every rule that holds over the page's reads, worked out once a read and a minute: the page's arrangement and the pane
 * both read Ask found in the same pass, and People's rows are everyone the workspace has.
 */
function rulesOf(headline: Headline, people: PeopleListsLike, noReply: NoReply, olderStands: boolean): Rules {
  const minute = Math.floor(Date.now() / MIN_MS);
  const held = rulesHeld;
  if (
    held &&
    held.headline === headline &&
    held.people === people &&
    held.noReply === noReply &&
    held.olderStands === olderStands &&
    held.minute === minute
  )
    return held.rows;
  const rows = TODAY_HELPERS.leaks(headline, people, TODAY_HELPERS.withoutWrongPerson(noReply), {
    max: EVERY_RULE,
    nowMs: minute * MIN_MS,
    olderStands,
  }).rows;
  rulesHeld = { headline, people, noReply, olderStands, minute, rows };
  return rows;
}

/**
 * The rows of Ask found, how a row is set aside for a week and how a card pressed keeps its place: everything it reads,
 * the page already holds. `broke`: a read the rules stand on that failed (People first: nothing else on the page says it,
 * where the foot says Reports), said in Ask found's place. `draws`: whether the pane draws (a row, or a read that failed),
 * and `acts`: whether it draws a row whose act may be the coral. Read by the page's arrangement as well as the pane.
 */
export function useFoundModel() {
  useMoved(["today", "ask_morning", "people", "reach_out_replies", TODAY_PEOPLE_HEARD]);
  const held = surfaceValue("ask_morning") ?? null;
  const morning = held?.dto ?? null;
  const headline = useSurface("reports_headline");
  // People's book, else what Today's first read carried of it (helpers.ts peopleForToday): the rules stand in the first draw.
  const people: PeopleListsLike | null = peopleForToday();
  const headlineFailed = useSurfaceFailed("reports_headline");
  const peopleFailed = useSurfaceFailed("people");
  const vm = surfaceValue("today");
  // Kept for the visit by Ask found, not by the part drawing it: the pane moves between the columns as Need you comes and
  // goes (zones/page.tsx), and what was pressed stays pressed (row-state.ts).
  const { rested, today, rest: restIt } = useRests();
  // The cards pressed this visit, kept in their place: a card with an outcome leaves the morning's next read, and its
  // receipt and Undo with it (morning.ts waitingCards).
  const [kept, setKept] = useRowState<readonly AskMorningCard[]>(FOUND_STATE, "kept", NO_CARDS);
  // Whether Ask found held a place for Ask's morning this visit (AskFound), so the place stays once the morning is written.
  const [waited] = useRowState<boolean>(FOUND_STATE, "waited", false);
  const broke = !people && peopleFailed ? "People" : !headline && headlineFailed ? "Reports" : null;
  // Every rule that holds, never the old pane's two: Ask found ranks them with the rest, draws three, and says the others.
  // Need you's rows by where each stands: who was found, and whether anyone has waited past a week, whom the page's
  // one line already counts (D22).
  const groups = vm ? needYouGroupsOf(TODAY_HELPERS.withReplies(vm.queue.rows)) : null;
  const rules =
    headline && people ? rulesOf(headline, people, vm?.noReply ?? NO_REPLY, (groups?.old.length ?? 0) > 0) : [];
  const read = morning?.offered ? [...(morning.findings ?? []), ...morning.cards] : [];
  const found = askFoundOf({
    rules,
    cards: [...kept, ...read.filter((c) => !kept.some((k) => k.id === c.id))],
    found: groups?.found ?? [],
    lately: morning?.lately ?? [],
    rested,
    today,
  });
  const rest = (key: string, flash: (f: Flash) => void, onUndone: () => void) => restIt({ key, flash, onUndone });
  const keep = (card: AskMorningCard) => setKept((was) => (was.some((k) => k.id === card.id) ? was : [...was, card]));
  const line = morningLine({ morning, asking: !!held?.asking, waited, found });
  return {
    found,
    morning,
    rest,
    keep,
    broke,
    line,
    // Known once the rules' reads are in, or one of them has failed. Not read yet is not nothing found: until then Today's
    // arrangement keeps its shape (arrangement.ts `known`).
    shown: !!broke || (!!headline && !!people),
    draws: found.rows.length > 0 || !!broke || line !== null,
    acts: found.rows.length > 0,
  };
}

/**
 * What Ask found says in the place it holds for Ask's morning (Ruben's "hold its place", 13 Nov 2026): Ask writes a member's
 * morning on their first Today of the day, a turn of up to two minutes, and its ideas come in while the page is open. While
 * it writes and Ask found has room for them, a line says so where they will stand, and the arrangement counts Ask found as
 * drawn; written with an idea, the idea takes the line's place; written with none, the line says that, and the place stays.
 * Three rows already drawn: no line, its ideas would only add to the ones not shown. Null where there is nothing to say.
 */
function morningLine(at: {
  morning: AskMorningDto | null;
  asking: boolean;
  waited: boolean;
  found: { rows: readonly AskFoundRowVM[] };
}): string | null {
  const room = at.found.rows.length < ASK_FOUND_SHOWN;
  const writing = !!at.morning?.offered && (at.morning.state === "writing" || at.asking);
  if (writing) return room ? F.reading : null;
  if (!at.waited) return null;
  return at.found.rows.some((r) => r.source === "idea") ? null : F.readNothing;
}

/** The place held for Ask's morning stays for the visit once it was drawn (morningLine): kept while its line is drawn. */
function useHeldPlace(reading: boolean) {
  const [, setWaited] = useRowState<boolean>(FOUND_STATE, "waited", false);
  useEffect(() => {
    if (reading) setWaited(true);
  }, [reading, setWaited]);
}

/** The line in the place held for Ask's morning, under the rows, as what came of an idea is said. Called, not drawn. */
const morningPlace = (line: string | null) =>
  line ? (
    <div className="tz-came calm-note" data-testid="today-found-reading">
      <span>{line}</span>
    </div>
  ) : null;

/** What a row's parts are handed: the row, whether it is the page's card, and how it is set aside. */
interface RowPorts {
  row: AskFoundRowVM;
  /** The row is the page's card (Today, calm, D1): drawn whole, its act the coral; else a line. */
  lead: boolean;
  open: boolean;
  onToggle: () => void;
  rest: (onUndone: () => void) => Promise<void>;
  flash: (f: Flash) => void;
}

/** AI's three, as a line's mark and the card's: what AI found is AI's to say, and it says so at rest, in ink. */
const foundMark = (size: number) => <Icon name="three" size={size} />;

/** The card's small line: AI's three and whose finding it is. Called, not drawn. */
const foundKind = (row: AskFoundRowVM) => (
  <>
    {foundMark(14)}
    <span>{row.source === "idea" ? F.idea : F.title}</span>
  </>
);

/** Why, as a press opens it: a new campaign's rules where its card has them; else the arithmetic, or what Approve changes. */
function foundWhy(row: AskFoundRowVM) {
  const sheet = row.card?.line && row.card.sheet?.rows.length ? row.card : null;
  return sheet ? <CardSheet card={sheet} /> : row.why ? <small>{row.why}</small> : null;
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

/** The quiet acts every row has, beside its own: Ask why (a rule's) and Not today. Called, not drawn. */
function quietActs(row: AskFoundRowVM, notToday: () => void, busy = false) {
  const ask = row.ask;
  return (
    <>
      <Button variant="quiet" size="sm" onClick={notToday} disabled={busy} data-testid="today-found-rest">
        {F.notToday}
      </Button>
      {ask ? (
        <Button variant="quiet" size="sm" onClick={() => askAbout({ prompt: ask })} data-testid="today-found-ask">
          {F.askWhy}
        </Button>
      ) : null}
    </>
  );
}

/**
 * A row drawn: the page's card where it is one (its kind, its head, its numbers under it, its act and Not today), else a
 * line, which is a link where its act is a door and opens under itself where its act is its own (an Approve is never
 * pressed on words not seen). `act` is its own press, drawn in the card and under an opened line; `said` what it came to,
 * in its place.
 */
function FoundRow({
  p,
  act,
  notToday,
  busy = false,
  said = null,
}: {
  p: RowPorts;
  act: ReactNode;
  notToday: () => void;
  busy?: boolean;
  said?: ReactNode;
}) {
  const { row } = p;
  const testid = `today-found-${row.source}`;
  if (p.lead)
    return (
      <Lead holder="found" label={F.title} kind={foundKind(row)} title={row.head} why={row.sub} testid={testid}>
        {said ?? (
          <LeadActs>
            {act}
            {quietActs(row, notToday, busy)}
          </LeadActs>
        )}
        {foundPeople(row)}
      </Lead>
    );
  const to = row.act.to;
  const under =
    said ??
    (p.open ? (
      <div className="tz-idea-why calm-under">
        {foundWhy(row)}
        <span className="tz-idea-acts">
          {act}
          {quietActs(row, notToday, busy)}
        </span>
        {foundPeople(row)}
      </div>
    ) : null);
  return (
    <CalmRow
      first={{ mark: foundMark(14) }}
      name={row.head}
      said={row.sub}
      door={to && !said ? routeDoor(to) : null}
      press={to || said ? null : p.onToggle}
      open={to || said ? undefined : p.open}
      under={under}
      testid={testid}
    />
  );
}

/**
 * A row whose act is a door: a rule, a call worth a listen, a lead who tried, a card that names where it is mended. Not
 * today rests it for the member; one of Ask's ideas (`turn`) is kept on its turn besides, as an idea pressed is.
 */
function DoorRow(p: RowPorts & { turn: { card: AskMorningCard; messageId: string | null } | null }) {
  const [gone, setGone] = useState(false);
  const { row, turn } = p;
  const to = row.act.to;
  const notToday = () => {
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
  };
  const act = to ? (
    <Button
      variant={p.lead ? "primary" : "secondary"}
      size={p.lead ? "lg" : "sm"}
      onClick={() => appNavigate(to)}
      data-testid="today-found-act"
    >
      {row.act.label}
    </Button>
  ) : null;
  return <FoundRow p={p} act={act} notToday={notToday} said={gone ? <Done tone="rest" words={W.idea.gone} /> : null} />;
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
  const said = acts.said ? (
    <Done
      tone={acts.said.tone}
      words={acts.said.words}
      act={acts.said.undo ? { label: W.undo, onPress: () => void acts.undo() } : null}
    />
  ) : null;
  const act = (
    <Button
      variant={p.lead ? "primary" : "secondary"}
      size={p.lead ? "lg" : "sm"}
      disabled={acts.busy}
      aria-busy={acts.busy || undefined}
      onClick={() => (card.plan ? acts.open() : void acts.approve())}
      data-testid="today-found-act"
      {...(card.plan ? {} : gate("approve", "approve AI's card"))}
    >
      {p.row.act.label}
    </Button>
  );
  return <FoundRow p={p} act={act} notToday={() => void acts.notToday()} busy={acts.busy} said={said} />;
}

/**
 * What AI found, as Today, calm draws it (19 Nov 2026, D1 and D4). `part` says which of it: `lead`, its first row as the
 * page's card, where the arrangement gave it the card (today/arrangement.ts), drawn at the page's start; and `lines`, the
 * rest of its rows as lines, each its short head with its numbers under it, then what came of an idea lately, and a
 * read that failed. The page draws both where what AI found holds the card: they share what was pressed (the rows'
 * store), so what one sets aside the other no longer draws.
 */
export function AskFound({ part, held }: { part: "lead" | "lines"; held: boolean }) {
  const { found, morning, rest, keep, broke, shown, line, draws } = useFoundModel();
  const lines = part === "lines";
  // The page's side of what AI found is asked for once, by the lines: the card beside them draws from the same read.
  useMorningWait(lines && morning?.state === "writing");
  usePartShown("today", "look", shown);
  useHeldPlace(lines && line === F.reading);
  const [toastNode, flash] = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [everyRow, setEveryRow] = useState(false);
  // While anyone waits it is one line (D20): analysis never outranks a person, and the rest fold under it.
  const waiting = useWaitsOnToday();
  if (!draws) return toastNode;
  const [first, ...others] = [...found.rows, ...found.rest];
  const listed = held ? others : [...found.rows, ...found.rest];
  // Three lines once nobody waits, as it always drew three rows, and a line that opens the rest where they stand.
  const room = waiting ? 1 : ASK_FOUND_SHOWN;
  const cut = Math.max(0, listed.length - room);
  const rows = lines ? (everyRow ? listed : listed.slice(0, room)) : held && first ? [first] : [];
  const drawn = rows.map((row) => {
    const ports: RowPorts = {
      row,
      lead: !lines,
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
  });
  if (!lines)
    return (
      <>
        {drawn}
        {toastNode}
      </>
    );
  return (
    <>
      {broke ? (
        <FailedRead
          kind="line"
          what={broke}
          body="The rest of the page is current."
          surface={broke === "People" ? "people" : "reports_headline"}
          testid="today-found-failed"
        />
      ) : null}
      {drawn.length ? (
        <CalmList label={F.title} testid="today-ask-found">
          {drawn}
          {cut ? (
            <CalmRow
              quiet
              name={everyRow ? F.fewer : L.foundMore(cut)}
              press={() => setEveryRow(!everyRow)}
              open={everyRow}
              testid="today-found-more"
            />
          ) : null}
        </CalmList>
      ) : null}
      {morningPlace(line)}
      {found.came ? (
        <div className="tz-came calm-note" data-testid="today-found-came">
          <span>
            <b>{F.came}</b> {found.came}
          </span>
        </div>
      ) : null}
      {toastNode}
    </>
  );
}

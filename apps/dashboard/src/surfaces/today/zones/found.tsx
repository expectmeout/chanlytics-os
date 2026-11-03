/**
 * Ask found (Today in three zones, 2 Nov 2026), Today's third zone: what is worth a look and waits on nobody, one ranked
 * list of three (contracts askFoundOf): what the workspace's own counts say leaks, what Ask noticed, a call worth a listen,
 * a lead who tried their receptionist, and Ask's ideas from its morning, last. Each row says what it is, its one act and
 * its sentence; a press on the sentence opens why (the arithmetic, a campaign's rules, what Approve changes), who a rule
 * names and Ask why, beside Not today, which rests the row a week for the member (views.ask_found) and, for an idea, is
 * kept on its turn for everyone. A card's act is its own verb walk (need-you/idea-work.tsx useIdeaActs), or the door it
 * names; what it came to is said in its place with its Undo, and the row is kept there for the visit. Under them, what
 * came of an idea approved lately. Where Need you draws no pane it leads the page, wide, its rows three across, and its
 * first act takes the coral where nothing before it in the walk did (queue-coral.ts); else it stands under the day and
 * takes none. A read it ranks from that failed is said in its place.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ASK_FOUND_VIEW,
  ASK_FOUND_WORDS as F,
  NEED_YOU_WORDS as W,
  askFoundOf,
  dayInZone,
  needYouGroupsOf,
  restedWith,
  usableZone,
  type AskFoundRowVM,
  type AskMorningCard,
  type AskRested,
  type PeopleListsLike,
} from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { saveView } from "../../people/people-detail";
import { surfaceValue } from "../../surface-values";
import { usePartShown, useSurface, useSurfaceFailed } from "../../use-surface";
import { askMorningOverride } from "../ask-morning-surface";
import { TODAY_HELPERS } from "../helpers";
import { Done } from "../need-you/parts";
import { CardSheet, dismissedOnTurn, useIdeaActs } from "../need-you/idea-work";
import { useRowState } from "../need-you/row-state";
import { useCoralAhead, zoneDrawn } from "../queue-coral";
import {
  appNavigate,
  askAbout,
  borrowed,
  canDo,
  doorGlyph,
  gate,
  useMoved,
  useToast,
  workspaceClock,
  type Flash,
} from "../shell";

/** How often Ask's morning is read again while Ask writes it: a turn takes up to two minutes. */
const MORNING_POLL_MS = 8_000;

/** The rules asked for whole (contracts todayLeaks' cap): Ask found's own ranking draws three of everything. */
const EVERY_RULE = Number.POSITIVE_INFINITY;

/** Ask's morning read again every few seconds while it writes; the surface stops the wait when it lands. */
function useMorningWait(writing: boolean) {
  useEffect(() => {
    if (!writing) return;
    const id = setInterval(() => void refreshSurfaces([askMorningOverride]), MORNING_POLL_MS);
    return () => clearInterval(id);
  }, [writing]);
}

/** Where Ask found keeps what was pressed this visit, among the rows' states. */
const FOUND_STATE = "ask-found";
const NO_CARDS: readonly AskMorningCard[] = [];

/** The business's day, YYYY-MM-DD: what a rest runs out against, where the morning has not said it. */
const dayToday = (): string => dayInZone(usableZone(workspaceClock()?.zone()), Date.now()).key;

/**
 * The rows of Ask found, how a row is set aside for a week and how a card pressed keeps its place: everything it reads,
 * the page already holds. `broke`: a read the rules stand on that failed (People first: nothing else on the page says it,
 * where the foot says Reports), said in Ask found's place.
 */
function useFoundRows() {
  useMoved(["today", "ask_morning", "people", "reach_out_replies"]);
  const morning = surfaceValue("ask_morning")?.dto ?? null;
  useMorningWait(morning?.state === "writing");
  const headline = useSurface("reports_headline");
  const people = borrowed<PeopleListsLike>("__PEOPLE");
  const headlineFailed = useSurfaceFailed("reports_headline");
  const peopleFailed = useSurfaceFailed("people");
  const vm = surfaceValue("today");
  // Both kept for the visit by Ask found, not by the part drawing it: the pane moves between the columns as Need you comes
  // and goes (zones/page.tsx), and what was pressed stays pressed (row-state.ts).
  // The rests pressed this visit: a second before the next read writes over the first's, not the read's.
  const [rests, setRests] = useRowState<AskRested | null>(FOUND_STATE, "rests", null);
  // The cards pressed this visit, kept in their place: a card with an outcome leaves the morning's next read, and its
  // receipt and Undo with it (morning.ts waitingCards).
  const [kept, setKept] = useRowState<readonly AskMorningCard[]>(FOUND_STATE, "kept", NO_CARDS);
  const broke = !people && peopleFailed ? "People" : !headline && headlineFailed ? "Reports" : null;
  // Drawn once the rules' reads are in, or one of them has failed: Today's last part, People being its heaviest read.
  usePartShown("today", "look", !!broke || (!!headline && !!people));
  const today = morning?.day ?? dayToday();
  // Every rule that holds, never the old pane's two: Ask found ranks them with the rest, draws three, and says the others.
  const rules =
    headline && people
      ? TODAY_HELPERS.leaks(headline, people, TODAY_HELPERS.withoutWrongPerson(vm?.noReply ?? []), EVERY_RULE).rows
      : [];
  const read = morning?.offered ? [...(morning.findings ?? []), ...morning.cards] : [];
  const found = askFoundOf({
    rules,
    cards: [...kept, ...read.filter((c) => !kept.some((k) => k.id === c.id))],
    found: vm ? needYouGroupsOf(TODAY_HELPERS.withReplies(vm.queue.rows)).found : [],
    lately: morning?.lately ?? [],
    rested: rests ?? morning?.rested ?? {},
    today,
  });
  const rest = async (key: string, flash: (f: Flash) => void) => {
    const rested = restedWith(rests ?? morning?.rested ?? {}, key, today);
    setRests(rested);
    const r = await saveView(ASK_FOUND_VIEW, { rested });
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
  };
  const keep = (card: AskMorningCard) => setKept((was) => (was.some((k) => k.id === card.id) ? was : [...was, card]));
  return { found, morning, rest, keep, broke };
}

/** What a row's parts are handed: its place, whether its act is the coral, and how it is set aside. */
interface RowPorts {
  row: AskFoundRowVM;
  coral: boolean;
  open: boolean;
  onToggle: () => void;
  rest: () => Promise<void>;
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
        {p.row.sentence}
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
        // The member's rest, then the turn's word, whatever the rest came to: the idea's own Not today (idea-work.tsx).
        void p
          .rest()
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

/** Whether Ask found draws, told to the page (queue-coral.ts): where neither it nor Need you does, the day is alone. */
function useFoundTold(drawn: boolean) {
  useLayoutEffect(() => {
    zoneDrawn("found", drawn);
  }, [drawn]);
  useLayoutEffect(() => () => zoneDrawn("found", false), []);
}

/**
 * Ask found's pane: its name and how many more there are, a read that failed, its three rows, and what came of an idea
 * lately. `wide` where it leads the page, its rows three across; its first act then takes the coral, where nothing
 * before it in the walk did.
 */
export function AskFound({ wide }: { wide: boolean }) {
  const { found, morning, rest, keep, broke } = useFoundRows();
  const [toastNode, flash] = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const ahead = useCoralAhead("found");
  useFoundTold(found.rows.length > 0 || !!broke);
  if (!found.rows.length && !broke) return toastNode;
  // The coral is Ask found's where it leads the page and nothing before it in the walk took it, setting up included.
  const coralFirst = wide && !ahead && canDo("approve");
  return (
    <section
      className={`tz-pane tz-found${wide ? " tz-found-wide" : ""}`}
      data-testid="today-ask-found"
      aria-labelledby="today-found-title"
    >
      <div className="tz-sec">
        <Icon name="three" size={14} />
        <h2 className="tz-sec-title" id="today-found-title">
          {F.title}
        </h2>
        {found.more ? <span className="tz-note">{F.more(found.more)}</span> : null}
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
        {found.rows.map((row, i) => {
          const ports: RowPorts = {
            row,
            coral: coralFirst && i === 0,
            open: open === row.key,
            onToggle: () => setOpen((was) => (was === row.key ? null : row.key)),
            rest: () => rest(row.key, flash),
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

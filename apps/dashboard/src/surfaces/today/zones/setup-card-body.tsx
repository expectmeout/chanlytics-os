/**
 * What is left to set up, as one card above the queue in its column (moved from pages/dashboard-a-brief.jsx,
 * decision 0015, step 4; the first run's Today card, canvas R10 and P9): the card itself, a chunk of its own, which
 * Today draws through setup-card.tsx once Setup's read and this code are in.
 *
 * The rows are Setup's own (surfaces/setup/rows: `SetupCardRow`, `SetupRows`), imported; each row's Skip is this
 * card's (SkipMenu), so the first run's own page never loads the kit's Menu.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import { LIFECYCLE_WORDS, restEndsDay, type ColdEmailNote, type SetupPutOffWhy } from "@chanlytics/contracts";
import { FIRST_RUN_HELPERS } from "@/surfaces/setup/first-run/model/first-run-helpers";
import {
  SETUP_CARD_WORDS,
  setupCardLeftWith,
  type SetupCardPutOff,
  type SetupCardVM,
  type SetupCardWho,
} from "@/surfaces/setup/first-run/model/card";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { Meter } from "../../kit/meter/meter";
import { Sheet } from "../../kit/sheet/sheet";
import { useRootFlag } from "../../kit/motion/root-flags";
import { surfaceValue } from "../../surface-values";
import { SetupCardRow } from "../../setup/rows/card-row";
import { SetupRows } from "../../setup/rows/rows";
import { setupVerbs, type SetupSurface } from "../../setup/surface";
import { appNavigate, refusalFlash, useToast, type Flash } from "../shell";
import { useTodayOnPhone } from "../phone";
import { CalmList, CalmRow } from "../calm/lines";
import { ColdEmailLine, ColdEmailRow } from "./cold-email-note";

/**
 * While a step is open: the one row that opens the first run. Its act is the page's coral while nobody waits on the
 * owner; while someone does, the queue's first act is (today/arrangement.ts) and this one is the quiet kind, since the
 * coral is for what is now (Today stood with Continue setting up and Answer both in it).
 */
function startRow(start: NonNullable<SetupCardVM["start"]>, left: string, nav: (to: string) => void, quiet: boolean) {
  return (
    <div className="tq-list">
      <SetupCardRow
        tone="warn"
        stateWords={start.status}
        name={start.name}
        sentence={start.sentence}
        left={left}
        cta={{
          label: start.cta,
          short: start.ctaShort,
          kind: quiet ? "ghost" : "primary",
          onClick: () => nav(start.to),
        }}
        testid="today-setup-start"
        ctaTestid="today-setup-go"
      />
    </div>
  );
}

/** A line each, under a quiet title: what the first run kept (canvas T·a), or what is already done going live (T·c). */
function ticks(title: string, lines: readonly string[], testid: string): ReactNode {
  if (!lines.length) return null;
  return (
    <div className="today-setup-ticks" data-testid={testid}>
      <span className="setup-title">{title}</span>
      <ul className="today-setup-tick-list">
        {lines.map((l) => (
          <li key={l}>
            <Icon name="check" size={12} />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the card knows beyond Setup: the business's name, and how the receptionist sounds where the settings read is
 * already in (never read for the card alone: Today does not draw Settings).
 */
function setupWhoOf(setup: SetupSurface): SetupCardWho {
  const read = surfaceValue("settings");
  const cfg = read && read.settings ? read.settings.config : null;
  const profile = cfg && cfg.brain ? cfg.brain.profile : null;
  return { business: setup.dto.business.name, sounds: profile ? FIRST_RUN_HELPERS.sounds(profile) : null };
}

/**
 * Where the card's fold is kept: this device's, as a pane left open or closed is. Never the member's saved view, which
 * holds what they put off: folding is no put-off, and nothing comes back after a week. A browser that keeps nothing
 * (a private window) keeps it for the visit.
 */
const FOLD_KEY = "today-setup-folded";

/** The card folded or open, as this device last left it: open until it is folded. */
function useFold(): [boolean, () => void] {
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setFolded((was) => {
      try {
        if (was) localStorage.removeItem(FOLD_KEY);
        else localStorage.setItem(FOLD_KEY, "1");
      } catch {
        // Kept for the visit alone.
      }
      return !was;
    });
  return [folded, toggle];
}

/**
 * A row's Skip (the refined canvas, 31 Oct 2026): a menu that says both choices before either is pressed: for a week,
 * back on its day; or "I don't need this", with where it is set up from then; and what waiting costs, where it costs
 * (the kept number's forwarding). It was one press that put a row off for a week and the next time for good, and said
 * which only in the toast after. On a phone it is the caret of the row's one pill, its word left to its name (the phone
 * pass, 3 Nov 2026), in the act's coral where the act leads (`lead`).
 */
function SkipMenu(p: {
  name: string;
  put: SetupCardPutOff;
  word: string;
  day: string;
  lead: boolean;
  testid: string;
  onPut: (why: SetupPutOffWhy, said: string) => void;
}) {
  const W = SETUP_CARD_WORDS.skip;
  return (
    <Menu
      align="end"
      label={W.menu(p.name)}
      trigger={
        <Button
          variant="quiet"
          size="sm"
          aria-label={W.menu(p.name)}
          data-lead={p.lead || undefined}
          data-testid={p.testid}
        >
          <span className="setup-line-long">{p.word}</span>
          <Icon name="chevron-down" size={12} />
        </Button>
      }
      groups={[
        {
          items: [
            { label: W.week, meta: W.backOn(p.day), onSelect: () => p.onPut("week", p.put.week) },
            { label: W.good, meta: p.put.home, onSelect: () => p.onPut("answer", p.put.good) },
          ],
          ...(p.put.cost ? { caption: p.put.cost } : {}),
        },
      ]}
    />
  );
}

/**
 * After the first run, with the calendar in: the one door to the appointment reminder (decision 22), as the card's last
 * row in Setup's list, drawn as Setup's are: its dot, its name over its sentence, its button and its Skip.
 */
function remindRow(
  remind: NonNullable<SetupCardVM["remind"]>,
  skip: NonNullable<SetupCardVM["skip"]>,
  nav: (to: string) => void,
  menu: ReactNode,
) {
  return (
    <div>
      <SetupCardRow
        tone=""
        stateWords={remind.stateWords}
        name={remind.name}
        nameShort={remind.nameShort}
        note={remind.back ? { long: skip.back, short: skip.backShort } : null}
        sentence={remind.words}
        cta={{ label: remind.label, onClick: () => nav(remind.to) }}
        menu={menu}
        testid="today-setup-remind"
        ctaTestid="today-setup-remind-go"
      />
    </div>
  );
}

/** After: Setup's own optional rows, each with its Skip, and the reminder's row under them. */
function optionalRows(
  setup: SetupSurface,
  card: SetupCardVM,
  flash: (flash: Flash) => void,
  { tail, quiet, skip }: { tail: ReactNode; quiet: boolean; skip: (id: string) => ReactNode },
) {
  return (
    <SetupRows
      S={setup}
      rows={card.rows}
      look="card"
      // The first row's act is the coral while nobody waits, as the first run's row is (startRow); while someone does, the
      // card's lead (Today with colour, 17 Nov 2026: each pane's first act wears the accent's tint, one act on the page filled).
      primary={quiet ? null : (card.rows[0]?.id ?? null)}
      lead={quiet ? (card.rows[0]?.id ?? null) : null}
      left={card.left}
      // Going live, the rows that need the owner can't be skipped: they are Go live's (the code, WhatsApp).
      later={card.skip ?? { put: "" }}
      flash={flash}
      tail={tail}
      skip={card.skip ? skip : null}
      testid="today-setup-rows"
    />
  );
}

/**
 * Whether folding hides anything. Folded, the card keeps saying what is next, its one row (8 Nov 2026: "1 step left" named
 * no step, and folded away "Calls aren't answered yet" under a head that said nothing needs you): what folds is everything
 * after it, and where nothing is, there is no chevron to press.
 */
/**
 * Whether the card draws an act that may be the page's coral: a step still open, or a row of Setup's left. A folded card
 * still draws its next step, so it counts; a card gone for the week, or with nothing left, draws none (today/arrangement.ts
 * hands the coral on).
 */
export function setupCardActs(setup: SetupSurface): boolean {
  const card = FIRST_RUN_HELPERS.todayCard(setup.vm, setupWhoOf(setup));
  return !!card && (!!card.start || card.rows.length > 0);
}

const foldsAnything = (card: SetupCardVM): boolean =>
  (card.start
    ? card.kept.length + card.done.length
    : card.rows.length + (card.remind ? 1 : 0) - 1 + card.done.length + (card.hide ? 1 : 0)) > 0;

/** What Hide says: the day it comes back, and what waiting costs where the kept number is among the rows. */
const hiddenSaid = (day: string, cost: string | null): string =>
  cost ? `${SETUP_CARD_WORDS.hidden(day)} ${cost}` : SETUP_CARD_WORDS.hidden(day);

/**
 * A press anywhere on the head's line folds the card; one on its own buttons is theirs, the chevron folding it itself. (8 Nov
 * 2026: the chevron's press stretched over the line with CSS reached a mouse, and a finger's click fell through to the words.)
 */
const foldFromHead = (toggle: () => void) => (e: MouseEvent) => {
  if (e.target instanceof Element && !e.target.closest("button")) toggle();
};

/** The chevron that folds the card and opens it, the press a key reaches. Called, not drawn. */
function foldChevron(short: boolean, toggle: () => void) {
  return (
    <Button
      variant="quiet"
      size="sm"
      iconOnly
      aria-label={short ? SETUP_CARD_WORDS.open : SETUP_CARD_WORDS.fold}
      aria-expanded={!short}
      onClick={toggle}
      data-folded={short || undefined}
      data-testid="today-setup-fold"
    >
      <Icon name="chevron-down" size={14} />
    </Button>
  );
}

/** The fewest steps the progress is drawn for: one part alone says nothing of how far along the card is. */
const STEPS_METERED_MIN = 2;

/**
 * Going live as progress (Today with colour, D6, 17 Nov 2026): a part a step, done in the ok tone's green and still to do as
 * an outline, beside the card's title. Drawn from the first visit, before a step is done (Ruben's call, 18 Nov 2026: it
 * was hidden until one was, and the empty parts are what say how short the list is). None for the first run's own row,
 * which says its steps itself, nor for a card of one step.
 */
function stepsMeter(card: SetupCardVM) {
  if (card.start || card.done.length + card.rows.length < STEPS_METERED_MIN) return null;
  const parts = [
    ...card.done.map(() => ({ share: 1, tone: "ok" as const })),
    ...card.rows.map(() => ({ share: 1, tone: "open" as const })),
  ];
  return <Meter apart size="sm" parts={parts} className="tz-done" aria-label={card.left} />;
}

/**
 * What is left to set up as one line of Today (Today, calm, 19 Nov 2026, D1), where the page's card is someone's who
 * waits: its name and how many are left, a quiet line as Also's is (the second look, L4), and a press that opens the card
 * in a sheet over Today (L7), with every row and act it has: asking a teammate, forwarding the number, choosing a line,
 * Skip and Hide for a week, each where it is done. Back closes it. Cold email's note is setting-up work too (D21): it is
 * counted among what is left and opens with the card, its own line first; with nothing else left to set up it is a line
 * of its own.
 */
export const TodaySetupLine = ({ S, note }: { S: SetupSurface; note: ColdEmailNote | null }) => {
  const [open, setOpen] = useState(false);
  // The card's toast is the line's, drawn on Today under the sheet: a Skip or a Hide can take the line and its sheet away
  // while its Undo is still up.
  const [toastNode, flash] = useToast();
  const card = FIRST_RUN_HELPERS.todayCard(S.vm, setupWhoOf(S));
  const shown = open && !!card;
  // Open over the page (`.over-page`): the tab bar stands down while it is, said on the document's root (kit/motion/root-flags.ts).
  useRootFlag("overPage", shown);
  return (
    <>
      {card ? (
        <CalmList label={card.title} testid="today-setup-line">
          <CalmRow
            quiet
            name={card.title}
            said={note ? setupCardLeftWith(card, 1) : card.left}
            press={() => setOpen(true)}
            testid="today-setup-row"
          />
        </CalmList>
      ) : note ? (
        <ColdEmailLine note={note} />
      ) : null}
      <Sheet
        open={shown}
        onClose={() => setOpen(false)}
        title={card?.title ?? ""}
        close={{ label: LIFECYCLE_WORDS.close, glyph: <Icon name="x" size={13} /> }}
        kicker
        fit
        backCloses
        className="over-page calm-setup-over"
        testid="today-setup-sheet"
      >
        {note ? (
          <div className="calm-subs" role="list">
            <ColdEmailRow note={note} />
          </div>
        ) : null}
        <div className="tq tps tz-setup calm-opened">
          <TodaySetupCard S={S} coral={false} under lent={flash} />
        </div>
      </Sheet>
      {toastNode}
    </>
  );
};

/** Put off, said in the card's toast with its Undo, which puts every row back as it stood. */
const putAwayWith = (flash: (f: Flash) => void) => async (ids: string[], why: SetupPutOffWhy, words: string) => {
  const put = await setupVerbs.later(ids, { on: true, why });
  if (!put.ok) return flash(refusalFlash(put, "Not saved"));
  flash({
    msg: <>{words}</>,
    undo: () =>
      put.undo().then((u) => {
        if (!u.ok) flash(refusalFlash(u, "Not saved"));
      }),
  });
};

/**
 * A row's Skip, by its id: a menu of a week or for good, its words the row's own (SetupCardRowVM.put); the coral row's
 * wears the coral with it on a phone (`leadId`). Called, not drawn.
 */
function skipsOf(
  card: SetupCardVM,
  parts: { day: string; leadId: string | null; putAway: ReturnType<typeof putAwayWith> },
) {
  const skipMenu = (id: string, name: string, put: SetupCardPutOff | null) =>
    put && card.skip ? (
      <SkipMenu
        name={name}
        put={put}
        word={card.skip.put}
        day={parts.day}
        lead={id === parts.leadId}
        testid={`setup-later-${id}`}
        onPut={(why, words) => void parts.putAway([id], why, words)}
      />
    ) : null;
  const skipRow = (id: string) => {
    const row = card.rows.find((r) => r.id === id);
    return row ? skipMenu(id, row.title, row.put) : null;
  };
  return { skipMenu, skipRow };
}

/**
 * The card's head: its title and how many are left, the steps' meter, Hide for a week on a desk, and the chevron. Its
 * whole line folds it; the chevron is the press a key and a reader reach. Called, not drawn.
 */
function setupHead(
  card: SetupCardVM,
  parts: { foldable: boolean; short: boolean; phone: boolean; toggle: () => void; hideButton: ReactNode },
) {
  return (
    <div
      className="setup-head tz-head"
      role="presentation"
      onClick={parts.foldable ? foldFromHead(parts.toggle) : undefined}
      data-foldable={parts.foldable || undefined}
    >
      <span className="setup-title tz-name">
        {card.title}
        <span className="setup-left tz-fact" data-testid="today-setup-left">
          {card.left}
        </span>
      </span>
      {stepsMeter(card)}
      {!parts.short && !parts.phone ? parts.hideButton : null}
      {parts.foldable ? foldChevron(parts.short, parts.toggle) : null}
    </div>
  );
}

/**
 * What stands under the head: while a step is open, the row that opens the first run and what was kept; after, Setup's
 * own rows with the reminder's last; what was done; and Hide for a week as the last row on a phone or under the line.
 * Folded, the first row alone. Called, not drawn.
 */
function setupBody(
  setup: SetupSurface,
  card: SetupCardVM,
  parts: {
    short: boolean;
    waiting: boolean;
    nav: (to: string) => void;
    flash: (f: Flash) => void;
    remindDrawn: ReactNode;
    skipRow: (id: string) => ReactNode;
    hideLast: ReactNode;
  },
) {
  const shownCard = parts.short ? { ...card, rows: card.rows.slice(0, 1) } : card;
  const kept = parts.short ? null : ticks(SETUP_CARD_WORDS.keptTitle, card.kept, "today-setup-kept");
  return (
    <>
      {card.start ? startRow(card.start, card.left, parts.nav, parts.waiting) : null}
      {card.start
        ? kept
        : optionalRows(setup, shownCard, parts.flash, {
            tail: parts.remindDrawn,
            quiet: parts.waiting,
            skip: parts.skipRow,
          })}
      {parts.short ? null : ticks(SETUP_CARD_WORDS.doneTitle, card.done, "today-setup-done")}
      {parts.hideLast}
    </>
  );
}

// What is left to set up, as one card above the queue in its column (the first run's Today card, canvas R10 and P9):
// while a step is open, the one row that opens the first run; after, Setup's own optional rows in the order they help
// most, each with its act and its Skip, and the reminder's row last. Two presses that do two things (the refined canvas,
// 31 Oct 2026): the chevron folds the card and opens it, as often as wanted, kept on this device; "Hide for a week" puts
// every row off for a week, and a week is always a week. Skip says its choices before either is pressed: a week, back
// on its day, or for good, with where it is set up from then (contracts setupPutOffNext, `week` and `answer`). Each put-
// off is said in the card's toast with its Undo, which puts the rows back as they stood. Gone once nothing is left. Every
// word is contracts' (first-run-card.ts setupCardOf); the rows are Setup's own, drawn as the card's compact rows. A phone
// draws the same rows and acts, each row one line (the phone pass, 3 Nov 2026): its short name and one pill, the act and
// Skip's caret (mobile.css), with no sentence; the head its title on one line, and Hide for a week the card's last row.
// `coral`: whether its first act is the page's coral, as Today's arrangement gave it (today/arrangement.ts): nobody waits
// on the owner and nothing the queue drew holds it. Else the card's acts are quiet.
export const TodaySetupCard = ({
  S,
  coral,
  under = false,
  lent = null,
}: {
  S: SetupSurface;
  coral: boolean;
  /** Drawn in the sheet Today's line for it opens (TodaySetupLine), which has said its name: no head, never folded. */
  under?: boolean;
  /** The line's toast, where the card stands in its sheet: a Skip or a Hide can close the sheet while its Undo is up. */
  lent?: ((f: Flash) => void) | null;
}) => {
  // The card's toast, lent to its rows: a Skip or a Hide can take the card away while its Undo is still up.
  const [ownToast, ownFlash] = useToast();
  const flash = lent ?? ownFlash;
  const toastNode = lent ? null : ownToast;
  const waiting = !coral;
  const [folded, toggle] = useFold();
  // On a phone the head is the card's title on one line with its chevron, and Hide for a week the open card's last row
  // (the phone pass, 3 Nov 2026: beside Hide the title broke onto two lines).
  const phone = useTodayOnPhone();
  const card = FIRST_RUN_HELPERS.todayCard(S.vm, setupWhoOf(S));
  if (!card) return toastNode;
  const nav = (to: string) => appNavigate(to);
  // The day a week put off now ends, on the business's clock: said in Skip's menu before the press, and after Hide.
  const day = restEndsDay(pageClock().zone(), Date.now());
  const putAway = putAwayWith(flash);
  const { remind, hide } = card;
  const hideAll = () =>
    hide &&
    putAway([...card.rows.map((r) => r.id), ...(remind ? [remind.id] : [])], "week", hiddenSaid(day, hide.cost));
  // The row whose act is the page's coral (optionalRows' `primary`): its Skip's caret wears the coral with it on a phone.
  const leadId = waiting ? null : (card.rows[0]?.id ?? null);
  const { skipMenu, skipRow } = skipsOf(card, { day, leadId, putAway });
  const hideButton = hide ? (
    <Button variant="quiet" size="sm" onClick={() => void hideAll()} data-testid="today-setup-hide">
      {hide.put}
    </Button>
  ) : null;
  const foldable = foldsAnything(card);
  const short = folded && foldable && !under;
  const remindDrawn =
    remind && card.skip && (!short || card.rows.length === 0)
      ? remindRow(remind, card.skip, nav, skipMenu(remind.id, remind.name, remind.put))
      : null;
  return (
    <section className="tq today-setup" data-testid="today-setup">
      {under ? null : setupHead(card, { foldable, short, phone, toggle, hideButton })}
      {setupBody(S, card, {
        short,
        waiting,
        nav,
        flash,
        remindDrawn,
        skipRow,
        hideLast: !short && (phone || under) ? hideButton : null,
      })}
      {toastNode}
    </section>
  );
};

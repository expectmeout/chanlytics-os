/**
 * The pile (the lead workbench, 00426; canvas B v2): one lead at a time, and three presses for it -- no, not now, yes --
 * with the five whys of Not a fit in the rail's place when it is pressed. The lead is its card (card.tsx): the reason up
 * front, what it rests on, how they can be reached and the first email they would get. Over it, the search being gone
 * through and where its adds go; under it, how far through it is, and Undo for the last three. At the end, the later
 * ones, or the leads held for a new list and the one press that writes to them. On a desk the pile stands where the
 * rows stand and the lead's details are the peek beside it, which follows the lead that is up; on a phone the pile is
 * a sheet over the rows (sheet.tsx), its card at half height and its five tabs at full. What a press did is the pile's
 * own line under it (a live region), never a toast over the next card; where no email can go to the lead and they have
 * a number, the yes is a call; over the pile, Add them all (bulk.tsx).
 *
 * Hookless: the page holds the pile (use-pile.ts) and hands it down. Every word is contracts' (LEAD_PILE_WORDS,
 * leadPileRailOf, LEAD_NOT_A_FIT_WORDS, LEAD_CARD_WORDS); the keys are the page's one listener's
 * (people/hooks/keyboard.ts) and listed in the ? sheet (SHORTCUTS), never drawn here.
 */
import {
  LEAD_CARD_WORDS,
  LEAD_NOT_A_FIT_TITLE,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_PILE_UNDO_KEY,
  LEAD_PILE_WORDS,
  leadPileProgressOf,
  leadPileRailOf,
  sequenceRoute,
  type LeadPileCountsDto,
  type LeadPileSlot,
  type LeadRowVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { gate, navigate } from "../../legacy-verbs";
import { PileBulk, type PileBulkFacts } from "./bulk";
import { LeadCardHead, LeadCardMail, type LeadCardFacts } from "./card";
import type { LeadPile } from "./use-pile";

/**
 * Why the rail's Add would come to nothing for this lead, where the card says so (no address, a slot with no value):
 * the press is off, and says why at the control. Null when it would go.
 */
export const pileAddBlocked = (card: LeadCardFacts | null): string | null =>
  card && card.email ? card.email.blocked : null;

/** Whether the rail's yes is a call: the add door said no email can go to them, and they have a number. */
export const pileCalls = (card: LeadCardFacts | null): boolean =>
  !!(card && card.email && card.email.instead === "call");

/** What a press of one of the rail's places does, and what it says at the control: Add that would come to nothing is off. */
function slotPressOf(p: PileViewProps, l: LeadRowVM, s: LeadPileSlot) {
  const off = s.act === "add" ? pileAddBlocked(p.card) : null;
  const press = () => (s.act === "call" ? p.onCall(l.id) : void p.pile.act(l, s.act));
  const title = off ?? (s.act === "call" ? LEAD_CARD_WORDS.callTip : null);
  return { off, press, says: title ? { title } : gate(s.right, s.label.toLowerCase()) };
}

/**
 * The rail: three presses, or the five whys of Not a fit in their place. Each press names its key to a screen reader,
 * and on a desk (`keys`) shows it too, the house's key (`.kbd`, light on the filled one): a phone has none to press.
 */
const railOf = (p: PileViewProps, l: LeadRowVM, keys: boolean) => {
  const { pile } = p;
  if (pile.asking)
    return (
      <div
        className="ld-pile-rail ld-pile-whys"
        role="group"
        aria-label={LEAD_NOT_A_FIT_TITLE}
        data-testid="lead-pile-whys"
      >
        {LEAD_NOT_A_FIT_WHYS.map((w) => (
          <Button
            key={w}
            size="sm"
            onClick={() => void pile.act(l, "not_a_fit", w)}
            data-testid={`lead-pile-why-${w}`}
            {...(pile.lastWhy === w ? { title: LEAD_PILE_WORDS.lastWhy, "data-last": "" } : {})}
          >
            {pile.lastWhy === w ? <span className="ld-now-dot" aria-hidden="true" /> : null}
            {LEAD_NOT_A_FIT_WORDS[w]}
          </Button>
        ))}
        <Button size="sm" variant="quiet" onClick={() => pile.setAsking(false)} data-testid="lead-pile-why-cancel">
          Cancel
        </Button>
      </div>
    );
  const rail = leadPileRailOf({
    cls: pile.cls,
    target: pile.target ? pile.target.name : null,
    call: pileCalls(p.card),
  });
  return (
    <div className="ld-pile-rail" data-testid="lead-pile-rail">
      {rail.map((s) => {
        // Add that would come to nothing is off, and says why at the control (the card says it too).
        const { off, press, says } = slotPressOf(p, l, s);
        return (
          <Button
            key={s.act}
            variant={s.look}
            disabled={pile.busy || !!off}
            onClick={press}
            aria-keyshortcuts={s.key.toUpperCase()}
            data-testid={`lead-pile-${s.act}`}
            {...says}
          >
            {s.label}
            {keys ? (
              <kbd className={s.look === "primary" ? "kbd kbd-on-dark" : "kbd"} aria-hidden="true">
                {s.key.toUpperCase()}
              </kbd>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
};

/** The rail, for the phone's sheet, which holds it still at its foot. */
export const PileRail = ({ p, l }: { p: PileViewProps; l: LeadRowVM }) => railOf(p, l, false);

/** The lead that is up, on a desk: its card, then the rail. Keyed by the lead, so the next one turns in (leads.css). */
const pileLeadOf = (p: PileViewProps, l: LeadRowVM) => (
  <article key={l.id} className="ld-pile-lead" aria-label={l.name} data-testid="lead-pile-lead">
    {p.card ? (
      <>
        <LeadCardHead up={l} card={p.card} />
        <LeadCardMail card={p.card} fills />
      </>
    ) : null}
    {railOf(p, l, true)}
  </article>
);

/** Where the adds go: each reach-out fed by a list, or a new list (held, then written to together). */
const targetsOf = (p: PileViewProps) => {
  const { pile } = p;
  if (pile.cls === "review") return null;
  const pick = [
    ...(pile.targets ?? []).map((t) => ({ id: t.rootId, name: t.name, t })),
    { id: "", name: LEAD_PILE_WORDS.newList, t: null },
  ];
  return (
    <div className="ld-pile-targets" role="group" aria-label={LEAD_PILE_WORDS.target} data-testid="lead-pile-targets">
      <span>{LEAD_PILE_WORDS.target}</span>
      {pick.map((x) => (
        <Button
          key={x.id || "new"}
          size="sm"
          variant={(pile.target ? pile.target.rootId : "") === x.id ? "secondary" : "quiet"}
          aria-pressed={(pile.target ? pile.target.rootId : "") === x.id}
          onClick={() => pile.setTarget(x.t)}
          data-testid={`lead-pile-target-${x.id || "new"}`}
        >
          {x.name}
        </Button>
      ))}
      {p.bulk ? <PileBulk bulk={p.bulk} busy={pile.busy} /> : null}
    </div>
  );
};

/** The sequence the pile's adds went to, on Sequences: who is in it now. The pile is left as it is opened. */
const openTarget = (p: PileViewProps) => {
  if (!p.pile.target) return;
  const to = sequenceRoute(p.pile.target.rootId, "people");
  p.pile.stop();
  navigate(to);
};

/**
 * The end of the pile: the later ones to go through, the leads held for a new list and the press that writes to them,
 * and the sequence its adds went to.
 */
const pileEndOf = (p: PileViewProps, later: number) => (
  <div className="ld-pile-end" data-testid="lead-pile-end">
    <h3>{LEAD_PILE_WORDS.end}</h3>
    <p>{LEAD_PILE_WORDS.endSub(later)}</p>
    <div className="ld-pile-rail">
      {later > 0 ? (
        <Button onClick={() => p.pile.setPass("later")} data-testid="lead-pile-later-again">
          {LEAD_PILE_WORDS.laterAgain}
        </Button>
      ) : null}
      {p.pile.held.length ? (
        <Button variant="primary" onClick={() => p.onWriteHeld(p.pile.held)} data-testid="lead-pile-write-held">
          {LEAD_PILE_WORDS.writeHeld(p.pile.held.length)}
        </Button>
      ) : null}
      {p.pile.target ? (
        <Button onClick={() => openTarget(p)} data-testid="lead-pile-open-target">
          {LEAD_PILE_WORDS.openTarget(p.pile.target.name)}
        </Button>
      ) : null}
      <Button variant="quiet" onClick={p.pile.stop} data-testid="lead-pile-leave">
        {LEAD_PILE_WORDS.leave}
      </Button>
    </div>
  </div>
);

/**
 * The pile's one line after a press, for the eye and a screen reader (a polite live region): what was done, and who is
 * up now or that it was the last. Nothing is said before the first press.
 */
const pileSaidOf = (p: PileViewProps) => (
  <p className="ld-pile-said" role="status" aria-live="polite" data-testid="lead-pile-said">
    {p.pile.said ? `${p.pile.said} · ${p.up ? LEAD_PILE_WORDS.next(p.up.name) : LEAD_PILE_WORDS.lastOne}` : null}
  </p>
);

/**
 * How far through it is, what is held, Undo for the last three (its key shown on a desk, as the rail's are), and the way
 * out (a desk's; a phone's sheet closes by its own pull and Close).
 */
const progressOf = (p: PileViewProps, leave: boolean) => {
  const { pile, counts } = p;
  const line = counts ? leadPileProgressOf(counts) : null;
  return (
    <div className="ld-pile-progress" data-testid="lead-pile-progress">
      {pileSaidOf(p)}
      {line ? <span data-testid="lead-pile-progress-line">{line.text}</span> : null}
      {pile.held.length ? <span>{LEAD_PILE_WORDS.held(pile.held.length)}</span> : null}
      {pile.canUndo ? (
        <Button
          size="sm"
          variant="quiet"
          disabled={pile.busy}
          onClick={() => void pile.undo()}
          aria-keyshortcuts={LEAD_PILE_UNDO_KEY.toUpperCase()}
          data-testid="lead-pile-undo"
        >
          {LEAD_PILE_WORDS.undo}
          {leave ? (
            <kbd className="kbd" aria-hidden="true">
              {LEAD_PILE_UNDO_KEY.toUpperCase()}
            </kbd>
          ) : null}
        </Button>
      ) : null}
      {leave ? (
        <Button size="sm" variant="quiet" onClick={pile.stop} data-testid="lead-pile-stop">
          {LEAD_PILE_WORDS.leave}
        </Button>
      ) : null}
    </div>
  );
};

export interface PileViewProps {
  pile: LeadPile;
  /** The lead that is up, and how many are put off for later (usePileUp). */
  up: LeadRowVM | null;
  later: number;
  /** The pile's numbers, from the page's read (00426 lead_pile_counts). */
  counts: LeadPileCountsDto | null;
  searchName: string;
  /** The card of the lead that is up (card.tsx leadCardFor); null with none up. */
  card: LeadCardFacts | null;
  /** Writes to the leads held for a new list: the list made of them, and its sequence (the bar's Write to them). */
  onWriteHeld: (ids: string[]) => void;
  /** The rail's call, where it is the yes: the owner's own phone dials, and the call's question is asked. */
  onCall: (id: string) => void;
  /** Add them all, over a Ready pile with a sequence and more than one lead open; null otherwise. */
  bulk: PileBulkFacts | null;
}

/** The pile's parts the phone's sheet places itself: where adds go, the end of the pile, the progress line. */
export const PileTargets = ({ p }: { p: PileViewProps }) => targetsOf(p);
export const PileEnd = ({ p }: { p: PileViewProps }) => pileEndOf(p, p.later);
export const PileProgress = ({ p }: { p: PileViewProps }) => progressOf(p, false);

/** The pile on a desk, where the rows stand. */
export const LeadPileView = (p: PileViewProps) => (
  <section className="ld-pile" aria-label={LEAD_PILE_WORDS.head(p.searchName)} data-testid="lead-pile">
    <header className="ld-pile-head">
      <h2>{LEAD_PILE_WORDS.head(p.searchName)}</h2>
      {targetsOf(p)}
    </header>
    {p.up ? pileLeadOf(p, p.up) : pileEndOf(p, p.later)}
    <footer>{progressOf(p, true)}</footer>
  </section>
);

/**
 * The door into the pile, under an open search: for a search whose leads no reach-out of its own writes to, or its
 * Needs review. Where a sequence's Add leads named the target, the door names it.
 */
export const LeadPileDoor = ({ onStart, target }: { onStart: () => void; target?: string | null }) => (
  <div className="ld-pile-door">
    <Button
      size="sm"
      variant={target === undefined ? "secondary" : "primary"}
      onClick={onStart}
      title={LEAD_PILE_WORDS.startTip}
      data-testid="lead-pile-start"
    >
      {target === undefined ? LEAD_PILE_WORDS.start : LEAD_PILE_WORDS.startFor(target)}
    </Button>
  </div>
);

/** With a sequence's Add leads standing and no search open: the line asking for one, and Not now, which lets it go. */
export const LeadPileAsk = ({ name, onLetGo }: { name: string | null; onLetGo: () => void }) => (
  <div className="ld-pile-door" data-testid="lead-pile-ask">
    <p>{LEAD_PILE_WORDS.askSearch(name)}</p>
    <Button size="sm" variant="quiet" onClick={onLetGo} data-testid="lead-pile-ask-let-go">
      {LEAD_PILE_WORDS.askLetGo}
    </Button>
  </div>
);

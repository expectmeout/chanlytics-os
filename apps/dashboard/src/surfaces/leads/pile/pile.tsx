/**
 * The pile (the lead workbench, 00423; canvas B v2): one lead at a time where the rows stand, and three presses for it
 * -- no, not now, yes -- with the five whys of Not a fit in the rail's place when it is pressed. Over it, the search
 * being gone through and where its adds go; under it, how far through it is, and Undo for the last three. At the end,
 * the later ones, or the leads held for a new list and the one press that writes to them. On a desk the lead's details
 * are the peek beside it, which follows the lead that is up; on a phone they are the peek, opened from Details.
 *
 * Hookless: the page holds the pile (use-pile.ts) and hands it down. Every word is contracts' (LEAD_PILE_WORDS,
 * leadPileRailOf, LEAD_NOT_A_FIT_WORDS); the keys are the page's one listener's (people/hooks/keyboard.ts) and listed in
 * the ? sheet (SHORTCUTS), never drawn here.
 */
import {
  LEAD_NOT_A_FIT_TITLE,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_PILE_WORDS,
  leadPileProgressOf,
  leadPileRailOf,
  type LeadPileCountsDto,
  type LeadRowVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { gate } from "../../legacy-verbs";
import { LeadTile } from "../cells/tile";
import type { LeadPile } from "./use-pile";

/** A fact the listing showed, with where it came from as its title: the rating, today's hours, the reach. */
const factRowsOf = (l: LeadRowVM): { key: string; text: string; from: string }[] =>
  [
    l.rated ? { key: "rated", text: `${l.rated.score} ★ · ${l.rated.reviews}`, from: "On its listing" } : null,
    l.card.today ? { key: "today", text: l.card.today, from: "The hours on its listing" } : null,
    l.reach.email ? { key: "email", text: l.emailWord, from: "Checked without sending anything" } : null,
    l.phoneAgrees ? { key: "phone", text: "Number on its listing and its site", from: "Two places agree" } : null,
    l.host ? { key: "site", text: l.host, from: "Its own website" } : null,
  ].filter((x): x is { key: string; text: string; from: string } => !!x);

/** The rail: three presses, or the five whys of Not a fit in their place. */
const railOf = (p: PileViewProps, l: LeadRowVM) => {
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
          <Button key={w} size="sm" onClick={() => void pile.act(l, "not_a_fit", w)} data-testid={`lead-pile-why-${w}`}>
            {LEAD_NOT_A_FIT_WORDS[w]}
          </Button>
        ))}
        <Button size="sm" variant="quiet" onClick={() => pile.setAsking(false)} data-testid="lead-pile-why-cancel">
          Cancel
        </Button>
      </div>
    );
  return (
    <div className="ld-pile-rail" data-testid="lead-pile-rail">
      {leadPileRailOf({ cls: pile.cls, target: pile.target ? pile.target.name : null }).map((s) => (
        <Button
          key={s.act}
          variant={s.look}
          disabled={pile.busy}
          onClick={() => void pile.act(l, s.act)}
          data-testid={`lead-pile-${s.act}`}
          {...gate(s.right, s.label.toLowerCase())}
        >
          {s.label}
        </Button>
      ))}
    </div>
  );
};

/** The lead that is up: its face, its name and where, why it fits, what the listing showed, and the rail. */
const pileLeadOf = (p: PileViewProps, l: LeadRowVM) => (
  <article key={l.id} className="ld-pile-lead" aria-label={l.name} data-testid="lead-pile-lead">
    <div className="ld-pile-who">
      <LeadTile l={l} size={56} />
      <div className="ld-pile-name">
        <h3>{l.name}</h3>
        {l.sub ? <p>{l.sub}</p> : null}
      </div>
    </div>
    {l.why ? (
      <p className="ld-pile-why" data-testid="lead-pile-why">
        {l.fitLabel ? <strong>{l.fitLabel}</strong> : null} {l.why}
      </p>
    ) : null}
    <ul className="ld-pile-facts" data-testid="lead-pile-facts">
      {factRowsOf(l).map((f) => (
        <li key={f.key} title={f.from}>
          {f.text}
        </li>
      ))}
    </ul>
    {railOf(p, l)}
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
    </div>
  );
};

/** The end of the pile: the later ones to go through, or the leads held for a new list and the press that writes to them. */
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
      <Button variant="quiet" onClick={p.pile.stop} data-testid="lead-pile-leave">
        {LEAD_PILE_WORDS.leave}
      </Button>
    </div>
  </div>
);

/** How far through it is, what is held, Undo for the last three, Details on a phone, and the way out. */
const progressOf = (p: PileViewProps, up: LeadRowVM | null) => {
  const { pile, counts } = p;
  const line = counts ? leadPileProgressOf(counts) : null;
  return (
    <footer className="ld-pile-progress" data-testid="lead-pile-progress">
      {line ? <span data-testid="lead-pile-progress-line">{line.text}</span> : null}
      {pile.held.length ? <span>{LEAD_PILE_WORDS.held(pile.held.length)}</span> : null}
      {pile.canUndo ? (
        <Button
          size="sm"
          variant="quiet"
          disabled={pile.busy}
          onClick={() => void pile.undo()}
          data-testid="lead-pile-undo"
        >
          {LEAD_PILE_WORDS.undo}
        </Button>
      ) : null}
      {p.phone && up ? (
        <Button size="sm" variant="quiet" onClick={() => p.onDetails(up.id)} data-testid="lead-pile-details">
          {LEAD_PILE_WORDS.details}
        </Button>
      ) : null}
      <Button size="sm" variant="quiet" onClick={pile.stop} data-testid="lead-pile-stop">
        {LEAD_PILE_WORDS.leave}
      </Button>
    </footer>
  );
};

export interface PileViewProps {
  pile: LeadPile;
  /** The lead that is up, and how many are put off for later (usePileUp). */
  up: LeadRowVM | null;
  later: number;
  /** The pile's numbers, from the page's read (00423 lead_pile_counts). */
  counts: LeadPileCountsDto | null;
  searchName: string;
  phone: boolean;
  /** Opens the lead's details: the peek. */
  onDetails: (id: string) => void;
  /** Writes to the leads held for a new list: the list made of them, and its reach-out's sheet (the bar's Write to them). */
  onWriteHeld: (ids: string[]) => void;
}

/** The pile, where the rows stand. */
export const LeadPileView = (p: PileViewProps) => (
  <section className="ld-pile" aria-label={LEAD_PILE_WORDS.head(p.searchName)} data-testid="lead-pile">
    <header className="ld-pile-head">
      <h2>{LEAD_PILE_WORDS.head(p.searchName)}</h2>
      {targetsOf(p)}
    </header>
    {p.up ? pileLeadOf(p, p.up) : pileEndOf(p, p.later)}
    {progressOf(p, p.up)}
  </section>
);

/** The door into the pile, under an open search: for a search whose leads no reach-out of its own writes to. */
export const LeadPileDoor = ({ onStart }: { onStart: () => void }) => (
  <div className="ld-pile-door">
    <Button size="sm" onClick={onStart} title={LEAD_PILE_WORDS.startTip} data-testid="lead-pile-start">
      {LEAD_PILE_WORDS.start}
    </Button>
  </div>
);

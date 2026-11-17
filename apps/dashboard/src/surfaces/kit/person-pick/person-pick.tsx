/**
 * The kit's person pick (kit.css, "Person pick"): who a sheet is for, before it does anything for them. The question over
 * a search, then who it found, each a press: their face, their name with the stopped mark where they asked to stop, and
 * under it where their deal stands, or when they were last heard. Or the words for nobody, said as a status while what
 * is shown is not yet the answer to what was typed. Enter takes the first found once it is.
 *
 * New proposal on the Pipeline (people/pipeline/new.tsx) and New conversation on the Inbox (inbox/new-conversation/
 * who.tsx) ask the same question in the same words, and drew it twice: a face and two lines on one, a name with its line
 * at the far end on the other. This is the one drawing both take. Who matches is the page's (the Pipeline's own rule over
 * the rows it holds, or the server's answer to the Inbox): the pick draws what it is handed, and says what it is told to
 * for nobody.
 *
 * The search is the record kit's box in the kit Field's classes, written here: the kit's Field brings Base UI's onto
 * People's first load (+5 KB), and the record kit's TSX would bring its modules into New conversation's sheet. Its label
 * carries `data-rec-row="search"`, by which a record sheet hands focus to it (kit/record/focus.ts). It draws nothing of a
 * sheet: it is what a sheet holds, the kit's Sheet in a job's shape on a phone and a pane beside the page on a desk.
 *
 * It draws what the gallery's Person pick family draws (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tests/styles/kit-components.test.mjs holds the two together). `className` is for the page's layout, and comes last;
 * `testid` names it, and `<testid>-search`, `-list`, `-pick`, `-stopped` and `-none` its parts.
 */
import type { PersonRowVM } from "@chanlytics/contracts";
import type { KeyboardEvent, ReactNode } from "react";
import { Face } from "../face/face";
import { StoppedMark } from "../pill/stopped-mark";
import { cx } from "../variants";

/** Who the pick offers: a People row, of what the pick draws of it. */
export type PersonPickRow = Pick<PersonRowVM, "id" | "name" | "initials" | "stopped" | "lastContact"> & {
  deal: Pick<NonNullable<PersonRowVM["deal"]>, "line"> | null;
};

/** The question, the search, who was found and the words for nobody. */
export interface PersonPickProps {
  /** The question over the search ("Who is it for?"), which names it. */
  label: string;
  /** What the empty search says. */
  placeholder: string;
  /** What was typed. */
  q: string;
  onQ: (q: string) => void;
  /** Who was found, in the page's order: each a press. */
  people: readonly PersonPickRow[];
  onPick: (id: string) => void;
  /** What is said where nobody was found. */
  none: ReactNode;
  /** What is shown is not yet the answer to what was typed: the words for nobody are a status, and Enter waits. */
  reading?: boolean;
  /** The search takes focus as it is drawn: where the sheet keeps a field that does (a phone's), and keys are there. */
  autoFocus?: boolean;
  testid: string;
  className?: string;
}

/** Where their deal stands, or when they were last heard: the row's own words. */
const saidOf = (p: PersonPickRow): string => (p.deal ? p.deal.line : p.lastContact.label);

/** Who was found, each a press that picks them; or the words for nobody. */
function found(p: PersonPickProps) {
  if (!p.people.length)
    return (
      <p className="person-pick-none" role={p.reading ? "status" : undefined} data-testid={`${p.testid}-none`}>
        {p.none}
      </p>
    );
  return (
    <ul className="person-pick-list" data-testid={`${p.testid}-list`}>
      {p.people.map((person) => (
        <li key={person.id}>
          <button
            type="button"
            className="person-pick-row"
            onClick={() => p.onPick(person.id)}
            data-testid={`${p.testid}-pick`}
          >
            <Face person={{ name: person.name, initials: person.initials }} size="sm" className="person-pick-face" />
            <span className="person-pick-name">
              {person.name}
              {/* They asked to stop: what the sheet does next is a message, so the pick says it before they are chosen. */}
              {person.stopped && <StoppedMark className="person-pick-stopped" testid={`${p.testid}-stopped`} />}
            </span>
            <span className="person-pick-said">{saidOf(person)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The question and its search, over who it found. */
export function PersonPick(p: PersonPickProps) {
  const { label, placeholder, q, onQ, people, onPick, reading = false, autoFocus = false, testid, className } = p;
  // Enter takes the first found, once what is shown answers what was typed: a search is a pick in two keys.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const first = people[0];
    if (e.key !== "Enter" || reading || !first) return;
    e.preventDefault();
    onPick(first.id);
  };
  return (
    <div className={cx("person-pick", className)} data-testid={testid}>
      <label className="rec-field" data-rec-row="search">
        <span className="rec-field-label">{label}</span>
        <input
          className="rec-input"
          type="search"
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the page says when: never on a touch screen (focusAsDrawn)
          autoFocus={autoFocus}
          autoComplete="off"
          value={q}
          placeholder={placeholder}
          onChange={(e) => onQ(e.target.value)}
          onKeyDown={onKeyDown}
          data-testid={`${testid}-search`}
        />
      </label>
      {found(p)}
    </div>
  );
}

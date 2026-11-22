/**
 * Who's in it (the journey canvas, board Piece, cells 25 to 35; the content loop PRD's 5.3 and 21.3, call 13): each person
 * the owner named in the piece or in what it was drawn from, and where their yes for posts stands. Rights are per person
 * and per use, and never read from a face: who is in it is said to AI, whose card the owner presses, or said here that
 * nobody is. A person is asked from here (the ask sheet), and what they answer is the owner's to read as a yes or a no.
 * What each line says is contracts' (content/piece-people.ts); this draws it and hands each press to the pane.
 */
import { useState } from "react";
import {
  PIECE_PEOPLE_WORDS as W,
  THREAD_CHANNEL_WORDS,
  isOneOf,
  personInitialsOf,
  personSaidOf,
  personStandsOf,
  type FileYesUse,
  type PersonStands,
  type PiecePeopleDto,
  type PiecePersonDto,
} from "@chanlytics/contracts";
import { askAbout } from "../../../frame-verbs";
import { Button } from "../../../kit/button/button";
import { AskLine, type ChangeAbout } from "../sheets/ask-change";
import type { ViewerClock } from "../model/viewer-line";

/** What a person answered, as the owner read it, or their yes let go. */
export type PersonSaid =
  { said: "yes"; saidIn: "message" | "in_person"; messageId?: string } | { said: "no" } | { said: "took_back" };

/** What the section's presses do, each the pane's own. */
export interface WhoPresses {
  busy: boolean;
  /** Whether this person may keep a yes or a no (the settings permission), and say who is in it (add_files). */
  may: boolean;
  mayName: boolean;
  about: ChangeAbout;
  /** The piece's name, as the line to AI names it. */
  piece: string;
  askPerson: (person: PiecePersonDto) => void;
  said: (person: PiecePersonDto, answer: PersonSaid) => void;
  /** Nobody is in it. */
  noOne: () => void;
}

const channelSaid = (via: string): string =>
  isOneOf(Object.keys(THREAD_CHANNEL_WORDS), via)
    ? THREAD_CHANNEL_WORDS[via as keyof typeof THREAD_CHANNEL_WORDS]
    : via;

const STAYS = (): void => undefined;

/** The line to AI where who is in it is said: AI finds each in People, and its card keeps them on a press. */
function NameLine({ on }: { on: WhoPresses }) {
  return <AskLine about={on.about} onAsked={STAYS} placeholder={W.nameHint} begin={W.nameAsk(on.piece)} />;
}

/** One quiet press under a person's line. */
function WhoPress(props: { words: string; press: () => void; lead?: boolean; busy: boolean; testid: string }) {
  const look = props.lead ? ({ size: "sm" } as const) : ({ size: "text", variant: "quiet" } as const);
  return (
    <Button {...look} className="cnv-goes-act" onClick={props.press} disabled={props.busy} data-testid={props.testid}>
      {props.words}
    </Button>
  );
}

/** What can be done about one person, by where they stand. */
function PersonActs({ person, stands, on }: { person: PiecePersonDto; stands: PersonStands; on: WhoPresses }) {
  if (!on.may) return null;
  const at = person.id;
  const inPerson = (
    <WhoPress
      words={W.saidYesInPerson}
      press={() => on.said(person, { said: "yes", saidIn: "in_person" })}
      busy={on.busy}
      testid={`cnv-who-in-person-${at}`}
    />
  );
  if (stands.is === "answered")
    return (
      <span className="cnv-goes-acts">
        <WhoPress
          words={W.thatsAYes}
          press={() => on.said(person, { said: "yes", saidIn: "message", messageId: stands.messageId })}
          lead
          busy={on.busy}
          testid={`cnv-who-yes-${at}`}
        />
        <WhoPress
          words={W.thatsANo}
          press={() => on.said(person, { said: "no" })}
          busy={on.busy}
          testid={`cnv-who-no-${at}`}
        />
      </span>
    );
  if (stands.is === "yes") {
    // A yes kept from their message or in person can be let go where it was read wrong; one said to AI is AI's to take back.
    const words = stands.yes.said_in === "in_person" ? W.undo : stands.yes.said_in === "message" ? W.notAYes : null;
    return words ? (
      <span className="cnv-goes-acts">
        <WhoPress
          words={words}
          press={() => on.said(person, { said: "took_back" })}
          busy={on.busy}
          testid={`cnv-who-back-${at}`}
        />
      </span>
    ) : null;
  }
  if (stands.is === "no")
    return (
      <span className="cnv-goes-acts">
        <WhoPress
          words={W.again(person.name)}
          press={() => askAbout({ about: on.about, prompt: W.again(person.name), fresh: true })}
          busy={on.busy}
          testid={`cnv-who-again-${at}`}
        />
      </span>
    );
  if (stands.is === "asked") return <span className="cnv-goes-acts">{inPerson}</span>;
  if (stands.is === "took_back") return null;
  // Nobody has asked them yet: the ask, where the workspace can write to them; in person either way.
  return (
    <span className="cnv-goes-acts">
      {person.conversation ? (
        <WhoPress
          words={W.ask(person.name)}
          press={() => on.askPerson(person)}
          lead
          busy={on.busy}
          testid={`cnv-who-ask-${at}`}
        />
      ) : null}
      {inPerson}
    </span>
  );
}

/** One person: their initials, their name, where their yes stands, their own words where they wrote, and what to do. */
function PersonRow(props: { person: PiecePersonDto; use: FileYesUse; clock: ViewerClock; on: WhoPresses }) {
  const { person, use, on } = props;
  const stands = personStandsOf(person, use);
  const says = personSaidOf(person, stands, use, { when: props.clock.ahead, channel: channelSaid });
  const quote = stands.is === "answered" ? stands.words : stands.is === "yes" ? stands.yes.quote : null;
  return (
    <div className="cnv-who-row" data-tone={says.tone || undefined} data-testid={`cnv-who-${person.id}`}>
      <span className="cnv-who-initials" aria-hidden="true">
        {personInitialsOf(person.name)}
      </span>
      <div className="cnv-goes-words">
        <b>{person.name}</b>
        <span className="cnv-who-said" data-testid={`cnv-who-said-${person.id}`}>
          {says.line}
        </span>
        {quote ? <q className="cnv-who-quote">{quote}</q> : null}
        {stands.is === "none" && !person.conversation && on.may ? (
          <p className="cnv-note">{W.askInPerson(person.name)}</p>
        ) : null}
        <PersonActs person={person} stands={stands} on={on} />
      </div>
    </div>
  );
}

/**
 * The section: nobody said yet (said to AI, or that nobody is), nobody in it, not sure, or each person on their line.
 * `seen` is how many people the look counted in the file, where it counted any.
 */
export function WhoIsInIt(props: {
  people: PiecePeopleDto | null;
  seen: number | null;
  use: FileYesUse;
  clock: ViewerClock;
  on: WhoPresses;
}) {
  const { people, on } = props;
  const [naming, setNaming] = useState(false);
  if (!people) return null;
  const head = <h3 className="cnv-sect">{W.title}</h3>;
  const noOne = on.mayName ? (
    <WhoPress words={W.noOne} press={on.noOne} busy={on.busy} testid="cnv-who-none-press" />
  ) : null;
  if (people.state === "named")
    return (
      <section className="cnv-who" data-testid="cnv-who" data-state="named">
        {head}
        {people.people.map((person) => (
          <PersonRow key={person.id} person={person} use={props.use} clock={props.clock} on={on} />
        ))}
        {on.mayName ? (
          naming ? (
            <NameLine on={on} />
          ) : (
            <span className="cnv-goes-acts">
              <WhoPress words={W.change} press={() => setNaming(true)} busy={on.busy} testid="cnv-who-change" />
            </span>
          )
        ) : null}
      </section>
    );
  if (people.state === "none")
    return (
      <section className="cnv-who" data-testid="cnv-who" data-state="none">
        {head}
        <div className="cnv-who-none">
          <span>{W.noOne}</span>
          {on.mayName && !naming ? (
            <WhoPress words={W.change} press={() => setNaming(true)} busy={on.busy} testid="cnv-who-change" />
          ) : null}
        </div>
        {naming ? <NameLine on={on} /> : null}
      </section>
    );
  return (
    <section className="cnv-who" data-testid="cnv-who" data-state={people.state}>
      {head}
      <p className="cnv-who-ask">{people.state === "unsure" ? W.unsure : W.whoAreThey(props.seen)}</p>
      {people.state === "unsure" ? <p className="cnv-note">{W.unsureNote}</p> : null}
      {on.mayName ? (
        <>
          <NameLine on={on} />
          <span className="cnv-goes-acts">
            {people.state === "unsure" ? (
              noOne
            ) : (
              <WhoPress words={W.noOneKnown} press={on.noOne} busy={on.busy} testid="cnv-who-none-press" />
            )}
          </span>
        </>
      ) : null}
    </section>
  );
}

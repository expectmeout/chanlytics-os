/**
 * The ad account's card (the Ads plan, 4.3; the canvas's Flow and Step2 boards): one card for every state the
 * connection can be in. Nothing connected, it says what connecting does and who is charged. Back from Meta's window it
 * checks, line by line, and goes on by itself. Connected, it names who Meta charges and the Page the ads run as, folds
 * what is ready into one line, and says the one thing missing with its one act. Where two ad accounts could both be
 * the one, it asks, the likelier already picked.
 *
 * It draws what card-model.ts hands over and decides nothing. The Ads page and Settings › Connections draw this same
 * card. Its caret opens the card whole (card-sheet.tsx): the five checks, changing the account, and Disconnect.
 */
import "./connect.css";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Panel } from "../../../kit/panel/panel";
import { routeDoor } from "../../../frame-verbs";
import type { CheckVM, ConnectCardVM, NeedAct, NeedVM } from "./card-model";
import { CARD, CHECK_UNSAID, QUESTION } from "./words";

/** What the card's presses do. */
interface CardActs {
  /** Open Meta's own window. */
  connect: () => void;
  /** The owner's answer to the one question: the platform's id of the account they meant. */
  choose: (externalId: string) => void;
  /** Open the card whole, from its caret. */
  open: () => void;
}

const DOT: Record<ConnectCardVM["state"], string> = {
  none: "off",
  left: "off",
  "signed-out": "warn",
  checking: "plain",
  question: "ok",
  connected: "ok",
};

/** A page of Meta's opens in a tab of its own: the owner comes back to this one, and the card looks again. */
export const META_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

/** A need's one act: a door to Meta, Meta's window again, or a page of the app. */
function NeedPress({ act, onConnect }: { act: NeedAct; onConnect: () => void }) {
  if (act.kind === "connect") {
    return (
      <Button size="sm" onClick={onConnect} data-testid="ads-conn-act">
        {act.words}
      </Button>
    );
  }
  const door = act.kind === "meta" ? { href: act.href, ...META_TAB } : routeDoor(act.to);
  return (
    <Button size="sm" {...door} data-testid="ads-conn-act">
      {act.words}
      {act.kind === "meta" ? <Icon name="chevron" size={12} /> : null}
    </Button>
  );
}

/** The one thing missing, or the one stop: what happened, what it stops, and its one act. */
export function CardNeed({ need, onConnect }: { need: NeedVM; onConnect: () => void }) {
  return (
    <div
      className="ads-conn-need"
      data-tone={need.tone}
      role="group"
      aria-label={need.title}
      data-testid="ads-conn-need"
    >
      <b>{need.title}</b>
      <span>{need.line}</span>
      {need.act ? <NeedPress act={need.act} onConnect={onConnect} /> : null}
    </div>
  );
}

/** The five checks as lines, each with its dot: turning while it is not known yet. */
export function CardChecks({ checks, neededFor }: { checks: readonly CheckVM[]; neededFor: boolean }) {
  return (
    <ul className="ads-conn-checks" data-testid="ads-conn-checks">
      {checks.map((check) => (
        <li key={check.id} data-state={check.state}>
          <span
            className="ads-dot"
            data-state={check.state === "ok" ? "ok" : check.state === "missing" ? "warn" : "plain"}
            data-turning={check.state === "unknown" ? "true" : undefined}
            aria-hidden="true"
          />
          <span className="ads-conn-check">{check.label}</span>
          {check.state === "unsaid" ? <span className="ads-conn-for">{CHECK_UNSAID}</span> : null}
          {neededFor ? <span className="ads-conn-for">{check.neededFor}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Who Meta charges, the Page, and Meta's own limit, as a list of what and which. */
export function CardFacts({ facts }: { facts: ConnectCardVM["facts"] }) {
  return (
    <dl className="ads-conn-facts" data-testid="ads-conn-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          {/* A fact with a door: the two side by side, and where they do not fit, the door under the fact, so no
              mark between them is left hanging at the end of a line. */}
          <dd className={fact.door ? "ads-conn-fact-door" : undefined}>
            {fact.door ? <span>{fact.value}</span> : fact.value}
            {fact.door ? (
              <LinkButton href={fact.door.href} {...META_TAB} size="inherit" data-testid="ads-conn-limit">
                {fact.door.words}
              </LinkButton>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The one question: the accounts that could both be right, one picked, and the press that uses it. */
function CardQuestion({
  question,
  onChoose,
}: {
  question: NonNullable<ConnectCardVM["question"]>;
  onChoose: (id: string) => void;
}) {
  const [picked, setPicked] = useState(question.picked);
  const chosen = question.options.find((option) => option.id === picked) ?? question.options.at(0);
  return (
    <div className="ads-conn-need" data-tone="calm" data-testid="ads-conn-question">
      <b>{question.title}</b>
      <div className="ads-conn-options" role="radiogroup" aria-label={QUESTION.group}>
        {question.options.map((option) => (
          <Button
            key={option.id}
            variant="quiet"
            role="radio"
            aria-checked={option.id === picked}
            className="ads-conn-option"
            onClick={() => setPicked(option.id)}
            data-testid="ads-conn-option"
          >
            <span>
              <b>{option.title}</b>
              <span>{option.line}</span>
            </span>
          </Button>
        ))}
      </div>
      {chosen ? (
        <Button size="sm" onClick={() => onChoose(chosen.id)} data-testid="ads-conn-use">
          {QUESTION.press(chosen.title.split(" · ").at(0) ?? chosen.title)}
        </Button>
      ) : null}
    </div>
  );
}

/** The head's right end: the connection's word, or, once connected, the same word as the caret that opens the card. */
function CardWord({ vm, onOpen }: { vm: ConnectCardVM; onOpen: () => void }) {
  if (vm.state !== "connected") {
    return (
      <span className="ads-conn-word" data-testid="ads-conn-word">
        {vm.word}
      </span>
    );
  }
  return (
    <Button
      variant="quiet"
      size="sm"
      className="ads-conn-caret"
      aria-label={CARD.caret}
      onClick={onOpen}
      data-testid="ads-conn-caret"
    >
      {vm.word}
      <Icon name="chevron-down" size={12} />
    </Button>
  );
}

interface ConnectCardProps {
  vm: ConnectCardVM;
  acts: CardActs;
  /** The name the page that draws it says it by. */
  title: string;
  /** AI stopped with ads still on, where the card says it (live/stop-notice.tsx). */
  stop?: ReactNode;
}

/** The ad account's card. */
export function ConnectCard({ vm, acts, title, stop = null }: ConnectCardProps) {
  return (
    <Panel as="section" className="ads-conn" aria-label={title} data-state={vm.state} data-testid="ads-conn">
      <div className="ads-conn-head">
        <span
          className="ads-dot"
          data-state={DOT[vm.state]}
          data-turning={vm.state === "checking" ? "true" : undefined}
          aria-hidden="true"
        />
        <b>{title}</b>
        <CardWord vm={vm} onOpen={acts.open} />
      </div>
      {vm.says.map((said) => (
        <p key={said.text} className="ads-conn-says" data-strong={said.strong ? "true" : undefined}>
          {said.text}
        </p>
      ))}
      {vm.state === "checking" ? (
        <>
          <CardChecks checks={vm.checks} neededFor={false} />
          <p className="ads-conn-says">{vm.quiet}</p>
        </>
      ) : null}
      {vm.facts.length > 0 ? <CardFacts facts={vm.facts} /> : null}
      {vm.ready ? (
        <LinkButton className="ads-conn-ready" onClick={acts.open} data-testid="ads-conn-ready">
          {vm.ready} <Icon name="chevron-down" size={12} />
        </LinkButton>
      ) : null}
      {vm.stale ? (
        <p className="ads-conn-says" data-testid="ads-conn-stale">
          {vm.stale}
        </p>
      ) : null}
      {stop}
      {vm.need ? <CardNeed need={vm.need} onConnect={acts.connect} /> : null}
      {vm.question ? <CardQuestion question={vm.question} onChoose={acts.choose} /> : null}
    </Panel>
  );
}

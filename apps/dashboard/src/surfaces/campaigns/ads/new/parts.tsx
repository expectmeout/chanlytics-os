/**
 * The parts of New ad's one screen over its preview (the Ads plan's 4.6): the one sentence, whose amount, miles and
 * date are changed in place (the drawer's own sentence, so the words are the same tinted ones); the box a tapped word
 * opens under it; why that amount; and the one line that stops the ad or asks, with its one act. Nothing here is a
 * list of choices: a number is typed, a date is picked, and anything else is told to AI.
 */
import { minorOfUnits } from "../model/money";
import type { SentencePart } from "../model/vm-base";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { CardNeed } from "../connect/card";
import { AdSentence } from "../drawer/sentence";
import type { AdLocal, LineAct, LinePress, LineVM, NewAdVM } from "./model";
import { NEW } from "./words";

/** Which word of the sentence is being changed. */
export type AdEditing = "amount" | "miles" | "end" | null;

interface SentenceProps {
  vm: NewAdVM;
  editing: AdEditing;
  /** While AI is changing the draft, its words are read and none opens. */
  still: boolean;
  onEdit: (word: AdEditing) => void;
}

/** The one sentence: the service in the ink, and the three words that are changed in place. */
export function NewSentence({ vm, editing, still, onEdit }: SentenceProps) {
  const { sentence } = vm;
  const chip = (id: "area" | "amount" | "end", words: string): SentencePart => ({
    chip: words,
    id,
    value: words,
    blank: false,
  });
  const parts: SentencePart[] = [
    { text: NEW.sentence.show },
    { chip: sentence.service, id: "offer", value: sentence.service, blank: false },
    { text: NEW.sentence.within },
    chip("area", sentence.miles),
    { text: NEW.sentence.so },
    chip("amount", sentence.amount),
    { text: NEW.sentence.until },
    chip("end", sentence.end),
    { text: NEW.sentence.end },
  ];
  const turn = (word: Exclude<AdEditing, null>) => () => onEdit(editing === word ? null : word);
  return (
    <AdSentence
      parts={parts}
      editing
      readOnly={still}
      jump={{ area: turn("miles"), amount: turn("amount"), end: turn("end") }}
    />
  );
}

/** Digits alone, as a whole number: what a box of an amount or of miles holds. */
const wholeOf = (typed: string): number => Number(typed.replace(/\D/g, "").slice(0, 9) || "0");

interface EditorProps {
  vm: NewAdVM;
  editing: Exclude<AdEditing, null>;
  local: AdLocal;
  currency: string;
  onType: (patch: Partial<AdLocal>) => void;
  onDone: () => void;
}

/** The box a tapped word opens: the amount, the miles or the last day, typed in place, with the press following. */
export function NewEditor({ vm, editing, local, currency, onType, onDone }: EditorProps) {
  const enter = (event: { key: string }) => {
    if (event.key === "Enter") onDone();
  };
  const shared = { onKeyDown: enter, autoFocus: true, enterKeyHint: "done" as const };
  return (
    <div className="ads-new-editor" data-testid={`ads-new-edit-${editing}`}>
      {editing === "amount" ? (
        <Field
          label={NEW.edit.amount}
          value={String(vm.units.now)}
          onValueChange={(typed) => onType({ total_minor: minorOfUnits(wholeOf(typed), currency) })}
          unit={currency}
          inputMode="numeric"
          hint={vm.hints.amount}
          data-testid="ads-new-amount"
          {...shared}
        />
      ) : null}
      {editing === "miles" ? (
        <Field
          label={NEW.edit.miles}
          value={String(local.miles)}
          onValueChange={(typed) => onType({ miles: wholeOf(typed) })}
          unit={NEW.edit.milesUnit}
          inputMode="numeric"
          hint={vm.hints.miles}
          data-testid="ads-new-miles"
          {...shared}
        />
      ) : null}
      {editing === "end" ? (
        <Field
          label={NEW.edit.end}
          type="date"
          value={local.end_day}
          onValueChange={(typed) => (typed ? onType({ end_day: typed }) : undefined)}
          hint={vm.hints.end}
          data-testid="ads-new-end"
          {...shared}
        />
      ) : null}
      <Button variant="quiet" size="sm" onClick={onDone} data-testid="ads-new-edit-done">
        {NEW.edit.done}
      </Button>
    </div>
  );
}

/** Why that amount, and why that service: one quiet line, AI's mark before it. */
export function NewWhy({ lines }: { lines: readonly string[] }) {
  return (
    <p className="ads-new-why" data-testid="ads-new-why">
      <Icon name="sparkle" size={13} />
      <span>{lines.join(" ")}</span>
    </p>
  );
}

const META_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

function LineButton({ press, quiet, onAct }: { press: LinePress; quiet: boolean; onAct: (act: LineAct) => void }) {
  if (press.act.kind === "meta")
    return (
      <Button size="sm" href={press.act.href} {...META_TAB} data-testid="ads-new-line-act">
        {press.words} <Icon name="chevron" size={12} />
      </Button>
    );
  const { act } = press;
  return quiet ? (
    <LinkButton onClick={() => onAct(act)} data-testid="ads-new-line-second">
      {press.words}
    </LinkButton>
  ) : (
    <Button size="sm" onClick={() => onAct(act)} data-testid="ads-new-line-act">
      {press.words}
    </Button>
  );
}

interface LineProps {
  line: LineVM;
  onAct: (act: LineAct) => void;
  /** The ad account's own need opens Meta's window again, where that is its act. */
  onConnect: () => void;
}

/**
 * The one line: what stops the ad, or what it asks, and its one act. A question has two answers, side by side; a
 * line with a way back says it quietly beside its act. The ad account's own need is the card's, drawn as the card
 * draws it.
 */
export function NewLine({ line, onAct, onConnect }: LineProps) {
  if (line.is === "account") return <CardNeed need={line.need} onConnect={onConnect} />;
  // A question's two answers weigh the same; any other second press is the quiet way back.
  const question = line.press?.act.kind === "answer" && line.second?.act.kind === "answer";
  return (
    <div
      className="ads-conn-need ads-new-line"
      data-tone={line.tone}
      role="group"
      aria-label={line.title}
      data-testid="ads-new-line"
    >
      <b>{line.title}</b>
      {line.body ? <span>{line.body}</span> : null}
      {line.press || line.second ? (
        <div className="ads-new-line-acts">
          {line.press ? <LineButton press={line.press} quiet={false} onAct={onAct} /> : null}
          {line.second ? <LineButton press={line.second} quiet={!question} onAct={onAct} /> : null}
        </div>
      ) : null}
    </div>
  );
}

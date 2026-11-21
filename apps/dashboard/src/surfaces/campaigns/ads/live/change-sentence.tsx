/**
 * An ad made here, changed from its drawer (the Ads plan's 4.5): its one sentence, whose total, last day and miles are
 * each the kit's token, pressed to open a box under it; the box, typed in place, with the hint under it and the press
 * that names what it does (a raise names its most); the line that says a change is on its way; and End, which asks
 * first. Every word is the model's (change-model.ts); nothing here decides whether a change can be sent.
 */
import { useState } from "react";
import { minorPerUnit } from "@chanlytics/contracts";
import type { AdChangeAsk } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Token } from "../../../kit/picker/picker";
import { gate } from "../../../frame-verbs";
import { minorOfUnits } from "../model/money";
import { GATE } from "../model/words";
import { changeEditOf, typedOf, type ChangeSentenceVM, type ChangeTyped, type ChangeWord } from "./change-model";
import { CHANGE_EDIT, CHANGE_END, CHANGE_SENTENCE } from "./change-words";

/** Digits alone, as a whole number: what a box of a total or of miles holds. */
const unitsTyped = (typed: string): number => Number(typed.replace(/\D/g, "").slice(0, 9) || "0");

/** The ask that takes a change back to what Meta holds now: what a toast's Undo presses. */
function undoAskOf(word: ChangeWord, vm: ChangeSentenceVM): AdChangeAsk {
  const was = typedOf(vm);
  if (word === "total") return { what: "total", total_minor: was.total_minor };
  return word === "end_day" ? { what: "end_day", end_day: was.end_day } : { what: "miles", miles: was.miles };
}

interface BoxProps {
  vm: ChangeSentenceVM;
  word: ChangeWord;
  typed: ChangeTyped;
  timezone: string;
  busy: boolean;
  onType: (patch: Partial<ChangeTyped>) => void;
  onPress: (ask: AdChangeAsk) => void;
  onDone: () => void;
}

/** The box a tapped word opens: typed in place, with the hint under it and the press following what was typed. */
function ChangeBox({ vm, word, typed, timezone, busy, onType, onPress, onDone }: BoxProps) {
  const edit = changeEditOf(vm, word, typed, { timezone });
  const { currency } = vm.facts;
  const press = edit.press;
  const enter = (event: { key: string }) => {
    if (event.key === "Enter" && press) onPress(press.ask);
  };
  const shared = { onKeyDown: enter, autoFocus: true, enterKeyHint: "done" as const, hint: edit.hint };
  return (
    <div className="ads-live-change" data-tone={edit.tone} data-testid={`ads-change-edit-${word}`}>
      {word === "total" ? (
        <Field
          label={CHANGE_EDIT.label.total}
          value={String(typed.total_minor / minorPerUnit(currency))}
          onValueChange={(text) => onType({ total_minor: minorOfUnits(unitsTyped(text), currency) })}
          unit={currency}
          inputMode="numeric"
          data-testid="ads-change-total"
          {...shared}
        />
      ) : null}
      {word === "end_day" ? (
        <Field
          label={CHANGE_EDIT.label.end_day}
          type="date"
          value={typed.end_day}
          onValueChange={(text) => (text ? onType({ end_day: text }) : undefined)}
          data-testid="ads-change-end-day"
          {...shared}
        />
      ) : null}
      {word === "miles" ? (
        <Field
          label={CHANGE_EDIT.label.miles}
          value={String(typed.miles)}
          onValueChange={(text) => onType({ miles: unitsTyped(text) })}
          unit={CHANGE_EDIT.milesUnit}
          inputMode="numeric"
          data-testid="ads-change-miles"
          {...shared}
        />
      ) : null}
      <div className="ads-live-change-acts">
        {press ? (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => onPress(press.ask)}
            data-testid="ads-change-press"
            {...gate("approve", GATE.change)}
          >
            {press.words}
          </Button>
        ) : null}
        <Button variant="quiet" size="sm" onClick={onDone} data-testid="ads-change-keep">
          {CHANGE_EDIT.cancel}
        </Button>
      </div>
    </div>
  );
}

interface SentenceProps {
  vm: ChangeSentenceVM;
  timezone: string;
  busy: boolean;
  /** A change, and the one that takes it back from its toast. */
  onChange: (ask: AdChangeAsk, back: AdChangeAsk) => void;
}

/** The sentence: who sees it, up to what in all, until when; each of its three words opens its box. */
export function ChangeSentence({ vm, timezone, busy, onChange }: SentenceProps) {
  const [editing, setEditing] = useState<ChangeWord | null>(null);
  const [typed, setTyped] = useState<ChangeTyped>(() => typedOf(vm));
  const open = (word: ChangeWord) => () => {
    setTyped(typedOf(vm));
    setEditing(editing === word ? null : word);
  };
  const word = (id: ChangeWord, words: string) =>
    vm.taps[id] ? (
      <Token
        aria-label={CHANGE_SENTENCE.said(CHANGE_SENTENCE.word[id], words)}
        onClick={open(id)}
        data-testid={`ads-change-word-${id}`}
      >
        {words}
      </Token>
    ) : (
      <span className="ads-word">{words}</span>
    );
  return (
    <div data-testid="ads-change">
      <p className="cm-recipe ads-sentence" data-testid="ads-change-sentence">
        {vm.lead}
        {word("miles", vm.area)}
        {CHANGE_SENTENCE.see}
        {word("total", vm.total)}
        {CHANGE_SENTENCE.until}
        {word("end_day", vm.end)}
        {CHANGE_SENTENCE.end}
      </p>
      {vm.note ? (
        <p className="ads-conn-says" data-testid="ads-change-note">
          {vm.note}
        </p>
      ) : null}
      {editing ? (
        <ChangeBox
          vm={vm}
          word={editing}
          typed={typed}
          timezone={timezone}
          busy={busy}
          onType={(patch) => setTyped((was) => ({ ...was, ...patch }))}
          onPress={(ask) => {
            setEditing(null);
            onChange(ask, undoAskOf(editing, vm));
          }}
          onDone={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/** End, for an ad made here: a quiet door first, then the question with its two answers (docs/words.md, Confirm). */
export function EndAd({ name, busy, onEnd }: { name: string; busy: boolean; onEnd: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <LinkButton onClick={() => setAsking(true)} data-testid="ads-end-open">
        {CHANGE_END.open}
      </LinkButton>
    );
  return (
    <div
      className="ads-conn-need ads-new-line"
      data-tone="warn"
      role="group"
      aria-label={CHANGE_END.ask(name)}
      data-testid="ads-end-ask"
    >
      <b>{CHANGE_END.ask(name)}</b>
      <span>{CHANGE_END.body}</span>
      <div className="ads-new-line-acts">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setAsking(false);
            onEnd();
          }}
          data-testid="ads-end-press"
          {...gate("approve", GATE.change)}
        >
          {CHANGE_END.press}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => setAsking(false)} data-testid="ads-end-keep">
          {CHANGE_END.keep}
        </Button>
      </div>
    </div>
  );
}

/**
 * The list a tapped word of the sentence opens (MOCKUP; Ruben, 11 Oct 2026): its title, its choices each with a line under
 * it that says what that choice changes, the way past them ("Your own amount", "Pick another day"), and the notes under all.
 * A choice the platform will not take is drawn but cannot be pressed, and its line is the platform's rule in its words.
 * On a desk it stands in the kit's popover and a press on a choice applies it. On a phone it is a bottom list (the kit's sheet
 * in a job's shape, list-sheet.tsx): a choice applies at once, except a raise, which names its most and so is picked and
 * then pressed as the sheet's primary ("Raise to $900 in all"); "Your own amount" opens its box inside the sheet.
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { MINOR_PER_UNIT, addDays } from "@chanlytics/contracts";
import { CHIPS, DRAWER, LIST, minorOfUnits, moneyOf } from "@chanlytics/contracts/ads-page";
import type { EditVM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../../kit/button/button";
import { DatePicker } from "../../../kit/datepicker/datepicker";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { focusAsDrawn } from "../../../legacy-verbs";
import type { ListSpec, Row } from "./chip-lists";

interface OwnBoxProps {
  edit: EditVM;
  onSet: (value: string) => void;
  onCancel: () => void;
  /** In a bottom list the press that sets it is the sheet's primary. */
  primary?: boolean;
}

/** The "Your own amount" editor, in the place of the amount's word (or inside the bottom list): a box, Set, Cancel. */
export function OwnBox({ edit, onSet, onCancel, primary = false }: OwnBoxProps) {
  const [text, setText] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const { own } = edit;
  // The box takes the keys as it appears, where a keyboard is not raised over what the person has not read yet.
  useEffect(() => {
    if (focusAsDrawn()) box.current?.focus();
  }, []);
  // The box takes whole units; an amount is held in minor units, and the platform bounds what it may be.
  const minor = minorOfUnits(Number(text.replace(/\D/g, "")));
  const within = minor >= own.minMinor && (own.maxMinor === null || minor <= own.maxMinor);
  const valid = text !== "" && own.refused === null && within && minor !== edit.currentMinor;
  const press = minor > edit.currentMinor && !edit.daily ? CHIPS.raise(moneyOf(minor, edit.currency)) : LIST.set;
  const set = () => (valid ? onSet(String(minor)) : undefined);
  return (
    <span className="ads-own" data-testid="ads-own">
      <Field
        aria-label={CHIPS.own}
        value={text}
        onValueChange={setText}
        inputMode="numeric"
        placeholder={moneyOf(Math.max(own.minMinor, MINOR_PER_UNIT), edit.currency)}
        unit={edit.daily ? LIST.unitDaily : LIST.unitTotal}
        maxLength={6}
        ref={box}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          if (e.key === "Enter") set();
          if (e.key === "Escape") onCancel();
        }}
        data-testid="ads-own-box"
      />
      <Button
        size="sm"
        variant={primary ? "primary" : undefined}
        disabled={!valid}
        onClick={set}
        data-testid="ads-own-set"
      >
        {press}
      </Button>
      <Button size="sm" variant="quiet" onClick={onCancel}>
        {DRAWER.foot.cancel}
      </Button>
      {own.hint ? <span className="ads-own-hint">{own.hint}</span> : null}
    </span>
  );
}

interface OptChoiceProps {
  row: Row;
  checked: boolean;
  onChoose: (value: string) => void;
}

/** One choice: its words, the line under them (what it changes, or why it is refused), and a tick where it is the one now. */
function OptChoice({ row, checked, onChoose }: OptChoiceProps) {
  const refused = row.refused !== null;
  return (
    <LinkButton
      className="ads-opt"
      role="radio"
      aria-checked={checked}
      disabled={refused}
      onClick={() => onChoose(row.value)}
      data-refused={refused ? "" : undefined}
      data-testid={`ads-opt-${row.value}`}
    >
      <span className="ads-opt-label">{row.label}</span>
      {row.sub ? <span className="ads-opt-sub">{row.sub}</span> : null}
      <span className="ads-opt-tick" aria-hidden="true">
        {checked ? <Icon name="check" size={14} /> : null}
      </span>
    </LinkButton>
  );
}

/** "Pick another day": the kit's date picker, from the end date's list; from tomorrow, and for Google no later than its last day. */
function PickDay({ edit, onChoose }: { edit: EditVM; onChoose: (day: string) => void }) {
  const glyph = <Icon name="chevron" size={14} />;
  const tomorrow = addDays(edit.minEnd, 1);
  const pick = (day: string) => {
    if (day <= edit.minEnd) onChoose(tomorrow);
    else onChoose(edit.lastEnd !== null && day > edit.lastEnd ? edit.lastEnd : day);
  };
  return (
    <DatePicker
      value={edit.endDay}
      onValueChange={pick}
      today={edit.minEnd}
      label={LIST.pickDayLabel}
      glyphs={{ previous: glyph, next: glyph }}
      trigger={
        <LinkButton className="ads-opt" data-testid="ads-opt-day">
          <span className="ads-opt-label">{LIST.pickDay}</span>
          <span className="ads-opt-tick" aria-hidden="true">
            <Icon name="calendar" size={14} />
          </span>
        </LinkButton>
      }
    />
  );
}

interface OptPanelProps {
  list: ListSpec;
  edit: EditVM;
  phone: boolean;
  /** Applies a choice; the caller closes the list. */
  onChoose: (value: string) => void;
  /** On a desk "Your own amount" takes the sentence's place; on a phone its box opens inside the sheet. */
  onOwn: () => void;
}

/** A tapped word's list: its title, its choices, the way past them, and the lines that say what a choice changes. */
export function OptPanel({ list, edit, phone, onChoose, onOwn }: OptPanelProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [own, setOwn] = useState(false);
  const raising = list.rows.find((r) => r.value === picked) ?? null;
  const choose = (value: string) => {
    if (phone && list.rows.some((r) => r.value === value && r.raise)) setPicked(value);
    else onChoose(value);
  };
  return (
    <div className="ads-opts" role="radiogroup" aria-label={list.title}>
      {phone ? null : <p className="ads-opts-title">{list.title}</p>}
      {list.rows.map((row) => (
        <OptChoice
          key={row.value}
          row={row}
          checked={picked === null ? row.current : row.value === picked}
          onChoose={choose}
        />
      ))}
      {list.own && !own ? (
        <LinkButton className="ads-opt" onClick={phone ? () => setOwn(true) : onOwn} data-testid="ads-opt-own">
          <span className="ads-opt-label">{CHIPS.own}</span>
        </LinkButton>
      ) : null}
      {list.days ? <PickDay edit={edit} onChoose={onChoose} /> : null}
      {own ? <OwnBox edit={edit} primary onSet={onChoose} onCancel={() => setOwn(false)} /> : null}
      {list.notes.length > 0 ? (
        <div className="ads-notes">
          {list.notes.map((note) => (
            <p key={note} className="ads-note">
              {note}
            </p>
          ))}
        </div>
      ) : null}
      {raising ? (
        <Button
          variant="primary"
          className="ads-bottom-act"
          onClick={() => onChoose(raising.value)}
          data-testid="ads-raise"
        >
          {raising.label}
        </Button>
      ) : null}
    </div>
  );
}

/** What a running ad's offer says when tapped: what changing it does, and the door to Edit, where the photo and words are. */
export function OfferNote({ edit, onEdit, phone }: { edit: EditVM; onEdit: (() => void) | undefined; phone: boolean }) {
  return (
    <div className="ads-opts">
      {phone ? null : <p className="ads-opts-title">{LIST.chip.offer}</p>}
      <div className="ads-notes">
        {edit.notes.offer.map((note) => (
          <p key={note} className="ads-note">
            {note}
          </p>
        ))}
      </div>
      {onEdit ? (
        <LinkButton className="ads-opt" onClick={onEdit} data-testid="ads-offer-edit">
          <span className="ads-opt-label">{DRAWER.foot.edit}</span>
          <span className="ads-opt-tick" aria-hidden="true">
            <Icon name="pencil" size={13} />
          </span>
        </LinkButton>
      ) : null}
    </div>
  );
}

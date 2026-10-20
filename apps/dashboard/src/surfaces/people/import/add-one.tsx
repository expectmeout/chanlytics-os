/**
 * Add people, one person (import-sheet.tsx draws it): a mobile number or an email, either enough, and a name if known,
 * through the one door a person is resolved by (POST contacts: create_person, or add_person with an address, 00393); a
 * number or an address already here opens that person rather than making a second. A note and the lists to put them on
 * go through their own doors once the person is there.
 *
 * Every field is drawn from the start, in two groups of rows (Ruben, 20 Oct 2026: + Note and + Add to a list each
 * lifted every field above the press, and the box they opened took a second tap), and one line under the details says
 * what each moment needs: that either box is enough, what is missing or refused, or who is already here. The lists are
 * one row whose picker opens in the sheet's own room (`ListPicker`): a list found by typing, the one open on People
 * picked already, a new one made with them on it once they are added.
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { samePhone } from "@chanlytics/contracts";
import type { PersonRowVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Face } from "../../kit/face/face";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { RecordSwitch } from "../../kit/record/field";
import { tabDraft } from "../../kit/record/work";
import { Search } from "../../kit/search/search";
import { focusAsDrawn } from "../../legacy-verbs";
import { plAddExtras, plAddPerson, plAddedWords } from "../lists/doors";
import type { Flash } from "../types";

/** A list a person can be put on by hand (one kept by hand, not one a rule keeps), and how many are on it. */
export type HandList = { id: string; name: string; count: number };

/** Someone already here, as People's rows hold them: whom a number or an address typed may turn out to be. */
export type KnownPerson = Pick<PersonRowVM, "id" | "name" | "initials" | "phone" | "email">;

/** Who a number or an address typed already belongs to, and which of the two it was. */
export type Here = { person: KnownPerson; by: "number" | "email" };

/**
 * Who a number or an address typed already is, among the people People holds: the number by its digits, the address
 * whole. The add's own answer stays the truth (a person past the page's first rows still opens rather than doubles).
 */
export function hereOf(known: readonly KnownPerson[], phone: string, email: string): Here | null {
  if (phone.trim()) {
    const p = known.find((k) => samePhone(k.phone, phone));
    if (p) return { person: p, by: "number" };
  }
  const e = email.trim().toLowerCase();
  if (e.includes("@")) {
    const p = known.find((k) => !!k.email && k.email.trim().toLowerCase() === e);
    if (p) return { person: p, by: "email" };
  }
  return null;
}

/** The one line under the details: what is missing or refused, who is already here, or that either box is enough. */
function addPersonLine(error: string | null, here: Here | null): ReactNode {
  if (error)
    return (
      <p className="pl-add-line" data-tone="bad" id="add-person-error" role="alert" data-testid="add-person-error">
        <Icon name="alert" size={14} />
        <span>{error}</span>
      </p>
    );
  if (here)
    return (
      <p className="pl-add-line" data-tone="here" aria-live="polite" data-testid="add-person-here">
        <Face person={{ name: here.person.name, initials: here.person.initials }} size="sm" />
        <b>{here.person.name}</b>
        <span>has this {here.by === "number" ? "number" : "email"}</span>
      </p>
    );
  return (
    <p className="pl-add-line" aria-live="polite">
      A mobile number or an email is enough.
    </p>
  );
}

/** The lists picked, as the row says them: their names, the new ones among them; or nothing. */
function listsPicked(lists: readonly HandList[], ids: readonly string[], made: readonly string[]): string {
  const names = [...lists.filter((l) => ids.includes(l.id)).map((l) => l.name), ...made];
  return names.join(", ");
}

/** One person's fields, every one drawn from the start: who they are, then a note and the lists to put them on. */
export function oneFields(one: AddOne, lists: readonly HandList[], here: Here | null, onPick: () => void): ReactNode {
  const bad = !!one.error;
  const picked = listsPicked(lists, one.listIds, one.newLists);
  return (
    <>
      <div className="rec-rows" data-invalid={bad ? "true" : undefined}>
        <Field
          look="row"
          label="Name"
          value={one.name}
          onValueChange={one.setName}
          placeholder="Optional"
          maxLength={80}
          readOnly={one.busy}
          autoComplete="name"
          enterKeyHint="next"
          ref={one.refs.name}
          onKeyDown={one.keys.name}
          data-testid="add-person-name"
        />
        <Field
          look="row"
          label="Mobile"
          type="tel"
          inputMode="tel"
          value={one.phone}
          onValueChange={one.setPhone}
          maxLength={24}
          readOnly={one.busy}
          invalid={bad}
          aria-describedby={bad ? "add-person-error" : undefined}
          autoComplete="tel"
          enterKeyHint={one.phone.trim() ? "go" : "next"}
          ref={one.refs.phone}
          onKeyDown={one.keys.phone}
          data-testid="add-person-phone"
        />
        <Field
          look="row"
          label="Email"
          type="email"
          inputMode="email"
          value={one.email}
          onValueChange={one.setEmail}
          maxLength={254}
          readOnly={one.busy}
          invalid={bad}
          aria-describedby={bad ? "add-person-error" : undefined}
          autoComplete="email"
          enterKeyHint="go"
          ref={one.refs.email}
          onKeyDown={one.keys.email}
          data-testid="add-person-email"
        />
      </div>
      {addPersonLine(one.error, here)}
      <div className="rec-rows">
        <Field
          look="row"
          label="Note"
          rows={2}
          value={one.note}
          onValueChange={one.setNote}
          placeholder="Optional"
          maxLength={2000}
          readOnly={one.busy}
          data-testid="add-person-note"
        />
        <Field
          look="row"
          label="Lists"
          onLabelPress={onPick}
          control={
            <Button
              variant="plain"
              ref={one.refs.lists}
              onClick={onPick}
              disabled={one.busy}
              aria-haspopup="dialog"
              aria-label={`Lists: ${picked || "none"}`}
              data-none={picked ? undefined : "true"}
              data-testid="add-person-list"
            >
              <span>{picked || "None"}</span>
              <Icon name="chevron-down" size={14} />
            </Button>
          }
        />
      </div>
    </>
  );
}

/**
 * The lists to put them on, in the sheet's own room (it keeps its height): a box that finds one by its name, or names a
 * new one; the list open on People first, picked already; then every list kept by hand, A to Z, each with how many are
 * on it and its switch, as a person's own Add to a list has (person/sheets/lists-sheet.tsx). A new one is made with them
 * on it once they are added (plAddExtras), so a sheet left behind leaves no empty list.
 */
export function ListPicker({
  one,
  lists,
  openList,
  onBack,
}: {
  one: AddOne;
  lists: readonly HandList[];
  openList: string | null;
  onBack: () => void;
}) {
  const [q, setQ] = useState("");
  const find = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // No keyboard rises by itself on a touch screen: the box waits for its tap there (focusAsDrawn).
    if (focusAsDrawn() && find.current) find.current.focus({ preventScroll: true });
  }, []);
  const query = q.trim();
  const low = query.toLowerCase();
  const fits = (name: string) => !low || name.toLowerCase().includes(low);
  const open = openList ? (lists.find((l) => l.id === openList) ?? null) : null;
  const rest = lists.filter((l) => l.id !== openList && fits(l.name)).sort((a, b) => a.name.localeCompare(b.name));
  const made = one.newLists.filter(fits);
  const named = [...lists.map((l) => l.name), ...one.newLists].some((n) => n.trim().toLowerCase() === low);
  const row = (r: { key: string; name: string; count: string; on: boolean; flip: () => void }) => (
    <label key={r.key} className="pl-add-pick-row">
      <span id={`pl-add-pick-${r.key}`}>{r.name}</span>
      <span className="pl-add-pick-count">{r.count}</span>
      <RecordSwitch on={r.on} labelledBy={`pl-add-pick-${r.key}`} onChange={r.flip} testid="add-person-list-switch" />
    </label>
  );
  const group = (cap: ReactNode, rows: ReactNode[]) => (
    <>
      <p className="pl-add-pick-cap">{cap}</p>
      <div className="rec-rows">{rows}</div>
    </>
  );
  const nothing = !made.length && !(open && fits(open.name)) && !rest.length;
  return (
    // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- Escape inside the picker goes back to the details, before the sheet hears it
    <div
      className="pl-add-picker"
      data-testid="add-person-lists"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.preventDefault();
        onBack();
      }}
    >
      <Search label="Find or make a list" value={q} onChange={setQ} inputRef={find} testid="add-person-list-find" />
      {made.length
        ? group(
            "New",
            made.map((name, i) =>
              row({ key: `new-${i}`, name, count: "New", on: true, flip: () => one.dropNew(name) }),
            ),
          )
        : null}
      {open && fits(open.name)
        ? group("Open on People", [
            row({
              key: open.id,
              name: open.name,
              count: open.count.toLocaleString(),
              on: one.listIds.includes(open.id),
              flip: () => one.flipList(open.id),
            }),
          ])
        : null}
      {rest.length
        ? group(
            <>
              All lists <span>{rest.length.toLocaleString()}</span>
            </>,
            rest.map((l) =>
              row({
                key: l.id,
                name: l.name,
                count: l.count.toLocaleString(),
                on: one.listIds.includes(l.id),
                flip: () => one.flipList(l.id),
              }),
            ),
          )
        : null}
      {nothing ? (
        <p className="pl-add-line">{low ? `No list called “${query}”.` : "No lists yet. Type a name to make one."}</p>
      ) : null}
      {low && !named ? (
        <Button
          className="pl-add-make"
          onClick={() => {
            one.makeNew(query);
            setQ("");
          }}
          data-testid="add-person-list-make"
        >
          <Icon name="plus" size={14} />
          <span>New list “{query}”, with them on it</span>
        </Button>
      ) : null}
    </div>
  );
}

/** What was typed for one person, and the lists picked: kept in the tab as it changes, asked about before it is thrown away. */
export interface Typed {
  name: string;
  phone: string;
  email: string;
  note: string;
  listIds: string[];
  newLists: string[];
}
export const TYPED_KIND = "people-add";
export const typedAny = (t: Typed) => [t.name, t.phone, t.email, t.note].some((v) => v.trim() !== "");
const strings = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x): x is string => typeof x === "string") ? v : null;
/** The words a person left in the sheet, when it opens again: what the tab kept, or nothing. */
const keptTyped = (): Partial<Typed> => {
  const kept = tabDraft(TYPED_KIND);
  if (!kept || typeof kept !== "object") return {};
  const k = kept as Partial<Record<keyof Typed, unknown>>;
  const listIds = strings(k.listIds);
  const newLists = strings(k.newLists);
  return {
    ...(typeof k.name === "string" ? { name: k.name } : {}),
    ...(typeof k.phone === "string" ? { phone: k.phone } : {}),
    ...(typeof k.email === "string" ? { email: k.email } : {}),
    ...(typeof k.note === "string" ? { note: k.note } : {}),
    ...(listIds ? { listIds } : {}),
    ...(newLists ? { newLists } : {}),
  };
};

/** Return in a box: on to the next box, or the add itself once a number or an address is there to add by. */
function useReturnKeys(p: {
  phone: string;
  email: string;
  submit: () => Promise<void>;
  refs: { phone: { current: HTMLInputElement | null }; email: { current: HTMLInputElement | null } };
}) {
  const enter = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    e.key === "Enter" && !e.nativeEvent.isComposing && !e.metaKey && !e.ctrlKey;
  return {
    name: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!enter(e)) return;
      e.preventDefault();
      p.refs.phone.current?.focus();
    },
    phone: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!enter(e)) return;
      e.preventDefault();
      if (p.phone.trim() || p.email.trim()) void p.submit();
      else p.refs.email.current?.focus();
    },
    email: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!enter(e)) return;
      e.preventDefault();
      void p.submit();
    },
  };
}

/**
 * The add's own state: the fields, the lists picked, its save and its refusal. The person is added through the one
 * door, then the note and the lists through their own; added, the sheet closes and their page opens, and what did not
 * go on (a note, a list) is said beside the add, never in its place.
 */
export function useAddOne(p: {
  onClose: () => void;
  onAdded: (id: string) => void;
  flash: Flash | null;
  firstLists: string[];
}) {
  const [kept] = useState(keptTyped);
  const [name, setName] = useState(kept.name ?? "");
  const [phone, setPhoneNow] = useState(kept.phone ?? "");
  const [email, setEmailNow] = useState(kept.email ?? "");
  const [note, setNote] = useState(kept.note ?? "");
  const [listIds, setListIds] = useState<string[]>(() => kept.listIds ?? p.firstLists);
  const [newLists, setNewLists] = useState<string[]>(() => kept.newLists ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = {
    name: useRef<HTMLInputElement | null>(null),
    phone: useRef<HTMLInputElement | null>(null),
    email: useRef<HTMLInputElement | null>(null),
    lists: useRef<HTMLButtonElement | null>(null),
  };
  const setPhone = (v: string) => {
    setPhoneNow(v);
    setError(null);
  };
  const setEmail = (v: string) => {
    setEmailNow(v);
    setError(null);
  };
  const submit = async () => {
    if (busy) return;
    // Add stands from the first draw, so the sheet says how it ends; pressed with neither, the line says what is missing.
    if (!phone.trim() && !email.trim()) {
      setError("A mobile number or an email is needed.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await plAddPerson({ name, phone, email });
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
      return;
    }
    const missed = await plAddExtras(r.id, { note, listIds, newLists });
    setBusy(false);
    if (p.flash) p.flash({ msg: plAddedWords({ name, phone, email }, r.existed, missed) });
    p.onClose();
    p.onAdded(r.id);
  };
  const keys = useReturnKeys({ phone, email, submit, refs });
  return {
    name,
    setName,
    phone,
    setPhone,
    email,
    setEmail,
    note,
    setNote,
    listIds,
    newLists,
    flipList: (id: string) => setListIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id])),
    makeNew: (n: string) =>
      setNewLists((xs) => (xs.some((x) => x.toLowerCase() === n.toLowerCase()) ? xs : [...xs, n])),
    dropNew: (n: string) => setNewLists((xs) => xs.filter((x) => x !== n)),
    busy,
    error,
    submit,
    refs,
    keys,
  };
}

export type AddOne = ReturnType<typeof useAddOne>;

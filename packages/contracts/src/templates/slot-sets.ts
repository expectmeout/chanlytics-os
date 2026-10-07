/**
 * The slots a message's versions fill (One message, every channel, step 5), said once for every kind of email: which
 * slots a message has, how a slot is written between double braces, which the words name, and what fills each. A
 * campaign message's slots are numbered, {{1}} to {{n}}, as Meta's are; a reach-out's email names six of its own
 * ({{business}}, {{your name}}). Both are a slot set, and the one reader of the words, the one fill and the check, the
 * editor's parts and the previews all take it, so an email's slots are read one way wherever they are met.
 *
 * A numbered set reads {{digits}} alone and leaves any other braces words. A named set reads every {{…}} as a slot, in
 * any case and spacing, so a name it does not list is a fault and so is a brace with no pair: neither may ever reach a
 * person. Values go by position: the value for a slot is the one at its place in the set's `keys`.
 */

/** A slot's key as written between the braces: a number's digits, or a name as the set lists it. */
export type SlotKey = string;

/**
 * The slots a message's versions fill. `keys` is each as written, in order, and `labels` what a page calls each (a
 * numbered slot with no name has an empty label, which a page says as "Value 3").
 */
export interface SlotSet {
  readonly kind: "numbered" | "named";
  readonly keys: readonly SlotKey[];
  readonly labels: readonly string[];
}

/** The numbered slots {{1}} to {{n}}: by their labels, or by how many there are where only that matters (a check). */
export function numberedSlots(labels: readonly string[] | number): SlotSet {
  const names = typeof labels === "number" ? Array.from({ length: Math.max(0, labels) }, () => "") : labels;
  return { kind: "numbered", keys: names.map((_, i) => String(i + 1)), labels: names };
}

/** Slots named from a list. `labels` is what a page calls each; each is called by its own name where none is given. */
export function namedSlots(names: readonly string[], labels: readonly string[] = names): SlotSet {
  return { kind: "named", keys: names, labels };
}

const NUMBERED_SLOT = /\{\{(\d+)\}\}/g;
const NAMED_SLOT = /\{\{([^{}]*)\}\}/g;

/** The slot's pattern for a kind of set: group 1 is what stands between the braces. */
const patternOf = (set: Pick<SlotSet, "kind">): RegExp => (set.kind === "numbered" ? NUMBERED_SLOT : NAMED_SLOT);

/** A name as a named set compares it: trimmed, its spaces folded, in lower case ({{ Your  Name }} is {{your name}}). */
function slotKey(name: string): SlotKey {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * What stands between the braces as the key it names: a number as the number it is (its digits without leading zeros,
 * whatever their count, never through a float), a name in its plain form. The editor's chips (message-version-slots.ts) and
 * the fill both read a slot through this, so a spelling is a slot to both or to neither.
 */
const keyInSet = (set: Pick<SlotSet, "kind">, inner: string): SlotKey =>
  set.kind === "numbered" ? inner.replace(/^0+(?=\d)/, "") : slotKey(inner);

/** A slot as it is written: its key between double braces. */
export const slotWritten = (key: SlotKey | number): string => `{{${key}}}`;

/** One slot as the words write it: its key, where it stands, and how it was spelled. */
interface SlotMention {
  key: SlotKey;
  index: number;
  written: string;
}

/** Every slot the words write, in the order written, each time it is written. */
export function slotMentions(set: Pick<SlotSet, "kind">, text: string): SlotMention[] {
  return [...text.matchAll(patternOf(set))].map((m) => ({
    key: keyInSet(set, m[1] ?? ""),
    index: m.index,
    written: m[0],
  }));
}

/**
 * What the words say of their slots: each one named, once, and whether a brace is left once they are out. A numbered
 * set's come in number order and ignore any other braces; a named set's come as written, and a brace with no pair
 * ("{{business", "{business}", "{{{business}}}") is stray.
 */
export function slotsWritten(set: Pick<SlotSet, "kind">, text: string): { keys: SlotKey[]; stray: boolean } {
  const keys = [...new Set(slotMentions(set, text).map((m) => m.key))];
  if (set.kind === "numbered") return { keys: keys.sort((a, b) => Number(a) - Number(b)), stray: false };
  return { keys, stray: /[{}]/.test(text.replace(NAMED_SLOT, "")) };
}

/** How many times the words write one slot. */
export function slotCountIn(set: Pick<SlotSet, "kind">, text: string, key: SlotKey): number {
  return slotMentions(set, text).filter((m) => m.key === key).length;
}

/** The words with every slot taken out and a space left where it stood: what a reader counts, reads or tests beside it. */
export function slotsOut(set: Pick<SlotSet, "kind">, text: string): string {
  return text.replace(patternOf(set), " ");
}

/** The first slot the words write that the set does not have; null when they keep to the set's own. */
export function slotOutside(set: SlotSet, text: string): SlotKey | null {
  return slotsWritten(set, text).keys.find((k) => !set.keys.includes(k)) ?? null;
}

/** Whether the words are written wrongly for the set: a slot it does not have, or a brace with no pair. */
export function slotFault(set: SlotSet, text: string): boolean {
  return slotOutside(set, text) !== null || slotsWritten(set, text).stray;
}

/** What may stand for a slot's value: a slot with none is a hole. */
export type SlotValue = string | null | undefined;

/** Where a slot's value is in a list of values: a numbered slot's by its number, a named one's by its place in the set. */
const placeInSet = (set: SlotSet | undefined, key: SlotKey): number =>
  !set || set.kind === "numbered" ? Number(key) - 1 : set.keys.indexOf(key);

/** The value a list of values holds for one slot: none for a slot the set does not have, or one given no value. */
export function slotValueOf(set: SlotSet | undefined, key: SlotKey, values: readonly SlotValue[]): SlotValue {
  return values[placeInSet(set, key)];
}

/**
 * The words with each slot filled: the value at the slot's place, and a slot with no value is left as it is written, so a
 * hole shows. A text of numbered slots takes no set; a text of named ones is read by its own.
 */
export function fillSlots(text: string, values: readonly SlotValue[], set?: SlotSet): string {
  const kind = set ?? { kind: "numbered" as const };
  return text.replace(
    patternOf(kind),
    (whole, inner: string) => slotValueOf(set, keyInSet(kind, inner), values) ?? whole,
  );
}

/** A set's values in its order, from the ones known by key: a blank one is a hole, so its slot is left as written. */
export function slotValues(set: SlotSet, known: Readonly<Record<SlotKey, SlotValue>>): Array<string | undefined> {
  return set.keys.map((key) => known[key]?.trim() || undefined);
}

/**
 * Whether filling these words would leave a hole: a slot the words write that has no value, or the set does not have,
 * or a brace with no pair. The one rule for "this email cannot go as it is", asked by the send and the preview alike.
 */
export function slotHoles(set: SlotSet, text: string, values: readonly SlotValue[]): boolean {
  const written = slotsWritten(set, text);
  return written.stray || written.keys.some((key) => (slotValueOf(set, key, values) ?? null) === null);
}

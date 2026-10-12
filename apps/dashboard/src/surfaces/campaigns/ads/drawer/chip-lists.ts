/**
 * What each tapped word of an ad's sentence lists (MOCKUP): the rows it offers and the lines under them that say what each
 * choice changes. Pure; option-list.tsx draws them. The drawer hands the lists its model's `EditVM`, whose amounts and end
 * dates already carry what each does to a day and which the platform will not take (drawer-edit.ts); New ad, which has none
 * to hand, jumps to its steps instead of opening a list. Amounts are minor units of the ad's currency.
 */
import type { AdDoor, AdsRead } from "@chanlytics/contracts";
import { CHIPS, DOOR, DOOR_ORDER, LIST, PLATFORM_WORD, platformsFor } from "@chanlytics/contracts/ads-page";
import type { ChipId, EditVM, SentencePart } from "@chanlytics/contracts/ads-page";

/** A word of the sentence that can be tapped. */
export type ChipPart = Extract<SentencePart, { chip: string }>;

/** One choice in a list: the value it hands back, its words, the line under them, and whether it is the one now. */
export interface Row {
  value: string;
  label: string;
  sub: string | null;
  current: boolean;
  /** Above what it is now: a raise names its most, so on a phone it is the sheet's primary. */
  raise: boolean;
  /** The platform's rule that stops it, in its words; null where it is allowed. */
  refused: string | null;
}

/** A list: its title, its choices, the lines that say what a choice changes, and the two ways past the choices. */
export interface ListSpec {
  title: string;
  rows: Row[];
  notes: string[];
  /** "Your own amount" after the rows. */
  own: boolean;
  /** "Pick another day" after the rows. */
  days: boolean;
}

/** What the lists are made from. */
export interface ListCtx {
  edit: EditVM;
  offers: AdsRead["services"];
  door: AdDoor;
}

const optionRow = (value: string, label: string, current: boolean, sub: string | null = null): Row => ({
  value,
  label,
  sub,
  current,
  raise: false,
  refused: null,
});

const spec = (
  title: string,
  rows: Row[],
  notes: string[],
  more: Partial<Pick<ListSpec, "own" | "days">> = {},
): ListSpec => ({
  title,
  rows,
  notes,
  own: more.own ?? false,
  days: more.days ?? false,
});

/** The list a tapped word opens. */
export function listFor(part: ChipPart, c: ListCtx): ListSpec {
  const { edit } = c;
  switch (part.id) {
    case "area": {
      const rows = edit.areas.map((a) => optionRow(String(a.miles), a.label, a.label === part.value, a.people));
      return spec(CHIPS.areaMiles, rows, edit.notes.area);
    }
    case "amount": {
      const rows = edit.amounts.map((a): Row => ({
        value: String(a.minor),
        label: a.label,
        sub: a.sub,
        current: a.current,
        raise: a.raise,
        refused: a.refused,
      }));
      // Nothing can be typed while the platform will not take a change.
      return spec(edit.daily ? LIST.amountDaily : CHIPS.amountTitle, rows, edit.notes.amount, {
        own: edit.own.refused === null,
      });
    }
    case "end": {
      const rows = edit.ends.map((e) => optionRow(e.day, e.label, e.current, e.sub));
      return spec(CHIPS.endTitle, rows, edit.notes.end, { days: true });
    }
    case "door":
      return spec(
        LIST.chip.door,
        DOOR_ORDER.map((d) => optionRow(d, DOOR[d].label, d === part.value, DOOR[d].line)),
        [],
      );
    case "platform":
      return spec(
        LIST.chip.platform,
        platformsFor(c.door).map((p) => optionRow(p, PLATFORM_WORD[p], p === part.value)),
        [],
      );
    default:
      return spec(
        LIST.chip.offer,
        c.offers.map((s) => optionRow(s.id, s.name, s.name === part.value, s.note)),
        edit.notes.offer,
      );
  }
}

export const chipValue = (parts: readonly SentencePart[], id: ChipId): string | undefined =>
  parts.find((p): p is ChipPart => "chip" in p && p.id === id)?.value;

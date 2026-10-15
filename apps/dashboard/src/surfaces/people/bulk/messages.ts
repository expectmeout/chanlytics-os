/**
 * What may go to a selection, and who answers them: the person page's own group, Messages and receptionist (contracts
 * PERSON_ABOUT_WORDS.messages), for many at once. A yes to messages and how it was given, a yes to
 * offers and news by the form they signed, and the receptionist's mode, an owner's. One list, drawn as a desk bar's one
 * menu and a phone's one step (the sheets as verbs, 14 Oct 2026: a desk drew two menus, Record a yes and Receptionist,
 * and a phone two steps, from the same three sets). What a choice does is the bar's (bulk-acts.tsx), handed in.
 */
import { PL_MODES, PL_SOURCE_GLYPH, plModeWord } from "../words";
import type { BulkCtx } from "./bulk-state";

type Purpose = "conversational" | "marketing";
type Way = { id: string; label: string };
type Mode = (typeof PL_MODES)[number];

/** One choice: its words, its glyph, whether it asks something next (a form's note), and its press. */
export interface MessagesChoice {
  key: string;
  label: string;
  icon: string;
  next: boolean;
  testid: string;
  onSelect: () => void;
}

/** The three sets, each under its heading; a set the role or the page does not keep is left out. */
export function messagesChoices(
  b: BulkCtx,
  on: { yes: (purpose: Purpose, way: Way) => () => void; mode: (m: Mode & { label: string }) => void },
): { header: string; items: MessagesChoice[] }[] {
  if (!b.canEdit) return [];
  const yesTo = (purpose: Purpose, ways: readonly Way[], glyph: string) =>
    ways.map((s) => ({
      key: `${purpose}-${s.id}`,
      label: s.label,
      icon: PL_SOURCE_GLYPH[s.id] || glyph,
      next: s.id === "form",
      testid: `bulk-yes-${purpose}-${s.id}`,
      onSelect: on.yes(purpose, s),
    }));
  const groups: { header: string; items: MessagesChoice[] }[] = [];
  if (b.keeps("consent") && b.sources.length > 0) {
    groups.push({ header: "Yes to messages", items: yesTo("conversational", b.sources, "check") });
    if (b.offersSources.length > 0)
      groups.push({ header: "Yes to offers and news", items: yesTo("marketing", b.offersSources, "tag") });
  }
  if (b.isOwner && b.keeps("receptionist"))
    groups.push({
      header: "Receptionist for these people",
      items: PL_MODES.map((m) => ({
        key: `mode-${m.id}`,
        label: plModeWord(m.id),
        icon: m.icon,
        next: false,
        testid: `bulk-mode-${m.id}`,
        onSelect: () => on.mode({ ...m, label: plModeWord(m.id) }),
      })),
    });
  return groups;
}

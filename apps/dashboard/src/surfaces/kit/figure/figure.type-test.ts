/**
 * What the kit's Figure takes, proved where the compiler reads it (figure.tsx): the words it counts and says, the period
 * before and the line under as words or none, a definition as words, a door as the kit's press props (a link's address or an
 * act), and the page's class and ids. A label or a number missing, a number that is not said, a definition that is an
 * element, and a door whose address is not words stop compiling.
 *
 * A ratio's count (`n`) is a number or none, and so is the fewest that say anything (`minN`): words stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the dashboard's
 * `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no bundle reaches it,
 * and the calls are in a function nothing calls.
 */
import type { ComponentProps } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { FigureProps } from "../index";
import type { PressAct, PressDoor } from "../press";
import { Figure } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _figureTakes(now: { door: PressAct | PressDoor | undefined; change: string | null }): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Figure>, FigureProps>>,
    Holds<Exactly<FigureProps["door"], PressAct | PressDoor | undefined>>,
    Holds<Exactly<FigureProps["change"], string | null | undefined>>,
    Holds<Exactly<FigureProps["n"], number | null | undefined>>,
    Holds<Exactly<FigureProps["minN"], number | undefined>>,
  ];
  Figure({ label: "Customer messages", value: "17" });
  Figure({
    label: "Customer messages",
    value: "17",
    change: "up from 7",
    meta: "on 6 of 7 days",
    id: "customer_messages",
  });
  Figure({
    label: "Customer messages",
    value: "17",
    definition: "What customers wrote or phoned in.",
    "data-testid": "fig",
  });
  Figure({ label: "Needed you", value: "3", door: { href: "/w/harbor/inbox" }, className: "rpt-cell" });
  Figure({ label: "Needed you", value: "3", door: { onClick: () => undefined } });
  // Chosen as the page runs: a door or none, and a change or none.
  Figure({ label: "Needed you", value: "3", door: now.door, change: now.change });
  // A ratio says what it is of (`n`) and the fewest that say anything (`minN`); a count that is not known is null.
  Figure({ label: "Answered without you", value: "62%", n: 17, minN: 5 });
  Figure({ label: "Answered without you", value: "—", n: null, minN: 5 });

  // @ts-expect-error a figure says what it counts: its label
  Figure({ value: "17" });
  // @ts-expect-error a figure's number is said (words), never a number the page has not formatted
  Figure({ label: "Calls", value: 3 });
  // @ts-expect-error a definition is words, drawn in the kit's tooltip, never an element
  Figure({ label: "Calls", value: "3", definition: { words: "What customers wrote." } });
  // @ts-expect-error a door that is a link has an address in words
  Figure({ label: "Calls", value: "3", door: { href: 3 } });
  // @ts-expect-error the label is words: a glyph or markup beside it is the page's, not the figure's
  Figure({ label: { words: "Calls" }, value: "3" });
  // @ts-expect-error a count is a number, never words
  Figure({ label: "Calls", value: "3", n: "17" });
  // @ts-expect-error a count is a number, never words
  Figure({ label: "Calls", value: "3", minN: "5" });
}

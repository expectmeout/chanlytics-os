/**
 * What the kit's Line takes, proved where the compiler reads it (line.tsx). A press names its kind, and what would draw a
 * wrong one stops compiling: a kind the map lacks, a press with no kind, and a link's address, since what a press of the line
 * opens goes by the Line's own move. The field takes a textarea's props and its ref.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line under
 * `@ts-expect-error <why>` must not compile. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { LineFieldProps, LinePressProps } from "../index";
import { LineField, LinePress } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _lineTakes(field: RefObject<HTMLTextAreaElement | null>, press: RefObject<HTMLButtonElement | null>): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof LinePress>, LinePressProps>>,
    Holds<Exactly<ComponentProps<typeof LineField>, LineFieldProps>>,
  ];

  LinePress({ kind: "send", disabled: true, ref: press });
  LinePress({ kind: "chip", selected: true, className: "ask-next" });
  LinePress({ kind: "act", on: true, "aria-label": "Copy" });
  LineField({ listening: true, rows: 1, ref: field, value: "", onChange: () => undefined });

  // @ts-expect-error a kind the map lacks
  LinePress({ kind: "primary" });
  // @ts-expect-error a press names its kind
  LinePress({});
  // @ts-expect-error what a press of the line opens goes by the Line's own move, never an address
  LinePress({ kind: "open", href: "/w/studio" });
}

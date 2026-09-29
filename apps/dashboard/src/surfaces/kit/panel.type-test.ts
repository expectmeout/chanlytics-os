/**
 * What the kit's Panel takes, proved where the compiler reads it (panel.tsx): its three surfaces and three paddings,
 * each left out for its default, and the element it is drawn on, which its ref holds. A surface or a padding the map
 * lacks, a tone, another element, and a section's ref on a div stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import { Panel } from "./index";

type Takes = ComponentProps<typeof Panel>;

/** Never called: the compiler reads it, and nothing runs it. */
function _panelTakes(div: RefObject<HTMLDivElement | null>, section: RefObject<HTMLElement | null>): void {
  type _Its = [
    Holds<Exactly<Takes["variant"], "pane" | "inset" | "pop" | undefined>>,
    Holds<Exactly<Takes["size"], "md" | "sm" | "flush" | undefined>>,
    Holds<Exactly<Takes["as"], "div" | "section" | undefined>>,
  ];
  Panel({ children: "Open today until six." });
  Panel({ variant: "inset", size: "sm", ref: div, children: "Their notes go with them." });
  Panel({ as: "section", variant: "pop", size: "flush", ref: section, children: "Three services" });

  // @ts-expect-error its surfaces are a pane, an inset and a pop
  Panel({ variant: "card", children: "Hours" });
  // @ts-expect-error its paddings are md, sm and flush
  Panel({ size: "lg", children: "Hours" });
  // @ts-expect-error it has no tone: what it holds says one
  Panel({ tone: "warn", children: "Hours" });
  // @ts-expect-error it is drawn on a div or a section
  Panel({ as: "aside", children: "Hours" });
  // @ts-expect-error a section's ref on a panel drawn on a div: as="section" draws the element that ref holds
  Panel({ ref: section, children: "Hours" });
}

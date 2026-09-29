/**
 * What the kit's Meter takes, proved where the compiler reads it (meter.tsx): its parts, each a share with a tone or a
 * series colour, the rest of the whole or none, its three heights, each written so or chosen as the page runs, and the
 * words it says to a screen reader. A height or a tone the map lacks, a part with both colours or neither, a part with
 * no share, a meter with no words, and a role of the page's stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { MeterProps } from "./index";
import { Meter } from "./index";

/** Never called: the compiler reads it, and nothing runs it. */
function _meterTakes(meter: RefObject<HTMLDivElement | null>, now: { held: boolean; size: MeterProps["size"] }): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Meter>, MeterProps>>,
    Holds<Exactly<MeterProps["size"], "sm" | "md" | "lg" | undefined>>,
    Holds<Exactly<MeterProps["parts"][number]["tone"], "ok" | "warn" | undefined>>,
  ];
  Meter({ parts: [{ share: 12, color: "var(--color-whatsapp)" }], "aria-label": "12 WhatsApp" });
  Meter({
    parts: [
      { share: 12, tone: "ok" },
      { share: 3, tone: "warn" },
    ],
    rest: true,
    size: "sm",
    "aria-label": "12 will get it, 3 held back",
    ref: meter,
  });
  // Chosen as the page runs: a part's tone, and the height.
  Meter({ parts: [{ share: 3, tone: now.held ? "warn" : "ok" }], size: now.size, "aria-label": "3 so far" });

  // @ts-expect-error 8px, large and small: the kit draws three heights
  Meter({ parts: [], size: "xl", "aria-label": "Nothing yet" });
  // @ts-expect-error ok and warn are a part's tones
  Meter({ parts: [{ share: 3, tone: "danger" }], "aria-label": "3 failed" });
  // @ts-expect-error a part's colour is a tone or a series colour, never both
  Meter({ parts: [{ share: 3, tone: "ok", color: "var(--color-sms)" }], "aria-label": "3 by text" });
  // @ts-expect-error a part has a colour: a tone, or the series colour a chart gives it
  Meter({ parts: [{ share: 3 }], "aria-label": "3 by text" });
  // @ts-expect-error a part is its share of the whole
  Meter({ parts: [{ tone: "ok" }], "aria-label": "some" });
  // @ts-expect-error it draws no words, so it says its parts to a screen reader
  Meter({ parts: [{ share: 3, tone: "ok" }] });
  // @ts-expect-error it is an image of its parts: its role is the kit's
  Meter({ parts: [], role: "progressbar", "aria-label": "Sent so far" });
}

/**
 * What the kit's Spark takes, proved where the compiler reads it (spark.tsx): its columns, each a value with a share of it
 * or none, whether the last is today's, its two heights, and the words it says to a screen reader. A height the map lacks,
 * a column with no value, a spark with no words, and a role of the page's stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. It imports through the kit's index, as a surface does; nothing imports
 * it, so no bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { SparkProps } from "../index";
import { Spark } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _sparkTakes(): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Spark>, SparkProps>>,
    Holds<Exactly<SparkProps["size"], "sm" | "md" | undefined>>,
    Holds<Exactly<SparkProps["today"], boolean | undefined>>,
  ];
  // A week behind a figure, today's last.
  Spark({ columns: [{ value: 2 }, { value: 3 }, { value: 1 }], today: true, size: "sm", "aria-label": "Last 7 days" });
  // A month of messages, what AI answered the lower part of each.
  Spark({ columns: [{ value: 4, part: 3 }], "aria-label": "Last 30 days" });
  // @ts-expect-error a height the spark does not have
  Spark({ columns: [], size: "lg", "aria-label": "x" });
  // @ts-expect-error a column says its value
  Spark({ columns: [{ part: 1 }], "aria-label": "x" });
  // @ts-expect-error it draws no words, so it says them
  Spark({ columns: [] });
  // @ts-expect-error its role is an image, the kit's
  Spark({ columns: [], role: "list", "aria-label": "x" });
}

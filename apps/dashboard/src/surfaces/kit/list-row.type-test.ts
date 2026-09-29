/**
 * What the kit's ListRow takes, proved where the compiler reads it (list-row.tsx): a face, the name, the facts, and
 * what trails, what was said and a note where a page has them; what trails is drawn by the page with the class the row
 * hands it. A row with no face, a face of nobody, facts that are not a list, what trails as words, an address, and
 * children stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, ReactNode, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import { ListRow } from "./index";

type Takes = ComponentProps<typeof ListRow>;

/** Never called: the compiler reads it, and nothing runs it. */
function _listRowTakes(pill: (place: string) => ReactElement, row: RefObject<HTMLDivElement | null>): void {
  type _Its = [
    Holds<Exactly<Takes["end"], ((place: string) => ReactNode) | undefined>>,
    Holds<Exactly<Takes["facts"], readonly ReactNode[]>>,
  ];
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", facts: ["Sat · 10:00", "2 h ago"] });
  ListRow({
    face: { initials: "AR", photo: "https://example.com/aisha.jpg" },
    name: "Aisha Rahman",
    end: pill,
    said: "asked about Saturday",
    facts: [null, "2 h ago"],
    note: "Next step: call back on Monday",
    ref: row,
  });

  // @ts-expect-error a row's first column is its face
  ListRow({ name: "Aisha Rahman", facts: [] });
  // @ts-expect-error the face is the kit's, and stands for someone
  ListRow({ face: {}, name: "Aisha Rahman", facts: [] });
  // @ts-expect-error the facts are a list, each drawn in a span of its own
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", facts: "2 h ago" });
  // @ts-expect-error what trails is the page's element, drawn with the class the row hands it
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", end: "Needs you", facts: [] });
  // @ts-expect-error a row that opens a page waits for a link row in kit.css
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", facts: [], href: "/w/studio/#/clients" });
  // @ts-expect-error its lines are its props: it takes no children
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", facts: [], children: "Aisha" });
}

/**
 * What the kit's ListRow takes, proved where the compiler reads it (list-row.tsx): a face and the name, and what
 * trails, what was said, the facts and a note where a page has them; what trails, and the said line where it is the
 * page's own element, are drawn by the page with the class the row hands it; an address, written so or known only as
 * the page runs, makes the row a link, whose ref holds a link. A row with no face, a face of nobody, facts that are not
 * a list, what trails as words, children and a ref of the other element stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, ReactNode, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { ListRowProps } from "../index";
import { ListRow } from "../index";

/** What a page knows only as it runs. */
type AsItRuns = { glyph: ReactElement | undefined; href: string | undefined };

/** Never called: the compiler reads it, and nothing runs it. */
function _listRowTakes(
  line: (place: string) => ReactElement,
  row: RefObject<HTMLDivElement | null>,
  link: RefObject<HTMLAnchorElement | null>,
  now: AsItRuns,
): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof ListRow>, ListRowProps>>,
    Holds<Exactly<ListRowProps["end"], ((place: string) => ReactNode) | undefined>>,
    Holds<Exactly<ListRowProps["said"], ReactNode | ((place: string) => ReactNode)>>,
    Holds<Exactly<ListRowProps["facts"], readonly ReactNode[] | undefined>>,
  ];
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman" });
  ListRow({
    face: { initials: "AR", photo: "https://example.com/aisha.jpg" },
    name: "Aisha Rahman",
    end: line,
    said: "asked about Saturday",
    facts: [null, "2 h ago", line("pl-card-visit")],
    note: "Next step: call back on Monday",
    ref: row,
  });
  // The said line as the page's own element, with the class the row hands it.
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", said: line });
  // A row with a page of its own: a link, with a link's ref.
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", href: "/w/studio/#/clients", ref: link });
  // Chosen as the page runs: its face, and its address, a link where there is one and a div where not.
  ListRow({ face: now.glyph ? { glyph: now.glyph } : { initials: "AR" }, name: "Aisha Rahman", href: now.href });

  // @ts-expect-error a row's first column is its face
  ListRow({ name: "Aisha Rahman", facts: [] });
  // @ts-expect-error the face is the kit's, and stands for someone
  ListRow({ face: {}, name: "Aisha Rahman" });
  // @ts-expect-error the facts are a list, each a line's flex item
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", facts: "2 h ago" });
  // @ts-expect-error what trails is the page's element, drawn with the class the row hands it
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", end: "Needs you" });
  // @ts-expect-error its lines are its props: it takes no children
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", children: "Aisha" });
  // @ts-expect-error a row's ref holds a div: a link's comes with its address
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", ref: link });
  // @ts-expect-error a link row's ref holds a link
  ListRow({ face: { initials: "AR" }, name: "Aisha Rahman", href: "/w/studio/#/clients", ref: row });
}

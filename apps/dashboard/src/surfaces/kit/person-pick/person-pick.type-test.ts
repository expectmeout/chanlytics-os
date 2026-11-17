/**
 * What the kit's PersonPick takes, proved where the compiler reads it (person-pick.tsx): the question and what the empty
 * search says, what was typed and its change, who was found as People's rows give them and the press that picks one, the
 * words for nobody, and whether it is still reading. A People row passes as it is; a pick with no words for nobody, a
 * found person with no last contact, a press that is handed the row instead of its id, and children stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps } from "react";
import type { Exactly, Holds, PersonRowVM } from "@chanlytics/contracts";
import type { PersonPickProps, PersonPickRow } from "../index";
import { PersonPick } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _personPickTakes(rows: readonly PersonRowVM[], row: PersonPickRow): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof PersonPick>, PersonPickProps>>,
    Holds<Exactly<PersonPickProps["onPick"], (id: string) => void>>,
    Holds<Exactly<PersonPickProps["people"], readonly PersonPickRow[]>>,
  ];
  const asked = { label: "Who is it for?", placeholder: "Search people", query: "", onQuery: () => undefined };
  PersonPick({ ...asked, people: rows, onPick: () => undefined, none: "No one matches.", testid: "pick" });
  PersonPick({
    ...asked,
    people: [row],
    onPick: () => undefined,
    none: "Reading…",
    reading: true,
    autoFocus: true,
    testid: "pick",
    className: "page-pick",
  });
  // @ts-expect-error what is said for nobody is the page's: the pick has no words of its own
  PersonPick({ ...asked, people: rows, onPick: () => undefined, testid: "pick" });
  const unheard = { id: "k1", name: "Aisha", initials: "AR", stopped: false, deal: null };
  // @ts-expect-error a person the pick offers says when they were last heard, where no deal says more
  PersonPick({ ...asked, people: [unheard], onPick: () => undefined, none: "", testid: "pick" });
  // @ts-expect-error the press is handed the person's id, never their row
  PersonPick({ ...asked, people: rows, onPick: (p: PersonRowVM) => p, none: "", testid: "pick" });
  // @ts-expect-error it takes no children: what it draws are its props
  PersonPick({ ...asked, people: rows, onPick: () => undefined, none: "", testid: "pick", children: "x" });
}

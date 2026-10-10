/**
 * What the kit's Search takes, proved where the compiler reads it (search.tsx): what it finds, the words in it and what
 * typing does, whether the field is drawn and what asks for it, and the field's test id. Whether it rests, the field's
 * ref and the page's class are its own to give; a search with no words to say, or no test id,
 * stops compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { SearchProps } from "../index";
import { Search } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _searchTakes(field: RefObject<HTMLInputElement | null>, now: { q: string; open: boolean }): void {
  const type = (_q: string) => undefined;
  const ask = (_open: boolean) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Search>, SearchProps>>,
    Holds<Exactly<SearchProps["onChange"], (q: string) => void>>,
    Holds<Exactly<SearchProps["onOpen"], (open: boolean) => void>>,
  ];
  Search({
    label: "Search conversations",
    value: now.q,
    onChange: type,
    open: now.open,
    onOpen: ask,
    testid: "inbox-search",
  });
  Search({
    label: "Search names, numbers and emails",
    value: now.q,
    onChange: type,
    open: now.open,
    onOpen: ask,
    rests: true,
    inputRef: field,
    testid: "people-phone-search",
    className: "pp-lookup",
  });

  // @ts-expect-error a search says what it finds: its words at rest, and its name to a screen reader
  Search({ value: now.q, onChange: type, open: now.open, onOpen: ask, testid: "inbox-search" });
  // @ts-expect-error the field has its test id, and its parts are named on it
  Search({ label: "Search leads", value: now.q, onChange: type, open: now.open, onOpen: ask });
  // @ts-expect-error whether it is open is the page's, so the page's keys can open it
  Search({ label: "Search leads", value: now.q, onChange: type, testid: "leads-phone-search" });
}

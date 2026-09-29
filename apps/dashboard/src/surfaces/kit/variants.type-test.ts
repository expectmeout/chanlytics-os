/**
 * What the kit's class helpers accept, proved where the compiler reads it (variants.ts). A component built with
 * `variants` takes one value of each prop its map names, or nothing for the prop's default, and its defaults are such
 * values too: so a value the map does not name, a prop it does not have, null, a default it does not name and a
 * default for a prop it does not have stop compiling, where at run time each would draw no class and say nothing.
 * `cx` takes class names and what a condition leaves, and answers one string.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts), and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { Exactly, Holds } from "@chanlytics/contracts";
import { cx, variants } from "./index";

/** Never called: the compiler reads it, and nothing runs it. */
function _drawsTheKitsClasses(open: boolean): void {
  // The house's button, as the kit will write it.
  const button = variants({
    base: "btn",
    variants: {
      variant: { primary: "btn-primary", secondary: "", quiet: "btn-ghost", danger: "btn-danger" },
      size: { sm: "btn-sm", md: "" },
    },
    defaults: { variant: "secondary", size: "md" },
  });
  type _Takes = [
    // Its props are its map's: one value of each prop, or none, and the whole of them may be left out.
    Holds<
      Exactly<
        Parameters<typeof button>[0],
        { variant?: "primary" | "secondary" | "quiet" | "danger"; size?: "sm" | "md" } | undefined
      >
    >,
    Holds<Exactly<ReturnType<typeof button>, string>>,
    Holds<Exactly<ReturnType<typeof cx>, string>>,
  ];
  button({ variant: "primary", size: "sm" });
  button({ variant: undefined });
  button();
  cx("btn", open && "is-open", null, undefined, "");

  // @ts-expect-error a value the map does not name draws no class, so it is refused where it is written
  button({ variant: "loud" });
  // @ts-expect-error a prop the map does not have is no variant of this component
  button({ tone: "warn" });
  // @ts-expect-error null is not a value of a prop: leave the prop out for its default
  button({ variant: null });
  // @ts-expect-error a number is no class name
  cx("btn", 1);
  variants({
    base: "pill",
    variants: { tone: { ok: "pill-ok", warn: "pill-warn" } },
    // @ts-expect-error a default the map does not name would draw no class
    defaults: { tone: "danger" },
  });
  variants({
    base: "pill",
    variants: { tone: { ok: "pill-ok" } },
    // @ts-expect-error a default for a prop the map does not have is no variant of this component
    defaults: { size: "sm" },
  });
}

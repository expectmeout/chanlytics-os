/**
 * The helpers every closed-set check is written with (schema-sets.ts), proved to fail. schema-sets.ts and channels'
 * schema-agreement.ts hold each hand-kept list to its column's CHECK with `Holds<Exactly<…>>` (`Within` where a list
 * is narrower on purpose), and every one of those lines is a positive: this is the proof that a stale list would not
 * have compiled. A list one value short of its column, one with a value the CHECK refuses, a misspelt one and an
 * empty one each fail `Exactly`; a wider list fails `Within`; a column the database does not have is refused rather
 * than read as an empty set; and `Holds` takes nothing but `true`.
 *
 * A type test: each line under `@ts-expect-error <why>` must not compile, and one that starts to compile is TS2578,
 * an unused directive, so the package's `tsc --noEmit` fails. Nothing imports this file, so no build reaches it.
 * What `Exactly` cannot see is `any`, which it reads as every set: each hand-kept list is written `as const` (or as a
 * union of literals), so none is one.
 */
import type { CONSENT_STATES } from "./enums";
import type { Exactly, Holds, SchemaSet, Within } from "./schema-sets";

/** The column the examples are held to: `contacts.consent`, whose CHECK allows unknown, opted_in and opted_out. */
type Column = SchemaSet<"contacts.consent">;
/** Its hand-kept list, as SchemaAgreement holds it. */
type Kept = (typeof CONSENT_STATES)[number];

type _Sets = [
  // The list is its column, in any order.
  Holds<Exactly<Kept, Column>>,
  Holds<Exactly<"opted_out" | "unknown" | "opted_in", Column>>,
  // A narrower list is within its column: Within is one way.
  Holds<Within<"opted_in" | "opted_out", Column>>,
  // Exactly answers false, never boolean: a set is compared whole, not value by value.
  Holds<Exactly<Exactly<Kept | "paused", Column>, false>>,
  // @ts-expect-error a list one value short of its column is not the column: a value the CHECK allows is missing
  Holds<Exactly<Exclude<Kept, "opted_out">, Column>>,
  // @ts-expect-error nor is a list with a value the CHECK refuses
  Holds<Exactly<Kept | "paused", Column>>,
  // @ts-expect-error nor a misspelt one
  Holds<Exactly<"unknown" | "opted_in" | "opted-out", Column>>,
  // @ts-expect-error nor an empty one: never is within every column, and no column is within never
  Holds<Exactly<never, Column>>,
  // @ts-expect-error a wider list is not within its column
  Holds<Within<Kept | "paused", Column>>,
  // @ts-expect-error a column the database does not have is refused, never read as an empty set
  SchemaSet<"contacts.consnet">,
  // @ts-expect-error Holds takes only true: a check that could be either is not a check
  Holds<boolean>,
];

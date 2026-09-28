/**
 * Whose id this is, proved where the compiler reads it (identity.ts): what each check makes is its brand, a branded
 * id is still a string wherever one is read, and nothing else is a TenantId or a ContactId -- not a bare string, not
 * the other id, not a lookalike brand under a symbol of its own.
 *
 * A type test: the positives are `Holds<Exactly<…>>` and `Holds<Within<…>>` (schema-sets.ts), and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * package's `tsc --noEmit` fails. Nothing imports this file, so no build reaches it.
 */
import type { ContactId, TenantId, asContactId, asTenantId } from "./identity";
import type { Exactly, Holds, Within } from "./schema-sets";

declare const lookalike: unique symbol;
/** The brand's shape under a symbol of its own: what a module that copied the declaration would make. */
type Lookalike = string & { readonly [lookalike]: "tenant" };

type _Brands = [
  // What each check makes is its brand, and nothing wider.
  Holds<Exactly<ReturnType<typeof asTenantId>, TenantId>>,
  Holds<Exactly<ReturnType<typeof asContactId>, ContactId>>,
  // A branded id is still a string wherever one is read: a query's filter, a log line, a map's key.
  Holds<Within<TenantId, string>>,
  Holds<Within<ContactId, string>>,
  // @ts-expect-error a bare string is not a TenantId: it becomes one where it enters, through asTenantId
  Holds<Within<string, TenantId>>,
  // @ts-expect-error nor a ContactId: that is asContactId's to make
  Holds<Within<string, ContactId>>,
  // @ts-expect-error a person's id is not a workspace's, though both are uuids
  Holds<Within<ContactId, TenantId>>,
  // @ts-expect-error nor is a workspace's id a person's
  Holds<Within<TenantId, ContactId>>,
  // @ts-expect-error a lookalike is not the brand: the symbol that keys it is identity.ts's alone
  Holds<Within<Lookalike, TenantId>>,
];

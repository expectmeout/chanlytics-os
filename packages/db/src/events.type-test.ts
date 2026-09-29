/**
 * The ledger's kinds, proved where the compiler reads them (events.ts): every kind the product writes from TypeScript
 * is one contracts' EVENT_KINDS declares, so the activity log never meets a row nobody can name. The rest of that
 * promise, the SQL's inserts and the kinds nothing writes, is repo/event-kinds.test.mjs's.
 *
 * A type test: the positives are `Holds<…>`, and each line under `@ts-expect-error <why>` must not compile. Nothing
 * imports this file, so no build reaches it.
 */
import type { EventKind, Holds, Within } from "@chanlytics/contracts";
import type { EmittedKind, EventData } from "./events";

type _Declared = [
  // Every kind written, Meta's family with the table's, is a declared one.
  Holds<Within<EmittedKind, EventKind>>,
  // @ts-expect-error a kind nobody declared is refused: the table's keys are EVENT_KINDS' own
  Holds<Within<keyof EventData | "made.up", EventKind>>,
];

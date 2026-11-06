/**
 * The ledger's kinds, proved where the compiler reads them (events.ts): every kind the product writes from TypeScript
 * is one contracts' EVENT_KINDS declares, so the activity log never meets a row nobody can name. The rest of that
 * promise, the SQL's inserts and the kinds nothing writes, is repo/event-kinds.test.mjs's. And every subject a row
 * is about is one the activity log declares a home for (contracts ACTIVITY_SUBJECT_HOMES), so the log never meets a
 * line it cannot open and cannot say why.
 *
 * A type test: the positives are `Holds<…>`, and each line under `@ts-expect-error <why>` must not compile. Nothing
 * imports this file, so no build reaches it.
 */
import type { ActivitySubjectType, EventKind, Exactly, Holds, Within } from "@chanlytics/contracts";
import type { EmittedKind, EventData, emitEvent, recordEvent } from "./events";

type _Declared = [
  // Every kind written, Meta's family with the table's, is a declared one.
  Holds<Within<EmittedKind, EventKind>>,
  // @ts-expect-error a kind nobody declared is refused: the table's keys are EVENT_KINDS' own
  Holds<Within<keyof EventData | "made.up", EventKind>>,
];

type _Subjects = [
  // The two writers take what a row is about from the table of subjects and nothing else (or no subject at all).
  Holds<Exactly<Parameters<typeof emitEvent>[3], ActivitySubjectType | null>>,
  Holds<Exactly<Parameters<typeof recordEvent>[3], ActivitySubjectType | null>>,
  // @ts-expect-error a subject nobody declared a home for is refused: the writers' type is the table's own keys
  Holds<Within<ActivitySubjectType | "made_up", ActivitySubjectType>>,
];

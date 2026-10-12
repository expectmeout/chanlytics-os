/**
 * Every kind of record says where it opens, or why it opens nowhere, proved where the compiler reads it (record-address.ts):
 * the kinds `addressOf` writes an address for and the kinds in RECORDS_WITHOUT_AN_ADDRESS are, together, exactly RECORD_KINDS'
 * (so a kind added there does not compile until it is one or the other), and none is both.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (schema-sets.ts), and each line under `@ts-expect-error <why>` must not
 * compile. Nothing imports this file, so no build reaches it; the package's `tsc --noEmit` does.
 */
import type { Exactly, Holds, Within } from "../shared/schema-sets";
import type { RECORDS_WITHOUT_AN_ADDRESS, RecordRef } from "./record-address";
import type { RecordKind } from "./record-kinds";

type Written = RecordRef["kind"];
type Unwritten = keyof typeof RECORDS_WITHOUT_AN_ADDRESS;

type _Addresses = [
  // A kind with an address and a kind with a reason are every kind of record there is.
  Holds<Exactly<Written | Unwritten, RecordKind>>,
  // No kind is both.
  Holds<Exactly<Extract<Written, Unwritten>, never>>,
  // An address is written for a kind of record, never for a word that is none.
  Holds<Within<Written, RecordKind>>,
  // @ts-expect-error a kind of record that is not in RECORD_KINDS has no address to write
  Holds<Within<"mystery" | Written, RecordKind>>,
  // @ts-expect-error a kind that has a reason it opens nowhere is not one an address is written for
  Holds<Within<Unwritten, Written>>,
];

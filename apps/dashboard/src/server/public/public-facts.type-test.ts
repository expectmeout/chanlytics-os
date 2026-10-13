/**
 * The business on record's columns, proved where the compiler reads them (public-facts.ts, the public pages' one load
 * through packages/db publicWorkspaceBySlug): the record the form fills is the table's row, and the public load answers
 * exactly the columns contracts lets the page show (lines/published-facts.ts). A column added to business_records fails
 * here until the form's record and the published list say what it is (the wiring's second audit, X4-3 and X4-4); the
 * load's select is held to the same list where it runs (tests/public/a-paused-workspace-asks-nobody-for-a-yes.test.mjs).
 *
 * A type test: the positives are `Holds<…>`, and each line under `@ts-expect-error <why>` must not compile. Nothing
 * imports this file, so no bundle reaches it.
 */
import type { BusinessRecordColumn, Exactly, Holds, PublishedRecordColumn, Within } from "@chanlytics/contracts";
import type { Database, PublicWorkspaceRead } from "@chanlytics/db";

type Row = Database["public"]["Tables"]["business_records"]["Row"];

type _Columns = [
  // The record the form fills is the row, less what the row keeps of itself.
  Holds<Exactly<BusinessRecordColumn, Exclude<keyof Row, "tenant_id" | "created_at" | "updated_at">>>,
  // The public load answers the published columns and no others.
  Holds<Exactly<keyof NonNullable<PublicWorkspaceRead["record"]>, PublishedRecordColumn>>,
  // @ts-expect-error the tax id is never on the public page
  Holds<Within<"ein", PublishedRecordColumn>>,
  // @ts-expect-error nor the owner's own mobile
  Holds<Within<"contact_phone", PublishedRecordColumn>>,
];

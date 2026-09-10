/**
 * This package's own copies of database sets, held to the database the same way
 * packages/contracts/src/schema-sets.ts holds the rest. No runtime: if this file
 * stops compiling, a list here and its column disagree.
 */
import type { Exactly, Holds, SchemaSet, Within } from "@chanlytics/contracts";
import type { A2P_STEPS } from "./a2p";
import type { LineProviderName } from "./lines";

export type ChannelsSchemaAgreement = [
  // The registration saga walks exactly the steps a line may record, in its own order.
  Holds<Exactly<(typeof A2P_STEPS)[number], SchemaSet<"lines.reg_step">>>,
  // The providers a number can be bought from. A line may also record 'carrier':
  // a number the business kept and forwards to us.
  Holds<Within<LineProviderName, SchemaSet<"lines.provider">>>,
];

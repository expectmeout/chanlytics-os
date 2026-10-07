/**
 * The three forms of an escalation reason are keyed by the database's own closed set (escalations.ts): a reason the
 * CHECK gains without its label, its clause and its summary fails here, and so does a key the set does not know.
 * A type test, as identity.type-test.ts is: positives are `Holds<Exactly<…>>`; nothing imports this file.
 */
import type { Exactly, Holds, SchemaSet } from "../shared/schema-sets";
import type { ESCALATION_REASON_LABELS, ESCALATION_REASON_SHORT, ESCALATION_SUMMARIES } from "./escalations";

type Reason = SchemaSet<"escalations.reason">;

type _Reasons = [
  Holds<Exactly<keyof typeof ESCALATION_REASON_LABELS, Reason>>,
  Holds<Exactly<keyof typeof ESCALATION_REASON_SHORT, Reason>>,
  Holds<Exactly<keyof typeof ESCALATION_SUMMARIES, Reason>>,
  // @ts-expect-error a key outside the set is not a reason: the maps take the set and nothing wider
  Holds<Exactly<keyof typeof ESCALATION_REASON_SHORT, Reason | "nonsense">>,
];

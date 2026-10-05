/**
 * The config's keys, written once in config-rules.ts for a page to read without a schema, held equal to the schemas
 * they are the keys of (business-profile.ts): the guardrails the profile stores are GUARDRAIL_KEYS, no more and no
 * fewer; what a stored guardrails object is, is what GuardrailsSchema reads; and the booking rules a box holds a
 * number for are exactly BookingRulesSchema's numbers, each of which has its bounds.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (shared/schema-sets.ts), and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * package's `tsc --noEmit` fails. Nothing imports this file, so no build reaches it.
 */
import type { z } from "zod";
import type { BookingRulesSchema, GuardrailsSchema } from "./business-profile";
import type { BOOKING_RULE_BOUNDS, BookingRuleKey, GuardrailKey, StoredGuardrails } from "./config-rules";
import type { Exactly, Holds } from "../../shared/schema-sets";

type Stored = z.infer<typeof GuardrailsSchema>;
type Rules = z.infer<typeof BookingRulesSchema>;
/** The booking rules the schema stores as a number. */
type NumberRules = { [K in keyof Rules]-?: NonNullable<Rules[K]> extends number ? K : never }[keyof Rules];

type _ConfigRules = [
  // A fifth guardrail in the schema fails here until GUARDRAIL_KEYS names it, and STRENGTHS and guardrailsInForce
  // fail after that until somebody says how far it goes and what its absence means.
  Holds<Exactly<GuardrailKey, keyof Stored>>,
  Holds<Exactly<StoredGuardrails, Stored>>,
  Holds<Exactly<BookingRuleKey, NumberRules>>,
  Holds<Exactly<keyof typeof BOOKING_RULE_BOUNDS, NumberRules>>,
  // @ts-expect-error the email switch is a boolean, not a rule with a range
  Holds<Exactly<BookingRuleKey, NumberRules | "ask_email">>,
  // @ts-expect-error a guardrail the schema does not store is not a key
  Holds<Exactly<GuardrailKey | "never_say_sorry", keyof Stored>>,
];

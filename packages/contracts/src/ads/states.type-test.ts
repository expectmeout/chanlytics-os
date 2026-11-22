/**
 * An ad's badge, proved where the compiler reads it (states.ts): every word Meta's reference lists for an ad is read
 * into ours, no word it does not list is, and the badge is one of the page's states or a draft.
 *
 * The list is Meta's own: the Ad object's `effective_status` (Marketing API v27.0, read on Meta's page 18 November
 * 2026). When Meta adds a word, it is added here and states.ts stops compiling until it says what the word means.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (schema-sets.ts), and each line under `@ts-expect-error <why>` must
 * not compile. Nothing imports this file, so no build reaches it.
 */
import type { Exactly, Holds, SchemaSet } from "../shared/schema-sets";
import type { AdState } from "./ads";
import type { AdWayClosed } from "./live";
import type { MetaAdWord, adStateOf } from "./states";

type MetaLists =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "PENDING_REVIEW"
  | "DISAPPROVED"
  | "PREAPPROVED"
  | "PENDING_BILLING_INFO"
  | "CAMPAIGN_PAUSED"
  | "ARCHIVED"
  | "ADSET_PAUSED"
  | "IN_PROCESS"
  | "WITH_ISSUES";

type _States = [
  // Every word Meta lists is read, and nothing it does not list.
  Holds<Exactly<MetaAdWord, MetaLists>>,
  // The badge is one of the page's states, or a draft nobody has turned on.
  Holds<Exactly<ReturnType<typeof adStateOf>, AdState | "draft">>,
  // @ts-expect-error a word left unread would make the two sets differ: Exactly refuses a narrower one
  Holds<Exactly<Exclude<MetaAdWord, "WITH_ISSUES">, MetaLists>>,
  // @ts-expect-error "too early to judge" is a reading from counts and age, never a badge the rule gives
  Holds<Exactly<ReturnType<typeof adStateOf>, AdState | "draft" | "too-early">>,
  // What stands in a running ad's way in, as its row keeps it, is the database's own set (ads.way_in, 00676).
  Holds<Exactly<AdWayClosed, SchemaSet<"ads.way_in">>>,
];

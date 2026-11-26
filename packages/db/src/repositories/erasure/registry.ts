/**
 * How an erasure reaches each column of a workspace table that can hold a person's words (decision 0036; 0031's
 * invariant 10, "every table has a tenant, a floor and an erasure strategy").
 *
 * An erasure (DELETE /api/v1/contacts/:id, packages/jobs/src/handlers/erasure.ts, its legs in repositories/erasure/legs.ts beside this)
 * runs its legs in order: the block, the copies keyed on the number, Storage, the rows in one transaction
 * (`erase_contact`), the triggers that fire on its tombstone, then the best-effort passes; one a press left unfinished
 * is finished by the erasure_finish job. What each leg reaches was written only in its own code, so a
 * new column that held a person's number or words was erased only if its author remembered. Here each such column
 * names one strategy:
 *
 *   with_person   the row goes when the erasure deletes the person's rows, by the named leg;
 *   scrubbed      the column is overwritten, or the row deleted, by the named legs, by the person's id or by needle;
 *   digest        kept only as a keyed hash an erasure cannot reverse (00263);
 *   by_age        removed by a retention clock within contracts' RETENTION_DAYS, which the privacy page states;
 *   with_workspace the workspace's own record that can name someone it is not serving: its owner, a member, its payer,
 *                 the representative its filing names. An erasure is of a person the workspace serves and does not
 *                 reach it; it leaves with the workspace, within the 30 days the privacy page states;
 *   as_record     the record that a request about a person was answered (decision 0066): who asked, when, and what was
 *                 done, kept past the workspace it was about so the answer can be shown; never what they wrote to it;
 *   not_personal  holds nothing of a person, said once.
 *
 * Which columns can hold words is the schema's: text, json and their arrays, in a table that names `tenant_id`, its
 * partitions read through it. A column the schema holds to a closed set (contracts SCHEMA_SETS) holds no person's words
 * and is not listed. A column with no strategy is counted: people/erasure/erasure-registry.test.mjs and the ratchet
 * "personal columns with no erasure strategy" (docs/debt.md) hold the count to fall, so a new column arrives with its
 * strategy. A message's words (messages.body, messages.template_vars) go with the person whose thread they are in, as
 * its other columns do; a person's words in someone else's thread stay, since a message is immutable by trigger (00326)
 * (Ruben, 6 October 2026, recorded as the rule on 26 November 2026).
 * A Google review's reviewer, words and reply are reached by no erasure (nothing joins a review to a person, and a name
 * is not a key): the mirror follows Google, and a review it has not seen for its days goes (00392, answered 10 October
 * 2026).
 */
import type { ErasureStrategy } from "./strategy";
import { CONTENT_TABLES } from "./registry/content";
import { LEADS_TABLES } from "./registry/leads";
import { PEOPLE_TABLES } from "./registry/people";
import { WORKSPACE_TABLES } from "./registry/workspace";

/**
 * Table, then column, then its strategy: what the legs reach today, and what is plainly no one's, in four parts by what
 * they hold (registry/).
 */
export const ERASURE_STRATEGIES: Readonly<Record<string, Readonly<Record<string, ErasureStrategy>>>> = {
  ...PEOPLE_TABLES,
  ...LEADS_TABLES,
  ...CONTENT_TABLES,
  ...WORKSPACE_TABLES,
};

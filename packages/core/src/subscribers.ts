/**
 * The subscribers a delivery can name (contracts EVENT_SUBSCRIBERS; decision 0031, 00333): each a verb over the event
 * it is handed, run by the event_deliver job (packages/jobs handlers.ts) after the relay wrote its delivery row.
 *
 * Every one may see the same delivery twice and must leave the same rows: a lease that ran out, a re-drive, a second
 * relay of a late commit are all second runs, and the ledger's rule below the commit line is at least once
 * (0030, invariant 3). The harness in tooling/scripts/tests/events runs each subscriber twice on one delivery.
 *
 * `audit` settles and does nothing else: the first subscriber only measures the relay (0031, step 3). A subscriber that
 * acts arrives with its own note, its ports and its schema for the kinds it reads.
 */
import type { EventSubscriber } from "@chanlytics/contracts";
import type { DeliveredEvent } from "@chanlytics/db";

/** A subscriber: the event, once; nothing to return, a throw is a failed delivery. */
export type Subscriber = (event: DeliveredEvent) => Promise<void>;

export const SUBSCRIBERS: Readonly<Record<EventSubscriber, Subscriber>> = {
  audit: async () => {},
};

/**
 * The kit's house parts a surface draws through a door of the frame's (decision 0015): `Confirm` and `StatePill`, the
 * kit's own, imported. Campaigns, Inbox and People import `kit/confirm`, `kit/pill/state-pill`, `kit/policy-chip`,
 * `kit/record` and `kit/field-error` by their paths; what is left here is what Leads, Live and the Calendar draw.
 */
import { Confirm } from "./kit/confirm/confirm";
import { StatePill } from "./kit/pill/state-pill";

/** A part that is not there draws nothing: what a JSX page drew where its store had no such row. The one spelling of it:
 *  the kit's head and the lead peek's doors answer the same where a part or a standing is not. */
export const nothing = (): null => null;

export const confirmPart = (): typeof Confirm => Confirm;

export const statePillPart = (): typeof StatePill => StatePill;

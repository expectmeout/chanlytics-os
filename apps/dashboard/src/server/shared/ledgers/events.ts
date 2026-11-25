import "server-only";
/**
 * The events ledger, as the dashboard writes it: what a member did, put on `events`, which no session may insert into
 * (members read it; only the service role's grant writes it). The one place the dashboard's routes take the service
 * role for an event, after the route's own scope has proved the workspace and the member; a call site names its kind
 * and what happened, and never holds the service-role client itself.
 *
 * Each of these belongs in the door of the change it records, in the same transaction (decision 0031, invariant 2): as
 * a change gets its door, its event moves into the door and its call here goes.
 */
import { emitEvent, recordActivation, recordEvent, type EmittedKind, type EventData } from "@chanlytics/db/events";
import type { ActivationMilestone, ActivitySubjectType, TenantId } from "@chanlytics/contracts";
import { serviceDb } from "../service-db";

/** The ledger's client: the service role's, the only one `events` takes an insert from. */
const ledgerDb = () => serviceDb();

/** One event, best effort: a write that fails is logged by its kind (packages/db emitEvent), never thrown. */
export function emitWorkspaceEvent<K extends EmittedKind>(
  tenantId: TenantId,
  kind: K,
  subjectType: ActivitySubjectType | null,
  subjectId: string | null,
  data: EventData[K],
): Promise<void> {
  return emitEvent(ledgerDb(), tenantId, kind, subjectType, subjectId, data);
}

/** One event, and whether it was written: for a writer whose answer says the record exists (packages/db recordEvent). */
export function recordWorkspaceEvent<K extends EmittedKind>(
  tenantId: TenantId,
  kind: K,
  subjectType: ActivitySubjectType | null,
  subjectId: string | null,
  data: EventData[K],
): Promise<{ error: string | null }> {
  return recordEvent(ledgerDb(), tenantId, kind, subjectType, subjectId, data);
}

/** A milestone the workspace reached, written once (packages/db recordActivation); true when this call wrote it. */
export function recordWorkspaceActivation(
  tenantId: TenantId,
  milestone: ActivationMilestone,
  via: string,
): Promise<boolean> {
  return recordActivation(ledgerDb(), tenantId, milestone, via);
}

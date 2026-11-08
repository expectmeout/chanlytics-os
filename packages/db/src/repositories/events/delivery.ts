/** Events: delivery. */

import { personName, type ActivationMilestone } from "@chanlytics/contracts";
import type { Json } from "../../types";
import { dbLog } from "../../shared/observe";
import { recordEvent, rowOf, type Db, type EventData } from "./events";
import { PERSON_FACE_COLUMNS } from "../../shared/person-columns";

/**
 * A workspace reached a milestone (the product's analytics: the first line live, the first reply, the first lead
 * search), written once: a milestone already on the ledger writes nothing. Best effort, as emitEvent is; two writers
 * racing may both write, and a funnel counts workspaces, not rows. True when this call wrote it.
 */
export async function recordActivation(
  db: Db,
  tenantId: string,
  milestone: ActivationMilestone,
  via: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "workspace.activated")
    .eq("data->>milestone", milestone)
    .limit(1);
  if (error) {
    dbLog().error("activation_read_failed", { tenant_id: tenantId, milestone, error: error.message });
    return false;
  }
  if (data && data.length) return false;
  const result = await recordEvent(db, tenantId, "workspace.activated", "workspace", tenantId, { milestone, via });
  if (result.error)
    dbLog().error("emit_event_failed", { tenant_id: tenantId, kind: "workspace.activated", error: result.error });
  return !result.error;
}

/* ----------------------------------------------------------- the spine: the relay and a delivery (00334, decision 0032) */

/** The event a delivery is about, as the ledger holds it: what a subscriber is handed. */
export interface DeliveredEvent {
  id: string;
  tenant_id: string;
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  data: Json;
  created_at: string;
  version: number;
  aggregate_version: number | null;
  causation_id: string | null;
}

/** One delivery row as the relay left it (event_deliveries). */
export interface DeliveryRow {
  state: "scheduled" | "done" | "failed" | "paused";
  attempts: number;
}

/**
 * The first step of every tick (relay_events, 00334): the outbox's events become deliveries and jobs, up to `limit` of
 * them, oldest first and with no cursor. Answers how many events were relayed.
 */
export async function relayEvents(db: Db, limit: number): Promise<number> {
  const { data, error } = await db.rpc("relay_events", { p_limit: limit });
  if (error) throw new Error(`relay_events: ${error.message}`);
  return data ?? 0;
}

/** The event a delivery is about; null when the ledger no longer holds it (the evidence purge, 00115). */
export async function findEventOfDelivery(db: Db, tenantId: string, eventId: string): Promise<DeliveredEvent | null> {
  const { data, error } = await db
    .from("events")
    .select("id, tenant_id, kind, subject_type, subject_id, data, created_at, version, aggregate_version, causation_id")
    .eq("tenant_id", tenantId)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`events: ${error.message}`);
  return data;
}

/** Whether a subscription is paused as its delivery runs; one that is gone reads as paused. */
export async function isSubscriptionPaused(db: Db, kind: string, subscriber: string): Promise<boolean> {
  const { data, error } = await db
    .from("event_subscriptions")
    .select("paused")
    .eq("kind", kind)
    .eq("subscriber", subscriber)
    .maybeSingle();
  if (error) throw new Error(`event_subscriptions: ${error.message}`);
  return data ? data.paused : true;
}

/** The delivery row as it stands; null when the relay never wrote it. */
export async function findDelivery(
  db: Db,
  tenantId: string,
  eventId: string,
  subscriber: string,
): Promise<DeliveryRow | null> {
  const { data, error } = await db
    .from("event_deliveries")
    .select("state, attempts")
    .eq("tenant_id", tenantId)
    .eq("event_id", eventId)
    .eq("subscriber", subscriber)
    .maybeSingle();
  if (error) throw new Error(`event_deliveries: ${error.message}`);
  return data;
}

/** The delivery's verdict after a run: done, failed with why, or paused because its subscription was. */
export async function settleDelivery(
  db: Db,
  details: {
    tenantId: string;
    eventId: string;
    subscriber: string;
    state: "done" | "failed" | "paused";
    attempts: number;
    error: string | null;
  },
): Promise<void> {
  const { error } = await db
    .from("event_deliveries")
    .update({ state: details.state, attempts: details.attempts, last_error: details.error })
    .eq("tenant_id", details.tenantId)
    .eq("event_id", details.eventId)
    .eq("subscriber", details.subscriber);
  if (error) throw new Error(`event_deliveries: ${error.message}`);
}

/**
 * A delivery whose job will not finish, settled failed unless it already settled (done, failed or paused): a run that died
 * before its subscriber's verdict left the row scheduled, where nothing ever took it again, since Deliver again
 * (event_deliveries_redrive) takes the failed and the paused. True when it moved. Throws when the write failed.
 */
export async function failOpenDelivery(
  db: Db,
  details: { tenantId: string; eventId: string; subscriber: string; error: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("event_deliveries")
    .update({ state: "failed", last_error: details.error.slice(0, 500) })
    .eq("tenant_id", details.tenantId)
    .eq("event_id", details.eventId)
    .eq("subscriber", details.subscriber)
    .eq("state", "scheduled")
    .select("event_id");
  if (error) throw new Error(`event_deliveries: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * A run that sent its last batch: marked sent, and its broadcast.sent with the tally written, in one transaction (00527
 * finish_broadcast). The state used to move first and the event after, so an event that could not be written threw out
 * of a run that had finished, and its owner was told it stopped partway. False when the run was not sending (another
 * chain finished it first, or it was stopped), and then nothing was written. Throws when the write failed.
 */
export async function finishBroadcast(
  db: Db,
  tenantId: string,
  id: string,
  tally: EventData["broadcast.sent"],
): Promise<boolean> {
  const { data, error } = await db.rpc("finish_broadcast", {
    p_tenant_id: tenantId,
    p_id: id,
    p_event: rowOf(tenantId, "broadcast.sent", "broadcast", id, tally),
  });
  if (error) throw new Error(`finish_broadcast: ${error.message}`);
  return data === true;
}

/* ------------------------------------------------ what the ledgers' rows are about ------------------------------------------------ */

/**
 * What the activity log's rows are about (apps/dashboard/src/server/metrics/activity.ts): each subject's name, and
 * whose thread or person it is, so a line can say and open it.
 *
 * A decision or an event names its subject by type and id, and the log printed neither: "Listened to a call's
 * recording" said whose call only behind its Open, and "A message could not be sent" opened nothing. This reads what a
 * page of the log needs, in rounds: the rows that name themselves (a list, a broadcast, a playbook, a lead) and the
 * ones that are a person's (a thread, a call, a deal, a message) or a thread's (an escalation); then an escalation's
 * thread; then every person those and the rows name. A person is named by the one rule (contracts personName).
 *
 * Workspace scope: every statement is filtered by tenant_id, on the member's own client, so row security decides what
 * is read and a subject of another workspace is no subject. Ids go out a hundred to a statement: a page may hold five
 * hundred rows, and five hundred ids in one address is past what the wire carries.
 */

/** A row's subject, as the ledgers name it. */
export interface ActivitySubject {
  type: string;
  id: string;
}

/** What a page's subjects are, each keyed `<type>:<id>`; a subject with no answer is absent from that answer. */
export interface ActivitySubjects {
  /** The name: a person's (their own, their thread's, call's, deal's, message's or escalation's), a list's, a run's, a lead's. */
  names: Record<string, string>;
  /** The thread a message or an escalation is on: its conversation's id. */
  threads: Record<string, string>;
  /** The person a deal is with: their id. */
  people: Record<string, string>;
  /** When a visit starts, as its row holds it (an ISO instant): the day a line about it opens the Calendar on. */
  visits: Record<string, string>;
  /** The name of the Library message a template row is, by `template:<id>`: how its drawer is addressed. A message that is gone, or hidden from the Library, is absent. */
  library: Record<string, string>;
}

/** How many ids one statement names. */
const IDS_PER_READ = 100;

const chunks = (ids: readonly string[]): string[][] => {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) out.push(ids.slice(i, i + IDS_PER_READ));
  return out;
};

/** Every row of one table whose id is one of `ids`, a hundred ids to a statement; the first error is thrown. */
async function readByIds<R>(
  ids: readonly string[],
  read: (some: string[]) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
): Promise<R[]> {
  const answers = await Promise.all(chunks(ids).map((some) => read(some)));
  const out: R[] = [];
  for (const a of answers) {
    if (a.error) throw new Error(a.error.message);
    out.push(...(a.data ?? []));
  }
  return out;
}

/** A row that is a person's, or a thread's: which. */
interface Theirs {
  id: string;
  contact_id?: string | null;
  conversation_id?: string | null;
  /** A visit's own name for who it is with, where no person of the workspace is on it (a booking tool's email). */
  client_name?: string | null;
  /** A visit's start: the row's own instant. */
  starts_at?: string | null;
}

/** The subjects that are a person's or a thread's, read by type: the first round. */
async function theirsOf(
  db: Db,
  tenantId: string,
  idsOf: (type: string) => string[],
): Promise<Record<string, Theirs[]>> {
  const [conversation, call, deal, message, escalation, appointment] = await Promise.all([
    readByIds<Theirs>(idsOf("conversation"), (some) =>
      db.from("conversations").select("id, contact_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("call"), (some) =>
      db.from("calls").select("id, contact_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("deal"), (some) =>
      db.from("deals").select("id, contact_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("message"), (some) =>
      db.from("messages").select("id, contact_id, conversation_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("escalation"), (some) =>
      db.from("escalations").select("id, conversation_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("appointment"), (some) =>
      db.from("appointments").select("id, contact_id, client_name, starts_at").eq("tenant_id", tenantId).in("id", some),
    ),
  ]);
  return { conversation, call, deal, message, escalation, appointment };
}

/** The subjects that name themselves: a list, a broadcast, a playbook, a lead, a search. */
async function ownNames(db: Db, tenantId: string, idsOf: (type: string) => string[]): Promise<Record<string, string>> {
  const [lists, broadcasts, playbooks, leads, searches] = await Promise.all([
    readByIds(idsOf("list"), (some) => db.from("segments").select("id, name").eq("tenant_id", tenantId).in("id", some)),
    readByIds(idsOf("broadcast"), (some) =>
      db.from("sequence_batches").select("id, name").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds(idsOf("playbook"), (some) =>
      db.from("sequence_steps").select("id, name").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds(idsOf("lead"), (some) =>
      db.from("leads").select("id, business_name").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds(idsOf("lead_search"), (some) =>
      db.from("lead_searches").select("id, name").eq("tenant_id", tenantId).in("id", some),
    ),
  ]);
  const names: Record<string, string> = {};
  for (const r of lists) if (r.name) names[`list:${r.id}`] = r.name;
  for (const r of broadcasts) if (r.name) names[`broadcast:${r.id}`] = r.name;
  for (const r of playbooks) if (r.name) names[`playbook:${r.id}`] = r.name;
  for (const r of leads) if (r.business_name) names[`lead:${r.id}`] = r.business_name;
  for (const r of searches) if (r.name) names[`lead_search:${r.id}`] = r.name;
  return names;
}

/** The Library messages the page's template subjects are, by `template:<id>` to their names: the ones that are still there to open. */
async function libraryOf(db: Db, tenantId: string, idsOf: (type: string) => string[]): Promise<Record<string, string>> {
  const rows = await readByIds(idsOf("template"), (some) =>
    db.from("templates").select("id, name").eq("tenant_id", tenantId).is("hidden_at", null).in("id", some),
  );
  return Object.fromEntries(rows.flatMap((r) => (r.name ? [[`template:${r.id}`, r.name]] : [])));
}

/**
 * Every subject of a page of the log: its name, and whose thread or person it is. A subject of a type with no name (a
 * workspace, a channel, a review), one row security hides, and a person with nothing to call them by are absent.
 */
export async function getActivitySubjects(
  db: Db,
  tenantId: string,
  subjects: readonly ActivitySubject[],
): Promise<ActivitySubjects> {
  const idsOf = (type: string): string[] => [...new Set(subjects.filter((s) => s.type === type).map((s) => s.id))];
  const [names, theirs, library] = await Promise.all([
    ownNames(db, tenantId, idsOf),
    theirsOf(db, tenantId, idsOf),
    libraryOf(db, tenantId, idsOf),
  ]);
  const threads: Record<string, string> = {};
  const people: Record<string, string> = {};
  const visits: Record<string, string> = {};

  // An escalation is a thread's: the thread says whose. Only the threads the first round did not read are asked for.
  const known = new Map((theirs.conversation ?? []).map((c) => [c.id, c.contact_id ?? null]));
  const items = [
    ...new Set((theirs.escalation ?? []).map((e) => e.conversation_id).filter((id): id is string => !!id)),
  ];
  const more = await readByIds<Theirs>(
    items.filter((id) => !known.has(id)),
    (some) => db.from("conversations").select("id, contact_id").eq("tenant_id", tenantId).in("id", some),
  );
  for (const c of more) known.set(c.id, c.contact_id ?? null);

  /** The person a subject is, by its key. */
  const personOf = new Map<string, string>();
  for (const id of idsOf("contact")) personOf.set(`contact:${id}`, id);
  for (const [type, rows] of Object.entries(theirs))
    for (const r of rows) {
      const key = `${type}:${r.id}`;
      if (type !== "conversation" && r.conversation_id) threads[key] = r.conversation_id;
      const person = r.contact_id ?? (r.conversation_id ? known.get(r.conversation_id) : null) ?? null;
      if (!person) continue;
      personOf.set(key, person);
      if (type === "deal") people[key] = person;
    }

  const rows = await readByIds([...new Set(personOf.values())], (some) =>
    db.from("contacts").select(PERSON_FACE_COLUMNS).eq("tenant_id", tenantId).in("id", some),
  );
  const nameOf = new Map<string, string>();
  for (const p of rows) {
    // A person with none of the four is "Unknown" to the one rule, and a log line gains nothing from saying so.
    if (p.display_name || p.wa_profile_name || p.phone_e164 || p.email) nameOf.set(p.id, personName(p));
  }
  for (const [key, person] of personOf) {
    const name = nameOf.get(person);
    if (name) names[key] = name;
  }
  // A visit nobody of the workspace is on yet is named as its booking said it.
  for (const a of theirs.appointment ?? []) {
    const key = `appointment:${a.id}`;
    if (!names[key] && a.client_name) names[key] = a.client_name;
    // and opens on its day, which only its row knows.
    if (a.starts_at) visits[key] = a.starts_at;
  }
  return { names, threads, people, visits, library };
}

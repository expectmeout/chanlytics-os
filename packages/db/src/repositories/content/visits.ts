/**
 * What the credit rule is handed (00699; the content loop PRD's 9.3, Appendix A.6, A.7): visits as creditOf reads them,
 * each with what it answered when it was asked for (appointments.through_type, through_id), and a post's one link with
 * its opens. Bounded by window and workspace; a read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES,
  DbFailure,
  isOneOf,
  LINK_LANDS,
  recordOrEmpty,
  TOUCH_SUBJECTS,
  type CreditVisit,
  type LinkLands,
  type ContactId,
  type TenantId,
} from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The most visits one read answers. */
const VISITS_READ_MAX = 2000;

/** A visit as the credit rule reads it, with what a page names it by. */
export interface VisitForCredit extends CreditVisit {
  id: string;
  starts_at: string;
  service: string | null;
}

const VISIT_COLUMNS = "id, contact_id, status, source, created_at, through_type, through_id, starts_at, service";

type VisitRow = Pick<
  Database["public"]["Tables"]["appointments"]["Row"],
  "id" | "contact_id" | "status" | "source" | "created_at" | "through_type" | "through_id" | "starts_at" | "service"
>;

function creditVisitOf(row: VisitRow): VisitForCredit | null {
  if (!isOneOf(APPOINTMENT_STATUSES, row.status) || !isOneOf(APPOINTMENT_SOURCES, row.source)) return null;
  const through = row.through_type && isOneOf(TOUCH_SUBJECTS, row.through_type) ? row.through_type : null;
  return {
    id: row.id,
    contact_id: row.contact_id,
    status: row.status,
    source: row.source,
    created_at: row.created_at,
    through_type: through,
    through_id: through ? row.through_id : null,
    starts_at: row.starts_at,
    service: row.service,
  };
}

/** These people's visits whose row was written since a moment (what their touches may be put down to). */
export async function listVisitsOf(
  db: Db,
  tenantId: TenantId,
  of: { contactIds: readonly ContactId[]; since: string },
): Promise<VisitForCredit[]> {
  const contactIds = [...new Set(of.contactIds)].slice(0, 500);
  if (contactIds.length === 0) return [];
  const { data, error } = await tenantDb(db, tenantId)
    .from("appointments")
    .select(VISIT_COLUMNS)
    .in("contact_id", contactIds)
    .gte("created_at", of.since)
    .order("created_at", { ascending: false })
    .limit(VISITS_READ_MAX);
  if (error) throw new DbFailure(error, "appointments");
  return data.flatMap((row) => creditVisitOf(row) ?? []);
}

/** A workspace's visits whose row was written in a window (Reports' total, each counted once). */
export async function listVisitsMadeIn(
  db: Db,
  tenantId: TenantId,
  window: { since: string; until: string },
): Promise<VisitForCredit[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("appointments")
    .select(VISIT_COLUMNS)
    .gte("created_at", window.since)
    .lt("created_at", window.until)
    .not("contact_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(VISITS_READ_MAX);
  if (error) throw new DbFailure(error, "appointments");
  return data.flatMap((row) => creditVisitOf(row) ?? []);
}

/** A post's one link: its code, where it lands, whether it was stopped, and how often it was opened in all. */
export interface PostLinkRead {
  linkId: string;
  code: string;
  lands: LinkLands;
  stopped: boolean;
  opens: number;
}

function postLinkOf(value: unknown): PostLinkRead | null {
  const row = recordOrEmpty(value);
  if (typeof row.link_id !== "string" || typeof row.code !== "string" || !isOneOf(LINK_LANDS, row.lands)) return null;
  return {
    linkId: row.link_id,
    code: row.code,
    lands: row.lands,
    stopped: row.stopped === true,
    opens: typeof row.opens === "number" ? row.opens : Number(row.opens ?? 0) || 0,
  };
}

/** A post's one link, made on first ask (post_link_make, a member who may act, on their own client). */
export async function makePostLink(db: Db, tenantId: TenantId, postId: string): Promise<PostLinkRead | null> {
  const { data, error } = await db.rpc("post_link_make", { p_tenant_id: tenantId, p_post_id: postId });
  if (error) throw new DbFailure(error, "post_link_make");
  return postLinkOf(data);
}

/** The links of these posts that exist, with their opens in all; a post with none is absent. */
export async function readPostLinks(
  db: Db,
  tenantId: TenantId,
  postIds: readonly string[],
): Promise<Map<string, PostLinkRead>> {
  const ids = [...new Set(postIds)].slice(0, 200);
  const out = new Map<string, PostLinkRead>();
  if (ids.length === 0) return out;
  const { data, error } = await tenantDb(db, tenantId)
    .from("links")
    .select("id, code, lands, stopped_at, subject_id, link_days(opens)")
    .eq("subject_type", "post")
    .in("subject_id", ids)
    .limit(ids.length);
  if (error) throw new DbFailure(error, "links");
  for (const row of data) {
    if (!isOneOf(LINK_LANDS, row.lands)) continue;
    out.set(row.subject_id, {
      linkId: row.id,
      code: row.code,
      lands: row.lands,
      stopped: row.stopped_at !== null,
      opens: row.link_days.reduce((sum, day) => sum + day.opens, 0),
    });
  }
  return out;
}

/** The most people one read of review asks names, under the gateway's line for one `.in()`. */
const ASKED_PEOPLE_MAX = 100;

/** A review ask sent to a person: when, and the conversation it went in. */
export interface ReviewAskRead {
  contactId: string;
  at: string;
  conversationId: string | null;
}

/**
 * The review asks these people were sent since a moment, oldest first (the content loop's pass 6; the canvas's Loop3):
 * a campaign's message that went, from a step whose words fill the business's review link (the after-visit ask, #2521),
 * with the conversation it went in. What the chain on a piece ends at: nothing here says who wrote a review on Google.
 */
export async function listReviewAsksOf(
  db: Db,
  tenantId: TenantId,
  contactIds: readonly ContactId[],
  sinceIso: string,
): Promise<ReviewAskRead[]> {
  const people = [...new Set(contactIds)].slice(0, ASKED_PEOPLE_MAX);
  if (people.length === 0) return [];
  const steps = await tenantDb(db, tenantId)
    .from("sequence_steps")
    .select("id")
    .contains("params", [{ kind: "review_link" }])
    // A workspace's campaigns that ask for a review: a handful.
    .limit(50);
  if (steps.error) throw new DbFailure(steps.error, "the steps that ask for a review");
  if (steps.data.length === 0) return [];
  const sends = await tenantDb(db, tenantId)
    .from("sequence_sends")
    .select("contact_id, sent_at, message_id")
    .in(
      "step_id",
      steps.data.map((row) => row.id),
    )
    .in("contact_id", people)
    .eq("state", "sent")
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: true })
    .limit(people.length * 3);
  if (sends.error) throw new DbFailure(sends.error, "review asks sent");
  const messageIds = sends.data.flatMap((row) => (row.message_id ? [row.message_id] : []));
  const where = new Map<string, string>();
  if (messageIds.length > 0) {
    const messages = await tenantDb(db, tenantId)
      .from("messages")
      .select("id, conversation_id")
      .in("id", messageIds)
      .limit(messageIds.length);
    if (messages.error) throw new DbFailure(messages.error, "review asks' conversations");
    for (const row of messages.data) where.set(row.id, row.conversation_id);
  }
  return sends.data.flatMap((row) =>
    row.contact_id && row.sent_at
      ? [
          {
            contactId: row.contact_id,
            at: row.sent_at,
            conversationId: row.message_id ? (where.get(row.message_id) ?? null) : null,
          },
        ]
      : [],
  );
}

/** What the plan reads to propose the review ask (pass 6; the canvas's Loop4), each a narrow read. */
export interface ReviewAskFactsRead {
  /** Whether a campaign whose step fills the review link is running. */
  askOn: boolean;
  /** When the owner last said Not now to the proposal; null where never. */
  restedAt: string | null;
  /** The newest review on Google, of any stars; null where there has been none. */
  newestReviewAt: string | null;
}

/**
 * Whether a review ask runs, when its proposal was last rested (a `snooze` of the workspace's, about `review_ask`), and
 * when the newest review came: what contracts reviewAskOf decides from, with the goal and the review link.
 */
export async function readReviewAskFacts(db: Db, tenantId: TenantId): Promise<ReviewAskFactsRead> {
  const [on, rested, newest] = await Promise.all([
    tenantDb(db, tenantId)
      .from("sequence_steps")
      .select("id")
      .eq("state", "running")
      .contains("params", [{ kind: "review_link" }])
      .limit(1),
    tenantDb(db, tenantId)
      .from("decisions")
      .select("created_at")
      .eq("subject_type", "workspace")
      .eq("verb", "snooze")
      .eq("payload->>about", "review_ask")
      .order("created_at", { ascending: false })
      .limit(1),
    tenantDb(db, tenantId)
      .from("google_reviews")
      .select("published_at")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1),
  ]);
  if (on.error) throw new DbFailure(on.error, "a running review ask");
  if (rested.error) throw new DbFailure(rested.error, "the review ask's rest");
  if (newest.error) throw new DbFailure(newest.error, "the newest review");
  return {
    askOn: on.data.length > 0,
    restedAt: rested.data[0]?.created_at ?? null,
    newestReviewAt: newest.data[0]?.published_at ?? null,
  };
}

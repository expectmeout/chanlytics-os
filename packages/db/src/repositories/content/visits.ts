/**
 * What a booking is put down to, as the database's one rule answers it (00732 bookings_with_sources; the content loop
 * PRD's 9.3, Appendix A.6, A.7), and a post's one link with its opens. Bounded by span and workspace; a read that fails
 * THROWS, but for a database from before the rule, which answers nothing and is said so.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APPOINTMENT_STATUSES,
  DbFailure,
  isOneOf,
  LINK_LANDS,
  recordOrEmpty,
  TOUCH_SUBJECTS,
  type BookingSource,
  type BookingWithSources,
  type LinkLands,
  type ContactId,
  type TenantId,
  type TouchSubjectType,
} from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

function bookingSourceOf(value: unknown): BookingSource | null {
  const row = recordOrEmpty(value);
  const at = textOrNull(row.at);
  if (!isOneOf(TOUCH_SUBJECTS, row.type) || !at) return null;
  return {
    type: row.type,
    id: textOrNull(row.id),
    ref: textOrNull(row.ref),
    at,
    standing: row.standing === "main" ? "main" : "helped",
    tied: row.tied === true,
  };
}

function bookingOf(value: unknown): BookingWithSources | null {
  const row = recordOrEmpty(value);
  const id = textOrNull(row.appointment_id);
  const madeAt = textOrNull(row.made_at);
  const startsAt = textOrNull(row.starts_at);
  if (!id || !madeAt || !startsAt || !isOneOf(APPOINTMENT_STATUSES, row.status)) return null;
  const sources = (Array.isArray(row.sources) ? row.sources : []).flatMap((one: unknown) => bookingSourceOf(one) ?? []);
  return {
    appointment_id: id,
    contact_id: textOrNull(row.contact_id),
    made_at: madeAt,
    starts_at: startsAt,
    status: row.status,
    sources,
  };
}

/** What the rule answered: the bookings, and the window it counted by; null from a database that has no such rule yet. */
export interface BookingsRead {
  windowDays: number;
  bookings: BookingWithSources[];
}

/**
 * The bookings made in a span with everything each is put down to (bookings_with_sources, on the member's own
 * client): of anyone, or of `people` alone; `of` keeps the bookings one source of that kind touched. Null where the
 * database is from before 00732: a page then says no booking of its own working out.
 */
export async function readBookingsWithSources(
  db: Db,
  tenantId: TenantId,
  span: { since: string; until: string | null; people?: readonly ContactId[]; of?: TouchSubjectType },
): Promise<BookingsRead | null> {
  if (span.people?.length === 0) return { windowDays: 0, bookings: [] };
  const { data, error } = await db.rpc("bookings_with_sources", {
    p_tenant_id: tenantId,
    p_since: span.since,
    ...(span.until ? { p_until: span.until } : {}),
    ...(span.people ? { p_people: [...new Set(span.people)].slice(0, 500) } : {}),
    ...(span.of ? { p_of: span.of } : {}),
  });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new DbFailure(error, "bookings_with_sources");
  }
  const answer = recordOrEmpty(data);
  return {
    windowDays: typeof answer.window_days === "number" ? answer.window_days : 0,
    bookings: (Array.isArray(answer.bookings) ? answer.bookings : []).flatMap((one: unknown) => bookingOf(one) ?? []),
  };
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

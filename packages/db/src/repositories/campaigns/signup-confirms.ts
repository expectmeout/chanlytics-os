/**
 * A website's sign-up, confirmed by its person (00489): what the edge reads before it asks (signupAskFacts, judged by
 * contracts signupAskRefusal), and the confirmation email the dashboard's page opens (confirmationEmailOf). An ask is
 * the email itself, a row of messages under meta.source signup_confirm: it is counted by its row, so no table keeps
 * what the thread already holds. Each read throws when it fails: "we could not count" is never "none asked".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  SIGNUP_ASK_LIMITS,
  SIGNUP_CONFIRM_MS,
  SIGNUP_CONFIRM_SOURCE,
  type SignupAskFacts,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/** A row an ask counts by: one that left or is about to. A cancelled one never reached anybody. */
const ASKING = ["queued", "sent", "delivered", "read"];

/** The workspace's asks since a moment, as a count; `extra` narrows them (to one address, to the failed). */
async function asksSince(
  db: Db,
  tenantId: string,
  sinceMs: number,
  extra: (q: ReturnType<typeof base>) => ReturnType<typeof base>,
): Promise<number> {
  const { count, error } = await extra(base(db, tenantId, sinceMs));
  if (error) throw new Error(`cannot count the sign-up confirmations: ${error.message}`);
  return count ?? 0;
}

function base(db: Db, tenantId: string, sinceMs: number) {
  return db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .eq("meta->>source", SIGNUP_CONFIRM_SOURCE)
    .gte("created_at", new Date(sinceMs).toISOString());
}

/**
 * What a sign-up is judged by before it is asked, all but the mailbox (the edge reads that for the identity it sends
 * as): the person as they stand, null when gone; whether an ask to them is still open; the asks the limits count, to
 * this address (`addressKey`, contracts signupAddressKey) in ninety days and by the workspace in the last day; and the
 * form their newest ask carried (`lastForm`, null with none), which a member's ask again keeps as its evidence.
 */
export async function signupAskFacts(
  db: Db,
  p: { tenantId: string; contactId: string; addressKey: string; nowMs: number },
): Promise<Omit<SignupAskFacts, "mailbox"> & { lastForm: Json | null }> {
  const dayAgo = p.nowMs - DAY_MS;
  const [person, open, last, addressAsks, workspaceToday, failedToday] = await Promise.all([
    db
      .from("contacts")
      .select(
        "email, consent, dnc, email_suppressed_at, email_marketing, acquired_via, erased_at, erasing_since, merged_into_contact_id",
      )
      .eq("tenant_id", p.tenantId)
      .eq("id", p.contactId)
      .maybeSingle(),
    db
      .from("messages")
      .select("id")
      .eq("tenant_id", p.tenantId)
      .eq("contact_id", p.contactId)
      .eq("channel", "email")
      .eq("direction", "outbound")
      .eq("meta->>source", SIGNUP_CONFIRM_SOURCE)
      .in("status", ASKING)
      .gte("created_at", new Date(p.nowMs - SIGNUP_CONFIRM_MS).toISOString())
      .limit(1),
    // Their newest ask, whatever became of it: that a sign-up of theirs was asked, and the form it carried.
    db
      .from("messages")
      .select("meta")
      .eq("tenant_id", p.tenantId)
      .eq("contact_id", p.contactId)
      .eq("channel", "email")
      .eq("direction", "outbound")
      .eq("meta->>source", SIGNUP_CONFIRM_SOURCE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    asksSince(db, p.tenantId, p.nowMs - SIGNUP_ASK_LIMITS.perAddressMs, (q) =>
      q.eq("meta->signup_confirm->>key", p.addressKey).neq("status", "canceled"),
    ),
    asksSince(db, p.tenantId, dayAgo, (q) => q.neq("status", "canceled")),
    asksSince(db, p.tenantId, dayAgo, (q) => q.eq("status", "failed")),
  ]);
  if (person.error) throw new Error(`cannot read the person a sign-up asks: ${person.error.message}`);
  if (open.error) throw new Error(`cannot read the person's open sign-up confirmation: ${open.error.message}`);
  if (last.error) throw new Error(`cannot read the person's last sign-up confirmation: ${last.error.message}`);
  const asked = (last.data?.meta ?? null) as { signup_confirm?: { form?: Json } } | null;
  const c = person.data;
  const gone = !c || !!c.erased_at || !!c.erasing_since || !!c.merged_into_contact_id;
  return {
    person: gone
      ? null
      : {
          email: c.email,
          stopped: c.consent === "opted_out" || !!c.dnc,
          suppressed: !!c.email_suppressed_at,
          emailOffers: c.email_marketing,
          fromWebsite: c.acquired_via === "website" || !!last.data,
        },
    open: (open.data ?? []).length > 0,
    addressAsks,
    workspaceToday,
    failedToday,
    lastForm: asked?.signup_confirm?.form ?? null,
  };
}

/** A sign-up's confirmation email, as its page reads it: whose it is, who sent it, the address it went to. */
interface ConfirmationEmail {
  /** The person it is about now: the email's row moves to the person someone was merged into. */
  contactId: string | null;
  /** The From it left as ("Name" <address>), the business's name read off it. */
  from: string | null;
  /** The address it went to, lower-cased. */
  to: string | null;
}

/**
 * The confirmation email a link names, or null when the workspace holds no such email (another email's id, an inbound
 * one, another workspace's). The page reads it to say whose question it asks; the yes door judges the press itself.
 */
export async function confirmationEmailOf(
  db: Db,
  p: { tenantId: string; messageId: string },
): Promise<ConfirmationEmail | null> {
  const { data, error } = await db
    .from("messages")
    .select("contact_id, meta")
    .eq("tenant_id", p.tenantId)
    .eq("id", p.messageId)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .eq("meta->>source", SIGNUP_CONFIRM_SOURCE)
    .maybeSingle();
  if (error) throw new Error(`cannot read the sign-up's confirmation email: ${error.message}`);
  if (!data) return null;
  const request = (data.meta as { email?: { request?: { from?: unknown; to?: unknown } } } | null)?.email?.request;
  const to =
    Array.isArray(request?.to) && typeof request.to[0] === "string" ? request.to[0].trim().toLowerCase() : null;
  return { contactId: data.contact_id, from: typeof request?.from === "string" ? request.from : null, to };
}

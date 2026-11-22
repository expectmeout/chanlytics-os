/**
 * The shared record's reader over ad_entries (the content loop PRD's Appendix A.2; the Ads tracking plan's T1, 00677
 * ad_touches_of): for a thread, which of its messages came from an ad, and the ad a person first came from, each named
 * as every page names an ad (ad_named) with the ad Chanlytics holds for it (ad_held_for). One read for every thread of an
 * answer, and none for threads that hold no ad: only a customer's message an ad's referral rode in on, and only a
 * person's first touch through an ad, are asked about.
 *
 * Its first user is the Inbox; a person's page and Reports read through it when their own steps come (A.2's touchesOf
 * and touchesIn). Posts, links and forms join it with their own homes and first readers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, recordOrNull, type TenantId, type Touch } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import type { Database } from "../../types";

/** The most messages, and first touches, one read asks about (the function's own bounds). */
const TOUCHES_MAX = { messages: 500, refs: 200 } as const;

/**
 * The ad's own id at its platform on a message whose referral is an ad, as the entry's door reads it (00644
 * ad_entry_keep): a customer's message, its referral of kind `ad`, its id said; else null. The one reading of a
 * message's referral in code: AI's note about the person (conversations/thread/ad-tap.ts) and the Inbox both ask it.
 */
export function adRefIn(message: { fromCustomer: boolean; meta: unknown }): string | null {
  if (!message.fromCustomer) return null;
  const referral = recordOrNull(recordOrNull(message.meta)?.referral);
  if (referral?.source_type !== "ad" || typeof referral.source_id !== "string") return null;
  return referral.source_id.trim() || null;
}

/** An ad as a touch names it: the ad Chanlytics holds (null where it holds none) and its name (null where none). */
type TouchedAd = Touch["subject"];

const filledText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/**
 * Of these messages, the touches they are (the entries they opened); and of these first touches (contacts.acquired_ref),
 * the ad each names, by the reference. Nothing is read where neither holds anything. A database that has not run 00677
 * answers none (either deploy order). A read the database refuses throws.
 */
export async function readAdTouches(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  among: { messageIds: readonly string[]; refs: readonly string[] },
): Promise<{ touches: Touch[]; firsts: Map<string, TouchedAd> }> {
  const messageIds = [...new Set(among.messageIds)].slice(0, TOUCHES_MAX.messages);
  const refs = [...new Set(among.refs.filter((ref) => ref.trim()))].slice(0, TOUCHES_MAX.refs);
  if (messageIds.length === 0 && refs.length === 0) return { touches: [], firsts: new Map() };
  const { data, error } = await db.rpc("ad_touches_of", {
    p_tenant_id: tenantId,
    p_messages: messageIds,
    p_refs: refs,
  });
  if (error) {
    if (isMissingDoor(error)) return { touches: [], firsts: new Map() };
    throw new DbFailure(error, "ad_touches_of");
  }
  const answer = recordOrEmpty(data);
  const named = new Map<string, TouchedAd>();
  for (const row of Array.isArray(answer.named) ? answer.named.map(recordOrEmpty) : []) {
    const ref = filledText(row.ref);
    if (ref) named.set(ref, { type: "ad", id: filledText(row.ad_id), name: filledText(row.name) });
  }
  const touches = (Array.isArray(answer.touches) ? answer.touches.map(recordOrEmpty) : []).flatMap((row): Touch[] => {
    const messageId = filledText(row.message_id);
    const subject = named.get(filledText(row.ref) ?? "");
    return messageId && subject ? [{ subject, message_id: messageId }] : [];
  });
  const firsts = new Map<string, TouchedAd>();
  for (const ref of refs) {
    const ad = named.get(ref);
    if (ad) firsts.set(ref, ad);
  }
  return { touches, firsts };
}

/**
 * What a person's message answered, kept beside it once it has landed (00699; the content loop PRD's 9.2, Appendix A.4,
 * A.5): a reply to one of the business's stories (Instagram names the story by the id the post keeps), an ig.me link's
 * code riding the message, or a post's code in a WhatsApp message's words. Each is a touch of the post, in the person's
 * thread, kept once by the message's own id, so the visit they ask for next records what it answered and AI's reply
 * knows the post. Its own call, which logs and never throws: a touch that could not be kept never costs the message.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundMessage } from "@chanlytics/channels/inbound";
import { postCodeIn, type TenantId } from "@chanlytics/contracts";
import type { InboundChannel } from "@chanlytics/core";
import { findPostByPlaceId, findPostOfCode, keepTouch } from "@chanlytics/db/content";
import type { Database } from "@chanlytics/db/types";
import { errField, logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/** The message as it landed: who wrote it, in which thread, its row's id. */
interface Landed {
  message_id: string;
  conversation_id: string;
  contact_id: string;
}

/** The post a message answered, and how: by a story reply, or by a link's code. Null for a message that answered none. */
async function answeredOf(
  db: Db,
  tenantId: TenantId,
  inbound: InboundMessage,
): Promise<{ postId: string; kind: "story_reply" | "coded_message" } | null> {
  if (inbound.answered?.story) {
    const post = await findPostByPlaceId(db, tenantId, { place: "instagram", externalId: inbound.answered.story });
    if (post) return { postId: post.id, kind: "story_reply" };
  }
  const code = inbound.referral?.sourceType === "link" ? inbound.referral.sourceId : postCodeIn(inbound.body);
  if (!code) return null;
  const of = await findPostOfCode(db, code);
  return of && of.tenantId === tenantId ? { postId: of.postId, kind: "coded_message" } : null;
}

/** The touch a message is of a post, kept; nothing for a message that answered no post. Never throws. */
export async function keepWhatItAnswered(
  db: Db,
  tenantId: TenantId,
  landed: Landed,
  inbound: InboundMessage & { channel: InboundChannel },
): Promise<void> {
  if (inbound.channel !== "instagram" && inbound.channel !== "whatsapp") return;
  try {
    const answered = await answeredOf(db, tenantId, inbound);
    if (!answered) return;
    const kept = await keepTouch(db, {
      tenantId,
      kind: answered.kind,
      subject: { type: "post", id: answered.postId },
      contactId: landed.contact_id,
      place: inbound.channel,
      eventId: inbound.externalId,
      at: inbound.channelTsIso ?? new Date().toISOString(),
      conversationId: landed.conversation_id,
      messageId: landed.message_id,
    });
    logger({ tenant_id: tenantId }).info("touch_recorded", { kind: answered.kind, kept: kept.kept });
  } catch (e) {
    logger({ tenant_id: tenantId }).error("touch_keep_failed", { message: inbound.externalId, error: errField(e) });
  }
}

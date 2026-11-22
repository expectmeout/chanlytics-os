/**
 * A request carried into a chat by its code (00680; the Forms plan, 3.4 and 3.5). A hosted form's thank-you opens the
 * chat with the visitor's own message ready, the request's code in brackets at its end. As that message is kept
 * (inbound/persist.ts runPgIngest), two things happen around the one write, each its own call that logs and never
 * throws, so a request's code is never the reason a customer's message is lost:
 *
 *   before   where the request's person has an address and no number, the number that wrote is added to them
 *            (form_code_person, by the person door's own rule: it fills what is empty), so the conversation the message
 *            opens is theirs and no second person is made;
 *   after    the conversation is linked to the request, which answers it, and the code is spent (form_code_link). A
 *            held entry whose code arrives is let through: a person's own phone wrote.
 *
 * A message with no code costs one look at its words and no read.
 */
import { requestCodeOf, type TenantId } from "@chanlytics/contracts";
import { addRequestCodeNumber, linkRequestCode } from "@chanlytics/db/forms";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errField, logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/**
 * Before the message is kept: the code its words carry, with the number that wrote added to the request's person where
 * they had none. Answers the code, or null for a message that carries none.
 */
export async function prepareCarriedRequest(
  db: Db,
  tenantId: TenantId,
  inbound: { body: string | null; phoneE164: string | null },
): Promise<string | null> {
  const code = inbound.body ? requestCodeOf(inbound.body) : null;
  if (!code) return null;
  if (inbound.phoneE164) {
    await addRequestCodeNumber(db, { tenantId, code, phone: inbound.phoneE164 }).catch((e: unknown) => {
      logger().error("request_code_failed", { tenant_id: tenantId, step: "person", error: errField(e) });
    });
  }
  return code;
}

/** After the message is kept: its conversation linked to the request its code names, which answers it. */
export async function linkCarriedRequest(
  db: Db,
  tenantId: TenantId,
  carried: { code: string | null; conversationId: string; messageId: string },
): Promise<void> {
  if (!carried.code) return;
  try {
    const linked = await linkRequestCode(db, {
      tenantId,
      code: carried.code,
      conversationId: carried.conversationId,
      messageId: carried.messageId,
    });
    if (linked)
      logger().info("request_code_linked", {
        tenant_id: tenantId,
        entry_id: linked.entryId,
        same_person: linked.samePerson,
      });
  } catch (e) {
    logger().error("request_code_failed", { tenant_id: tenantId, step: "link", error: errField(e) });
  }
}

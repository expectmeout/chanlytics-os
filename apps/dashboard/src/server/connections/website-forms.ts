/**
 * A website's keys for its forms, for the dashboard (00674; the Forms plan, F0, and Ruben's call 9): one made at random
 * here and shown to the owner once, its sha-256 alone kept (form_key_make); one changed for a new one by the same name,
 * the old one honoured a day so the site can be given the new one with no form refused (form_key_change); one ended at
 * once (form_key_end). An owner's or a partner's (the route says so, and each door asks again). The edge's door looks
 * a key up by the same hash (apps/edge/lib/website/form-key.ts). Every refusal is the door's own sentence.
 */
import "server-only";
import type { WebsiteFormKeyMade } from "@chanlytics/contracts";
import { newWebsiteFormKey, websiteFormKeyHash } from "@chanlytics/channels/tokens";
import { changeFormKey, endFormKey, makeFormKey } from "@chanlytics/db/people";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";

/** What a press on a key asks: a key made for a site, or one of the workspace's keys changed or ended. */
type WebsiteKeyPress = { act: "make"; name: string } | { act: "change" | "end"; key_id: string };

/**
 * `POST website-forms`: a key made (the key itself answered this once, `made`), a key changed for a new one (its new key
 * answered this once; the old one works a day more), or a key ended (`ended`, whether one that still worked was).
 */
export async function changeWebsiteKey(
  ctx: RouteContext,
  member: Member,
  press: WebsiteKeyPress,
): Promise<{ made: WebsiteFormKeyMade | null; ended: boolean }> {
  if (press.act === "end") {
    const ended = await endFormKey(ctx.supabase, { tenantId: member.tenantId, keyId: press.key_id });
    return { made: null, ended };
  }
  const key = newWebsiteFormKey();
  const hash = websiteFormKeyHash(key);
  if (press.act === "make") {
    // The name as the route read it (trimmed, one to sixty characters), which the door keeps.
    const id = await makeFormKey(ctx.supabase, { tenantId: member.tenantId, name: press.name, hash });
    return { made: { id, name: press.name, key }, ended: false };
  }
  // The door names the new key: the site's name, kept from the one it replaces.
  const kept = await changeFormKey(ctx.supabase, { tenantId: member.tenantId, keyId: press.key_id, hash });
  return { made: { ...kept, key }, ended: false };
}

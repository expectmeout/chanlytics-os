/**
 * The number a post's band says: the one the receptionist tells customers to call, resolved as it is everywhere (contracts
 * resolveFacts), so what a picture prints is what is answered. Most businesses type none, and it falls back to their line. A
 * module apart from the composer, so Ask's act reads it without loading the image libraries on every turn.
 */
import "server-only";
import { parseTenantConfig, resolveFacts } from "@chanlytics/contracts";
import { getKnownFacts } from "../readers/settings";
import type { RouteContext } from "../shared/with-route";

/** The published number, or null where this business has none. */
export async function postPhoneOf(ctx: RouteContext, tenantId: string, config: unknown): Promise<string | null> {
  const brain = parseTenantConfig(config)?.brain ?? null;
  return resolveFacts(brain, await getKnownFacts(ctx, tenantId)).phone_display?.value ?? null;
}

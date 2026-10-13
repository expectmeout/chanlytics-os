import "server-only";
import { cache } from "react";

/**
 * One load of a workspace's public facts for the pages that have no session: the sign-up page, its paper form and desk
 * sign, the business's own page and its texting terms (the wiring's second audit, X4-7). They read with the service role
 * and show nothing a member's page does not.
 *
 * Wrapped in React's per-request `cache`: each page reads in generateMetadata and again in the component, and the sign-up
 * page reads the business page's facts beside its own, so one load answers all of them in a request. Every read that
 * fails throws (packages/db publicWorkspaceBySlug): a page that cannot read a fact is a failed page, never one with
 * Chanlytics' own policy links or no phone. A workspace with no public pages, a fixture or an ended one, is null.
 */
import { hasPublicPages } from "@chanlytics/contracts";
import { publicWorkspaceBySlug, type PublicWorkspaceRead } from "@chanlytics/db";
import { serviceDb } from "../service-db";

/** A slug as `create_workspace` mints them: lowercase letters, digits and dashes. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const publicFactsFor = cache(async function publicFactsFor(slug: string): Promise<PublicWorkspaceRead | null> {
  const clean = slug.trim().toLowerCase();
  if (!SLUG.test(clean)) return null;
  const w = await publicWorkspaceBySlug(serviceDb(), clean);
  return w && hasPublicPages(w.status, w.open) ? w : null;
});

/** The oldest active number of a kind, as Connections shows it; null when there is none. */
export function activeNumberOf(w: PublicWorkspaceRead, kind: string): string | null {
  return w.channels.find((c) => c.kind === kind && c.number_e164)?.number_e164 ?? null;
}

/**
 * The Page a Meta link's sign-in shared, read at Connect (the content loop PRD's pass 5): among the Pages the token may post
 * to (its own description's `pages_manage_posts`, granular_scopes' target ids), the one linked to the Instagram account the
 * link connects, else the only one. Several and none linked keeps none: the owner connects again and shares one. A sign-in
 * that shared no Page, or one whose Page cannot be read, keeps none, and Instagram connects all the same.
 */
import type { MetaPage } from "@chanlytics/contracts";
import { META_GRAPH, isMetaId, metaObject, metaProofQuery, metaText, type MetaRequest } from "../meta/client";
import { callFacebook, type FacebookDeps } from "./page";

/** At most this many Pages are read at Connect: a business shares a few, never a list to page through. */
const PAGES_READ_MAX = 5;
const PAGE_READ_MS = 8_000;

/** A Page as Connect reads it: its name, and the Instagram account it is linked to. */
function linkedPageRequest(token: string, appSecret: string, pageId: string): MetaRequest {
  return {
    url: `${META_GRAPH}/${encodeURIComponent(pageId)}?${new URLSearchParams({
      fields: "id,name,instagram_business_account",
      ...metaProofQuery(token, appSecret),
    }).toString()}`,
    method: "GET",
  };
}

/** A Page, read: its id, its name, and the Instagram account it is linked to; null where the answer names no Page. */
function parseLinkedPage(json: unknown): (MetaPage & { instagramId: string | null }) | null {
  const o = metaObject(json);
  const id = metaText(o?.id);
  if (!isMetaId(id)) return null;
  const linked = metaText(metaObject(o?.instagram_business_account)?.id);
  return { id, name: metaText(o?.name).trim() || null, instagramId: isMetaId(linked) ? linked : null };
}

/** The Page ids a token may post to, as its own description names them. */
export const postablePageIdsOf = (accountsByScope: Record<string, string[]>): string[] => [
  ...new Set((accountsByScope.pages_manage_posts ?? []).filter((id) => isMetaId(id))),
];

/** The Page the link keeps for this Instagram account, or none; never throws (a Page unread is a Page not kept). */
export async function readLinkedPage(
  at: { token: string; appSecret: string; accountId: string; pageIds: readonly string[] },
  deps: FacebookDeps = {},
): Promise<MetaPage | null> {
  const ids = at.pageIds.slice(0, PAGES_READ_MAX);
  if (ids.length === 0) return null;
  const answers = await Promise.all(
    ids.map((id) => callFacebook(linkedPageRequest(at.token, at.appSecret, id), { timeoutMs: PAGE_READ_MS }, deps)),
  );
  const pages = answers.flatMap((a) => {
    const page = a.outcome === "ok" ? parseLinkedPage(a.json) : null;
    return page ? [page] : [];
  });
  const chosen = pages.find((p) => p.instagramId === at.accountId) ?? (at.pageIds.length === 1 ? pages[0] : undefined);
  return chosen ? { id: chosen.id, name: chosen.name } : null;
}

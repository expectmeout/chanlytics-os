/**
 * The website read's look step (decision 0075): the page's colour, as its reader saw the brand's, else read in code (core
 * accentOfColour, siteAccentOf), the mark its reader saw, else one the site declares, fetched over the guarded fetch
 * (channels publicFetcher: the page names the picture's address, so a private one is refused at the connect) and judged as
 * the Logo row's lookup judges it (core findSiteLogo), remade as the square PNG a workspace wears (core remadeLogo) and
 * stored in 00407's bucket under the workspace's own folder, and both worn through wear_found_look, which fills only what
 * no person set. What was found is answered for the read to keep, whether or not it was worn: the Logo row offers a mark
 * the server could not make square. Never throws: a look that fails is logged, and the read goes on.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  LOGO_FOUND_MAX_BYTES,
  SECOND_MS,
  WORKSPACE_LOGOS_BUCKET,
  workspaceLogoPath,
  type LookRead,
  DbFailure,
} from "@chanlytics/contracts";
import { fetchImageBytes, type SitePage } from "@chanlytics/channels/website";
import { publicFetcher } from "@chanlytics/channels/shared";
import { remadeLogo } from "@chanlytics/channels/files";
import { accentOfColour, siteAccentOf, findSiteLogo } from "@chanlytics/core";
import { wearFoundLook } from "@chanlytics/db/look";
import type { Database } from "@chanlytics/db/types";
import { errField, logger } from "../shared/log.js";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

const IMAGE_MS = 4 * SECOND_MS;
const STORE_MS = 4 * SECOND_MS;
/** A day, as the dashboard's save caches a logo: a replaced picture has a new name. */
const CACHE_S = String(DAY_MS / SECOND_MS);

/** The PNG stored under the workspace's folder, or null when storage refused or did not answer in time. */
async function storedLogo(db: Db, tenantId: TenantId, png: Uint8Array): Promise<string | null> {
  const path = workspaceLogoPath(tenantId, randomUUID());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<{ error: { message: string } }>((resolve) => {
      timer = setTimeout(() => resolve({ error: { message: `timed out after ${STORE_MS} ms` } }), STORE_MS);
    });
    const upload = db.storage
      .from(WORKSPACE_LOGOS_BUCKET)
      .upload(path, png, { contentType: "image/png", cacheControl: CACHE_S, upsert: false });
    const { error } = await Promise.race([upload, late]);
    if (error) throw new DbFailure(error);
    return path;
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("website_look_failed", { step: "store", error: errField(e) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function wearSiteLook(
  db: Db,
  params: { tenantId: TenantId; page: Pick<SitePage, "html" | "url" | "brand">; fetchImpl?: typeof fetch },
): Promise<LookRead> {
  const log = logger({ tenant_id: params.tenantId });
  const none: LookRead = { logo_url: null, accent: null, worn: { logo: false, accent: false } };
  try {
    const fetchImpl = params.fetchImpl ?? publicFetcher();
    // The reader's own sight of the look first; the page read in code behind it, until real reads have proved the first
    // (`logo_from`, `accent_from` below say which answered).
    const seen = params.page.brand;
    const seenAccent = accentOfColour(seen?.colour);
    const accent = seenAccent ?? siteAccentOf(params.page.html);
    const found = await findSiteLogo(
      (url) => fetchImageBytes(fetchImpl, url, IMAGE_MS, LOGO_FOUND_MAX_BYTES),
      params.page.html,
      new URL(params.page.url).origin,
      seen?.logo ?? null,
    );
    const created = found ? remadeLogo(found.bytes, { inputMax: LOGO_FOUND_MAX_BYTES }) : null;
    const path = created?.ok ? await storedLogo(db, params.tenantId, created.png) : null;
    const worn = await wearFoundLook(db, { tenantId: params.tenantId, logoPath: path, accent });
    // A picture nobody wears is not left on our origin.
    if (path && !worn.logo)
      await db.storage
        .from(WORKSPACE_LOGOS_BUCKET)
        .remove([path])
        .catch(() => undefined);
    log.info("website_look", {
      logo: !found ? "none" : worn.logo ? "worn" : created?.ok ? "kept" : "offered",
      accent: !accent ? "none" : worn.accent ? "worn" : "kept",
      logo_from: found ? (found.url === seen?.logo ? "reader" : "page") : null,
      accent_from: accent ? (seenAccent ? "reader" : "page") : null,
    });
    return { logo_url: found?.url ?? null, accent, worn };
  } catch (e) {
    log.warn("website_look_failed", { step: "wear", error: errField(e) });
    return none;
  }
}

/**
 * The website read's look step (decision 0075): the page's colour read in code (core siteAccentOf), the mark the site
 * declares fetched over the guarded fetch (channels publicFetcher: the page names the picture's address, so a private
 * one is refused at the connect) and judged as the Logo row's lookup judges it (core siteLogoFrom), remade as the
 * square PNG a workspace wears (core remadeLogo) and stored in 00407's bucket under the workspace's own folder, and
 * both worn through wear_found_look, which fills only what no person set. What was found is answered for the read to
 * keep, whether or not it was worn: the Logo row offers a mark the server could not make square. Never throws: a look
 * that fails is logged, and the read goes on.
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
} from "../packages/contracts.js";
import { imageBytes, publicFetcher, remadeLogo } from "../packages/channels.js";
import { siteAccentOf, siteLogoFrom } from "../packages/core.js";
import { wearFoundLook, type Database } from "../packages/db.js";
import { errField, logger } from "../log.js";

type Db = SupabaseClient<Database>;

const IMAGE_MS = 4 * SECOND_MS;
const STORE_MS = 4 * SECOND_MS;
/** A day, as the dashboard's save caches a logo: a replaced picture has a new name. */
const CACHE_S = String(DAY_MS / SECOND_MS);

/** The PNG stored under the workspace's folder, or null when storage refused or did not answer in time. */
async function storedLogo(db: Db, tenantId: string, png: Uint8Array): Promise<string | null> {
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
    if (error) throw new Error(error.message);
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
  p: { tenantId: string; html: string; origin: string; fetchImpl?: typeof fetch },
): Promise<LookRead> {
  const L = logger({ tenant_id: p.tenantId });
  const none: LookRead = { logo_url: null, accent: null, worn: { logo: false, accent: false } };
  try {
    const fetchImpl = p.fetchImpl ?? publicFetcher();
    const accent = siteAccentOf(p.html);
    const found = await siteLogoFrom(
      (url) => imageBytes(fetchImpl, url, IMAGE_MS, LOGO_FOUND_MAX_BYTES),
      p.html,
      p.origin,
    );
    const made = found ? remadeLogo(found.bytes, { inputMax: LOGO_FOUND_MAX_BYTES }) : null;
    const path = made?.ok ? await storedLogo(db, p.tenantId, made.png) : null;
    const worn = await wearFoundLook(db, { tenantId: p.tenantId, logoPath: path, accent });
    // A picture nobody wears is not left on our origin.
    if (path && !worn.logo)
      await db.storage
        .from(WORKSPACE_LOGOS_BUCKET)
        .remove([path])
        .catch(() => undefined);
    L.info("website_look", {
      logo: !found ? "none" : worn.logo ? "worn" : made?.ok ? "kept" : "offered",
      accent: !accent ? "none" : worn.accent ? "worn" : "kept",
    });
    return { logo_url: found?.url ?? null, accent, worn };
  } catch (e) {
    L.warn("website_look_failed", { step: "wear", error: errField(e) });
    return none;
  }
}

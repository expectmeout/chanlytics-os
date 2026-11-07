/**
 * A post on the business's own Google profile (decision 0099, step 3), and off it again. Only on a person's press: the dashboard's
 * route holds who may, and nothing here runs by itself. It goes as the owner, with the token the connection holds, and the ledger keeps
 * Google's name for it, which is how a sheet says it is up and how it comes down.
 */
import { createLocalPost, deleteLocalPost, reviewParent, type GbpPostAsked } from "@chanlytics/channels/google";
import type { EdgeRefusal } from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db/events";
import { connectionOf, type Db } from "../shared/google/rows.js";
import { http } from "../shared/google/places.js";
import { tokenFor } from "../shared/google/credentials.js";

/** The connection and a token good now, or why not. */
async function asTheOwner(db: Db, tenantId: string, now: Date) {
  const conn = await connectionOf(db, tenantId);
  if (!conn || !conn.location_name) return { ok: false as const, error: "not_connected" as const };
  const t = await tokenFor(db, tenantId, now.getTime());
  if (!t.ok) return { ok: false as const, error: "no_token" as const, detail: t.detail ?? t.error };
  return { ok: true as const, token: t.token, parent: reviewParent(conn.account_name, conn.location_name) };
}

const googleSaid = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function postOnProfile(
  db: Db,
  tenantId: string,
  input: { fileId: string; by: string | null; post: GbpPostAsked },
  now = new Date(),
): Promise<{ ok: true; name: string; search_url: string | null; state: string | null } | EdgeRefusal> {
  const owner = await asTheOwner(db, tenantId, now);
  if (!owner.ok) return owner;
  let created;
  try {
    created = await createLocalPost(http, owner.token, owner.parent, input.post);
  } catch (e) {
    return { ok: false, error: "google_refused", detail: googleSaid(e) };
  }
  await emitEvent(db, tenantId, "file.posted", "workspace", tenantId, {
    file_id: input.fileId,
    post_name: created.name,
    search_url: created.search_url,
    by: input.by,
  }).catch(() => {});
  return { ok: true, ...created };
}

export async function unpostOnProfile(
  db: Db,
  tenantId: string,
  input: { fileId: string; by: string | null; name: string },
  now = new Date(),
): Promise<{ ok: true } | EdgeRefusal> {
  const owner = await asTheOwner(db, tenantId, now);
  if (!owner.ok) return owner;
  // Its name says whose it is: this connection's location, and no other's, whatever a caller sends.
  if (!input.name.startsWith(`${owner.parent}/localPosts/`)) return { ok: false, error: "not_found" };
  try {
    await deleteLocalPost(http, owner.token, input.name);
  } catch (e) {
    return { ok: false, error: "google_refused", detail: googleSaid(e) };
  }
  await emitEvent(db, tenantId, "file.unposted", "workspace", tenantId, {
    file_id: input.fileId,
    post_name: input.name,
    by: input.by,
  }).catch(() => {});
  return { ok: true };
}

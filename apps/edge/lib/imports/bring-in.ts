/**
 * POST /api/admin/files/bring-in: a link brought in from the owner's press on Ask's card (contracts content/bring-in.ts;
 * Content's empty state, 14 Nov 2026): a website read again for its photos and videos (the website_read job, with its
 * photos), or an Instagram account's posts and reels (instagram_read). Each says on the ledger that it is on its way, so the
 * page's card says "Looking"; what comes waits in the Library for a Keep. A link nothing here reads is refused in words.
 * An account already read inside the day is not read again: the answer says when it was and what came (00643).
 */
import { BRING_IN_WORDS, bringInOf, type DoorRead, type FILE_BRING_IN_DOOR } from "@chanlytics/contracts";
import { noteImport } from "@chanlytics/db/imports";
import { workspaceOf } from "../shared/admin-door.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { scheduleInstagramRead } from "./instagram-read.js";
import { scheduleWebsiteRead } from "./website-read.js";

export async function bringInLink(auth: Admitted, body: DoorRead<typeof FILE_BRING_IN_DOOR>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const at = workspaceOf(ws.tenantId);
  if (!at.ok) return at.response;
  const { db, tenantId } = at;
  const target = bringInOf(body.link ?? "");
  if (target.place === "none") return refuse(400, "bad_request", BRING_IN_WORDS.refused[target.why]);
  // A Google Drive folder is watched, never read once: its own door takes it (api/admin/sources), and nothing is here.
  if (target.place === "drive") return refuse(400, "bad_request", BRING_IN_WORDS.drive.summary);
  if (target.place === "instagram") {
    // An account read inside the day, or a day's reads used up, starts nothing and is no refusal: the card says which.
    const read = await scheduleInstagramRead(db, tenantId, target.handle);
    if (read.fate === "read_lately")
      return json(200, {
        ok: true,
        fate: read.fate,
        read_at: read.readAt.toISOString(),
        reading: read.reading,
        photos: read.photos,
        videos: read.videos,
      });
    if (read.fate === "wait")
      return json(200, { ok: true, fate: read.fate, binds: read.binds, until: read.until.toISOString() });
    return json(200, { ok: true, fate: read.fate });
  }
  await noteImport(db, { tenantId, source: "website_media", state: "queued", counts: {} });
  await scheduleWebsiteRead(db, tenantId, target.url);
  return json(200, { ok: true, fate: "website" });
}

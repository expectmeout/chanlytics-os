/**
 * What an owner approves when they turn an ad on, kept as an approval (the content loop PRD's 3.3 and 5.3; the Ads PRD's
 * join 6: one approval model for a post and an ad): the photo by its file and the SHA-256 of its bytes, the words by
 * version, where it shows and who it opens a chat with, the most it can cost and its last day, the area. Turn on's door
 * hands it to `ad_turn_on`, which keeps it in `approvals` with its hash taken in the database; the launch reads the
 * photo's bytes again right before it sends them, and a photo whose bytes are not the ones approved is never sent.
 *
 * The snapshot is a plain object: the database hashes its canonical form (approval_hash, 00681).
 */
import { createHash } from "node:crypto";
import { filePathOf, isFileMime, type TenantId } from "@chanlytics/contracts";
import { filesBucket, findFileForWork } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** The SHA-256 of a file's bytes, as an approval names a picture by (PRD 5.3), in hex. */
export const checksumOf = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** An ad's photo's bytes, read from Files: a photo of this workspace's that is still here, or null. */
export async function readAdPhoto(db: Db, tenantId: TenantId, fileId: string): Promise<Uint8Array | null> {
  const row = await findFileForWork(db, tenantId, fileId);
  if (!row || row.removed_at !== null || !isFileMime(row.mime) || !row.mime.startsWith("image/")) return null;
  const read = await filesBucket(db).download(filePathOf(row.tenant_id, row.id, row.mime));
  return read.data ? new Uint8Array(await read.data.arrayBuffer()) : null;
}

/** What the press approved, as Turn on's door reads it: enough of it to name each part of the snapshot. */
interface PressedAd {
  name: string;
  service: string;
  picture: string;
  picture_kind: "photo" | "video";
  miles: number;
  area?: { kind: "city" | "region" | "country"; key: string; name?: string; country?: string } | undefined;
  most_minor: number;
  end_day: string;
  versions: readonly { text: string; headline: string }[];
  address?: string | undefined;
  whatsapp: string;
  declared: "none";
}

/** An ad's approval, as `approvals.snapshot` keeps it (subject `ad`): a plain object, sent as jsonb as it is. */
type AdApprovalSnapshot = {
  ad: { name: string; service: string };
  picture: { file_id: string; kind: "photo" | "video"; checksum: string | null };
  words: { n: number; text: string; headline: string }[];
  shown_on: string[];
  where:
    | { area: { kind: string; key: string; name: string | null; country: string | null } }
    | { miles: number; address: string };
  opens: { door: "whatsapp"; number: string };
  spend: { most_minor: number; currency: string; end_day: string; ends_at: string };
  page_id: string;
  declared: "none";
  uses: ["ad"];
};

/**
 * The approval of an ad as pressed: each part named as the owner saw it, the photo by its file and its bytes' checksum
 * (null where its bytes could not be read at the press: the launch then finds no photo to send), the end in the
 * account's own zone.
 */
export function adApprovalSnapshotOf(
  ad: PressedAd,
  at: { currency: string; pageId: string; endsAt: string; shownOn: readonly string[]; checksum: string | null },
): AdApprovalSnapshot {
  return {
    ad: { name: ad.name, service: ad.service },
    picture: { file_id: ad.picture, kind: ad.picture_kind, checksum: at.checksum },
    words: ad.versions.map((version, nth) => ({ n: nth + 1, text: version.text, headline: version.headline })),
    shown_on: [...at.shownOn],
    where: ad.area
      ? {
          area: {
            kind: ad.area.kind,
            key: ad.area.key,
            name: ad.area.name ?? null,
            country: ad.area.country ?? null,
          },
        }
      : { miles: ad.miles, address: ad.address ?? "" },
    opens: { door: "whatsapp", number: ad.whatsapp },
    spend: { most_minor: ad.most_minor, currency: at.currency, end_day: ad.end_day, ends_at: at.endsAt },
    page_id: at.pageId,
    declared: ad.declared,
    uses: ["ad"],
  };
}

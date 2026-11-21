/**
 * A yes for one use of a file (00665; the content PRD's step L4): who said it, for a post, an ad, a reply or a cold email,
 * when, and when it was taken back. A member reads a file's yeses with the file, as its `yes_for` and `yes_back`; the
 * two doors (recorded, taken back) ask the settings permission themselves and restate those in the same transaction.
 * What a made piece was drawn from is read from `made`, which a member's session does not read, so that read is the
 * service role's.
 */
import {
  DbFailure,
  fileYesUsesIn,
  recordOrEmpty,
  type FileYesAd,
  type FileYesTakenBack,
  type FileYesUse,
  type TenantId,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

const textsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];

/** What keeping a yes came to: the uses kept now, those that already stood for that person, and the file's standing. */
export interface FileYesKept {
  kept: FileYesUse[];
  again: FileYesUse[];
  ids: string[];
  yesFor: FileYesUse[];
  yesBack: FileYesUse[];
}

/** A member's door: a yes said to AI for a file, for each use named, by who the owner named, in the conversation named. */
export async function recordFileYes(
  db: Db,
  args: { tenantId: TenantId; fileId: string; uses: readonly FileYesUse[]; who: string; threadId: string | null },
): Promise<FileYesKept> {
  const { data, error } = await db.rpc("file_yes_record", {
    p_tenant_id: args.tenantId,
    p_file_id: args.fileId,
    p_uses: [...args.uses],
    p_who: args.who,
    ...(args.threadId ? { p_thread_id: args.threadId } : {}),
  });
  if (error) throw new DbFailure(error, "file yes record");
  const answer = recordOrEmpty(data);
  return {
    kept: fileYesUsesIn(answer.kept),
    again: fileYesUsesIn(answer.again),
    ids: textsOf(answer.ids),
    yesFor: fileYesUsesIn(answer.yes_for),
    yesBack: fileYesUsesIn(answer.yes_back),
  };
}

const postsOf = (raw: unknown): FileYesTakenBack["held"] =>
  (Array.isArray(raw) ? raw : []).flatMap((row) => {
    const post = recordOrEmpty(row);
    return typeof post.post_id === "string" && typeof post.file_id === "string" && typeof post.place === "string"
      ? [
          {
            post_id: post.post_id,
            file_id: post.file_id,
            place: post.place,
            kind: typeof post.kind === "string" ? post.kind : "picture",
            status: typeof post.status === "string" ? post.status : "held",
            link: typeof post.permalink === "string" ? post.permalink : null,
            at: typeof post.at === "string" ? post.at : null,
          },
        ]
      : [];
  });

const YES_AD_OUTCOMES: readonly FileYesAd["outcome"][] = ["done", "pending", "blocked", "not_possible", "needs_person"];

/** The ads a take-back reached, as its door answers them; anything else in the answer is left out. */
const adsOf = (raw: unknown): FileYesAd[] =>
  (Array.isArray(raw) ? raw : []).flatMap((one): FileYesAd[] => {
    const ad = recordOrEmpty(one);
    const outcome = YES_AD_OUTCOMES.find((word) => word === ad.outcome);
    if (typeof ad.ad_id !== "string" || !outcome) return [];
    return [
      {
        ad_id: ad.ad_id,
        name: typeof ad.name === "string" ? ad.name : "",
        act: ad.act === "cancel" ? "cancel" : "pause",
        outcome,
      },
    ];
  });

/**
 * A member's door (the PRD's section 8): the yes for each use named, every use where none is, taken back on a file and on
 * every piece drawn from it, every post of them still waiting held with `held`'s words, and every ad made here that shows
 * one of them paused (00676), in one transaction. Answers what was held, every post already up or on its way, for the
 * owner to take down where it is, and the ads paused.
 */
export async function takeBackFileYes(
  db: Db,
  args: { tenantId: TenantId; fileId: string; uses: readonly FileYesUse[] | null; held: string },
): Promise<FileYesTakenBack> {
  const { data, error } = await db.rpc("file_yes_take_back", {
    p_tenant_id: args.tenantId,
    p_file_id: args.fileId,
    ...(args.uses && args.uses.length ? { p_uses: [...args.uses] } : {}),
    p_held: args.held,
  });
  if (error) throw new DbFailure(error, "file yes take back");
  const answer = recordOrEmpty(data);
  return {
    taken_back: typeof answer.taken_back === "number" ? answer.taken_back : 0,
    uses: fileYesUsesIn(answer.uses),
    files: textsOf(answer.files),
    held: postsOf(answer.held),
    live: postsOf(answer.live),
    ads: adsOf(answer.ads),
  };
}

/** For each made piece named, the files still here it was drawn from: the service role's, since `made` is. */
export async function listFilesDrawnFrom(
  db: Db,
  tenantId: TenantId,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const drawn = new Map<string, string[]>();
  if (ids.length === 0) return drawn;
  const { data, error } = await db.rpc("files_drawn_from", { p_tenant_id: tenantId, p_ids: [...ids] });
  if (error) throw new DbFailure(error, "files drawn from");
  for (const row of data) drawn.set(row.file_id, [...(drawn.get(row.file_id) ?? []), row.from_id]);
  return drawn;
}

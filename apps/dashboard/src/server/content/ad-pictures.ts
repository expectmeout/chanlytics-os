import "server-only";
import {
  AD_BEFORE_AFTER,
  adPictureIssue,
  fileAdRightsOf,
  fileSoundOf,
  type AdPicture,
  type FileDto,
  type FileYesFacts,
} from "@chanlytics/contracts";
import { listFilesForAds, listFilesOnShelf, readFileSound, type FileMemberRow } from "@chanlytics/db/files";
import { fileDtoOf } from "../readers/files";
import { readDrawnFrom } from "../posts/made-as";
import type { ReaderContext } from "../shared/reader";

/**
 * The pictures and videos a new ad may show (the Ads plan's 4.6, 6.8 and G15), from what the business keeps in Files and
 * what AI made. Whether each may run as an ad, on the rights, is Content's one answer (contracts files/yes.ts
 * fileAdRightsOf, the content PRD's step L4): someone shown runs only with a yes for ads that stands (a yes for posts
 * never covers an ad), a made piece shows who its photo or clips show, and a video with music, or not heard yet, is a no
 * until its licence is written (L8). This module reads what that answer needs and keeps no rule of its own:
 *
 *  - A video's sound, heard whole: none at all, or heard and holding no music, is no music. A video not heard yet is
 *    not known to have none.
 *  - Before and after: where the look's own sentence says the picture sets one beside the other.
 *
 * Ads never crops: the shape is the file's own, and the rule that judges it is contracts adPictureIssue.
 *
 * New ad's draft asks it (server/ads/draft-facts.ts).
 */

/**
 * How many a draft looks through of each shelf and kind, newest first, of what Files knows may be offered (nobody shown, a
 * video ready here): what AI made, then what the business keeps, photos and videos apart. Never the newest of a whole
 * shelf: on 20 November 2026 a Drive folder's 29 new clips, none looked at yet, pushed the one photo fine in ads out of
 * the 24 read, and every draft said a picture was missing.
 */
const AD_SHELF_READ = 24;
/** The most videos whose sound is read whole for one draft. */
const AD_SOUNDS_READ = 6;

/** A sound as much of it as the music rule reads: whether there is none at all, and whether what was heard holds music. */
type HeardSound = ReturnType<typeof fileSoundOf>;

const musicIn = (sound: HeardSound | null): boolean | null => {
  if (sound === null) return null;
  if (sound.none === true) return false;
  return sound.note ? sound.note.music.present : null;
};

/** A file as the picture rule reads it. `from` is what a made piece was drawn from; `music` a video's, as heard. */
function adPictureOfFile(file: FileDto, from: readonly FileYesFacts[], music: boolean | null): AdPicture {
  const video = file.kind === "video";
  return {
    id: file.id,
    // Files does not say which service a picture is about: every one is about none in particular.
    serviceId: null,
    kind: video ? "video" : "photo",
    width: file.width ?? 0,
    height: file.height ?? 1,
    seconds: file.seconds,
    rights: fileAdRightsOf(file, from, video ? music : false),
    beforeAfter: AD_BEFORE_AFTER.test([file.line ?? "", ...file.issues].join(" ")),
    made: file.source === "made",
  };
}

/** Whether a file can be shown at all: a video the video platform holds ready, with its copy still here. */
const playable = (file: FileDto): boolean =>
  file.kind !== "video" || (file.media_status === "ready" && file.copy === "here");

/** What a draft picks its picture from: each as the rule reads it, and the file itself for what a page draws. */
export interface AdPictures {
  pictures: AdPicture[];
  /**
   * Where none of `pictures` fits an ad: the newest of each shelf as Files keeps them, whatever is in them, read only so
   * a draft can say why (someone shown, nobody said who, music, a shape). Empty where one fits.
   */
  newest: AdPicture[];
  files: ReadonlyMap<string, FileDto>;
}

type AdReader = Pick<ReaderContext, "ctx" | "tenantId">;

/** For each made piece among these, the files it was drawn from, as the rule reads them. */
async function readPiecesDrawnFrom(rc: AdReader, files: readonly FileDto[]): Promise<Map<string, FileDto[]>> {
  const pieces = files.filter((file) => file.source === "made").map((file) => file.id);
  const drawn = await readDrawnFrom(rc.ctx.supabase, rc.tenantId, pieces);
  return new Map([...drawn].map(([id, rows]) => [id, rows.map(fileDtoOf)]));
}

/** The newest of each shelf as Files keeps them, each as the rule reads it, its sound not read: only to say why none fits. */
async function listNewestOnShelves(rc: AdReader): Promise<AdPicture[]> {
  const page = { limit: AD_SHELF_READ };
  const shelves = await Promise.all([
    listFilesOnShelf(rc.ctx.supabase, rc.tenantId, { status: "filed", made: true }, page),
    listFilesOnShelf(rc.ctx.supabase, rc.tenantId, { status: "filed", made: false }, page),
  ]);
  const files = shelves.flat().map(fileDtoOf).filter(playable);
  const from = await readPiecesDrawnFrom(rc, files);
  return files.map((file) => adPictureOfFile(file, from.get(file.id) ?? [], null));
}

/**
 * The pictures a draft may be offered, in the order Files offers them: what AI made first, then what the business
 * keeps, each newest first. A video's sound is read only where everything else about it is fine, and for a few.
 */
export async function listAdPictures(rc: AdReader): Promise<AdPictures> {
  const { supabase } = rc.ctx;
  const shelf = async (madeByAi: boolean): Promise<FileMemberRow[]> => {
    const [images, videos] = await Promise.all([
      listFilesForAds(supabase, rc.tenantId, { made: madeByAi, kind: "image" }, AD_SHELF_READ),
      listFilesForAds(supabase, rc.tenantId, { made: madeByAi, kind: "video" }, AD_SHELF_READ),
    ]);
    // One shelf newest first again, the two kinds among each other, as Files offers them.
    return [...images, ...videos].sort(
      (first, second) => second.created_at.localeCompare(first.created_at) || second.id.localeCompare(first.id),
    );
  };
  const [byAi, byBusiness] = await Promise.all([shelf(true), shelf(false)]);
  const files = [...byAi, ...byBusiness].map(fileDtoOf).filter(playable);
  const from = await readPiecesDrawnFrom(rc, files);
  const fromOf = (file: FileDto) => from.get(file.id) ?? [];
  const unheard = files
    .filter((file) => file.kind === "video" && adPictureIssue(adPictureOfFile(file, fromOf(file), false)) === null)
    .slice(0, AD_SOUNDS_READ);
  const sounds = new Map<string, HeardSound>(
    await Promise.all(
      unheard.map(async (file): Promise<[string, HeardSound]> => [
        file.id,
        fileSoundOf(await readFileSound(supabase, file.id)),
      ]),
    ),
  );
  const pictures = files.map((file) => adPictureOfFile(file, fromOf(file), musicIn(sounds.get(file.id) ?? null)));
  return {
    pictures,
    newest: pictures.some((picture) => adPictureIssue(picture) === null) ? [] : await listNewestOnShelves(rc),
    files: new Map(files.map((file) => [file.id, file])),
  };
}

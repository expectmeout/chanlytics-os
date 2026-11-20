import "server-only";
import { AD_BEFORE_AFTER, adPictureIssue, fileSoundOf, type AdPicture, type FileDto } from "@chanlytics/contracts";
import { listFilesForAds, listFilesOnShelf, readFileSound, type FileMemberRow } from "@chanlytics/db/files";
import { fileDtoOf } from "../readers/files";
import type { ReaderContext } from "../shared/reader";

/**
 * The pictures and videos a new ad may show (the Ads plan's 4.6, 6.8 and G15). The ONE place that answers "may this
 * run as an ad?" until Content does (its step L4, join 1 of 6.8): when Content's reader exists, this asks it and keeps
 * no rule of its own. Until then a draft is offered only what shows nobody and has no music, from what the business
 * keeps in Files and what AI made:
 *
 *  - Nobody shown: a member said so (`no_one`), or AI's look counted no one. A picture nobody has looked at is not
 *    known to show nobody, so it is not offered; nor is one a person agreed to for posts, since a yes for posts does
 *    not cover an ad.
 *  - No music: a video with no sound at all, or one whose sound was heard and holds none. A video not heard yet is
 *    not known to have none.
 *  - Before and after: where the look's own sentence says the picture sets one beside the other.
 *
 * Ads never crops: the shape is the file's own, and the rule that judges it is contracts adPictureIssue.
 *
 * It stands in Content's own folder, where its answer will: New ad's draft asks it (server/ads/draft-facts.ts).
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

/** Whether anyone is shown: false only where a member said no one, or the look counted none. */
const peopleShown = (file: FileDto): boolean | null => {
  if (file.who_in_it === "no_one") return false;
  if (file.who_in_it === "agreed") return true;
  return file.look_status === "done" && file.people !== null ? file.people.count > 0 : null;
};

const musicIn = (sound: HeardSound | null): boolean | null => {
  if (sound === null) return null;
  if (sound.none === true) return false;
  return sound.note ? sound.note.music.present : null;
};

/** A file as the picture rule reads it. `sound` is a video's, read whole; null where it was not read. */
function adPictureOfFile(file: FileDto, sound: HeardSound | null): AdPicture {
  const video = file.kind === "video";
  return {
    id: file.id,
    // Files does not say which service a picture is about: every one is about none in particular.
    serviceId: null,
    kind: video ? "video" : "photo",
    width: file.width ?? 0,
    height: file.height ?? 1,
    seconds: file.seconds,
    people: peopleShown(file),
    music: video ? musicIn(sound) : false,
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

/** The newest of each shelf as Files keeps them, each as the rule reads it, its sound not read: only to say why none fits. */
async function listNewestOnShelves(rc: Pick<ReaderContext, "ctx" | "tenantId">): Promise<AdPicture[]> {
  const page = { limit: AD_SHELF_READ };
  const shelves = await Promise.all([
    listFilesOnShelf(rc.ctx.supabase, rc.tenantId, { status: "filed", made: true }, page),
    listFilesOnShelf(rc.ctx.supabase, rc.tenantId, { status: "filed", made: false }, page),
  ]);
  return shelves
    .flat()
    .map(fileDtoOf)
    .filter(playable)
    .map((file) => adPictureOfFile(file, null));
}

/**
 * The pictures a draft may be offered, in the order Files offers them: what AI made first, then what the business
 * keeps, each newest first. A video's sound is read only where everything else about it is fine, and for a few.
 */
export async function listAdPictures(rc: Pick<ReaderContext, "ctx" | "tenantId">): Promise<AdPictures> {
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
  const unheard = files
    .filter(
      (file) => file.kind === "video" && adPictureIssue({ ...adPictureOfFile(file, null), music: false }) === null,
    )
    .slice(0, AD_SOUNDS_READ);
  const sounds = new Map<string, HeardSound>(
    await Promise.all(
      unheard.map(async (file): Promise<[string, HeardSound]> => [
        file.id,
        fileSoundOf(await readFileSound(supabase, file.id)),
      ]),
    ),
  );
  const pictures = files.map((file) => adPictureOfFile(file, sounds.get(file.id) ?? null));
  return {
    pictures,
    newest: pictures.some((picture) => adPictureIssue(picture) === null) ? [] : await listNewestOnShelves(rc),
    files: new Map(files.map((file) => [file.id, file])),
  };
}

import "server-only";
import { z } from "zod";
import {
  FILES_MAX,
  FILE_SHELVES,
  clockOf,
  cuesSaidOf,
  fenced,
  fileNameOf,
  fileSoundOf,
  noteSaidOf,
  secondsOf,
  shelfOf,
  videoFrameSizeOf,
  videoFramesSaidOf,
  videoFrameWhatOf,
  videoSheetAfterOf,
  videoSheetWhatOf,
  videoSpanWhatOf,
  type FileSound,
  type ZoomBox,
  type ZoomSize,
} from "@chanlytics/contracts";
import { fileIndexLineOf, fileShelfSaid, fileWhoSaid, type FileForAsk } from "@/server/files/line";
import { findFile, listVideosHeard, readFileSound, type FileRow } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import { drawVideoMoment, findPictureCopy, listFileCopiesOf, type FileCopy } from "../../../files/copies";
import { askEar } from "../../../files/listen";
import { findNewestPostLook } from "../../../posts/record";
import { getZoomInto } from "../../../files/zoom";
import { load } from "../../../shared/reader";
import { filesForAsk } from "../../../readers/files";
import { PICTURES, defineActions, readAction, type ToolContext, type ToolPicture } from "../context/tool-defs";

/**
 * The business's photos and videos, the way a person who knows them would use them (decision 0099, step 2 and stage B). Three
 * levels: the one line in the facts says what exists; `list` and `get` read what the look wrote, which is enough to choose;
 * `view` and `compare` open the pixels, by Anthropic's id for a copy only the edge makes, each with the size the model sees it at,
 * so it can name a box in those pixels; `zoom` cuts that box out and enlarges it, which is how a small sign or a face is read
 * (Ask's eyes). Names go in and ids stay out: `view` takes the names the owner and Ask both say, and an id is never shown to the
 * model or taken from a tool's input.
 *
 * A video is shown the way Claude Code looks at one: its sheet, a grid of frames in order each marked with its time, and after it
 * what other models heard of its sound, as data, since Claude hears nothing. `zoom` opens one moment whole (`at`), a box of a
 * moment (`at` and `box`), or a stretch as a sheet of its own (`from`, `to`); `listen` puts a question about a stretch to an ear.
 */

/** The most lines one page of a list answers: enough to choose from, and the next page or a narrower ask finds the rest. */
const LIST_MAX = 40;
/** The last page a list has: a workspace's files at their cap, a page at a time. */
const LIST_PAGES_MAX = Math.ceil(FILES_MAX / LIST_MAX);
/** The most pictures one read opens: each costs a few cents the first time, and a person compares no more than this at once. */
const VIEW_MAX = 4;
/** How much of what a video says `get` carries; `view` carries the whole, as its sheet's words. */
const GET_SAID_CHARS = 1500;
/** A question put to the ear, as Ask may word it. */
const QUESTION_MAX = 600;

/** What the model is told whenever an ear's words reach it: they are a report, not its own hearing. */
const AN_EARS_ANSWER = "An ear's answer, not yours: another model listened to the clip's sound and wrote this.";

const filesOfTurn = async (t: ToolContext): Promise<FileForAsk[]> =>
  (await load(t.rc, filesForAsk, undefined)).data.files;

/** How long the edge has for a copy, from what is left of the turn. */
const leftOf = (t: ToolContext): number | undefined => (t.endsAt === undefined ? undefined : t.endsAt - Date.now());

const isVideo = (f: Pick<FileForAsk, "kind">): boolean => f.kind === "video";
/** The moment a video's look chose to stand for the whole clip, as a read says it; nothing before its look. */
const standsAtOf = (f: Pick<FileForAsk, "stands_at">): { stands_at?: string } =>
  f.stands_at === null ? {} : { stands_at: clockOf(f.stands_at, true) };
const notReadyWords = (f: Pick<FileForAsk, "media_status">): string =>
  f.media_status === "failed"
    ? "could not be prepared: the video platform could not read it, and its owner can delete it"
    : "is still being prepared: its frames and its sound are not in yet; say so, and that you will look once it is";

/**
 * The named files, by the words either of them uses for one: what is typed is cleaned as a name is. A turn's scope names its
 * file by the row's id (cross-page.ts scopedRead), so a file renamed since is still the one on screen.
 */
export function filesNamed(files: readonly FileForAsk[], names: readonly string[]) {
  const byName = new Map(files.map((f) => [f.name, f]));
  const found: FileForAsk[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const file = byName.get(fileNameOf(name)) ?? files.find((f) => f.id === name);
    if (!file) missing.push(name);
    else if (!found.includes(file)) found.push(file);
  }
  return { found, missing };
}

/**
 * What is said in the videos among these files, by file: read only when a list is searched, so a clip is found by its words as a
 * photo is by its sign. A read that fails finds by the rest.
 */
async function saidIn(turn: ToolContext, files: readonly FileForAsk[]): Promise<ReadonlyMap<string, string>> {
  if (!files.some((f) => isVideo(f) && f.media_status === "ready")) return new Map();
  const heard = await listVideosHeard(turn.ctx.supabase, turn.tenantId).catch(
    logAndGoOn<Pick<FileRow, "id" | "sound">[]>("listVideosHeard", []),
  );
  return new Map(
    heard.map((video) => {
      const words = fileSoundOf(video.sound).words;
      return [video.id, words && !("none" in words) ? words.text : ""];
    }),
  );
}

/** The files a list's words find: every word in what a file is named, shows, has written on it or says. */
async function filesAbout(turn: ToolContext, files: readonly FileForAsk[], about: string | undefined) {
  const words = about?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  if (!words.length) return files;
  const said = await saidIn(turn, files);
  return files.filter((f) => {
    const hay = [f.name, f.line ?? "", f.sound_said ?? "", ...f.text_seen, said.get(f.id) ?? ""]
      .join(" ")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** A copy's size, where the edge said it, as the model is told it. */
const sizeOf = (c: { width: number | null; height: number | null }): ZoomSize | null =>
  c.width && c.height ? [c.width, c.height] : null;

/** What was heard of a video, read by id under the caller's RLS; nothing heard where it could not be read. */
const soundOf = async (t: ToolContext, f: FileForAsk): Promise<FileSound> =>
  fileSoundOf(await readFileSound(t.ctx.supabase, f.id).catch(() => null));

/** A video's sheet as the model is shown it: named a video of its length, and what was heard after it. */
async function sheetPicture(turn: ToolContext, file: FileForAsk, copy: FileCopy): Promise<ToolPicture> {
  const size = sizeOf(copy);
  return {
    name: file.name,
    id: file.id,
    fileId: copy.fileId,
    ...(size ? { size } : {}),
    what: videoSheetWhatOf(file.name, file.seconds ?? 0),
    after: videoSheetAfterOf({
      seconds: file.seconds ?? 0,
      width: file.width,
      height: file.height,
      sound: await soundOf(turn, file),
    }),
  };
}

/** A picture opened, and what is known of it beside it, or why it could not be. A video opens as its sheet, once it is ready. */
async function picturesOpened(turn: ToolContext, names: readonly string[]) {
  const { found, missing } = filesNamed(await filesOfTurn(turn), names);
  const unready = found.filter((f) => isVideo(f) && f.media_status !== "ready");
  const openable = found.filter((f) => !unready.includes(f));
  // What the model refused is not sent again, and is not the owner's to wait for: it is said.
  const copies = await listFileCopiesOf(
    { tenantId: turn.tenantId, userId: turn.ctx.userId },
    openable.map((f) => f.id),
    leftOf(turn),
  );
  const shown = openable.filter((f) => copies.has(f.id));
  // How their newest post looks, so the next keeps what they settled on: read only where a post may come of it.
  const lastPost = shown.some((f) => !isVideo(f)) ? await findNewestPostLook(turn.tenantId) : null;
  const pictures: ToolPicture[] = await Promise.all(
    shown.map(async (f) => {
      const copy = copies.get(f.id) as FileCopy;
      if (isVideo(f)) return sheetPicture(turn, f, copy);
      const size = sizeOf(copy);
      return { name: f.name, id: f.id, fileId: copy.fileId, ...(size ? { size } : {}) };
    }),
  );
  return {
    shown: shown.map((f) => {
      const size = sizeOf(copies.get(f.id) as FileCopy);
      return {
        name: f.name,
        ...(isVideo(f) ? { video: clockOf(f.seconds ?? 0), ...standsAtOf(f) } : {}),
        shelf: fileShelfSaid(f),
        who: fileWhoSaid(f),
        ...(size ? { size } : {}),
      };
    }),
    ...(lastPost ? { last_post: lastPost } : {}),
    ...(missing.length ? { no_such_file: missing, hint: "Names come from files with action list." } : {}),
    ...(unready.length ? { not_ready: unready.map((f) => `${f.name} ${notReadyWords(f)}`) } : {}),
    ...(openable.length > shown.length
      ? { could_not_open: openable.filter((f) => !copies.has(f.id)).map((f) => f.name) }
      : {}),
    [PICTURES]: pictures,
  };
}

/**
 * A box of one picture, cut and enlarged. The box is in the pixels the picture was shown at, which is the copy's size: the
 * edge says it, and the cut is made here from the photo itself, then held at Anthropic for the turn.
 */
async function pictureZoomed(turn: ToolContext, file: FileForAsk, box: ZoomBox) {
  const member = { tenantId: turn.tenantId, userId: turn.ctx.userId };
  const [copy, row] = await Promise.all([
    listFileCopiesOf(member, [file.id], leftOf(turn)).then((m) => m.get(file.id) ?? null),
    findFile(turn.ctx.supabase, file.id),
  ]);
  const of = copy ? sizeOf(copy) : null;
  if (!copy || !of || !row) return { error: `${file.name} could not be opened just now; say so` };
  const cut = await getZoomInto(row, box, of);
  if ("wont" in cut) return { error: `${file.name}: ${cut.wont}` };
  const heldCopy = await findPictureCopy(
    member,
    { bytes: cut.bytes, mime: "image/jpeg", name: `${file.name}-zoom.jpg` },
    leftOf(turn),
  );
  if (!heldCopy) return { error: `${file.name}: the box was cut but could not be shown to you just now; say so` };
  const picture: ToolPicture = {
    name: file.name,
    id: file.id,
    fileId: heldCopy.fileId,
    size: cut.size,
    zoom: { box: cut.box, of: cut.of },
  };
  return { zoomed: file.name, box: cut.box, of: cut.of, shown_as: cut.size, [PICTURES]: [picture] };
}

/** What a video's zoom asks for, read: a moment, a box of one, or a stretch. */
interface VideoZoomAsked {
  at: number | null;
  box: ZoomBox | null;
  from: number | null;
  to: number | null;
}

/** Why a video's zoom cannot be drawn as asked, in words for the model; null where it can. */
function videoZoomWont(file: FileForAsk, zoom: VideoZoomAsked): string | null {
  if (file.media_status !== "ready") return `${file.name} ${notReadyWords(file)}`;
  const span = zoom.from !== null || zoom.to !== null;
  if (span && zoom.at !== null) return "name a moment (at) or a stretch (from and to), not both";
  if (zoom.box && zoom.at === null)
    return "a box of a video is of one moment: open it with zoom at first, then name the box in that frame's pixels";
  if (!span && zoom.at === null) return "for a video name a moment (at, as M:SS) or a stretch (from and to)";
  const seconds = file.seconds ?? 0;
  const first = zoom.at ?? zoom.from;
  return first !== null && first > seconds + 0.05
    ? `${file.name} is ${clockOf(seconds)} long: name a moment inside it`
    : null;
}

/** A stretch of a video as a sheet of its own, held for the turn. */
async function videoSpanOpened(turn: ToolContext, file: FileForAsk, zoom: VideoZoomAsked) {
  const seconds = file.seconds ?? 0;
  const from = zoom.from ?? 0;
  const to = Math.min(zoom.to ?? seconds, seconds);
  const drawn = await drawVideoMoment(
    { tenantId: turn.tenantId, userId: turn.ctx.userId },
    { id: file.id, from, to },
    leftOf(turn),
  );
  if ("wont" in drawn) return { error: `${file.name}: ${drawn.wont}; say so` };
  const size = sizeOf(drawn);
  const shownFrom = drawn.from ?? from;
  const shownTo = drawn.to ?? to;
  const picture: ToolPicture = {
    name: file.name,
    id: file.id,
    fileId: drawn.fileId,
    ...(size ? { size } : {}),
    what: videoSpanWhatOf(file.name, shownFrom, shownTo),
    after: videoFramesSaidOf(drawn.frames ?? 1, drawn.step ?? 0),
  };
  return { opened: file.name, from: clockOf(shownFrom, true), to: clockOf(shownTo, true), [PICTURES]: [picture] };
}

/** A closer look at a video: one moment whole, a box of one, or a stretch as a sheet of its own. */
async function videoZoomed(turn: ToolContext, file: FileForAsk, zoom: VideoZoomAsked) {
  const wont = videoZoomWont(file, zoom);
  if (wont) return { error: wont };
  if (zoom.from !== null || zoom.to !== null) return videoSpanOpened(turn, file, zoom);
  const member = { tenantId: turn.tenantId, userId: turn.ctx.userId };
  const at = zoom.at ?? 0;
  const of: ZoomSize = videoFrameSizeOf(file.width, file.height);
  const drawn = await drawVideoMoment(
    member,
    zoom.box ? { id: file.id, at, box: zoom.box, of } : { id: file.id, at },
    leftOf(turn),
  );
  if ("wont" in drawn) return { error: `${file.name}: ${drawn.wont}; say so` };
  const size = sizeOf(drawn);
  const picture: ToolPicture = {
    name: file.name,
    id: file.id,
    fileId: drawn.fileId,
    ...(size ? { size } : {}),
    what: videoFrameWhatOf(file.name, at),
    ...(drawn.box && drawn.of ? { zoom: { box: drawn.box, of: drawn.of } } : {}),
  };
  return {
    opened: file.name,
    at: clockOf(at, true),
    ...(drawn.box ? { box: drawn.box, of: drawn.of } : {}),
    ...(size ? { shown_as: size } : {}),
    [PICTURES]: [picture],
  };
}

/** One file by its name, or the words that say there is none. */
async function oneNamed(t: ToolContext, name: string): Promise<FileForAsk | { error: string }> {
  const { found, missing } = filesNamed(await filesOfTurn(t), [name]);
  return found.at(0) ?? { error: `no file named ${missing.at(0)}; names come from files with action list` };
}

/** What `get` says a video is: its length, where it stands, and what was heard of it, the ears' words fenced as data. */
async function videoGot(turn: ToolContext, file: FileForAsk) {
  const base = {
    video: clockOf(file.seconds ?? 0),
    ...standsAtOf(file),
    ...(file.media_status === "ready" ? {} : { state: notReadyWords(file) }),
  };
  if (file.media_status !== "ready") return base;
  const sound = await soundOf(turn, file);
  if (sound.none) return { ...base, sound: "it has no sound" };
  const words = sound.words;
  const soundLine = !words
    ? { what_is_said: "not heard yet" }
    : "none" in words
      ? { what_is_said: "no one speaks in it" }
      : (() => {
          const all = cuesSaidOf(words);
          return {
            what_is_said: fenced("transcript", all.slice(0, GET_SAID_CHARS)),
            ...(all.length > GET_SAID_CHARS
              ? { more_said: `${all.length - GET_SAID_CHARS} characters more: view opens it whole` }
              : {}),
          };
        })();
  return {
    ...base,
    sound: file.sound_said ?? "not heard yet",
    ...soundLine,
    how_it_sounds: sound.note ? fenced("note", noteSaidOf(sound.note)) : "not heard yet",
    heard_by: {
      ...(sound.heard_by?.words ? { words: sound.heard_by.words.model } : {}),
      ...(sound.heard_by?.note ? { note: sound.heard_by.note.model } : {}),
    },
    you: "You did not hear this clip yourself: files action listen asks an ear about a stretch.",
  };
}

/** One shape for both actions that open pictures, as a field a tool's actions share must have (registry.ts flatten). */
const FILE_NAMES_ASKED = z
  .array(z.string().min(1).max(120))
  .min(1)
  .max(VIEW_MAX)
  .describe(`Up to ${VIEW_MAX} names, from list.`);

const BOX_ASKED = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .describe(
    "[x1, y1, x2, y2]: the top-left and bottom-right corners, in the pixels of the size the picture was shown at.",
  );

/** A moment in a video, as the model names it: seconds, or M:SS (1:05, 0:12.5). One shape, and one say, for both actions. */
const MOMENT_ASKED = z.union([z.number().min(0), z.string().max(12)]);
const FROM_ASKED = MOMENT_ASKED.optional().describe("A video's stretch, from M:SS; left out, its start.");
const TO_ASKED = MOMENT_ASKED.optional().describe("To M:SS; left out, its end.");
const momentOf = (v: number | string | undefined): number | null | "bad" => {
  if (v === undefined) return null;
  const s = secondsOf(v);
  return s === null ? "bad" : s;
};

export const filesTool = defineActions({
  name: "files",
  description:
    "The business's own photos, videos and images: its files, library, pictures, clips, logo. Each has one name, the same one the owner sees.",
  tail: "The facts' Files line says how many there are. Use what is kept; what waits in the Inbox or was set aside is the owner's to decide, so offer it only if they ask. A picture opened says its size beside its name, and a box you name is in those pixels; a video opens as a sheet of its frames with their times, what was heard after. To make a post from a photo, find propose_post with tool search; last_post, beside a picture opened, is how their newest post looks: keep its voice, layout and book unless they ask for something else.",
  actions: {
    list: readAction({
      input: z.object({
        shelf: z.enum(FILE_SHELVES).optional().describe("One shelf. Left out, or all: everything kept."),
        about: z.string().max(80).optional().describe("Words to find in what a file shows, has written on it or says."),
        page: z
          .number()
          .int()
          .min(1)
          .max(LIST_PAGES_MAX)
          .optional()
          .describe("Left out, the newest. The next_page a list answered, for the ones after."),
      }),
      examples: [{ shelf: "work" }],
      label: "Looking through your files",
      words: `Action list answers one line a file, newest first, ${LIST_MAX} a page, to choose by: its name, shelf, quality, who is in it, and what the look saw; a video's, its length and sound. Where it says more, page reads on.`,
      async run(turn, input) {
        const all = await filesOfTurn(turn);
        const shelf = input.shelf ?? "all";
        const onShelf =
          shelf === "all" ? all.filter((f) => f.status === "filed") : all.filter((f) => shelfOf(f) === shelf);
        const matched = await filesAbout(turn, onShelf, input.about);
        const page = input.page ?? 1;
        const from = (page - 1) * LIST_MAX;
        if (page > 1 && from >= matched.length)
          return {
            error: `there is no page ${page}: this list ends on page ${Math.max(1, Math.ceil(matched.length / LIST_MAX))}`,
          };
        const more = matched.length - from - LIST_MAX;
        return {
          files: matched.slice(from, from + LIST_MAX).map(fileIndexLineOf),
          ...(more > 0 ? { more, next_page: page + 1 } : {}),
        };
      },
    }),
    get: readAction({
      input: z.object({ name: z.string().min(1).max(120) }),
      examples: [{ name: "storefront-dusk-street" }],
      label: "Reading what a file shows",
      words:
        "Action get answers what the look wrote of one file: a note, not the picture, and its size in pixels; a video's, what was heard, and stands_at, the moment its look chose to stand for the whole clip.",
      async run(turn, input) {
        const file = await oneNamed(turn, input.name);
        if ("error" in file) return file;
        return {
          name: file.name,
          shelf: fileShelfSaid(file),
          status: file.status,
          source: file.source,
          who: fileWhoSaid(file),
          saw: file.line,
          words_in_it: file.text_seen,
          sharp: file.quality.sharp,
          light: file.quality.light,
          colors: file.colors,
          ...(isVideo(file) ? {} : { subject: file.subject }),
          issues: file.issues,
          looks_like_stock: file.looks_like_stock,
          look: file.look_status,
          ...(file.width && file.height ? { size: [file.width, file.height] } : {}),
          ...(isVideo(file) ? await videoGot(turn, file) : {}),
          added: file.created_at,
        };
      },
    }),
    view: readAction({
      input: z.object({ names: FILE_NAMES_ASKED }),
      examples: [{ names: ["storefront-dusk-street", "wash-bar-empty"] }],
      label: "Looking at your files",
      words: `Action view opens up to ${VIEW_MAX} pictures themselves, so you see them as the owner does, a video as its sheet. Do it before proposing or judging one, and whenever the owner asks about one.`,
      run: (t, input) => picturesOpened(t, input.names),
    }),
    compare: readAction({
      input: z.object({ names: FILE_NAMES_ASKED }),
      examples: [{ names: ["storefront-dusk-street", "storefront-day"] }],
      label: "Comparing two files",
      words: "Action compare opens two pictures side by side, for which is better for something: name exactly two.",
      run: async (t, input) =>
        input.names.length === 2 ? picturesOpened(t, input.names) : { error: "name exactly two files to compare" },
    }),
    zoom: readAction({
      input: z.object({
        name: z.string().min(1).max(120),
        box: BOX_ASKED.optional(),
        at: MOMENT_ASKED.optional().describe("A video's moment, M:SS."),
        from: FROM_ASKED,
        to: TO_ASKED,
      }),
      examples: [
        { name: "storefront-dusk-street", box: [420, 90, 980, 310] },
        { name: "shop-tour", at: "0:12" },
      ],
      label: "Looking closer",
      words:
        "Action zoom cuts one box out of a picture you have open and enlarges it, so small words, a sign, a price or a face read: name the box by its corners in the pixels of the size the picture was shown at. A video's: at, a moment whole; at with box; from and to, a stretch. Use it whenever you are not sure what you see, before saying what a picture shows or says.",
      async run(turn, input) {
        const file = await oneNamed(turn, input.name);
        if ("error" in file) return file;
        const at = momentOf(input.at);
        const from = momentOf(input.from);
        const to = momentOf(input.to);
        if (at === "bad" || from === "bad" || to === "bad") return { error: "a moment is M:SS, as 1:05, or seconds" };
        if (!isVideo(file)) {
          if (at !== null || from !== null || to !== null)
            return { error: `${file.name} is a photo: name a box alone` };
          if (!input.box) return { error: "name the box to cut, in the pixels the picture was shown at" };
          return pictureZoomed(turn, file, input.box);
        }
        return videoZoomed(turn, file, { at, box: input.box ?? null, from, to });
      },
    }),
    listen: readAction({
      input: z.object({
        name: z.string().min(1).max(120),
        question: z.string().min(1).max(QUESTION_MAX).describe("What to ask of how it sounds."),
        from: FROM_ASKED,
        to: TO_ASKED,
      }),
      examples: [{ name: "shop-tour", question: "Does the voice sound sure?", from: "0:18" }],
      label: "Listening to your video",
      words: "Action listen asks an ear how a stretch of a video sounds; its answer is a report, not your hearing.",
      async run(turn, input) {
        const file = await oneNamed(turn, input.name);
        if ("error" in file) return file;
        if (!isVideo(file)) return { error: `${file.name} is a photo: it has no sound` };
        if (file.media_status !== "ready") return { error: `${file.name} ${notReadyWords(file)}` };
        const from = momentOf(input.from);
        const to = momentOf(input.to);
        if (from === "bad" || to === "bad") return { error: "a moment is M:SS, as 1:05, or seconds" };
        const heard = await askEar(
          { tenantId: turn.tenantId, userId: turn.ctx.userId },
          { id: file.id, question: input.question, from, to },
          leftOf(turn),
        );
        if ("wont" in heard) return { error: `${file.name}: ${heard.wont}; say so` };
        return {
          listened: file.name,
          ...(from !== null || to !== null
            ? { from: clockOf(from ?? 0, true), to: clockOf(to ?? file.seconds ?? 0, true) }
            : {}),
          heard_by: heard.model,
          answer: `${AN_EARS_ANSWER}\n${fenced("note", heard.answer)}`,
        };
      },
    }),
  },
});

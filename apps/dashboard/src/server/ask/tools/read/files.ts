import "server-only";
import { z } from "zod";
import { FILE_SHELVES, fileNameOf, shelfOf } from "@chanlytics/contracts";
import { fileIndexLineOf, fileShelfSaid, fileWhoSaid, type FileForAsk } from "@/server/files/line";
import { findFile } from "@chanlytics/db/files";
import { listFileCopiesOf, findPictureCopy, type FileCopy } from "../../../files/copies";
import { findNewestPostLook } from "../../../posts/record";
import { getZoomInto, type Box, type Size } from "../../../files/zoom";
import { load } from "../../../shared/reader";
import { filesForAsk } from "../../../readers/files";
import { PICTURES, defineActions, readAction, type ToolContext, type ToolPicture } from "../context/tool-defs";

/**
 * The business's photos, the way a person who knows them would use them (decision 0099, step 2). Three levels: the one line in
 * the facts says what exists; `list` and `get` read what the look wrote, which is enough to choose; `view` and `compare` open the
 * pixels, by Anthropic's id for a copy only the edge makes, each with the size the model sees it at, so it can name a box in
 * those pixels; `zoom` cuts that box out and enlarges it, which is how a small sign or a face is read (Ask's eyes). Names go in
 * and ids stay out: `view` takes the names the owner and Ask both say, and an id is never shown to the model or taken from a
 * tool's input.
 */

/** The most lines a list answers: enough to choose from, and a narrower ask finds the rest. */
const LIST_MAX = 40;
/** The most pictures one read opens: each costs a few cents the first time, and a person compares no more than this at once. */
const VIEW_MAX = 4;

const filesOfTurn = async (t: ToolContext): Promise<FileForAsk[]> =>
  (await load(t.rc, filesForAsk, undefined)).data.files;

/** How long the edge has for a copy, from what is left of the turn. */
const leftOf = (t: ToolContext): number | undefined => (t.endsAt === undefined ? undefined : t.endsAt - Date.now());

/**
 * The named files, by the words either of them uses for one: what is typed is cleaned as a name is. A turn's scope names its
 * file by the row's id (cross-page.ts scopedRead), so a file renamed since is still the one on screen.
 */
export function filesNamed(files: readonly FileForAsk[], names: readonly string[]) {
  const byName = new Map(files.map((f) => [f.name, f]));
  const found: FileForAsk[] = [];
  const missing: string[] = [];
  for (const request of names) {
    const file = byName.get(fileNameOf(request)) ?? files.find((f) => f.id === request);
    if (!file) missing.push(request);
    else if (!found.includes(file)) found.push(file);
  }
  return { found, missing };
}

/** A copy's size, where the edge said it, as the model is told it. */
const sizeOf = (c: FileCopy): Size | null => (c.width && c.height ? [c.width, c.height] : null);

/** A picture opened, and what is known of it beside it, or why it could not be. */
async function picturesOpened(toolContext: ToolContext, names: readonly string[]) {
  const { found, missing } = filesNamed(await filesOfTurn(toolContext), names);
  // What the model refused is not sent again, and is not the owner's to wait for: it is said.
  const copies = await listFileCopiesOf(
    { tenantId: toolContext.tenantId, userId: toolContext.ctx.userId },
    found.map((f) => f.id),
    leftOf(toolContext),
  );
  const shown = found.filter((f) => copies.has(f.id));
  // How their newest post looks, so the next keeps what they settled on: read only where a post may come of it.
  const lastPost = shown.length ? await findNewestPostLook(toolContext.tenantId) : null;
  const pictures: ToolPicture[] = shown.map((f) => {
    const copy = copies.get(f.id) as FileCopy;
    const size = sizeOf(copy);
    return { name: f.name, id: f.id, fileId: copy.fileId, ...(size ? { size } : {}) };
  });
  return {
    shown: shown.map((f) => {
      const size = sizeOf(copies.get(f.id) as FileCopy);
      return { name: f.name, shelf: fileShelfSaid(f), who: fileWhoSaid(f), ...(size ? { size } : {}) };
    }),
    ...(lastPost ? { last_post: lastPost } : {}),
    ...(missing.length ? { no_such_file: missing, hint: "Names come from files with action list." } : {}),
    ...(found.length > shown.length
      ? { could_not_open: found.filter((f) => !copies.has(f.id)).map((f) => f.name) }
      : {}),
    [PICTURES]: pictures,
  };
}

/**
 * A box of one picture, cut and enlarged. The box is in the pixels the picture was shown at, which is the copy's size: the
 * edge says it, and the cut is made here from the photo itself, then held at Anthropic for the turn.
 */
async function pictureZoomed(toolContext: ToolContext, name: string, box: Box) {
  const { found, missing } = filesNamed(await filesOfTurn(toolContext), [name]);
  const item = found.at(0);
  if (!item) return { error: `no file named ${missing.at(0)}; names come from files with action list` };
  const fields = { tenantId: toolContext.tenantId, userId: toolContext.ctx.userId };
  const [copy, row] = await Promise.all([
    listFileCopiesOf(fields, [item.id], leftOf(toolContext)).then((m) => m.get(item.id) ?? null),
    findFile(toolContext.ctx.supabase, item.id),
  ]);
  const of = copy ? sizeOf(copy) : null;
  if (!copy || !of || !row) return { error: `${item.name} could not be opened just now; say so` };
  const cut = await getZoomInto(row, box, of);
  if ("wont" in cut) return { error: `${item.name}: ${cut.wont}` };
  const held = await findPictureCopy(
    fields,
    { bytes: cut.bytes, mime: "image/jpeg", name: `${item.name}-zoom.jpg` },
    leftOf(toolContext),
  );
  if (!held) return { error: `${item.name}: the box was cut but could not be shown to you just now; say so` };
  const picture: ToolPicture = {
    name: item.name,
    id: item.id,
    fileId: held.fileId,
    size: cut.size,
    zoom: { box: cut.box, of: cut.of },
  };
  return { zoomed: item.name, box: cut.box, of: cut.of, shown_as: cut.size, [PICTURES]: [picture] };
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

export const filesTool = defineActions({
  name: "files",
  description:
    "The business's own photos and images: its files, library, pictures, logo. Each has one name, the same one the owner sees.",
  tail: "The facts' Files line says how many there are. Use what is kept; what waits in the Inbox or was set aside is the owner's to decide, so offer it only if they ask. A picture opened says its size beside its name: a box you name is in those pixels. To make a post from one, find propose_post with tool search; last_post, beside a picture opened, is how their newest post looks, what they settled on, so keep its voice, layout and book unless they ask for something else.",
  actions: {
    list: readAction({
      input: z.object({
        shelf: z.enum(FILE_SHELVES).optional().describe("One shelf. Left out, or all: everything kept."),
        about: z.string().max(80).optional().describe("Words to find in what a file shows or has written on it."),
      }),
      examples: [{ shelf: "work" }, { about: "storefront" }],
      label: "Looking through your files",
      words:
        "Action list answers one line a file, newest first, to choose by: its name, shelf, quality, who is in it, and what the look saw.",
      async run(item, input) {
        const all = await filesOfTurn(item);
        const shelf = input.shelf ?? "all";
        const onShelf =
          shelf === "all" ? all.filter((f) => f.status === "filed") : all.filter((f) => shelfOf(f) === shelf);
        const words = input.about?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
        const matched = words.length
          ? onShelf.filter((f) => {
              const hay = [f.name, f.line ?? "", ...f.text_seen].join(" ").toLowerCase();
              return words.every((w) => hay.includes(w));
            })
          : onShelf;
        return {
          files: matched.slice(0, LIST_MAX).map(fileIndexLineOf),
          ...(matched.length > LIST_MAX ? { more: matched.length - LIST_MAX } : {}),
        };
      },
    }),
    get: readAction({
      input: z.object({ name: z.string().min(1).max(120) }),
      examples: [{ name: "storefront-dusk-street" }],
      label: "Reading what a photo shows",
      words:
        "Action get answers what the look wrote of one file: a note, not the picture, and the photo's size in pixels.",
      async run(item, input) {
        const { found, missing } = filesNamed(await filesOfTurn(item), [input.name]);
        const result = found.at(0);
        if (!result) return { error: `no file named ${missing.at(0)}; names come from files with action list` };
        return {
          name: result.name,
          shelf: fileShelfSaid(result),
          status: result.status,
          source: result.source,
          who: fileWhoSaid(result),
          saw: result.line,
          words_in_it: result.text_seen,
          sharp: result.quality.sharp,
          light: result.quality.light,
          colors: result.colors,
          subject: result.subject,
          issues: result.issues,
          looks_like_stock: result.looks_like_stock,
          look: result.look_status,
          ...(result.width && result.height ? { size: [result.width, result.height] } : {}),
          added: result.created_at,
        };
      },
    }),
    view: readAction({
      input: z.object({ names: FILE_NAMES_ASKED }),
      examples: [{ names: ["storefront-dusk-street", "wash-bar-empty"] }],
      label: "Looking at your photos",
      words: `Action view opens up to ${VIEW_MAX} pictures themselves, so you see them as the owner does. Do it before you propose or judge a picture, and whenever the owner asks about one.`,
      run: (t, input) => picturesOpened(t, input.names),
    }),
    compare: readAction({
      input: z.object({ names: FILE_NAMES_ASKED }),
      examples: [{ names: ["storefront-dusk-street", "storefront-day"] }],
      label: "Comparing two photos",
      words: "Action compare opens two pictures side by side, for which is better for something: name exactly two.",
      run: async (t, input) =>
        input.names.length === 2 ? picturesOpened(t, input.names) : { error: "name exactly two files to compare" },
    }),
    zoom: readAction({
      input: z.object({ name: z.string().min(1).max(120), box: BOX_ASKED }),
      examples: [{ name: "storefront-dusk-street", box: [420, 90, 980, 310] }],
      label: "Looking closer",
      words:
        "Action zoom cuts one box out of a picture you have open and enlarges it, so small words, a sign, a price or a face read: name the box by its corners in the pixels of the size the picture was shown at. Use it whenever you are not sure what you see, before you say what a picture shows or what is written in it.",
      run: (t, input) => pictureZoomed(t, input.name, input.box),
    }),
  },
});

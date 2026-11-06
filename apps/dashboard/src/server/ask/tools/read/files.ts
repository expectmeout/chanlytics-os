import "server-only";
import { z } from "zod";
import {
  FILE_SHELVES,
  fileIndexLineOf,
  fileNameOf,
  fileShelfSaid,
  fileWhoSaid,
  shelfOf,
  type FileForAsk,
} from "@chanlytics/contracts";
import { fileCopiesOf } from "../../../files/copies";
import { load } from "../../../readers";
import { filesForAsk } from "../../../readers/files";
import { PICTURES, defineActions, readAction, type ToolContext } from "../context";

/**
 * The business's photos, the way a person who knows them would use them (decision 0099, step 2). Three levels: the one line in
 * the facts says what exists; `list` and `get` read what the look wrote, which is enough to choose; `view` and `compare` open the
 * pixels, by Anthropic's id for a copy only the edge makes. Names go in and ids stay out: `view` takes the names the owner and
 * Ask both say, and an id is never shown to the model or taken from a tool's input.
 */

/** The most lines a list answers: enough to choose from, and a narrower ask finds the rest. */
const LIST_MAX = 40;
/** The most pictures one read opens: each costs a cent or so the first time, and a person compares no more than this at once. */
const VIEW_MAX = 4;

const filesOfTurn = async (t: ToolContext): Promise<FileForAsk[]> =>
  (await load(t.rc, filesForAsk, undefined)).data.files;

/**
 * The named files, by the words either of them uses for one: what is typed is cleaned as a name is. A turn's scope names its
 * file by the row's id (cross-page.ts scopedRead), so a file renamed since is still the one on screen.
 */
export function filesNamed(files: readonly FileForAsk[], names: readonly string[]) {
  const byName = new Map(files.map((f) => [f.name, f]));
  const found: FileForAsk[] = [];
  const missing: string[] = [];
  for (const asked of names) {
    const file = byName.get(fileNameOf(asked)) ?? files.find((f) => f.id === asked);
    if (!file) missing.push(asked);
    else if (!found.includes(file)) found.push(file);
  }
  return { found, missing };
}

/** A picture opened, and what is known of it beside it, or why it could not be. */
async function picturesOpened(t: ToolContext, names: readonly string[]) {
  const { found, missing } = filesNamed(await filesOfTurn(t), names);
  // What the model refused is not sent again, and is not the owner's to wait for: it is said.
  const copies = await fileCopiesOf(
    { tenantId: t.tenantId, userId: t.ctx.userId },
    found.map((f) => f.id),
    t.endsAt === undefined ? undefined : t.endsAt - Date.now(),
  );
  const shown = found.filter((f) => copies.has(f.id));
  return {
    shown: shown.map((f) => ({ name: f.name, shelf: fileShelfSaid(f), who: fileWhoSaid(f) })),
    ...(missing.length ? { no_such_file: missing, hint: "Names come from files with action list." } : {}),
    ...(found.length > shown.length
      ? { could_not_open: found.filter((f) => !copies.has(f.id)).map((f) => f.name) }
      : {}),
    [PICTURES]: shown.map((f) => ({ name: f.name, fileId: copies.get(f.id) as string })),
  };
}

/** One shape for both actions that open pictures, as a field a tool's actions share must have (registry.ts flatten). */
const FILE_NAMES_ASKED = z
  .array(z.string().min(1).max(120))
  .min(1)
  .max(VIEW_MAX)
  .describe(`Up to ${VIEW_MAX} names, from list.`);

export const filesTool = defineActions({
  name: "files",
  description:
    "The business's own photos and images: its files, library, pictures, logo. Each has one name, the same one the owner sees.",
  tail: "The facts' Files line says how many there are. Use what is kept; what waits in the Inbox or was set aside is the owner's to decide, so offer it only if they ask. To make a post from one, find propose_post with tool search.",
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
      async run(t, input) {
        const all = await filesOfTurn(t);
        const asked = input.shelf ?? "all";
        const onShelf =
          asked === "all" ? all.filter((f) => f.status === "filed") : all.filter((f) => shelfOf(f) === asked);
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
      words: "Action get answers what the look wrote of one file: a note, not the picture.",
      async run(t, input) {
        const { found, missing } = filesNamed(await filesOfTurn(t), [input.name]);
        const f = found.at(0);
        if (!f) return { error: `no file named ${missing.at(0)}; names come from files with action list` };
        return {
          name: f.name,
          shelf: fileShelfSaid(f),
          status: f.status,
          source: f.source,
          who: fileWhoSaid(f),
          saw: f.line,
          words_in_it: f.text_seen,
          sharp: f.quality.sharp,
          light: f.quality.light,
          colors: f.colors,
          subject: f.subject,
          issues: f.issues,
          looks_like_stock: f.looks_like_stock,
          look: f.look_status,
          added: f.created_at,
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
  },
});

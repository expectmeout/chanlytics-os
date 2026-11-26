import "server-only";
import { z } from "zod";
import { BRING_IN_WORDS, FOOTAGE_NUMBERS, FOOTAGE_SETUP, bringInOf, videoPreviewOf } from "@chanlytics/contracts";
import { listSourceItemsPassed } from "@chanlytics/db/files";
import { nameSourceFolder } from "../../../../files/sources";
import { footage } from "../../../../readers/content/footage";
import { load } from "../../../../shared/reader";
import * as readers from "../../../../readers/facts";
import { defineAct, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { approvalWords, propose, refuse } from "../../context/context";

/**
 * Why a Google Drive folder is not offered, or not this one, for the model to say in its own words: never a card that
 * could not be pressed. Said to the model only, so they are here and not in what a page carries.
 */
const DRIVE_REFUSED = {
  notHere:
    "AI can't watch a Google Drive folder in this workspace yet. The owner can add those photos and videos from their phone.",
  notYours: `${FOOTAGE_SETUP.connect.notAllowed} ${FOOTAGE_SETUP.connect.notAllowedMore}`,
  shut: (email: string | null) =>
    `${email ?? "The connected Google account"} can't open that folder. Share it with that account in Google Drive, or connect the Google account that owns it. Then paste the link again.`,
  watched: (folder: string) => `“${folder}” is already being watched. Its new photos and videos come in by themselves.`,
  noFolder:
    "No Google Drive folder is watched yet, so there are no older files to bring in. Ask which folder they keep them in.",
  allIn: (folder: string) =>
    `Everything “${folder}” holds is already in the Library or on its way: nothing older waits in Drive.`,
} as const;

/**
 * The watched folder's older files (the footage screens' call 7: "They stay in Drive until you ask AI for them"): what
 * its first look left in Drive, past the newest of the last thirty days, counted from the folder's own list, and one card
 * whose press asks for all of them. They come in at the day's pace like any other.
 */
async function olderOutcome(toolContext: ToolContext): Promise<ProposalOutcome> {
  const { rc } = toolContext;
  const stands = (await load(rc, footage, undefined)).data;
  if (!stands.can_change) return refuse(DRIVE_REFUSED.notYours);
  const folder = stands.folder && stands.folder.state !== "stopped" ? stands.folder : null;
  if (!folder) return refuse(DRIVE_REFUSED.noFolder);
  const passed = await listSourceItemsPassed(rc.ctx.supabase, { tenantId: rc.tenantId, sourceId: folder.id });
  const older = passed.filter((row) => row.state === "listed").reduce((sum, row) => sum + row.videos + row.photos, 0);
  if (older === 0) return refuse(DRIVE_REFUSED.allIn(folder.name));
  return propose({
    kind: "bring_in",
    title: BRING_IN_WORDS.drive.olderTitle(older, folder.name),
    summary: BRING_IN_WORDS.drive.olderSummary(FOOTAGE_NUMBERS.takesADay),
    payload: { place: "drive_older", folder_name: folder.name, count: older },
  });
}

/**
 * A Google Drive folder, watched (the footage sources plan, P5): the card is the folder's own steps, whichever are left
 * (connect, choose, watch). A pasted folder is named by the connected account first, so the card says which folder it
 * is, and one that account cannot open is said in a sentence with the way through. Where no Drive is connected yet the
 * card starts at Connect and carries the folder along.
 */
async function driveOutcome(toolContext: ToolContext, folderId: string | null, link: string): Promise<ProposalOutcome> {
  const { rc } = toolContext;
  const stands = (await load(rc, footage, undefined)).data;
  if (!stands.offered && !stands.account) return refuse(DRIVE_REFUSED.notHere);
  if (!stands.can_change) return refuse(DRIVE_REFUSED.notYours);
  const named =
    folderId && stands.account?.health === "ok" ? await nameSourceFolder(rc.ctx, rc.tenantId, folderId) : null;
  if (named === "shut") return refuse(DRIVE_REFUSED.shut(stands.account?.email ?? null));
  if (named && stands.folder?.provider_id === named.id) return refuse(DRIVE_REFUSED.watched(named.name));
  return propose({
    kind: "bring_in",
    title: BRING_IN_WORDS.drive.title(named?.name ?? null),
    summary: BRING_IN_WORDS.drive.summary,
    payload: {
      place: "drive",
      link: link.trim(),
      folder_id: named?.id ?? folderId,
      folder_name: named?.name ?? null,
    },
  });
}

/**
 * A business's photos and videos brought in from a link the owner gave (Content's empty state, 14 Nov 2026: the card's one
 * line to Ask, never a button a place): its website, read again for what it shows and plays, its Instagram account, its
 * newest posts and reels, or a Google Drive folder, watched from then on. The link is read in code (contracts
 * content/bring-in.ts); one nothing here reads is refused back to the model in words it says. The card's press brings them
 * in; what a website or an Instagram brings waits in the Library for a Keep, and what a folder brings is the business's own.
 */
async function bringInOutcome(
  toolContext: ToolContext,
  input: { link: string; older?: boolean | undefined },
): Promise<ProposalOutcome> {
  if (input.older === true) return olderOutcome(toolContext);
  const target = bringInOf(input.link);
  if (target.place === "none") return refuse(BRING_IN_WORDS.refused[target.why]);
  if (target.place === "drive") return driveOutcome(toolContext, target.folderId, input.link);
  const config = await load(toolContext.rc, readers.config, undefined).then((r) => r.data?.config ?? null);
  return propose({
    kind: "bring_in",
    title: BRING_IN_WORDS.title(target),
    summary: BRING_IN_WORDS.summary(target, videoPreviewOf(config)),
    payload: { link: input.link.trim() },
  });
}

export const bringInAct = defineAct({
  name: "propose_bring_in",
  description: `Bring in the business's own photos and videos from a link they give you: their website (read again for the photos it shows and the videos it plays), their Instagram account (its newest posts and reels; an "@name" is one), or a Google Drive folder (its link, or the words "google drive" when they say their photos and videos are kept in Drive and gave no link). Propose it at once when they paste or name one. A website's or an Instagram's wait in the Library until they Keep them; a Drive folder is watched from then on, and what lands in it goes straight into the Library. For a watched folder's older files, set \`older\`. A YouTube or Vimeo link, a Google Photos link, a link to one file, one post's link or another social page is refused in words to say back. Only their own: never a competitor's or a page they did not say is theirs. ${approvalWords("bring_in")}.`,
  kind: "bring_in",
  input: z.object({
    link: z
      .string()
      .describe(
        "The link as they gave it: a website's address, an Instagram account's link or @name, a Google Drive folder's link, or \"google drive\" where they named Drive with no link.",
      ),
    older: z
      .boolean()
      .optional()
      .describe(
        'True when they ask for the watched Google Drive folder\'s older photos and videos, the ones it left in Drive; the link is then "google drive".',
      ),
  }),
  label: "Bringing it in",
  build: bringInOutcome,
});

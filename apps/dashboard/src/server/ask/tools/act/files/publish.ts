import "server-only";
import { z } from "zod";
import {
  DAY_MS,
  FILE_GOOGLE_WORDS_MAX,
  INSTAGRAM_POST_KINDS,
  POST_AHEAD_DAYS_MAX,
  POST_PLACE_SAID,
  POST_PLACES,
  POST_SOON_MS,
  clockWhen,
  dateFormat,
  fileSaidOf,
  postCaptionProblem,
  postPlaceTakenOf,
  publishCardWords,
  wallClockAt,
  type PostDto,
  type PostPlace,
  type PostPublish,
} from "@chanlytics/contracts";
import { postClaimsProblem } from "@/server/files/post-check";
import { load } from "../../../../shared/reader";
import * as readers from "../../../../readers/facts";
import { filesNamedForAsk } from "../../../../readers/files";
import { findConnection } from "../../../../connections/google";
import { readPostCaption } from "../../../../posts/caption";
import { readInstagramPostable } from "../../../../posts/instagram";
import { readFilePosts } from "../../../../posts/record";
import { defineAct, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { approvalWords, propose, refuse } from "../../context/context";
import { filesNamed } from "../../read/files";
import { ownersWords } from "./post";

/**
 * A made post put up at its places, now or at a time the owner said in words (Ruben, 12 Nov 2026), as the page's own Schedule
 * sets one by hand (Post it, #2281). The act never acts: it checks the post, the places and the time, and makes the card
 * (contracts content/publish.ts), whose press goes through each place's own door. The caption is the post's own, as Details
 * says it, unless the owner asks for other words; Ask's are held to what the owner said, as a post's words are, and kept on
 * the post as it is pressed, so the post says what went.
 */

const publishInput = z.object({
  file: z.string().min(1).max(120).optional().describe("Its name as files says it; left out, the question's post."),
  places: z.array(z.enum(POST_PLACES)).min(1),
  as: z.enum(INSTAGRAM_POST_KINDS).optional().describe("On Instagram: picture (the feed) or story."),
  when: z
    .string()
    .max(20)
    .optional()
    .describe("YYYY-MM-DD HH:MM, the business's clock, only for a time they named. Left out, now."),
  caption: z.string().max(2200).optional().describe("Only for other words they asked for. Left out, its own."),
});

type PublishInput = z.infer<typeof publishInput>;

/** The time asked, as the doors take it, and as the card says it; or why it cannot be. Null `at` is now. */
function whenOf(said: string | undefined, zone: string): { at: number | null } | { refused: string } {
  if (!said) return { at: null };
  const parts = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})$/.exec(said.trim());
  if (!parts) return { refused: `when ${said} is not YYYY-MM-DD HH:MM` };
  const at = wallClockAt(zone, parts[1] ?? "", Number(parts[2]), Number(parts[3]));
  if (!Number.isFinite(at)) return { refused: `when ${said} is not a time` };
  const ahead = at - Date.now();
  // A time this close is the press's own: it goes as the card is pressed (contracts POST_SOON_MS, 00616 post_begin).
  if (ahead < -POST_SOON_MS)
    return {
      refused: `${said} has passed on the business's clock. Ask them for a later time, or leave when out for now`,
    };
  if (ahead > POST_AHEAD_DAYS_MAX * DAY_MS)
    return {
      refused: `${said} is more than ${POST_AHEAD_DAYS_MAX} days ahead, the most a post can wait. Ask for a nearer day`,
    };
  return { at: ahead <= POST_SOON_MS ? null : at };
}

/**
 * Why a place already holds this post, for the model: one of the same kind on its way there (now, or set for its time), or
 * one up on Google (contracts postPlaceTakenOf, the rule the page's switches keep). A story waits apart from the post (00620).
 * Null where it can go.
 */
function placeTakenSaid(posts: readonly PostDto[], request: { place: PostPlace; as: PostPublish["as"] }, zone: string) {
  const { place } = request;
  const taken = postPlaceTakenOf(posts, place, place === "instagram" ? request.as : "picture");
  if (!taken) return null;
  const where = place === "instagram" && request.as === "story" ? "Instagram as a story" : POST_PLACE_SAID[place];
  if (taken.is === "up")
    return `this post is already up on ${where}, and a second would show twice there. Say so, and leave ${where} out`;
  const due = Date.parse(taken.scheduled_for);
  return due - Date.now() > POST_SOON_MS
    ? `this post is already set for ${clockWhen(due, zone, Date.now())} on ${where}. Say so: Don't post on it in Campaigns › Content lets that one go first, or leave ${where} out`
    : `this post is already on its way to ${where}. Say so, and leave ${where} out`;
}

/** The time as the card says it, in the turn's language, on the business's clock: "Sat 10:00 AM", "sábado, 15 nov, 10:00". */
const whenSaidOf = (at: number, zone: string, language: PostPublish["language"]): string =>
  language === "es"
    ? dateFormat("es", {
        weekday: "long",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: zone,
      }).format(at)
    : clockWhen(at, zone, Date.now());

/** Why a place can take no post now, in a sentence for the model; null where it can. */
async function placeRefusal(toolContext: ToolContext, place: PostPlace): Promise<string | null> {
  if (place === "google") {
    const connection = await findConnection(toolContext.ctx.supabase, toolContext.tenantId);
    return connection?.location_name
      ? null
      : "Google is not connected. Say so: Settings › Connections connects it, and the post can go to Instagram meanwhile";
  }
  const can = await readInstagramPostable(toolContext.tenantId);
  if (can === "yes") return null;
  return can === null
    ? "Instagram is not offered to this workspace yet. Say so, and offer Google"
    : "Instagram is not connected to post. Say so: Settings › Connections connects it";
}

/** The caption that goes, held to what the owner said where it is Ask's; or why it cannot go. */
async function captionOf(
  toolContext: ToolContext,
  input: PublishInput,
  at: { fileId: string; places: readonly PostPlace[]; as: PostPublish["as"] },
): Promise<{ caption: string; isNew: boolean } | { refused: string }> {
  const kept = (await readPostCaption(toolContext.ctx, toolContext.tenantId, at.fileId)) ?? "";
  const asked = input.caption?.trim() ?? "";
  const caption = asked || kept;
  const isNew = !!asked && asked !== kept.trim();
  const needsWords = at.places.includes("google") || at.as === "picture";
  if (needsWords && !caption)
    return { refused: "this post has no caption. Write one from the owner's words in caption, or ask them for it" };
  if (isNew) {
    const config = await load(toolContext.rc, readers.config, undefined).then((r) => r.data?.config ?? null);
    const claims = postClaimsProblem(caption, await ownersWords(toolContext, config));
    if (claims) return { refused: `caption: ${claims}` };
  }
  if (at.places.includes("google") && caption.length > FILE_GOOGLE_WORDS_MAX)
    return { refused: `caption: Google takes ${FILE_GOOGLE_WORDS_MAX} characters at most. Shorten it` };
  const instagram = at.places.includes("instagram") && at.as === "picture" ? postCaptionProblem(caption) : null;
  if (instagram) return { refused: `caption: ${instagram}` };
  return { caption, isNew };
}

async function publishOutcome(toolContext: ToolContext, input: PublishInput): Promise<ProposalOutcome> {
  const named = input.file ?? toolContext.subjectFile;
  if (!named) return refuse("name the post with file, as files says it");
  const { files } = (await load(toolContext.rc, filesNamedForAsk, { names: [named] })).data;
  const file = filesNamed(files, [named]).found.at(0);
  if (!file) return refuse(`no file named ${named}; names come from files with action list`);
  if (file.source !== "made" || file.kind === "video")
    return refuse(
      `${file.name} is not a post made here. A video is saved from Campaigns › Content and posted from the phone; a photo is made into a post first, with propose_post`,
    );
  const places = POST_PLACES.filter((p) => input.places.includes(p));
  for (const place of places) {
    const why = await placeRefusal(toolContext, place);
    if (why) return refuse(why);
  }
  const as = input.as ?? "picture";
  const posts = await readFilePosts(toolContext.ctx, toolContext.tenantId, file.id);
  for (const place of places) {
    const taken = placeTakenSaid(posts, { place, as }, toolContext.timezone);
    if (taken) return refuse(taken);
  }
  const when = whenOf(input.when, toolContext.timezone);
  if ("refused" in when) return refuse(when.refused);
  const caption = await captionOf(toolContext, input, { fileId: file.id, places, as });
  if ("refused" in caption) return refuse(caption.refused);
  const language = toolContext.language === "es" ? "es" : "en";
  const payload: PostPublish = {
    file_id: file.id,
    places,
    as,
    when: when.at === null ? null : new Date(when.at).toISOString(),
    when_said: when.at === null ? null : whenSaidOf(when.at, toolContext.timezone, language),
    caption: caption.caption,
    caption_new: caption.isNew,
    language,
  };
  return propose({ kind: "publish", ...publishCardWords(payload, fileSaidOf(file.name)), payload: { ...payload } });
}

export const publishAct = defineAct({
  name: "propose_publish",
  description: `Put a made post up on Instagram (post or story) and Google, now or at a time the owner named. The card says where, when and its caption. ${approvalWords("publish")}.`,
  kind: "publish",
  input: publishInput,
  label: "Putting a post up",
  build: publishOutcome,
});

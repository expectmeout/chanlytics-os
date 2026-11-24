/**
 * A week's posts made after its approval (00706; the content loop PRD's 8.4 and 10.2; Ruben, 23 Nov 2026: made after the
 * week is approved, so a week nobody approves makes nothing). The press answers at once, and each approved creative is
 * then made in turn by the code a member's own press runs, under the same member's session, with no AI conversation:
 *
 *   - a picture or a story: drawn by code from its photo, or from its clip's best moment (posts/make.ts makePost, free),
 *     with the words AI wrote while drafting and the Week showed; then placed at its place at its time
 *     (posts/instagram.ts, posts/google.ts), each placement its own approval of those bytes and words.
 *   - a reel: its video begun from its clip's best moment with those words (content/piece.ts beginPieceFor), the one
 *     part that costs. A video's bytes are approved once they can be watched (00681), so a made reel asks its own look.
 *
 * Whatever stands in the way of one is said on its row with its one fix, in the words the press would have said: nothing
 * is lost without a word, and nothing is retried behind the owner's back.
 */
import "server-only";
import { after } from "next/server";
import {
  AppError,
  PIECE_LIMITS,
  POST_VOICES,
  WEEK_MADE_AHEAD_MS,
  type PieceIntent,
  type PlanSlotDto,
  type PostAbout,
  type PostPlan,
  type SlotWords,
  type TenantId,
} from "@chanlytics/contracts";
import {
  findBestMoment,
  findFile,
  markSlotMade,
  markSlotPrepared,
  readContentWeek,
  type FileMemberRow,
} from "@chanlytics/db/files";
import { jsonCopyOf } from "@chanlytics/db/shared";
import { logAndGoOn } from "@chanlytics/log";
import { log } from "@/server/shared/log";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { placeSlotAsAI } from "../posts/approve";
import { makePost } from "../posts/make";
import { postFileToGoogle, prepareOnGoogle } from "../posts/google";
import { postFileToInstagram, prepareOnInstagram } from "../posts/instagram";
import { beginPieceFor } from "./piece";

/** What a row says when a creative could not be made, with its one fix (Try again). */
const UNMADE = {
  words: "AI couldn't write its words. Try again.",
  footage: "Its photo or clip isn't there any more.",
  failed: "It couldn't be made. Try again.",
  /** A week AI approved, whose slot's time came before its turn to be made (00714): never posted late. */
  late: "Its time came before it could be made. Pick another time.",
} as const;

/** How long a reel runs around its clip's best moment: a beat before it, and long enough to land. */
const REEL_BEFORE_S = 1;
const REEL_SECONDS = 8;

/** The slots of each approved creative not yet made, in time order. */
function creativesToMake(slots: readonly PlanSlotDto[]): PlanSlotDto[][] {
  const byCreative = new Map<string, PlanSlotDto[]>();
  for (const slot of slots) {
    if (slot.state !== "approved" || slot.post_id || slot.piece_id) continue;
    byCreative.set(slot.creative, [...(byCreative.get(slot.creative) ?? []), slot]);
  }
  return [...byCreative.values()];
}

/** A slot's reason as a press says it: the day, the offer or the service its words date (contracts PostAbout). */
const aboutOf = (intent: PieceIntent | null): PostAbout | undefined =>
  intent ? { day: intent.day, offer: intent.offer, service: intent.service } : undefined;

/** The words a refusal says to the owner, or the plain one where it was not the owner's to read. */
const refusalWords = (e: unknown): string => (e instanceof AppError ? e.message : UNMADE.failed);

type Hold = (reason: string) => Promise<void>;

/**
 * Who makes a week: a member's press (after their Approve the week, or a row's own), or AI under the rung the owner set
 * (00714: a held week at its time, through the edge's job and app/api/content/week-made). AI's placements go via rung,
 * each with its slot in one write, and a reel it begins is keyed by its slot: its making asked again, or twice at once,
 * places no slot twice and begins no second video.
 */
export type WeekMadeBy = "press" | "rung";

/** A picture or a story drawn from its photo, or its clip's best moment, with the words the Week showed: its made file. */
async function drawPicture(
  ctx: RouteContext,
  member: Member,
  creative: { file: FileMemberRow; words: SlotWords },
): Promise<FileMemberRow> {
  const { file, words } = creative;
  const moment = file.kind === "video" ? await findBestMoment(ctx.supabase, member.tenantId, file.id) : null;
  const plan: PostPlan = {
    file_id: file.id,
    line: words.line,
    over: words.over,
    under: words.under,
    book: false,
    words_at: "bottom",
    voice: POST_VOICES[0],
    layout: "over",
    language: words.language,
    at: moment ? (moment.start_s + moment.end_s) / 2 : null,
  };
  const post = await makePost(ctx, member, plan);
  const row = await findFile(ctx.supabase, post.file_id);
  if (!row) throw new AppError("not_found", UNMADE.failed, 404);
  return row;
}

/** The made file every slot of a creative was drawn into ahead (00714), where they share one: whoever places it reuses it. */
const preparedFileOf = (slots: readonly PlanSlotDto[]): string | null => {
  const first = slots[0]?.prepared_file_id ?? null;
  return first && slots.every((s) => s.prepared_file_id === first) ? first : null;
};

/** One slot of a drawn picture, to be placed: the slot, the made file and the words it goes with. */
interface SlotPlacing {
  slot: PlanSlotDto;
  row: FileMemberRow;
  words: SlotWords;
}

/** A slot's placement readied for AI under the rung (00714): every check, its drawn piece's words kept, nothing approved. */
const readySlot = (ctx: RouteContext, member: Member, { slot, row, words }: SlotPlacing) =>
  slot.place === "google"
    ? prepareOnGoogle(ctx, member, row, { summary: words.caption, when: slot.at, about: aboutOf(slot.intent) })
    : prepareOnInstagram(ctx, member, row, {
        as: slot.kind === "story" ? "story" : "picture",
        caption: words.caption,
        when: slot.at,
        about: aboutOf(slot.intent),
      });

/** A slot held because its time came before it could be made (00714): AI never posts it late. */
async function holdLate(ctx: RouteContext, member: Member, slot: PlanSlotDto): Promise<void> {
  await markSlotMade(ctx.supabase, member.tenantId, {
    id: slot.id,
    made: { held: { why: "late", reason: UNMADE.late } },
  });
}

/**
 * A slot placed as AI under the rung (00714): readied, then its post and the slot's link to it in one write
 * (plan_slot_place). A making asked twice, or two at once, place it once: the second finds it taken and goes on.
 */
async function placeAsAI(ctx: RouteContext, member: Member, placing: SlotPlacing): Promise<void> {
  const approval = await readySlot(ctx, member, placing);
  const slot = { id: placing.slot.id, fileId: placing.row.id, approval };
  if ((await placeSlotAsAI(ctx, member, slot)) === "past") await holdLate(ctx, member, placing.slot);
}

/** A slot placed by the member's press: each place's own door, at its time. */
async function placeByPress(ctx: RouteContext, member: Member, { slot, row, words }: SlotPlacing): Promise<void> {
  const about = aboutOf(slot.intent);
  const placed =
    slot.place === "google"
      ? await postFileToGoogle(ctx, member, row, { summary: words.caption, when: slot.at, about }).then(() => null)
      : await postFileToInstagram(ctx, member, row, {
          as: slot.kind === "story" ? "story" : "picture",
          caption: words.caption,
          when: slot.at,
          about,
        });
  if (placed) await markSlotMade(ctx.supabase, member.tenantId, { id: slot.id, made: { post_id: placed.post_id } });
}

/** A picture or a story: drawn (or the one drawn ahead), then each of its places at its time. */
async function makePicture(
  ctx: RouteContext,
  member: Member,
  creative: { slots: readonly PlanSlotDto[]; file: FileMemberRow; words: SlotWords; by: WeekMadeBy },
): Promise<void> {
  const { slots, file, words } = creative;
  const prepared = preparedFileOf(slots);
  const row =
    (prepared ? await findFile(ctx.supabase, prepared) : null) ?? (await drawPicture(ctx, member, { file, words }));
  const place = creative.by === "rung" ? placeAsAI : placeByPress;
  for (const slot of slots) await place(ctx, member, { slot, row, words });
}

/** A reel: its video begun from its clip's best moment, with the words the Week showed. */
async function beginReel(
  ctx: RouteContext,
  member: Member,
  creative: { slots: readonly PlanSlotDto[]; file: FileMemberRow; words: SlotWords; key: string },
): Promise<void> {
  const { slots, file, words } = creative;
  const moment = await findBestMoment(ctx.supabase, member.tenantId, file.id);
  const from = Math.max(0, (moment?.start_s ?? 0) - REEL_BEFORE_S);
  const to = Math.min(file.seconds ?? from + REEL_SECONDS, from + REEL_SECONDS);
  const begun = await beginPieceFor(ctx, member, {
    key: creative.key,
    shape: "blocks",
    blocks: [{ is: "clip", file_id: file.id, from, to, label: null }],
    lines: [words.line].filter((line) => line.length <= PIECE_LIMITS.line),
    words_at: "low",
    words_hold: "first",
    end_line: null,
    language: words.language,
    caption: words.caption,
  });
  for (const slot of slots)
    await markSlotMade(ctx.supabase, member.tenantId, { id: slot.id, made: { piece_id: begun.piece_id } });
}

/** One creative made, or held on its row with why and its one fix. */
async function makeCreative(
  ctx: RouteContext,
  member: Member,
  creative: { slots: readonly PlanSlotDto[]; by: WeekMadeBy },
): Promise<void> {
  const { slots, by } = creative;
  const first = slots[0];
  if (!first) return;
  const hold: Hold = async (reason) => {
    for (const slot of slots)
      await markSlotMade(ctx.supabase, member.tenantId, { id: slot.id, made: { held: { why: "unmade", reason } } });
  };
  // AI makes nothing it would post late (00714, the making queue): a slot whose time is too near is held, with why.
  if (by === "rung" && Math.min(...slots.map((s) => Date.parse(s.at))) - Date.now() < WEEK_MADE_AHEAD_MS) {
    for (const slot of slots) await holdLate(ctx, member, slot);
    return;
  }
  if (!first.words) return hold(UNMADE.words);
  const file = first.file_id ? await findFile(ctx.supabase, first.file_id) : null;
  if (!file) return hold(UNMADE.footage);
  try {
    if (first.kind === "reel")
      // A key a press of its own: each approval that makes it (the week's, or its own Try again) begins its own video.
      // AI's is its slot's own (00714): the job asked again finds the video it began.
      await beginReel(ctx, member, {
        slots,
        file,
        words: first.words,
        key: by === "rung" ? `week:${first.id}:rung` : `week:${first.id}:${Date.now()}`,
      });
    else await makePicture(ctx, member, { slots, file, words: first.words, by });
  } catch (e) {
    log.warn("week_make_failed", { tenant_id: member.tenantId, creative: first.creative, error: e });
    await hold(refusalWords(e));
  }
}

/** Every approved creative of a week not yet made, one at a time, as the member whose press approved it, or as AI. */
export async function makeWeek(
  ctx: RouteContext,
  member: Member,
  week: { weekOf: string; by: WeekMadeBy },
): Promise<number> {
  const read = await readContentWeek(ctx.supabase, member.tenantId, week.weekOf);
  const creatives = creativesToMake(read.slots);
  for (const slots of creatives) await makeCreative(ctx, member, { slots, by: week.by });
  return creatives.length;
}

/** One creative of a held week prepared: drawn once, each of its places readied and kept on its slot. How many. */
async function prepareCreative(ctx: RouteContext, member: Member, slots: readonly PlanSlotDto[]): Promise<number> {
  const first = slots[0];
  const file = first?.words && first.file_id ? await findFile(ctx.supabase, first.file_id) : null;
  if (!first?.words || !file) return 0;
  const words = first.words;
  let readied = 0;
  try {
    const row = await drawPicture(ctx, member, { file, words });
    for (const slot of slots) {
      const approval = await readySlot(ctx, member, { slot, row, words });
      // With the footage it was drawn from: a slot given other footage since is drawn again, never placed as this.
      const prepared = jsonCopyOf({ file_id: row.id, from: file.id, at: slot.at, approval });
      if (await markSlotPrepared(ctx.supabase, member.tenantId, { id: slot.id, prepared })) readied += 1;
    }
  } catch (e) {
    log.warn("week_prepare_failed", { tenant_id: member.tenantId, creative: first.creative, error: e });
  }
  return readied;
}

/**
 * A held week prepared ahead (00714; the making queue's overnight pass): each picture or story drawn once into its made
 * file, and each of its places readied for the door (posts/approve.ts prepareApproval), kept on its slot. Nothing approved,
 * nothing placed, no reel begun: a reel costs, and waits for the owner's look whatever the rung. A creative that cannot be
 * readied is left to be made after the approval, where it says its one fix if it cannot be then either. How many slots.
 */
export async function prepareWeek(ctx: RouteContext, member: Member, weekOf: string): Promise<number> {
  const read = await readContentWeek(ctx.supabase, member.tenantId, weekOf);
  const byCreative = new Map<string, PlanSlotDto[]>();
  for (const slot of read.slots) {
    if (slot.state !== "proposed" || slot.kind === "reel" || slot.prepared_file_id) continue;
    byCreative.set(slot.creative, [...(byCreative.get(slot.creative) ?? []), slot]);
  }
  let readied = 0;
  for (const slots of byCreative.values()) readied += await prepareCreative(ctx, member, slots);
  return readied;
}

/** The week made after the press has answered (next/server `after`): the owner waits on none of it. */
export function makeWeekAfter(ctx: RouteContext, member: Member, at: { tenantId: TenantId; weekOf: string }): void {
  after(() =>
    makeWeek(ctx, member, { weekOf: at.weekOf, by: "press" }).then(
      (count) => log.info("week_made", { tenant_id: at.tenantId, creatives: count }),
      logAndGoOn("making a week's posts"),
    ),
  );
}

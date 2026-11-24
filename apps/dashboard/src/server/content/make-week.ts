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
  type PieceIntent,
  type PlanSlotDto,
  type PostAbout,
  type PostPlan,
  type SlotWords,
  type TenantId,
} from "@chanlytics/contracts";
import { findBestMoment, findFile, markSlotMade, readContentWeek, type FileMemberRow } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import { log } from "@/server/shared/log";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { makePost } from "../posts/make";
import { postFileToGoogle } from "../posts/google";
import { postFileToInstagram } from "../posts/instagram";
import { beginPieceFor } from "./piece";

/** What a row says when a creative could not be made, with its one fix (Try again). */
const UNMADE = {
  words: "AI couldn't write its words. Try again.",
  footage: "Its photo or clip isn't there any more.",
  failed: "It couldn't be made. Try again.",
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

/** A picture or a story: drawn from its photo or its clip's moment, then each of its places at its time. */
async function makePicture(
  ctx: RouteContext,
  member: Member,
  creative: { slots: readonly PlanSlotDto[]; file: FileMemberRow; words: SlotWords },
): Promise<void> {
  const { slots, file, words } = creative;
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
  for (const slot of slots) {
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
async function makeCreative(ctx: RouteContext, member: Member, slots: readonly PlanSlotDto[]): Promise<void> {
  const first = slots[0];
  if (!first) return;
  const hold: Hold = async (reason) => {
    for (const slot of slots)
      await markSlotMade(ctx.supabase, member.tenantId, { id: slot.id, made: { held: { why: "unmade", reason } } });
  };
  if (!first.words) return hold(UNMADE.words);
  const file = first.file_id ? await findFile(ctx.supabase, first.file_id) : null;
  if (!file) return hold(UNMADE.footage);
  try {
    if (first.kind === "reel")
      // A key a press of its own: each approval that makes it (the week's, or its own Try again) begins its own video.
      await beginReel(ctx, member, { slots, file, words: first.words, key: `week:${first.id}:${Date.now()}` });
    else await makePicture(ctx, member, { slots, file, words: first.words });
  } catch (e) {
    log.warn("week_make_failed", { tenant_id: member.tenantId, creative: first.creative, error: e });
    await hold(refusalWords(e));
  }
}

/** Every approved creative of a week not yet made, one at a time, as the member whose press approved it. */
export async function makeWeek(ctx: RouteContext, member: Member, weekOf: string): Promise<number> {
  const week = await readContentWeek(ctx.supabase, member.tenantId, weekOf);
  const creatives = creativesToMake(week.slots);
  for (const slots of creatives) await makeCreative(ctx, member, slots);
  return creatives.length;
}

/** The week made after the press has answered (next/server `after`): the owner waits on none of it. */
export function makeWeekAfter(ctx: RouteContext, member: Member, at: { tenantId: TenantId; weekOf: string }): void {
  after(() =>
    makeWeek(ctx, member, at.weekOf).then(
      (count) => log.info("week_made", { tenant_id: at.tenantId, creatives: count }),
      logAndGoOn("making a week's posts"),
    ),
  );
}

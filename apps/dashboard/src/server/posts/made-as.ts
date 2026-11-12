/**
 * How a piece made here was made, as Ask is told it when it opens one (ask/tools/read/files.ts, action view): the photo a post
 * came from and what it was asked to be, or the clips, pictures and words a video was drawn from, each file by the name Ask
 * and the owner both say, in the words Ask's own cards take (propose_post, propose_piece). Without it Ask saw the finished
 * picture and nothing of what it came from, so "move the words down" or "make it shorter" about a piece was a guess. With it,
 * a change is a new one made from the same material with that changed, and the one they have stays.
 *
 * A file it was made from that is no longer in the Library, or that this person cannot see, is said as gone: nothing is
 * named that the caller's own read does not hold.
 */
import "server-only";
import {
  piecePlanOf,
  pieceFileIdsOf,
  postPlanOf,
  recordOrNull,
  type PiecePlan,
  type TenantId,
} from "@chanlytics/contracts";
import { findFile, findPiecePlanOfFile, getFileMade, listFilesByIds } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";

type Db = RouteContext["supabase"];
type PieceBlock = PiecePlan["blocks"][number];
/** A picture held still in a block: a photo, or one moment of a clip. */
type PieceShot = Extract<PieceBlock, { is: "pair" }>["before"];

/**
 * What Ask is told of a made piece: what it is, what it was asked to be, and how a change to it is made. `plan` holds only
 * what the act that makes one takes, under the act's own names (propose_post's input, propose_piece's), so it goes back
 * as it is with the change made: nothing the act works out for itself (a quote's source is looked up) and nothing only the
 * owner can say again (that the people shown agreed) is in it. A video's language is in it: kept as it is unless the owner
 * asks for another, whatever language they ask in.
 */
interface MadeAs {
  what: string;
  plan: Record<string, unknown>;
  /** Files it was drawn from that are no longer there, counted: a post's one photo, or some of a video's. */
  gone?: number;
  to_change: string;
}

const POST_CHANGE =
  "To change it, call propose_post with this plan with the change made. The one they have stays; the new one is saved beside it.";
const POST_GONE =
  "The photo or clip this post came from is no longer in the Library, so it cannot be made again from it. Say so, and offer one from another photo.";
const PIECE_CHANGE =
  "To change it, call propose_piece with this plan with the change made. The one they have stays; the new one is made beside it.";
const PIECE_GONE =
  "Some of what it was made from is no longer in the Library: say so, and offer it made from what is still there.";

/**
 * A post's making: the photo it came from (or the clip, where it was drawn from a moment of one), under the caller's own
 * read, and what it was asked to be. The file is named in the plan as `file`, the word propose_post takes it by; with it
 * gone the plan names none, and says it cannot be made again.
 */
async function postMadeAs(db: Db, tenantId: TenantId, fileId: string): Promise<MadeAs | null> {
  const created = recordOrNull(await getFileMade(serviceDb(), tenantId, fileId));
  if (!created) return null;
  const from = typeof created.from === "string" ? await findFile(db, created.from) : null;
  const plan = postPlanOf(recordOrNull(created.plan) ?? {});
  return {
    what: "a post made here, with its words on it",
    plan: {
      ...(from ? { file: from.name } : {}),
      ...(plan.at !== null ? { at: plan.at } : {}),
      line: plan.line,
      ...(plan.over ? { over: plan.over } : {}),
      ...(plan.under ? { under: plan.under } : {}),
      book: plan.book,
      words_at: plan.words_at,
      voice: plan.voice,
      layout: plan.layout,
    },
    ...(from ? {} : { gone: 1 }),
    to_change: from ? POST_CHANGE : POST_GONE,
  };
}

/** A picture held still, as a block names it: its file's name, and its moment where it is a clip's. */
const shotNamed = (shot: PieceShot, key: string, names: ReadonlyMap<string, string>): Record<string, unknown> => ({
  [key]: names.get(shot.file_id) ?? null,
  ...(shot.at !== null ? { [`${key}_at`]: shot.at } : {}),
});

/** One block in the words propose_piece takes, each file by its name; a file that is gone is named null. */
function blockNamed(block: PieceBlock, names: ReadonlyMap<string, string>): Record<string, unknown> {
  if (block.is === "clip")
    return {
      is: "clip",
      file: names.get(block.file_id) ?? null,
      from: block.from,
      to: block.to,
      ...(block.label ? { label: block.label } : {}),
    };
  if (block.is === "photo")
    return {
      is: "photo",
      file: names.get(block.file_id) ?? null,
      seconds: block.seconds,
      ...(block.label ? { label: block.label } : {}),
    };
  if (block.is === "pair")
    return {
      is: "pair",
      ...shotNamed(block.before, "before", names),
      ...shotNamed(block.after, "after", names),
      seconds: block.seconds,
    };
  if (block.is === "words") return { is: "words", lines: block.lines, seconds: block.seconds };
  return {
    is: "quote",
    text: block.text,
    ...(block.over ? shotNamed(block.over, "over", names) : {}),
    seconds: block.seconds,
  };
}

/** A video's making: its blocks in play order with each file by its name, its words, and the words to paste under it. */
async function pieceMadeAs(db: Db, tenantId: TenantId, fileId: string): Promise<MadeAs | null> {
  const drawnBy = recordOrNull(await findPiecePlanOfFile(db, tenantId, fileId));
  if (!drawnBy) return null;
  const plan = piecePlanOf(drawnBy);
  const ids = pieceFileIdsOf(plan);
  const held = await listFilesByIds(db, tenantId, ids);
  const names = new Map(held.map((file) => [file.id, file.name]));
  const gone = ids.filter((id) => !names.has(id)).length;
  return {
    what: "a video made here",
    plan: {
      blocks: plan.blocks.map((block) => blockNamed(block, names)),
      lines: plan.lines,
      words_at: plan.words_at,
      words_hold: plan.words_hold,
      ...(plan.end_line ? { end_line: plan.end_line } : {}),
      language: plan.language,
      ...(plan.caption ? { caption: plan.caption } : {}),
    },
    ...(gone > 0 ? { gone } : {}),
    to_change: gone > 0 ? PIECE_GONE : PIECE_CHANGE,
  };
}

/**
 * The words a piece made here keeps on it, as the owner's: a post's lines, a video's opening words, its labels, its cards, its
 * end line and its caption. Once the owner pressed Save they are theirs (files/post-check.ts), so a piece made again from it
 * may say them again: its offer, its number, its promise. Never a quote's words, nor where it was said: those are a client's,
 * held to a review this workspace holds (act/files/piece.ts quotesSourced). Empty where nothing is kept, or the read fails.
 */
export async function readKeptWords(db: Db, tenantId: TenantId, fileId: string): Promise<string> {
  const read = async (): Promise<string[]> => {
    const created = recordOrNull(await getFileMade(serviceDb(), tenantId, fileId));
    if (created) {
      const plan = postPlanOf(recordOrNull(created.plan) ?? {});
      return [plan.line, plan.over ?? "", plan.under ?? ""];
    }
    const drawnBy = recordOrNull(await findPiecePlanOfFile(db, tenantId, fileId));
    if (!drawnBy) return [];
    const plan = piecePlanOf(drawnBy);
    const blocks = plan.blocks.flatMap((block) =>
      block.is === "words" ? block.lines : block.is === "clip" || block.is === "photo" ? [block.label ?? ""] : [],
    );
    return [...plan.lines, ...blocks, plan.end_line ?? "", plan.caption ?? ""];
  };
  const words = await read().catch(logAndGoOn("the words a piece keeps", [] as string[]));
  return words.filter((w) => w.trim()).join("\n");
}

/**
 * How a made piece was made, or null where nothing is kept of it (a post kept before its making was, a video whose row is
 * gone). A read that fails is no making to tell, and is logged: Ask still sees the piece, and says what it can.
 */
export function readMadeAs(db: Db, tenantId: TenantId, file: { id: string; kind: string }): Promise<MadeAs | null> {
  const made = file.kind === "video" ? pieceMadeAs(db, tenantId, file.id) : postMadeAs(db, tenantId, file.id);
  return made.catch(logAndGoOn("how a piece was made", null));
}

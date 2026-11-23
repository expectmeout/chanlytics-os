/**
 * The Week as its page reads it (00702; the content loop PRD's 21.2): the week's plan, with what it needs to draw each
 * creative once (its footage's still, the piece it was made into, where that piece's posts stand), whether AI is paused,
 * which places take a post, and what Settings › Content says (what posts are for, how often, quiet days, languages, the
 * offers). One read, so the Week, Settings › Content and AI say the same numbers.
 */
import type { FileDto } from "../../files/views";
import type { ContentMadeDto } from "../page";
import type { PieceStatus } from "../piece-making";
import type { OwnerClaim } from "./claims";
import type { ContentGoal } from "./sets";
import type { WeekPlanDto, cadenceOf } from "./week";

/** A reel's video as the Week reads it: being made, made into a file, or not made. */
export interface WeekPieceDto {
  id: string;
  status: PieceStatus;
  file_id: string | null;
}

/** What a business's posts are for, as Settings › Content says it. */
export interface WeekGoalDto {
  goal: ContentGoal;
  /** The owner's own words for it, where they gave any. */
  detail: string | null;
}

export interface WeekPageDto {
  week_of: string;
  /** The business's zone: a slot's day and time are said in it. */
  zone: string;
  week: WeekPlanDto;
  /** Every file a slot names: the footage each was planned from. */
  files: FileDto[];
  /** What each slot was made into, with its posts: a picture's post, a reel's video once made. */
  made: ContentMadeDto[];
  pieces: WeekPieceDto[];
  /** Since when AI is paused (the stop); null while it is on. */
  paused_at: string | null;
  /** Which places take a post now. */
  places: { instagram: boolean; google: boolean };
  /** Whether this workspace plans its weeks (features.content_plan): the Week is its tab only where it does. */
  planned: boolean;
  claims: OwnerClaim[];
  goals: WeekGoalDto[];
  cadence: ReturnType<typeof cadenceOf>;
  quiet_days: string[];
  languages: string[];
  /** The owner's own sentence for a line of Settings › Content, where they said one. */
  lines: Partial<Record<"goals" | "cadence" | "quiet_days" | "languages", string>>;
}

/**
 * Where a watched folder stands, as a member's own session reads it (the footage sources plan, P5; 00655): its files
 * counted from the folder's own list, never kept a second time, and what was passed over with its cause. Read on the
 * asker's session, so the tables' own rule (a member reads their workspace's rows) decides, and nothing here writes.
 *
 * The counting is one statement in the database (source_items_tally, source_items_passed): each part of it reads an
 * index over the folder's rows in one state, so a folder of fifty thousand files costs what one of fifty does.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, SOURCE_ITEM_STATES, SOURCE_ITEM_WHYS, isOneOf } from "@chanlytics/contracts";
import type { SourceItemState, SourceItemWhy, TenantId } from "@chanlytics/contracts";
import { z } from "zod";
import { readAnswer } from "../../shared/read-json";
import type { Database } from "../../types";
import type { SourceRef } from "./source-items";

type Db = SupabaseClient<Database>;

/** A folder's files, counted where they stand: what a screen's one line is made from. */
export interface SourceItemsTally {
  /** Photos and videos its listing has found and that are still where they were. */
  found: number;
  /** Those in the Library. */
  in: number;
  /** Those on their way now: being taken, or waiting for nothing but their turn. */
  coming: number;
  /** Of the files that began coming with those still on their way, how many are in. */
  landed: number;
  /** Those waiting for something only time or the owner changes, by its cause. */
  budget: number;
  room: number;
  libraryFull: number;
  videosOff: number;
}

const TallyAnswer = z.object({
  found: z.number(),
  in: z.number(),
  coming: z.number(),
  landed: z.number(),
  budget: z.number(),
  room: z.number(),
  library_full: z.number(),
  videos_off: z.number(),
});

/** A folder's files counted from its own list (source_items_tally). */
export async function countFolderStanding(db: Db, ref: SourceRef): Promise<SourceItemsTally> {
  const { data, error } = await db.rpc("source_items_tally", { p_tenant_id: ref.tenantId, p_source_id: ref.sourceId });
  if (error) throw new DbFailure(error, "cannot count the watched folder's files");
  const answer = readAnswer("source_items_tally", TallyAnswer, data);
  return {
    found: answer.found,
    in: answer.in,
    coming: answer.coming,
    landed: answer.landed,
    budget: answer.budget,
    room: answer.room,
    libraryFull: answer.library_full,
    videosOff: answer.videos_off,
  };
}

/** What fills a workspace's sixty minutes of video, in seconds, by road (00657 video_minutes_by_road). */
export interface VideoMinutesByRoad {
  total: number;
  /** Watched clips that make room for a new one by themselves. */
  canStepAside: number;
  setAside: number;
  own: number;
  made: number;
  found: number;
}

const MinutesAnswer = z.object({
  total: z.number(),
  can_step_aside: z.number(),
  set_aside: z.number(),
  own: z.number(),
  made: z.number(),
  found: z.number(),
});

/** What fills the workspace's videos, read as the member: their own workspace's videos alone. */
export async function readVideoMinutesByRoad(db: Db, tenantId: TenantId): Promise<VideoMinutesByRoad> {
  const { data, error } = await db.rpc("video_minutes_by_road", { p_tenant_id: tenantId });
  if (error) throw new DbFailure(error, "cannot read what fills the videos");
  const answer = readAnswer("video_minutes_by_road", MinutesAnswer, data);
  return {
    total: answer.total,
    canStepAside: answer.can_step_aside,
    setAside: answer.set_aside,
    own: answer.own,
    made: answer.made,
    found: answer.found,
  };
}

/** Files of a folder that are not in the Library, by where they stand and why, counted; `name` where it is one file. */
export interface SourceItemsPassed {
  state: SourceItemState;
  why: SourceItemWhy | null;
  videos: number;
  photos: number;
  /** The one file's name, where the count is one: a sentence can then name it. */
  name: string | null;
}

const PassedAnswer = z.array(
  z.object({
    state: z.string(),
    why: z.string().nullable(),
    videos: z.number(),
    photos: z.number(),
    name: z.string().nullable(),
  }),
);

/**
 * What a folder holds that is not in the Library, by its state and cause (source_items_passed): what waits, what was
 * passed over, what could not be brought in, and what was only listed (older than a first watch takes). Read when its
 * sheet is opened, never with a page.
 */
export async function listSourceItemsPassed(db: Db, ref: SourceRef): Promise<SourceItemsPassed[]> {
  const { data, error } = await db.rpc("source_items_passed", {
    p_tenant_id: ref.tenantId,
    p_source_id: ref.sourceId,
  });
  if (error) throw new DbFailure(error, "cannot read what the watched folder passed over");
  return readAnswer("source_items_passed", PassedAnswer, data).flatMap((row) =>
    isOneOf(SOURCE_ITEM_STATES, row.state)
      ? [
          {
            state: row.state,
            why: isOneOf(SOURCE_ITEM_WHYS, row.why) ? row.why : null,
            videos: row.videos,
            photos: row.photos,
            name: row.name,
          },
        ]
      : [],
  );
}

/** What came from the workspace's watched folders and is still in the Library, and how many of its clips are kept in Drive. */
export interface SourcedFilesTally {
  files: number;
  /** Clips whose copy is not at the video platform now: they play again only while a folder is watched. */
  away: number;
  /** Files a post or a video used: they stay whatever their folder becomes. */
  used: number;
}

const SourcedAnswer = z.object({ files: z.number(), away: z.number(), used: z.number() });

/** What a folder's stop, a disconnect and "remove what came from it" say before the press (source_files_tally). */
export async function countSourcedFiles(db: Db, tenantId: TenantId): Promise<SourcedFilesTally> {
  const { data, error } = await db.rpc("source_files_tally", { p_tenant_id: tenantId });
  if (error) throw new DbFailure(error, "cannot count what came from the watched folder");
  return readAnswer("source_files_tally", SourcedAnswer, data);
}

const RemovedAnswer = z.object({ removed: z.number(), kept: z.number() });

/**
 * "Remove what came from it too" (00657 source_files_remove), on the member's own session, which the door holds to
 * the settings permission: what the watched folders brought and nothing used leaves the Library; `kept` were used.
 */
export async function removeSourcedFiles(db: Db, tenantId: TenantId): Promise<{ removed: number; kept: number }> {
  const { data, error } = await db.rpc("source_files_remove", { p_tenant_id: tenantId });
  if (error) throw new DbFailure(error, "cannot remove what came from the watched folder");
  return readAnswer("source_files_remove", RemovedAnswer, data);
}

import "server-only";
import {
  FOLDER_STOPPED_WHYS,
  MEDIA_SOURCE_STATES,
  ROLE_PERMS,
  SOURCE_CONNECTION_HEALTHS,
  isOneOf,
  videoPreviewOf,
  type FootageAccountDto,
  type FootageDto,
  type FootageFolderDto,
} from "@chanlytics/contracts";
import {
  listMediaSourcesOf,
  listSourceConnectionsOf,
  countFolderStanding,
  readingAccountOf,
  watchedFolderOf,
  readVideoMinutesByRoad,
  type MediaSourceRow,
  type SourceConnectionRow,
} from "@chanlytics/db/files";
import { readTeamRoster } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import { isDriveOffered } from "../files/sources";
import { load, readerStamp, type Reader, type ReaderContext } from "../shared/reader";
import { config as configReader } from "./facts";

/**
 * Who connected an account, by the name the roster says; null where they are no longer one of the workspace's members
 * (the folder then pauses, and its row says who it was only if it still can).
 */
async function connectorOf(rc: ReaderContext, account: SourceConnectionRow): Promise<string | null> {
  if (!account.connected_by) return null;
  const roster = await readTeamRoster(rc.ctx.supabase, rc.tenantId);
  const member = (roster.data ?? []).find((row) => row.member_user_id === account.connected_by);
  return member ? member.display_name || member.email || null : null;
}

async function accountDtoOf(rc: ReaderContext, account: SourceConnectionRow): Promise<FootageAccountDto> {
  return {
    id: account.id,
    email: account.email,
    health: isOneOf(SOURCE_CONNECTION_HEALTHS, account.health) ? account.health : "needs_reconnect",
    // A name that cannot be read is left out, never the row's failure.
    connected_by: await connectorOf(rc, account).catch(logAndGoOn("footage: who connected the account", null)),
    by_you: account.connected_by === rc.userId,
  };
}

async function folderOf(rc: ReaderContext, source: MediaSourceRow): Promise<FootageFolderDto> {
  const counts = await countFolderStanding(rc.ctx.supabase, { tenantId: rc.tenantId, sourceId: source.id });
  const state = isOneOf(MEDIA_SOURCE_STATES, source.state) ? source.state : "paused";
  // What fills the videos is asked only while clips wait for room: it tells a wait from "Videos are full" (call 3).
  const minutes = counts.room > 0 ? await readVideoMinutesByRoad(rc.ctx.supabase, rc.tenantId) : null;
  return {
    id: source.id,
    provider_id: source.folder_id,
    name: source.folder_name,
    state,
    subfolders: source.include_subfolders,
    // A first look is listing until the folder has been listed whole once.
    looking: state === "setting_up" || (source.walk_kind === "snapshot" && source.reconciled_at === null),
    held: source.hold_at !== null && source.hold_confirmed_at === null ? (source.hold_count ?? 0) : null,
    // Why it is not read whole, as the sync says it in one word (00657 stopped_why).
    stopped_why: isOneOf(FOLDER_STOPPED_WHYS, source.stopped_why) ? source.stopped_why : null,
    over_listed: state === "watching" && source.stopped_why === "over_listed",
    updated_at: source.last_read_at,
    // The folder's one count (00674): every screen's number of it is one of these, read once with the page.
    counts: {
      found: counts.found,
      in: counts.in,
      away: counts.away,
      coming: counts.coming,
      landed: counts.landed,
      waits: {
        budget: counts.budget,
        room: counts.room,
        library_full: counts.libraryFull,
        videos_off: counts.videosOff,
      },
      processing: counts.waitingLength,
      missed: { failed: counts.failed, too_long: counts.tooLong, too_large: counts.tooLarge },
    },
    videos: minutes && {
      total: minutes.total,
      can_step_aside: minutes.canStepAside,
      set_aside: minutes.setAside,
      own: minutes.own,
      made: minutes.made,
      found: minutes.found,
    },
  };
}

/**
 * GET sources, as the route answers it (the footage sources plan, P5): where the workspace's watched folder stands.
 * The row in Settings, Content's card, the Library's line and AI read the same answer, so no two of them can say
 * different things of one folder. The folder's files are counted from its own list as it is read (00655), never kept.
 * An account is not a row a citation names.
 */
export const footage: Reader<undefined, FootageDto> = {
  name: "footage",
  async read(rc) {
    const db = rc.ctx.supabase;
    const [offered, config, accounts, sources] = await Promise.all([
      isDriveOffered(rc.tenantId),
      // The workspace's settings through their own reader, so a turn that reads both reads them once.
      load(rc, configReader, undefined).then((read) => read.data?.config ?? null),
      listSourceConnectionsOf(db, rc.tenantId, "watch"),
      listMediaSourcesOf(db, rc.tenantId),
    ]);
    // An account that reads comes before the word that one could not (a connect that works removes that row).
    const account = readingAccountOf(accounts) ?? accounts[0] ?? null;
    const source = watchedFolderOf(sources);
    const [accountDto, folderDto] = await Promise.all([
      account ? accountDtoOf(rc, account) : null,
      source ? folderOf(rc, source) : null,
    ]);
    const data: FootageDto = {
      // The rollout's guard is the workspace's video switch (the plan's D9), as the edge's connect holds it.
      offered: offered && videoPreviewOf(config),
      can_change: ROLE_PERMS[rc.role].settings,
      account: accountDto,
      folder: folderDto,
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

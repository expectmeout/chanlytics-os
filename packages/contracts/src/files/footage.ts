/**
 * A business's watched folder, as every screen says it (the footage sources plan, P5; the canvas "A watched folder:
 * every screen", 19 November 2026). One reading of where the folder stands, made here from what the server tells
 * (`FootageDto`, GET sources), and said in the same words by the row in Settings, Content's card and the Library's
 * line, so the three can never disagree.
 *
 * Each standing says what is happening, whether it mends itself (its tone: `you` only where the owner must act), and
 * the one thing to do. Never a code and never Google's wording. Pure: a moment is said by the clock the page hands in.
 */
import { groupedPlural } from "../shared/words";
import { FOOTAGE_NUMBERS } from "./footage-numbers";
import { FOOTAGE_SAID, quotedName } from "./footage-said";
import { FILE_VIDEO_BYTES_MAX, FILE_VIDEO_MINUTES_MAX, FILE_VIDEO_SECONDS_MAX } from "./kinds";
import { FILES_MAX } from "./limits";
import type {
  FolderStoppedWhy,
  MEDIA_SOURCE_STATES,
  SOURCE_CONNECTION_HEALTHS,
  SourceItemState,
  SourceItemWhy,
} from "./sources";

export type SourceConnectionHealth = (typeof SOURCE_CONNECTION_HEALTHS)[number];
export type WatchedFolderState = (typeof MEDIA_SOURCE_STATES)[number];

/** What waits in a folder for something only time or the owner changes, by its cause (contracts SOURCE_ITEM_WHYS). */
export interface FootageWaitsDto {
  /** A day's allowance is used. */
  budget: number;
  /** The workspace's videos are full. */
  room: number;
  /** The Library is full. */
  library_full: number;
  /** The workspace takes no videos yet. */
  videos_off: number;
}

/** A folder's files, counted from its own list (source_items), never kept a second time. */
export interface FootageCountsDto {
  /** Photos and videos its listing has found so far. */
  found: number;
  /** Those in the Library now. */
  in: number;
  /** Those on their way now. */
  coming: number;
  /** Of the ones that began coming with those on their way, how many have landed: "12 of 40" is 12 of 12 + 28. */
  landed: number;
  waits: FootageWaitsDto;
}

/** The Google account a folder is read through. */
export interface FootageAccountDto {
  id: string;
  email: string | null;
  health: SourceConnectionHealth;
  /** Who connected it, by name; null where they are no longer one of the workspace's members, or never were named. */
  connected_by: string | null;
  /** Whether the member reading is the one who connected it. */
  by_you: boolean;
}

/** The folder watched, or one that was (stopped). */
export interface FootageFolderDto {
  id: string;
  /** The folder's own id at its provider: what a chosen folder is matched to. */
  provider_id: string;
  name: string;
  state: WatchedFolderState;
  subfolders: boolean;
  /** Its first look inside is still listing. */
  looking: boolean;
  /** A wave of removals is held until it is seen twice: how many left at once; null where none is held. */
  held: number | null;
  /** Why it is not read whole, as the sync says it (00656); null while it is read whole. */
  stopped_why: FolderStoppedWhy | null;
  /** It holds more than is listed. */
  over_listed: boolean;
  /** When it was last brought up to date. */
  updated_at: string | null;
  counts: FootageCountsDto;
  /** What fills the videos' sixty minutes, read only while clips wait for room; null otherwise. */
  videos: FootageVideoMinutesDto | null;
}

/** What fills a workspace's sixty minutes of video, in seconds (00656 video_minutes_by_road). */
export interface FootageVideoMinutesDto {
  total: number;
  /** Watched clips that make room for a new one by themselves (within the hour, once rested). */
  can_step_aside: number;
  /** By road: found online and set aside, added by the owner, made here, found online and kept. */
  set_aside: number;
  own: number;
  made: number;
  found: number;
}

/** GET sources: where the workspace's footage stands, as every screen is told it. */
export interface FootageDto {
  /** Whether connecting Google Drive is offered in this workspace here. */
  offered: boolean;
  /** Whether this member may connect, choose, stop and disconnect: an owner or a partner. */
  can_change: boolean;
  account: FootageAccountDto | null;
  folder: FootageFolderDto | null;
}

/** Where a folder stands, as one closed set every screen has words for. */
export type FootageStandingKey =
  | "not_connected"
  | "blocked"
  | "not_watching"
  | "looking"
  | "bringing_in"
  | "waits_tomorrow"
  | "waits_room"
  | "videos_full"
  | "library_full"
  | "videos_off"
  | "signed_out"
  | "connector_left"
  | "cant_open"
  | "checking_left"
  | "watching";

/** The one thing to do about a standing, where there is one. */
export type FootageAct =
  "connect" | "reconnect" | "connect_own" | "choose" | "choose_another" | "open_library" | "copy_steps";

export interface FootageStanding {
  key: FootageStandingKey;
  /** The short state: the row's badge, the card's line and the Library's line all say it. */
  badge: string;
  /** live: on its way by itself; ok: quiet and well; you: the owner's to mend; rest: nothing to do. */
  tone: "live" | "ok" | "you" | "rest";
  /** One sentence where the row folds open: what is happening and whether it mends itself. */
  say: string;
  /** The same, short, for a line with no room for the sentence (Content's card); null where the badge says it all. */
  note: string | null;
  act: FootageAct | null;
}

/** "photos and videos", counted: "1 photo or video" reads wrong, so one is "1 file". */
const filesWord = (count: number): string =>
  count === 1 ? "1 file" : `${count.toLocaleString("en-US")} photos and videos`;

/** A count with its verb in agreement: "1 waits", "40 wait". */
const waitWord = (count: number): string => `${count.toLocaleString("en-US")} ${count === 1 ? "waits" : "wait"}`;

export const FOOTAGE_WORDS = {
  /** The row's name in Settings, and the provider's name wherever it is said. */
  provider: "Google Drive",
  acts: {
    connect: "Connect",
    reconnect: "Connect again",
    connect_own: "Connect your Google account",
    choose: "Choose a folder",
    choose_another: "Choose another folder",
    open_library: "Open Library",
    copy_steps: "Copy the steps for them",
  } satisfies Record<FootageAct, string>,
  /** The folder's sheet, opened from the Library's line: its way to Settings. */
  openConnections: "Open Connections",
  /** The quiet acts at the foot of a watched folder's fold. */
  check: "Check now",
  checked: "Looking now",
  stop: "Stop watching",
  disconnect: "Disconnect",
  /** The fold's facts. */
  facts: { folder: "Folder", account: "Account", by: "Connected by", you: "You" },
  /** The Library's line under its state: which folder it is. */
  from: (folder: string) => `From ${quotedName(folder)}`,
  /** Content's card, while a folder is its only news: what comes from a folder needs no approval. */
  straight: FOOTAGE_SAID.straight,
  updated: (at: string) => `Updated ${at}`,
  /** What an organisation's admin is sent, word for word, so whoever manages it can allow the app (the plan's who-it-must-work-for table). */
  // screen-word: Google's own name for the menu, as its Admin console writes it, so the manager finds it
  adminSteps:
    "To let Chanlytics open Google Drive: in the Google Admin console, go to Security, then API controls, then Manage third-party app access. Find Chanlytics, choose Change access, and allow it to open Google Drive.",
  stepsCopied: "Copied",
} as const;

/** What fills the most of the sixty minutes, said as minutes of them: the owner's to look through first. */
const FILL_ROADS = [
  ["set_aside", "videos found online that you set aside"],
  ["found", "videos found online"],
  ["own", "videos you added"],
  ["made", "videos made here"],
] as const satisfies readonly (readonly [keyof FootageVideoMinutesDto, string])[];

function videosFillWords(videos: FootageVideoMinutesDto): string {
  const [road, words] = FILL_ROADS.reduce((most, next) => (videos[next[0]] > videos[most[0]] ? next : most));
  const minutes = Math.max(1, Math.round(videos[road] / 60));
  return `${minutes} of your ${FILE_VIDEO_MINUTES_MAX} minutes ${minutes === 1 ? "is" : "are"} ${words}.`;
}

/** The sentence for a wait that is the owner's or time's, and the short note that goes with it. */
function waitStanding(folder: FootageFolderDto): FootageStanding | null {
  const { waits } = folder.counts;
  if (waits.library_full > 0)
    return {
      key: "library_full",
      badge: "Library is full",
      tone: "you",
      say: `The Library holds ${FILES_MAX.toLocaleString("en-US")} photos and videos. ${waitWord(waits.library_full)} until some are removed.`,
      note: `${waitWord(waits.library_full)} until some are removed.`,
      act: "open_library",
    };
  if (folder.counts.coming > 0) return null;
  if (waits.budget > 0)
    return {
      key: "waits_tomorrow",
      badge: `${waitWord(waits.budget)} for tomorrow`,
      tone: "rest",
      say: `${FOOTAGE_NUMBERS.takesADay} a day come in from a folder. The rest follow tomorrow by themselves.`,
      note: "A day's allowance is used. They come in tomorrow by themselves.",
      act: null,
    };
  if (waits.room > 0 && folder.videos && folder.videos.can_step_aside <= 0)
    return {
      key: "videos_full",
      badge: "Videos are full",
      tone: "you",
      say: `${waitWord(waits.room)}, and none of your videos can step aside. ${videosFillWords(folder.videos)} Remove some to make room.`,
      note: `${waitWord(waits.room)}. ${videosFillWords(folder.videos)}`,
      act: "open_library",
    };
  if (waits.room > 0)
    return {
      key: "waits_room",
      badge: `${waitWord(waits.room)} for room`,
      tone: "rest",
      say: `Videos hold ${FILE_VIDEO_MINUTES_MAX} minutes at a time. Clips nobody used lately make room within the hour.`,
      note: "Clips nobody used lately make room within the hour.",
      act: null,
    };
  if (waits.videos_off > 0)
    return {
      key: "videos_off",
      badge: "Watching",
      tone: "ok",
      say: `Photos come in. ${FOOTAGE_SAID.videosOff}`,
      note: FOOTAGE_SAID.videosOff,
      act: null,
    };
  return null;
}

/** A folder that is being read and has nothing wrong: looking, bringing in, waiting, or quiet. */
function readStanding(folder: FootageFolderDto, clock: (iso: string) => string): FootageStanding {
  const { counts } = folder;
  if (folder.held !== null && folder.held > 0)
    return {
      key: "checking_left",
      badge: `Checking ${folder.held.toLocaleString("en-US")} that left`,
      tone: "rest",
      say: `${groupedPlural(folder.held, "file")} left ${quotedName(folder.name)} at once. Nothing was removed from your Library. Chanlytics looks again tomorrow before anything leaves.`,
      note: "Nothing was removed. Chanlytics looks again tomorrow.",
      act: null,
    };
  const waiting = waitStanding(folder);
  if (waiting) return waiting;
  if (counts.coming > 0) {
    const all = counts.landed + counts.coming;
    return {
      key: "bringing_in",
      badge:
        counts.landed > 0
          ? `Bringing in ${counts.landed.toLocaleString("en-US")} of ${all.toLocaleString("en-US")}`
          : `Bringing in ${all.toLocaleString("en-US")}`,
      tone: "live",
      say:
        counts.in > 0
          ? `${counts.in.toLocaleString("en-US")} ${counts.in === 1 ? "is" : "are"} in your Library. The rest follow, ${FOOTAGE_NUMBERS.takesAtOnce} at a time.`
          : `They come in by themselves, ${FOOTAGE_NUMBERS.takesAtOnce} at a time.`,
      note: null,
      act: null,
    };
  }
  if (folder.looking || folder.state === "setting_up")
    return {
      key: "looking",
      badge: "Looking inside",
      tone: "live",
      say:
        counts.found > 0
          ? `${filesWord(counts.found)} found so far. The newest ${FOOTAGE_NUMBERS.firstItems} come in first.`
          : `The newest ${FOOTAGE_NUMBERS.firstItems} come in first.`,
      note: null,
      act: null,
    };
  const quiet = [
    `${filesWord(counts.in)} in`,
    folder.updated_at ? FOOTAGE_WORDS.updated(clock(folder.updated_at)) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    key: "watching",
    badge: "Watching",
    tone: "ok",
    say: folder.over_listed
      ? `${quotedName(folder.name)} holds more than ${FOOTAGE_NUMBERS.itemsMax.toLocaleString("en-US")} files, so the rest isn't listed.`
      : quiet,
    note: null,
    act: null,
  };
}

/**
 * A folder that is not being read, and why, as the sync says it in one word (`stopped_why`, 00656): its account signed
 * out, its connector gone, or the folder itself shut. A paused folder with no word (kept before 00656) is read as its
 * connector gone, as it was then.
 */
function stoppedStanding(account: FootageAccountDto, folder: FootageFolderDto): FootageStanding | null {
  const holder = account.email ?? "this account";
  const paused = folder.state === "paused";
  if (account.health === "needs_reconnect" || (paused && folder.stopped_why === "signed_out"))
    return {
      key: "signed_out",
      badge: "Needs you",
      tone: "you",
      say: `Google signed ${holder} out, so nothing new comes in. What came in stays.`,
      note: `Google signed ${holder} out.`,
      act: "reconnect",
    };
  if (paused) {
    const by = account.connected_by;
    return {
      key: "connector_left",
      badge: "Paused",
      tone: "you",
      say: by
        ? `${by} connected this folder and has left the workspace. What came in stays.`
        : "Whoever connected this folder has left the workspace. What came in stays.",
      note: by ? `${by} connected it and has left.` : "Whoever connected it has left.",
      act: "connect_own",
    };
  }
  if (folder.state === "frozen")
    return {
      key: "cant_open",
      badge: "Can't open the folder",
      tone: "you",
      say: `${account.email ?? "This account"} can no longer open ${quotedName(folder.name)}. Nothing was removed. Chanlytics keeps trying, and carries on by itself once it opens.`,
      note: "Nothing was removed. Chanlytics keeps trying.",
      act: "choose_another",
    };
  return null;
}

/**
 * Where the workspace's footage stands, in one closed set and its words. `clock` says a moment as the page's clock
 * does ("2:14 PM"): the page hands its own in, and nothing here reads a clock.
 */
export function footageStandingOf(footage: FootageDto, clock: (iso: string) => string): FootageStanding {
  const { account, folder } = footage;
  if (!account)
    return {
      key: "not_connected",
      badge: "Not connected",
      tone: "rest",
      say: "New photos and videos come in from a folder by themselves.",
      note: null,
      act: "connect",
    };
  if (account.health === "blocked_by_admin")
    return {
      key: "blocked",
      badge: "Blocked for now",
      tone: "rest",
      say: "Your Google Workspace doesn't let apps open Drive yet. Whoever manages it can allow Chanlytics.",
      note: null,
      act: "copy_steps",
    };
  if (folder && folder.state !== "stopped") {
    const stopped = stoppedStanding(account, folder);
    if (stopped) return stopped;
    return readStanding(folder, clock);
  }
  if (account.health === "needs_reconnect")
    return {
      key: "signed_out",
      badge: "Needs you",
      tone: "you",
      say: `Google signed ${account.email ?? "this account"} out. Connect it again to watch a folder.`,
      note: null,
      act: "reconnect",
    };
  return {
    key: "not_watching",
    badge: "Not watching",
    tone: "rest",
    say: `Google Drive is connected${account.email ? ` as ${account.email}` : ""}. No folder is watched.`,
    note: null,
    act: "choose",
  };
}

/* ------------------------------------------------------------------------------------- the Library's one line -- */

/** The one line above the Library's list: the one thing worth knowing of the folder right now. */
export interface FootageLine {
  glyph: "folder" | "clock" | "alert";
  head: string;
  sub: string;
  tone: FootageStanding["tone"];
  act: FootageAct | null;
}

/**
 * The Library's line for a watched folder; null where there is nothing to say (no folder, or one quiet and well).
 * Only one thing is said at a time, in the standing's own order: what needs the owner, then what is full, then what
 * waits, then what is coming in.
 */
export function footageLineOf(footage: FootageDto, standing: FootageStanding): FootageLine | null {
  const { account, folder } = footage;
  if (!account || !folder || folder.state === "stopped") return null;
  const name = quotedName(folder.name);
  const line = (glyph: FootageLine["glyph"], head: string, sub: string): FootageLine => ({
    glyph,
    head,
    sub,
    tone: standing.tone,
    act: standing.act,
  });
  switch (standing.key) {
    case "looking":
    case "bringing_in":
      return line("folder", standing.badge, FOOTAGE_WORDS.from(folder.name));
    case "waits_tomorrow":
      return line("clock", standing.badge, `${FOOTAGE_NUMBERS.takesADay} a day come in from ${name}`);
    case "waits_room": {
      const clips = folder.counts.waits.room;
      return line(
        "clock",
        `${clips === 1 ? "1 clip waits" : `${clips.toLocaleString("en-US")} clips wait`} for room`,
        "They come in as room frees up, within the hour",
      );
    }
    case "videos_full":
      return line("alert", standing.badge, standing.note ?? "");
    case "library_full":
      return line(
        "alert",
        standing.badge,
        `${FILES_MAX.toLocaleString("en-US")} photos and videos at most. ${waitWord(folder.counts.waits.library_full)} until some are removed.`,
      );
    case "signed_out":
      return line("alert", "Google Drive needs you", `Google signed ${account.email ?? "this account"} out`);
    case "connector_left":
      return line("alert", `${name} is paused`, standing.note ?? "");
    case "cant_open":
      // It mends itself once the folder opens: said plainly, with nothing to press (the canvas's Content 8, Settings 10).
      return { ...line("folder", `Can't open ${name}`, standing.note ?? ""), tone: "rest", act: null };
    case "checking_left":
      return line("folder", standing.badge, standing.note ?? "");
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------------- the folder's sheet, its rows -- */

/** What a folder holds that is not in the Library, counted by where it stands and why (GET sources/contents). */
export interface FootagePassedDto {
  /** Typed by the closed sets (the review's finding 6), so a state or a cause added there is a compile error here. */
  state: SourceItemState;
  why: SourceItemWhy | null;
  videos: number;
  photos: number;
  /** The one file's name, where the count is one. */
  name: string | null;
}

/** One row of the folder's sheet: what, how many, and its reason in a sentence. Never an error. */
export interface FootageSheetRow {
  key: string;
  head: string;
  count: number;
  say: string | null;
}

/** The longest video AI can watch, in minutes, and the heaviest, in megabytes: what a passed-over file's row quotes. */
const LONGEST_MINUTES = FILE_VIDEO_SECONDS_MAX / 60;
const HEAVIEST_MB = FILE_VIDEO_BYTES_MAX / 1_000_000;

/** The row a state and cause belong to, and its sentence; null for what the sheet does not list. */
function sheetGroupOf(
  row: FootagePassedDto,
): { key: string; head: string; say: (count: number, name: string | null) => string | null } | null {
  const { state, why } = row;
  if (state === "listed")
    return {
      key: "older",
      head: `Older than ${FOOTAGE_NUMBERS.firstDays} days`,
      // Asking AI for them is the canvas's call 7 (propose_bring_in's `older`): the canvas's own sentence.
      say: () => "They stay in Drive until you ask AI for them.",
    };
  if (state === "waiting" || state === "taking") {
    if (why === "budget")
      return {
        key: "budget",
        head: "Wait for tomorrow",
        say: () => `${FOOTAGE_NUMBERS.takesADay} a day come in. The rest follow by themselves.`,
      };
    if (why === "room")
      // Never "within the hour": where nothing can step aside, only the owner makes room (the review's finding 2).
      return { key: "room", head: "Wait for room", say: () => "They come in as room frees up." };
    if (why === "library_full")
      return {
        key: "library_full",
        head: "Wait for room in the Library",
        say: () => `The Library holds ${FILES_MAX.toLocaleString("en-US")} photos and videos.`,
      };
    if (why === "videos_off")
      return { key: "videos_off", head: "Videos, not on yet", say: () => FOOTAGE_SAID.videosOff };
    return { key: "coming", head: "On their way", say: () => null };
  }
  if (state === "too_big") {
    if (why === "bytes")
      return { key: "bytes", head: "Too heavy", say: () => `Over ${HEAVIEST_MB} MB, so they stay in Drive.` };
    if (why === "pixels") return { key: "pixels", head: "Too large to open", say: () => "They stay in Drive." };
    return {
      key: "seconds",
      head: "Too long to watch",
      say: () => `Longer than ${LONGEST_MINUTES} minutes, so AI can't watch them.`,
    };
  }
  if (state === "not_media")
    return {
      key: "not_media",
      head: "Not photos or videos AI can use",
      say: () => "A camera's own format, an empty file, or a photo too small to post.",
    };
  if (state === "failed")
    return {
      key: "failed",
      head: "Couldn't be brought in",
      say: (count, name) =>
        count === 1 && name
          ? `${quotedName(name)} was tried three times. Check that it plays in Drive.`
          : "Each was tried three times. Check that they play in Drive.",
    };
  if (state === "no_access")
    return {
      key: "not_found",
      head: "Can't be found in Drive",
      say: () => "They stay in your Library until you remove them.",
    };
  if (state === "gone" || state === "outside")
    return {
      key: "removed",
      head: "Removed in Drive",
      say: () => "They leave your Library after seven days, unless a post or a video used them.",
    };
  return null;
}

/**
 * The folder's sheet: what came in, what waits and what was passed over, each with its count and its reason in plain
 * words. Rows keep one order, and a row of nothing is not drawn.
 */
export function footageSheetOf(footage: FootageDto, passed: readonly FootagePassedDto[]): FootageSheetRow[] {
  const rows: FootageSheetRow[] = [];
  const inLibrary = footage.folder?.counts.in ?? 0;
  if (inLibrary > 0) rows.push({ key: "in", head: "In your Library", count: inLibrary, say: null });
  for (const item of passed) {
    const group = sheetGroupOf(item);
    if (!group) continue;
    const count = item.videos + item.photos;
    const held = rows.find((row) => row.key === group.key);
    if (held) {
      held.count += count;
      held.say = group.say(held.count, null);
    } else rows.push({ key: group.key, head: group.head, count, say: group.say(count, item.name) });
  }
  const order = [
    "in",
    "coming",
    "budget",
    "room",
    "library_full",
    "videos_off",
    "seconds",
    "bytes",
    "pixels",
    "not_media",
    "failed",
    "not_found",
    "removed",
    "older",
  ];
  return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

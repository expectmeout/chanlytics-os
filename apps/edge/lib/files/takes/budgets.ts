/**
 * What taking footage in may spend, and how it is paced (the footage sources plan, D15): every number of a take, named
 * and in one place. These are the plan's starting values, set from what its proof measured on real clips (a clip costs
 * about 415 of Google's units; the bytes pass in seconds); each is changed here and nowhere else.
 *
 * Google gives a project 1 TB of Drive downloads and 400,000,000 units a day before it charges, and counts a day in
 * Pacific time. The database counts the same day (00643 source_take_spend), so "tomorrow" here is Google's tomorrow.
 */
import { DAY_MS, FOOTAGE_NUMBERS, HOUR_MS, MIN_MS, SECOND_MS, WEEK_MS } from "@chanlytics/contracts";

/** A million of Google's units: its quota is written in them. */
const MILLION_UNITS = 1_000_000;

/** The day's budgets: what binds a take, each with its line when it does (waits.ts). */
export const TAKE_BUDGETS = {
  /**
   * Bytes moved from providers in a day, for the whole platform: under Google's free 1 TB, with room left for a
   * broken fetch's second read and for copies brought back.
   */
  platformBytesADay: 800_000_000_000,
  /** Bytes one workspace may bring in in a day, so one business cannot spend the platform's day: forty full clips. */
  workspaceBytesADay: 20_000_000_000,
  /** Files one workspace may bring in in a day. Each is one look by AI; a first watch is fifty. */
  workspaceTakesADay: 100,
  /**
   * Google's units in a day at which takes stop. The sync's reads spend from the same 400,000,000, so the takes stop
   * well before it.
   */
  unitsADay: 300 * MILLION_UNITS,
} as const;

/**
 * A found read's pace and budget (the plan's D21): what reading an account a business names for its posts may cost in a
 * day. The day's own line beside the takes' (00643 found_read_spend, source_days.reads). An account is read once in a
 * day whatever these say.
 */
export const FOUND_READ_BUDGETS = {
  /** Reads one workspace may ask for in a day: three accounts, each once. One that stopped and is asked again is one of them. */
  workspaceReadsADay: 3,
  /** Reads the whole platform starts in a day: each is about $0.12 at the scraping platform, $0.50 at most. */
  platformReadsADay: 1000,
  /** The files one read hands on, newest first, a carousel's slides counted. */
  filesARead: 150,
} as const;

/** What one call to Drive costs in Google's units since 1 May 2026. */
export const DRIVE_UNITS = { record: 5, download: 200 } as const;

/**
 * The most takes one turn of the footage clock hands out, for every workspace together. A constant of its own so the
 * capacity page reads it (docs/capacity.md, the sources clock's second lane).
 */
const TAKES_A_TICK = 500;

/**
 * How waiting items are handed their jobs: a workspace has a few being taken at once, and the next is handed as one
 * ends, so a first watch arrives in minutes and no workspace fills the bulk lane. The clock is the floor under that.
 */
export const TAKE_HAND_OUT = {
  /** How many of a workspace's files are being taken at once. */
  inFlight: 5,
  /** The most jobs one turn of the clock writes, for every workspace together. */
  limit: TAKES_A_TICK,
  /**
   * The clips the video platform is preparing for takes at once, for every workspace together. It prepares 120 for
   * an account (queued or encoding, by its FAQ; its support can raise that) and answers the rest "too many": this
   * leaves room for what members add themselves and what is found online.
   */
  videosAtOnce: 90,
  /** A take with no file and nothing written for this long never ended: it waits again. */
  staleSeconds: (2 * HOUR_MS) / SECOND_MS,
} as const;

/** How long an item rests before it is tried again, by what it waits for. A day's budget rests until the day ends. */
export const TAKE_RESTS_MS = {
  /**
   * The videos are full and no copy may ever be let go for them (uploads, made and found videos fill them): room
   * comes when a video is removed, which releases what waits at once, so it is asked after a few times a day.
   */
  room: 6 * HOUR_MS,
  /**
   * The videos are full and a copy may be let go once its rest ends (00654 file_copies_free_at): tried again this
   * long after, so the copy has passed its rest whatever the two clocks say.
   */
  afterRest: MIN_MS,
  /** The Library is full. */
  libraryFull: 6 * HOUR_MS,
  /** The workspace takes no videos yet, or this deployment has no relay or video platform to send one through. */
  videosOff: 6 * HOUR_MS,
  /** Its folder is not being read just now (paused, or its account signed out). */
  folder: HOUR_MS,
  /** The job ran out of its time before a download could start. */
  deadline: MIN_MS,
  /** The video platform is preparing as many clips as it takes at once: asked again shortly, and no try is spent. */
  busy: 2 * MIN_MS,
} as const;

/** How long a clip's ticket runs: the video platform fetches within minutes, and asks again after a break. */
export const RELAY_TICKET_MS = 6 * HOUR_MS;

/** One read of Drive's bytes: a clip's first MiB, and a photo whole (25 MB at most). */
export const TAKE_READ_MS = { head: 15 * SECOND_MS, photo: 25 * SECOND_MS } as const;

/**
 * Bringing a watched clip's copy back to the video platform (the plan's Availability and D15): each return is a whole
 * download again, so it spends the platform's bytes and units of the day beside the takes', and a workspace has a
 * number of its own. Starting values, unmeasured: no copy has been let go or brought back on a real account by the app.
 */
export const RETURN_BUDGETS = {
  /** Copies one workspace may bring back in a day: a video made from six clips, three times over. */
  workspaceReturnsADay: 20,
} as const;

/** How a return is paced. */
export const COPY_RETURN = {
  /**
   * A return marked as begun that the video platform was never asked for (its job died in between) is begun again by
   * the next asker, or ended by the sweep, once this old.
   */
  staleSeconds: (10 * MIN_MS) / SECOND_MS,
  /** An ask that meets a copy being let go is run this much later, once the delete has landed. */
  afterGoingMs: 20 * SECOND_MS,
  /** A copy coming back that the video platform has not said its word about is asked after once this old. */
  askAfterMs: 2 * MIN_MS,
  /** One it still has not prepared by then is given up: the file stays away, and the next ask begins anew. */
  giveUpMs: HOUR_MS,
  /**
   * A copy that was asked for and found no room is asked for again by each half-hourly pass for this long, so it
   * comes back by itself once another copy's rest ends (an hour at most). Past it the next ask is a person's.
   */
  roomAskForMs: 6 * HOUR_MS,
  /** How many such copies one pass asks for again, for every workspace together. */
  roomAsksASweep: 100,
} as const;

/**
 * Letting a watched clip's copy go (the plan's D6): by room, the least recently used first, when a clip needs it; and
 * by age, with room to spare. Never an upload, a video made here or a found video (00654 file_copies_let_go).
 */
export const LET_GO = {
  /** A copy unused this long is let go even where there is room. */
  unusedMs: 2 * WEEK_MS,
  /**
   * A copy is not let go within this of its last use or of its arrival: a player's token lasts an hour, and a first
   * watch of a large folder then turns over the sixty minutes an hour at a time, not a clip at a time. A clip that
   * found them full is tried again as the first rest ends (`TAKE_RESTS_MS.afterRest`), not a room's six hours.
   */
  restMs: HOUR_MS,
  /** The most copies one read of a folder lets go by age. */
  aRead: 5,
  /** The most copies one take or return lets go to make its room. */
  forRoom: 100,
  /** A copy marked as going whose delete at the video platform never landed is finished by the sweep once this old. */
  staleMs: 10 * MIN_MS,
  /** A use is written at most this often: a clip played and shown to AI in one sitting is one write. */
  touchEveryMs: 5 * MIN_MS,
} as const;

/**
 * A made video's copy on Chanlytics' own shelf (the archive plan's B2; 00695): its job is written with its row, by the
 * door. The half-hourly pass is the floor under that: a copy still saving this long after it was last touched gets
 * its job again, a few a pass for every workspace together. Nothing should ever need it.
 */
export const SHELF_REQUEUE = {
  staleSeconds: HOUR_MS / SECOND_MS,
  aSweep: 100,
} as const;

/**
 * The seven-day cleanup (the plan's D3, as narrowed on 18 November): how long after an item was seen in its
 * provider's bin, or moved out to a place its account can see, its unused Library file leaves; and how many items
 * one half-hourly pass settles, for every workspace together.
 */
export const SOURCE_GRACE = {
  seconds: (FOOTAGE_NUMBERS.graceDays * DAY_MS) / SECOND_MS,
  aSweep: 500,
} as const;

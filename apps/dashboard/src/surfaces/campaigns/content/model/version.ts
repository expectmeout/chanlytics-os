/**
 * A made video's versions, as its screens say them (the version board, approved 23 Nov 2026 with its calls 14 and 15;
 * 00708): version 2 being made over version 1 dimmed, made and asking again, or not made with version 1 still standing; the
 * lines of the posts that wait for it; and the list of its versions, with "Post this one instead" on an older one. Pure:
 * the piece's standing hook reads it once, and the phone's viewer, the desk's pane and the sheet draw from it.
 */
import { PIECE_STAGES, isOneOf, pieceWordsIn, type PieceVersionsDto, type PostDto } from "@chanlytics/contracts";
import { GOES_WORDS, type GoesTone } from "./goes";

export const VERSION_WORDS = {
  making: (n: number) => `Making version ${n}`,
  waitsFor: (n: number) => `Waits for version ${n}`,
  waitsNote: "Nothing goes up while it's made. It takes about a minute, then it asks you.",
  madeNote: "It takes about a minute, then it's here.",
  waitsApproval: (n: number, at: string) => `Waits for version ${n}'s approval · ${at}`,
  replaced: (n: number, at: string) =>
    `Version ${n} replaced what you approved, so it waits for you before it goes up ${at}.`,
  couldnt: (n: number) => `Version ${n} couldn't be made this time`,
  stillGoes: (n: number, at: string) => `Version ${n} still goes up ${at}, as you approved it.`,
  approve: (n: number) => `Approve version ${n}`,
  again: "Try again",
  version: (n: number) => `Version ${n}`,
  approved: "What you approved",
  instead: "Post this one instead",
  play: "Play",
  versions: "Versions",
} as const;

/** What moved in a version, said as the owner reads it: a new cut, the order, the words on it, the sound. */
const CHANGED_SAID: Readonly<Record<string, string>> = {
  trim: "a new cut",
  order: "in a new order",
  layout: "new words on it",
  sound: "a new sound",
  caption: "new words under it",
};

const changedSaidOf = (changed: readonly string[]): string | null =>
  changed.map((c) => CHANGED_SAID[c]).find((said): said is string => !!said) ?? null;

/** One version as the sheet lists it. */
export interface VersionListed {
  n: number;
  title: string;
  said: string;
  fileId: string;
  current: boolean;
  /** "Post this one instead": an older version, where something of the piece waits to go up. */
  instead: boolean;
}

/** Where a made video stands as versions say it; every part null or empty where no version decides it. */
export interface VersionStanding {
  /** A new version being made: the frame dims under the three, with its number and where it is at. */
  making: { title: string; stage: string; share: number } | null;
  /** "Version 2 · a new cut", or "Version 2 couldn't be made this time": said only where there is more than one. */
  ver: string | null;
  /** The pill, where a version decides it. */
  pill: { said: string; tone: GoesTone } | null;
  /** The sentence under the pill. */
  under: string | null;
  /** The act that leads: approve this version for every place it was set for, or draw it again. */
  lead: { words: string; is: "approve" | "again" } | null;
  /** Each post that waits on a version, by its id: its line's words. */
  lines: ReadonlyMap<string, string>;
  list: VersionListed[];
}

const NO_VERSION_STANDING: VersionStanding = {
  making: null,
  ver: null,
  pill: null,
  under: null,
  lead: null,
  lines: new Map(),
  list: [],
};

/** The posts still set to go, soonest first: what waits. */
const postsStillSetOf = (posts: readonly PostDto[]): PostDto[] =>
  posts
    .filter((p) => p.status === "queued" || p.status === "preparing" || p.status === "held")
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));

/** The versions list: each drawn version, newest first, with "Post this one instead" on an older one where posts wait. */
function versionsListedOf(
  version: PieceVersionsDto,
  fileId: string,
  waits: boolean,
  when: (iso: string) => string,
): VersionListed[] {
  if (version.list.length < 2) return [];
  return version.list.map((v) => {
    const current = v.file_id === fileId;
    const what = current ? changedSaidOf(v.changed) : VERSION_WORDS.approved;
    return {
      n: v.n,
      title: VERSION_WORDS.version(v.n),
      said: [what, when(v.at)].filter(Boolean).join(" · "),
      fileId: v.file_id,
      current,
      instead: !current && waits,
    };
  });
}

/**
 * Where a made video stands by its versions: `version` is its record's (null for one with none), `posts` its posts at
 * every version, `fileId` the file open, `when` a moment said short ("Tue 6:00 PM").
 */
export function versionStandingOf(
  version: PieceVersionsDto | null | undefined,
  posts: readonly PostDto[],
  fileId: string,
  when: (iso: string) => string,
): VersionStanding {
  if (!version) return NO_VERSION_STANDING;
  const waiting = postsStillSetOf(posts);
  const soonest = waiting[0] ? when(waiting[0].scheduled_for) : null;
  const list = versionsListedOf(version, fileId, waiting.length > 0, when);
  const next = version.n + 1;
  if (version.drawing !== null) {
    const stage = isOneOf(PIECE_STAGES, version.drawing) ? version.drawing : "drawing";
    return {
      ...NO_VERSION_STANDING,
      making: {
        title: VERSION_WORDS.making(next),
        stage: pieceWordsIn("en").follows.stage[stage](0),
        share: (PIECE_STAGES.indexOf(stage) + 1) / (PIECE_STAGES.length + 1),
      },
      pill: waiting.length
        ? { said: GOES_WORDS.pill.places(VERSION_WORDS.waitsFor(next), waiting.length), tone: "live" }
        : null,
      under: waiting.length ? VERSION_WORDS.waitsNote : VERSION_WORDS.madeNote,
      lines: new Map(waiting.map((p) => [p.id, `${VERSION_WORDS.waitsFor(next)} · ${when(p.scheduled_for)}`])),
      list,
    };
  }
  const changed = version.list.find((v) => v.n === version.n)?.changed ?? [];
  const ver = list.length
    ? [VERSION_WORDS.version(version.n), changedSaidOf(changed)].filter(Boolean).join(" · ")
    : null;
  if (version.failed)
    return {
      ...NO_VERSION_STANDING,
      ver: VERSION_WORDS.couldnt(next),
      under: soonest ? VERSION_WORDS.stillGoes(version.n, soonest) : null,
      lead: { words: VERSION_WORDS.again, is: "again" },
      list,
    };
  const asking = waiting.filter((p) => version.waiting.includes(p.id));
  if (asking.length && soonest)
    return {
      ...NO_VERSION_STANDING,
      ver,
      pill: { said: GOES_WORDS.pill.changed, tone: "you" },
      under: VERSION_WORDS.replaced(version.n, soonest),
      lead: { words: VERSION_WORDS.approve(version.n), is: "approve" },
      lines: new Map(asking.map((p) => [p.id, VERSION_WORDS.waitsApproval(version.n, when(p.scheduled_for))])),
      list,
    };
  return { ...NO_VERSION_STANDING, ver, list };
}

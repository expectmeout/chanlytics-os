/**
 * Made's All under its headings (Ruben, 12 Nov 2026: Content's list stands under headings, as Sequences', Messages' and the
 * Pipeline's do): what needs the owner first, then what is being made, then what was made this week and earlier
 * (files/time-groups.ts). Status is no heading: a piece goes from ready to posting to posted in a minute, and a row that
 * changed groups under a thumb would be a list that moves by itself; where it stands is each row's own line, and the views
 * (Scheduled, Posted) narrow to one.
 *
 * A piece with a post that stopped stands under Needs you alone, never under its week as well. Pure: the page's read, the
 * zone and now are handed in.
 */
import {
  CONTENT_WORDS,
  type ContentLineDto,
  type ContentMadeDto,
  type ContentMakingDto,
  type ContentPageDto,
} from "@chanlytics/contracts";
import { timeGroupsOf } from "../../../files/time-groups";

/** One heading of Made's All and what stands under it. */
export interface MadeGroup {
  key: "needs" | "making" | "week" | "earlier";
  label: string;
  /** How many it holds, where that is known whole (files/time-groups.ts); null draws no figure. */
  count: number | null;
  /** Needs you: the posts that stopped, one line each, in the read's order. */
  lines: ContentLineDto[];
  /** Needs you: the videos that could not be made. Being made: the videos being made. */
  making: ContentMakingDto[];
  /** The pieces under it: Needs you's, once each however many of its posts stopped; a week's, newest first. */
  made: ContentMadeDto[];
}

/** The pieces a run of stopped posts is of, once each, in the order they come: the page's own piece where it holds it. */
function piecesOfLines(lines: readonly ContentLineDto[], made: readonly ContentMadeDto[]): ContentMadeDto[] {
  const held = new Map(made.map((m) => [m.file.id, m]));
  const pieces = new Map<string, ContentMadeDto>();
  for (const line of lines) {
    const id = line.file.id;
    const piece = pieces.get(id);
    if (piece && !held.has(id)) piece.posts.push(line.post);
    else if (!piece) pieces.set(id, held.get(id) ?? { file: line.file, posts: [line.post] });
  }
  return [...pieces.values()];
}

/** A list with no headings (what was found by words, or set aside), as the one group the desk's table takes. */
export const madeFlatOf = (dto: ContentPageDto): MadeGroup[] => [
  { key: "week", label: "", count: null, lines: [], making: dto.making, made: dto.made },
];

/**
 * How many stand under a group drawn as squares or as the desk's table: a piece once, however many of its posts stopped.
 * Its rows on a phone are one a post, which is the group's own count.
 */
export const piecesUnder = (group: MadeGroup): number | null =>
  group.key === "needs" ? group.making.length + group.made.length : group.count;

/** All of Made under its headings, each that holds anything, in the order a person reads them. */
export function madeGroupsOf(dto: ContentPageDto, at: { zone: string; nowMs: number }): MadeGroup[] {
  const says = CONTENT_WORDS.views.name;
  const notMade = dto.making.filter((m) => m.status === "failed");
  const beingMade = dto.making.filter((m) => m.status !== "failed");
  const stopped = new Set(dto.lines.map((line) => line.file.id));
  const rest = dto.made.filter((m) => !stopped.has(m.file.id));
  const none = { lines: [], making: [], made: [] };
  const groups: MadeGroup[] = [
    {
      key: "needs",
      label: says.needs,
      count: dto.lines.length + notMade.length,
      lines: dto.lines,
      making: notMade,
      made: piecesOfLines(dto.lines, dto.made),
    },
    { ...none, key: "making", label: says.making, count: beingMade.length, making: beingMade },
    ...timeGroupsOf(rest, (m) => m.file.created_at, { ...at, more: dto.next !== null }).map((group) => ({
      ...none,
      key: group.key,
      label: group.label,
      count: group.count,
      made: group.items,
    })),
  ];
  return groups.filter((group) => group.lines.length + group.making.length + group.made.length > 0);
}

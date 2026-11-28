/**
 * The room a figure on its way keeps, as wide as the figure its place last said (kit.css `[data-coming]`).
 *
 * A part whose figure is not read yet keeps the room of one (the sub-tabs' `count: null`), which is right for a 4 and one
 * figure short for a 41: the tab grew by the second as it landed. And a part that says no figure for a zero (a view's
 * count on the strip of views) cannot know whether one is coming at all, so it kept no room, and the tabs after it moved
 * whenever one came (Ruben, 28 Nov 2026). Neither is known before the read, but both were known the last time this device
 * drew the part: so each part that is given a name (`kept`) leaves here how many characters its figure was, none for a
 * part that said none, and a part drawn again before its read keeps exactly that much room. What moves, then, is only
 * what truly changed since: a 9 that became a 10, a count that went to nothing.
 *
 * Kept in this browser's local storage, as the height of the phone's keyboard is (motion/keyboard.ts): a few small
 * numbers under the names the pages give, never a figure itself and nothing of a customer's. A device that keeps
 * nothing (a private window) draws as a first visit does.
 */
import { useEffect } from "react";

/** Where the rooms are kept. */
const ROOMS_SLOT = "chanlytics.kept-rooms.v1";
/** The most places remembered: the oldest written goes first. */
const MOST_PLACES = 80;
/** The longest room kept: a figure past it grows its part by the rest. */
const WIDEST_ROOM = 4;

type Rooms = Record<string, number>;

/** The slot as last read, parsed once for the text it held. */
let read: { raw: string | null; rooms: Rooms } | null = null;

/** The browser's local storage, or none where there is none or it is refused. */
function roomStore(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Every room kept: read again only when the slot's text is another. */
function roomsKept(): Rooms {
  const local = roomStore();
  if (!local) return {};
  try {
    const raw = local.getItem(ROOMS_SLOT);
    if (read && read.raw === raw) return read.rooms;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const rooms: Rooms = {};
    if (parsed && typeof parsed === "object")
      for (const [place, room] of Object.entries(parsed)) if (typeof room === "number") rooms[place] = room;
    read = { raw, rooms };
    return rooms;
  } catch {
    return {};
  }
}

/** How many characters a figure takes as a part draws it; none for a part that says none. */
const roomOf = (figure: number | null): number => (figure === null ? 0 : Math.min(String(figure).length, WIDEST_ROOM));

/**
 * How many characters the figure at a place was when this device last drew it: 0 where it said none then, and undefined
 * where the device has never drawn it (or keeps nothing).
 */
export function roomKept(place: string): number | undefined {
  return roomsKept()[place];
}

/** The figure a part draws unseen to keep a room: that many noughts, in the figure's own type (kit.css). */
export const roomFigure = (room: number): string => "0".repeat(Math.max(1, Math.min(room, WIDEST_ROOM)));

/** A place and the figure it says now: null where it says none. */
export type PlaceSaid = readonly [place: string, figure: number | null];

/** Keep what each place says now, where it is not what is held; the place written last is the newest. */
function keepRooms(places: readonly PlaceSaid[]): void {
  const local = roomStore();
  if (!local) return;
  const held = roomsKept();
  const moved = places.filter(([place, figure]) => held[place] !== roomOf(figure));
  if (moved.length === 0) return;
  const next: Rooms = { ...held };
  for (const [place, figure] of moved) {
    delete next[place];
    next[place] = roomOf(figure);
  }
  const names = Object.keys(next);
  for (const old of names.slice(0, Math.max(0, names.length - MOST_PLACES))) delete next[old];
  try {
    const raw = JSON.stringify(next);
    local.setItem(ROOMS_SLOT, raw);
    read = { raw, rooms: next };
  } catch {
    /* kept for this page only */
  }
}

/**
 * Leave what a strip's parts say now for the next time they are drawn before their read. `places` holds only the parts
 * whose figure is read (a part still waiting says nothing new); none where the strip is given no name.
 */
export function useRoomsKept(places: readonly PlaceSaid[]): void {
  const key = places.map(([place, figure]) => `${place}=${figure ?? ""}`).join("|");
  useEffect(() => {
    if (places.length > 0) keepRooms(places);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what is said is in `key`: the list itself is made anew at every draw
  }, [key]);
}

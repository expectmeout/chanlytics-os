/**
 * What a made post or a video holds beyond what a list reads (GET files/[id]): how a post was made, whether it can go on
 * Google and is there, its posts on Instagram, what was heard of a video, and the plan a video Ask made was drawn by. Read as
 * the file is opened, by the file's sheet and by Campaigns › Content's open piece alike.
 *
 * Each answer is kept for the visit, by its file and what its list said of it when it was read (`recordKeyOf`), and a press on a
 * piece's tile begins its read at the first touch (readRecordAhead), so the piece opens with its record already in: drawn
 * from the list alone, its line, where it stands and its coral act moved a beat after it opened, as the record landed
 * (Ruben, 25 Nov 2026: "Picture post · made Saturday" grew "from one of your photos", a caret came, Post again went).
 */
import { useCallback, useEffect, useState } from "react";
import type { FileDto, FilePosted, PieceTakeDownDto, PieceVersionsDto, PostDto } from "@chanlytics/contracts";
import type { PieceAdStands } from "@/server/content/ad-pictures";
import { fileVerbs } from "../verbs";

/** A file's record as GET files/[id] answers it: its contracts record, with a made piece's ad and take-down beside it. */
type RecordData = Extract<Awaited<ReturnType<typeof fileVerbs.record>>, { ok: true }>["data"];

/** A record kept: the answer, what the list said of the file when it was read, and when. */
interface Held {
  data: RecordData;
  key: string;
  at: number;
}

/** How long a record read at a press is taken as the open's own, rather than read again. */
const RECORD_FRESH_MS = 30_000;

/** Every record read this visit, by its file; and the reads on their way, so a press and its open make one read. */
const recordsHeld = new Map<string, Held>();
const recordsAsking = new Map<string, Promise<Held | null>>();

/** Whether a file has a record to read: a post AI made, or a video. */
const hasRecord = (file: Pick<FileDto, "source" | "kind">): boolean => file.source === "made" || file.kind === "video";

/** What the list said of a post's places: a post that landed or stopped reads the record again. */
export const postsMovedOf = (posts: readonly Pick<PostDto, "id" | "status">[]): string =>
  posts.map((p) => `${p.id}:${p.status}`).join();

/** What a record was read for: its posts as the list had them, and what was heard of a video. */
const recordKeyOf = (file: Pick<FileDto, "kind" | "media_status" | "sound_said">, moved: string): string =>
  file.kind === "video" ? `${moved}|${file.media_status}|${file.sound_said ?? ""}` : moved;

/** Read a file's record, once at a time: a read already on its way is the one answered. */
function readRecord(id: string, key: string): Promise<Held | null> {
  const on = recordsAsking.get(id);
  if (on) return on;
  const read = fileVerbs.record(id).then(
    (answer) => {
      recordsAsking.delete(id);
      if (!answer.ok) return null;
      const kept = { data: answer.data, key, at: Date.now() };
      recordsHeld.set(id, kept);
      return kept;
    },
    () => {
      recordsAsking.delete(id);
      return null;
    },
  );
  recordsAsking.set(id, read);
  return read;
}

/** The record kept for a file as its list says it now: what an open draws first. Null where none was read for it. */
function recordHeldOf(id: string, key: string): Held | null {
  const kept = recordsHeld.get(id);
  return kept && kept.key === key ? kept : null;
}

/** The same, read lately enough to stand for the open's own read; null otherwise, and the open reads it again. */
function freshOf(id: string, key: string): Held | null {
  const kept = recordHeldOf(id, key);
  return kept && Date.now() - kept.at < RECORD_FRESH_MS ? kept : null;
}

/**
 * A piece's record read before it is opened: at the first touch of a press on it (a tile's or a row's pointer down), a beat
 * before the press opens it, and for the pieces beside the one open (content/read-ahead.ts), so a walk to them lands whole.
 */
export function readRecordAhead(file: FileDto, posts: readonly Pick<PostDto, "id" | "status">[]): void {
  const key = recordKeyOf(file, postsMovedOf(posts));
  if (hasRecord(file) && !freshOf(file.id, key)) void readRecord(file.id, key);
}

/**
 * How a post was made and where it is up, or what was heard of a video, read as its sheet opens: none of it is on the list a page
 * reads. Drawn at once from the record kept for it where there is one; nothing is said until it comes otherwise. A video's is
 * read again as what it is heard changes (its list's `sound_said`), and a post's as the page it is open on says its posts moved
 * (`moved`: a post that landed brings its See it without a reopen).
 */
export function usePostRecord(file: FileDto, moved = "") {
  const key = recordKeyOf(file, moved);
  // The answer read for this file; another file's (the piece walked from) is never said for this one.
  const [read, setRead] = useState<{ id: string; data: RecordData } | null>(null);
  // Google's post, as the page says it changed before the record is read again (piece.tsx: taken off Google).
  const [postedOver, setPostedOver] = useState<{ id: string; posted: FilePosted | null } | null>(null);
  // Read again when asked: a post on its way to Instagram says where it stands as it moves.
  const [asked, setAsked] = useState(0);
  const reread = useCallback(() => setAsked((n) => n + 1), []);
  const isRead = hasRecord(file);
  useEffect(() => {
    if (!isRead) return undefined;
    let live = true;
    const take = (kept: Held | null) => {
      if (!live || !kept) return;
      setRead({ id: file.id, data: kept.data });
      setPostedOver(null);
    };
    // A record read at the press that opened it is the open's own; asked again, or moved since, it is read again.
    const fresh = asked === 0 ? freshOf(file.id, key) : null;
    if (fresh) take(fresh);
    else void readRecord(file.id, key).then(take);
    return () => {
      live = false;
    };
  }, [file.id, isRead, key, asked]);
  // This file's answer; before it, the one kept for it as its list says it now, so an open draws whole from its first frame.
  const data = read?.id === file.id ? read.data : (recordHeldOf(file.id, key)?.data ?? null);
  const setPosted = useCallback((value: FilePosted | null) => setPostedOver({ id: file.id, posted: value }), [file.id]);
  return {
    ...recordSaysOf(data),
    ...(postedOver?.id === file.id ? { posted: postedOver.posted } : {}),
    setPosted,
    /** Whether nothing more is on its way that changes what an open says: read, or a file with no record to read. */
    settled: !isRead || data !== null,
    reread,
  };
}

/** What a file's record says, as its sheet and its open piece read it; nothing of it before it is read. */
function recordSaysOf(data: RecordData | null) {
  return {
    made: data?.made ?? null,
    connected: data?.google?.connected ?? false,
    posted: data?.google?.posted ?? null,
    sound: data?.sound ?? null,
    instagram: data?.instagram ?? null,
    // A Page's, where Facebook is offered to the workspace (pass 5); null where it is not, or from a server before it.
    facebook: data?.facebook ?? null,
    // Every post of it at every place, newest first; a server from before every place's posts were answered: Instagram's.
    posts: data ? (data.posts ?? data.instagram?.posts ?? null) : null,
    // A video Ask made: the plan it was drawn by, which Campaigns › Content makes it again from.
    video: data?.video?.plan ?? null,
    // A made piece's standing for an ad, where Ads is on: what Content's Run as an ad says.
    ad: (data?.ad ?? null) satisfies PieceAdStands | null,
    /** Whether this file's record has been read: nothing is said of a place before it is. */
    read: data !== null,
    takeDown: (data?.take_down ?? null) satisfies PieceTakeDownDto | null,
    version: (data?.version ?? null) satisfies PieceVersionsDto | null,
  };
}

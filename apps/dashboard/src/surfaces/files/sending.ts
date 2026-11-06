/**
 * The photos on their way (decision 0099): one entry a File, kept outside the pane, so a press goes on while the person moves
 * to another tab and the toast that ends it still comes. Three go at a time. Each is drawn at the head of the grid at once;
 * one that failed stays, as its picture with its words and Try again, since the File is still in memory, and the person
 * should not have to hunt through a camera roll for IMG_4417. One that arrived leaves, and the list says it from the server.
 *
 * One that arrived stays where it stands until the read that ends its run has answered, so a batch never comes apart: the list is read
 * once, at the end, and until then it has none of them (on a first add, the page would say it held nothing, under the toast saying
 * they were added). It is a photo by then, to open, and it draws the server's small picture.
 *
 * Only what is going or failed holds a picture of its own: a hundred full-size pictures on a phone is the memory the page can't spare.
 * One that arrived lets its own go as the server's comes in. A phone that locks mid-batch suspends the page and kills the sends, so the
 * screen is held awake while there is work, where the browser lets it. Nothing here is on any server until it arrives.
 */
import { useSyncExternalStore } from "react";
import { FILE_UPLOADS_AT_ONCE, FILE_WORDS as W, FILES_PAGE } from "@chanlytics/contracts";
import { refreshSurface, type FrameFlash } from "../frame-verbs";
import { surfaceValue } from "../surface-values";
import { readFilesUpTo } from "./surface";
import { fileVerbs, type AddSaid } from "./verbs";

/** How many photos go up at once. */
const SENT_AT_ONCE = 3;
/** How many times the list is read at a run's end before what arrived is left standing, and how long apart. */
const READS_AT_THE_END = 3;
const READ_AGAIN_AFTER_MS = 3000;

export interface SendingPhoto {
  key: number;
  file: File;
  state: "waiting" | "sending" | "arrived" | "failed";
  /** A picture of it to draw, from this device: while going or failed, and until the server's has come in. */
  picture: string | null;
  /** How much of it has gone, 0 to 1, where the browser can say; null before it starts. */
  sent: number | null;
  /** Why it failed. */
  message: string | null;
  /** The file it became, once it arrived. */
  id: string | null;
}

interface Sending {
  photos: readonly SendingPhoto[];
  /** What the last press could not take, in words. */
  said: string | null;
  /** How many of what is on its way have finished, for the head's button. */
  finished: number;
}

let now: Sending = { photos: [], said: null, finished: 0 };
const sendingListeners = new Set<() => void>();
let nextKey = 1;
let senders = 0;
let flashing: (f: FrameFlash) => void = () => {};
// What this run of work came to, told once at its end. A photo that failed in an earlier run is not this run's to count.
let run = { kept: 0, twins: 0, failed: 0 };
// The photos added on this visit, as they were drawn (see inLandedOrder).
let landed: readonly string[] = [];

function set(change: Partial<Sending>): void {
  now = { ...now, ...change };
  for (const told of sendingListeners) told();
}

function listenToSending(listener: () => void): () => void {
  sendingListeners.add(listener);
  return () => sendingListeners.delete(listener);
}

export const useSending = (): Sending =>
  useSyncExternalStore(
    listenToSending,
    () => now,
    () => now,
  );

const pictureOf = (file: File): string | null =>
  typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;

function letGoOf(p: SendingPhoto): void {
  if (p.picture) URL.revokeObjectURL(p.picture);
}

const swap = (key: number, change: Partial<SendingPhoto>) =>
  set({ photos: now.photos.map((p) => (p.key === key ? { ...p, ...change } : p)) });

/** Whether a photo is still on its way, rather than here or stopped. */
export const stillGoing = (p: SendingPhoto): boolean => p.state === "waiting" || p.state === "sending";

/**
 * A list in the order what was added on this visit was drawn. The server's is newest first, so a batch read back would turn itself over
 * under the eye: sent in the order it was picked, its last is the newest. What this visit did not add keeps the server's order, after it.
 */
export function inLandedOrder<T extends { id: string }>(files: readonly T[]): readonly T[] {
  if (landed.length === 0) return files;
  const rank = new Map(landed.map((id, place) => [id, place]));
  const placeOf = (f: T) => rank.get(f.id) ?? landed.length;
  return [...files].sort((one, other) => placeOf(one) - placeOf(other));
}

/* ------------------------------------------------- the screen, kept awake while there is work */

let awake: { release: () => Promise<void> } | null = null;

async function stayAwake(): Promise<void> {
  // Feature-checked and caught: a phone may refuse, on low battery, and a refusal must never stop the sends.
  const lock = (navigator as { wakeLock?: { request: (kind: "screen") => Promise<{ release: () => Promise<void> }> } })
    .wakeLock;
  if (!lock || awake) return;
  try {
    awake = await lock.request("screen");
    // The work may have ended while the browser answered.
    if (!now.photos.some(stillGoing)) sleepAgain();
  } catch {
    awake = null;
  }
}

function sleepAgain(): void {
  void awake?.release().catch(() => {});
  awake = null;
  document.removeEventListener("visibilitychange", wakeAgain);
}

// A browser lets go of the lock when the page is hidden: taken again when the person comes back.
function wakeAgain(): void {
  if (document.visibilityState !== "visible") return;
  awake = null;
  void stayAwake();
}

/* ------------------------------------------------------------------------- the sends */

function nextWaiting(): SendingPhoto | undefined {
  return now.photos.find((p) => p.state === "waiting");
}

async function sender(): Promise<void> {
  for (let p = nextWaiting(); p; p = nextWaiting()) {
    const { key, file } = p;
    swap(key, { state: "sending", picture: pictureOf(file), sent: 0 });
    const said = await fileVerbs
      .add(file, (sent) => swap(key, { sent }))
      .catch((): AddSaid => ({ kept: false, message: W.notSaved }));
    if (!said.kept) {
      run.failed++;
      swap(key, { state: "failed", message: said.message, sent: null });
      continue;
    }
    set({ finished: now.finished + 1 });
    if (said.twin) {
      // Already in the library, under its own tile.
      run.twins++;
      takeAway(key);
      continue;
    }
    run.kept++;
    swap(key, { state: "arrived", id: said.id, sent: 1 });
  }
}

/** The list has them: what arrived goes, and the list draws each where it stood. */
function handOver(arrived: readonly SendingPhoto[]): void {
  const leaving = new Set(arrived.map((p) => p.key));
  const current = now.photos.filter((p) => leaving.has(p.key));
  landed = [...current.flatMap((p) => (p.id ? [p.id] : [])), ...landed];
  current.forEach(letGoOf);
  set({ photos: now.photos.filter((p) => !leaving.has(p.key)) });
}

/**
 * The read that ends a run, and the hand-over once it has landed. One that failed, or that a shelf's press overtook, is asked again a
 * little later; past that what arrived goes on standing, since it is true, and the next run's end hands it over with its own. It asks for
 * as many as are about to be on screen, so none of a long batch drops under the end of a page.
 */
function readThenHandOver(arrived: readonly SendingPhoto[], tries = READS_AT_THE_END): void {
  const held = surfaceValue("files");
  const shown = (held?.dto.files.length ?? 0) + arrived.length;
  if (shown > FILES_PAGE) readFilesUpTo(shown);
  void Promise.resolve(refreshSurface("files")).then(() => {
    if (surfaceValue("files")?.fetchedAt !== held?.fetchedAt) handOver(arrived);
    else if (tries > 1) setTimeout(() => readThenHandOver(arrived, tries - 1), READ_AGAIN_AFTER_MS);
  });
}

/** The end of a run: the list read, and how it came out said in a toast that outlives this tab. */
function ended(): void {
  const { kept, twins, failed } = run;
  run = { kept: 0, twins: 0, failed: 0 };
  sleepAgain();
  set({ finished: 0 });
  readThenHandOver(now.photos.filter((p) => p.state === "arrived"));
  const words = [
    kept > 0 ? W.added(kept) : "",
    twins > 0 ? W.alreadyHere(twins) : "",
    failed > 0 ? W.notAdded(failed) : "",
  ].filter(Boolean);
  if (words.length) flashing({ ...(failed > 0 ? { tone: "warn" } : {}), msg: words.join(" ") });
}

/** Senders started up to the number that may run; the last to finish ends the run. */
function goOn(): void {
  if (nextWaiting()) void stayAwake().then(() => document.addEventListener("visibilitychange", wakeAgain));
  while (senders < SENT_AT_ONCE && nextWaiting()) {
    senders++;
    void sender().finally(() => {
      senders--;
      if (senders === 0) ended();
    });
  }
}

/** A press of Add: the first the press may take, and it says so if there were more. */
export function addPhotos(files: readonly File[], flash: (f: FrameFlash) => void): void {
  flashing = flash;
  const taken = files.slice(0, FILE_UPLOADS_AT_ONCE);
  set({
    said: files.length > taken.length ? W.tookFirst(taken.length, files.length) : null,
    photos: [
      ...now.photos,
      ...taken.map((file) => ({
        key: nextKey++,
        file,
        state: "waiting" as const,
        picture: null,
        sent: null,
        message: null,
        id: null,
      })),
    ],
  });
  goOn();
}

/** Try again: the whole add from a fresh start, since nothing says a signed address can be used twice. */
export function tryAgain(key: number, flash: (f: FrameFlash) => void): void {
  flashing = flash;
  const p = now.photos.find((x) => x.key === key);
  if (p) letGoOf(p);
  swap(key, { state: "waiting", message: null, picture: null });
  goOn();
}

export function tryAll(flash: (f: FrameFlash) => void): void {
  flashing = flash;
  for (const p of now.photos) if (p.state === "failed") letGoOf(p);
  set({
    photos: now.photos.map((p) =>
      p.state === "failed" ? { ...p, state: "waiting", message: null, picture: null } : p,
    ),
  });
  goOn();
}

/** A failed photo the person no longer wants on the page. */
export function takeAway(key: number): void {
  const p = now.photos.find((x) => x.key === key);
  if (p) letGoOf(p);
  set({ photos: now.photos.filter((x) => x.key !== key) });
}

/** The server's picture of one that arrived has come in: its own, full size, is let go. */
export function serverPictureIn(key: number): void {
  const p = now.photos.find((x) => x.key === key);
  if (!p?.picture) return;
  letGoOf(p);
  swap(key, { picture: null });
}

export const clearSaid = (): void => set({ said: null });

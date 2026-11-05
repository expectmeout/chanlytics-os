/**
 * The photos on their way (decision 0099): one entry a File, kept outside the pane, so a press goes on while the person moves
 * to another tab and the toast that ends it still comes. Three go at a time. Each is drawn at the head of the grid at once;
 * one that failed stays, as its picture with its words and Try again, since the File is still in memory, and the person
 * should not have to hunt through a camera roll for IMG_4417. One that arrived leaves, and the list says it from the server.
 *
 * Only what is going or failed holds a picture: a hundred full-size pictures on a phone is the memory the page can't spare. A
 * phone that locks mid-batch suspends the page and kills the sends, so the screen is held awake while there is work, where
 * the browser lets it. Nothing here is on any server until it arrives.
 */
import { useSyncExternalStore } from "react";
import { FILE_UPLOADS_AT_ONCE, FILE_WORDS as W } from "@chanlytics/contracts";
import { refreshSurface, type LegacyFlash } from "../../legacy-verbs";
import { fileVerbs, type AddSaid } from "./verbs";

/** How many photos go up at once. */
const SENT_AT_ONCE = 3;

export interface SendingPhoto {
  key: number;
  file: File;
  state: "waiting" | "sending" | "failed";
  /** A picture of it to draw, while going or failed. */
  picture: string | null;
  /** Why it failed. */
  message: string | null;
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
let flashing: (f: LegacyFlash) => void = () => {};
// What this run of work came to, told once at its end.
let run = { kept: 0, twins: 0 };

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
    if (!now.photos.some((p) => p.state !== "failed")) sleepAgain();
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
    swap(key, { state: "sending", picture: pictureOf(file) });
    const said = await fileVerbs.add(file).catch((): AddSaid => ({ kept: false, message: W.notSaved }));
    if (!said.kept) {
      swap(key, { state: "failed", message: said.message });
      continue;
    }
    if (said.twin) run.twins++;
    else run.kept++;
    const gone = now.photos.find((x) => x.key === key);
    if (gone) letGoOf(gone);
    set({ photos: now.photos.filter((x) => x.key !== key), finished: now.finished + 1 });
  }
}

/** The end of a run: the list read, and how it came out said in a toast that outlives this tab. */
function ended(): void {
  const failed = now.photos.length;
  const { kept, twins } = run;
  run = { kept: 0, twins: 0 };
  sleepAgain();
  set({ finished: 0 });
  void refreshSurface("files");
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
export function addPhotos(files: readonly File[], flash: (f: LegacyFlash) => void): void {
  flashing = flash;
  const taken = files.slice(0, FILE_UPLOADS_AT_ONCE);
  set({
    said: files.length > taken.length ? W.tookFirst(taken.length, files.length) : null,
    photos: [
      ...now.photos,
      ...taken.map((file) => ({ key: nextKey++, file, state: "waiting" as const, picture: null, message: null })),
    ],
  });
  goOn();
}

/** Try again: the whole add from a fresh start, since nothing says a signed address can be used twice. */
export function tryAgain(key: number, flash: (f: LegacyFlash) => void): void {
  flashing = flash;
  const p = now.photos.find((x) => x.key === key);
  if (p) letGoOf(p);
  swap(key, { state: "waiting", message: null, picture: null });
  goOn();
}

export function tryAll(flash: (f: LegacyFlash) => void): void {
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

export const clearSaid = (): void => set({ said: null });

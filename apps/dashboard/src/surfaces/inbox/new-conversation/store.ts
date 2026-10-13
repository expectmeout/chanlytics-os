/**
 * Whether the new conversation sheet is open, and for whom (a conversation begins from the Inbox). A plain store, as
 * the head's standing is (kit/head/standing.ts): the button that opens the sheet is drawn by the frame's head, and the
 * sheet by the page under it, so neither can hold the other's state. One sheet for the Inbox's three tabs.
 */
import { useSyncExternalStore } from "react";
import type { ConsentChannel } from "@chanlytics/contracts";

interface NewConversationAsk {
  open: boolean;
  /** The person it opens on, where a door named one (their page's Start a conversation); null opens on the pick. */
  personId: string | null;
  /** The wire it opens on, where a door named one (their page's Text them, Email them); null takes the reach read's. */
  wire: ConsentChannel | null;
  /** Counts each opening, so the sheet drawn for one starts from nothing of the last. */
  session: number;
}

const NEVER: NewConversationAsk = { open: false, personId: null, wire: null, session: 0 };
let asked: NewConversationAsk = NEVER;
const watchers = new Set<() => void>();

const tellAsked = (): void => {
  for (const fn of watchers) fn();
};
const onAsked = (fn: () => void): (() => void) => {
  watchers.add(fn);
  return () => watchers.delete(fn);
};
const askedNow = (): NewConversationAsk => asked;
const neverAsked = (): NewConversationAsk => NEVER;

/** Open the sheet: on the pick, or on one person, and on the wire a door named. */
export function openNewConversation(personId: string | null = null, wire: ConsentChannel | null = null): void {
  asked = { open: true, personId, wire, session: asked.session + 1 };
  tellAsked();
}

/** Close it. What it held stays drawn while it leaves (the kit's sheet plays its way out). */
export function closeNewConversation(): void {
  if (!asked.open) return;
  asked = { ...asked, open: false };
  tellAsked();
}

/** What is asked of the sheet, drawn again when it changes. */
export function useNewConversation(): NewConversationAsk {
  return useSyncExternalStore(onAsked, askedNow, neverAsked);
}

/** What is asked of the sheet, read once: for the page's key, and for a test. */
export const newConversationAsked = (): NewConversationAsk => asked;

let warmer: (() => void) | null = null;

/** The frame's host says how the sheet is loaded ahead of a press; what it answers takes that back. */
export function onWarmAsked(warm: () => void): () => void {
  warmer = warm;
  return () => {
    if (warmer === warm) warmer = null;
  };
}

/** A pointer or focus has reached the act: load the sheet now, so a press finds it. Nothing where no host is drawn. */
export function warmNewConversation(): void {
  warmer?.();
}

"use client";

/**
 * The browser's Supabase client where the frame reaches for it (the live feed, a voice session's fresh token, a second
 * factor), as a chunk of its own, fetched once and shared by every caller. Carried in the frame, @supabase/ssr and the
 * client it makes (auth, realtime, storage, functions, postgrest) were 79 KB, compressed, that every first load parsed
 * before any page could draw (the loadability review, 19 Oct 2026); each caller was already asynchronous. A fetch that
 * fails is asked for again by the next caller.
 */
import { codeOnce } from "../code-once";

/** The client's code: fetched on the first call, the same fetch for every caller after it. */
export const clientCode = codeOnce(() => import("./client"));

/** A browser client, once its code is in. */
export async function browserClient(): Promise<ReturnType<typeof import("./client").createClient>> {
  return (await clientCode()).createClient();
}

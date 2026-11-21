import "server-only";
import { randomUUID } from "node:crypto";
import { SECOND_MS } from "@chanlytics/contracts";
import { endAdDraftWriting, findAdDraft, markAdDraftWriting } from "@chanlytics/db/ads";
import { logAndGoOn } from "@chanlytics/log";
import { stableJson, type ReaderContext } from "../shared/reader";
import type { AdDraftState } from "./draft-shape";

/**
 * The ad writer, asked once for a draft's words (the Ads plan's G18; 00669). New ad asks for the words of a draft that
 * has none, and a reload, a second device or another member opening it while the writer is out sees a draft with no
 * words yet and asks again. So an ask marks itself the kept draft's writer, for the words it writes; an ask for the
 * same words that finds one out waits for it, and answers the words it keeps. The wait is bounded: past it, or once the
 * writer came back with nothing, the ask writes its own. An ask for other words (another picture, Take the price out)
 * is no duplicate, and takes the mark over.
 */

/**
 * How long another ask waits for a writer out for the same words: past New ad's real calls through the gateway (15 to
 * 20 seconds, measured 21 November 2026), and well inside the words route's minute, so an ask that waited still has
 * the time to write its own.
 */
const WRITER_HELD_MS = 30 * SECOND_MS;
/** How often a waiting ask looks whether the writer is back. */
const WRITER_LOOK_MS = SECOND_MS / 2;

/** One ask for a draft's words: its own id, and the words it writes, as the mark names them. */
interface AdWriting {
  ask: string;
  words: string;
}

/**
 * The words an ask writes, as the mark names them: for the service and the picture they are written about, with the
 * price or without. Two asks with the same name would write the same words.
 */
export const adWordsFor = (draft: Pick<AdDraftState, "service" | "picture">, noPrice: boolean): string =>
  stableJson({ service: draft.service.trim().toLowerCase(), picture: draft.picture, price: !noPrice });

/** A new ask for a draft's words. */
export const newAdWriting = (draft: AdDraftState, noPrice: boolean): AdWriting => ({
  ask: randomUUID(),
  words: adWordsFor(draft, noPrice),
});

/** Where an ask stands: the draft's writer now, or waiting for the one out (`out`), or neither (no draft kept). */
interface AdWriterHeld {
  held: boolean;
  out: { ask: string; until: string } | null;
}

/** This ask marked as the kept draft's writer, or the one out for the same words. A mark that cannot be made is none. */
export async function holdAdWriter(rc: ReaderContext, writing: AdWriting): Promise<AdWriterHeld> {
  const marked = await markAdDraftWriting(rc.ctx.supabase, rc.tenantId, {
    ask: writing.ask,
    for: writing.words,
    until: new Date(Date.now() + WRITER_HELD_MS).toISOString(),
  }).catch(logAndGoOn("an ad's writer marked", null));
  if (marked === null) return { held: false, out: null };
  return marked.held ? { held: true, out: null } : { held: false, out: marked.out };
}

/** Until the writer out is back (its mark gone or taken over), its time is up, or this ask's own `deadline` comes. */
export async function waitForAdWriter(
  rc: ReaderContext,
  out: { ask: string; until: string },
  deadline: number,
): Promise<void> {
  const until = Math.min(Date.parse(out.until), deadline);
  for (let now = Date.now(); now < until; now = Date.now()) {
    await new Promise((resolve) => setTimeout(resolve, WRITER_LOOK_MS));
    const row = await findAdDraft(rc.ctx.supabase, rc.tenantId).catch(logAndGoOn("an ad's writer looked for", null));
    if (row?.writing_ask !== out.ask) return;
  }
}

/** The writer this ask marked is back: its mark goes. One that cannot be let go ends with its time. */
export async function letGoAdWriter(rc: ReaderContext, ask: string): Promise<void> {
  await endAdDraftWriting(rc.ctx.supabase, rc.tenantId, ask).catch(logAndGoOn("an ad's writer let go", undefined));
}

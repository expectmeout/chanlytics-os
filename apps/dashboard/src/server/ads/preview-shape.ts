/**
 * What GET ads/preview takes and answers (preview.ts): the shape New ad's screen reads beside its own drawing of the ad.
 * Types and one schema, so the browser reads them with nothing of the server.
 */
import { z } from "zod";

/** Where an ad made here shows, as New ad names each: Facebook's feed, stories and Reels. */
export type AdPreviewPlace = "feed" | "story" | "reel";

/** GET ads/preview?version=: which of the kept draft's versions, from 0. */
export const AdPreviewQuery = z.object({ version: z.coerce.number().int().min(0).max(2) });

/** Meta's own frame of one place: its preview page, and the size its page draws the place at, where that is known. */
export interface AdPreviewFrame {
  src: string;
  width: number | null;
  height: number | null;
}

/**
 * Why a place shows Chanlytics' own drawing and not Meta's: Meta can't be asked from here, or answered in a shape this
 * page can't read (both said as the plain drawing); the account is not connected,
 * or Meta needs it connected again; the picture is a video, which Meta's preview is not asked for yet; Meta did not
 * answer, or is holding the account back; or Meta said no.
 */
export type AdPreviewWhy = "not_here" | "not_connected" | "signed_out" | "video" | "busy" | "refused";

/** What GET ads/preview answers. */
export interface AdPreviewAnswer {
  /**
   * What Meta was asked to draw: the picture's id and the version's words, as the kept draft holds them. The screen shows
   * Meta's frame only beside the same picture and words. Null where the draft has no such version yet.
   */
  drew: { picture: string; text: string; headline: string } | null;
  /** Meta's frame for each place it drew. */
  frames: Partial<Record<AdPreviewPlace, AdPreviewFrame>>;
  /** Why a place has no frame of Meta's; null where every place has one. */
  why: AdPreviewWhy | null;
}

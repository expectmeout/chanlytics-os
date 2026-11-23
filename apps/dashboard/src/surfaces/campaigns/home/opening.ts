/**
 * The view a load of Campaigns opens on, drawn once: its code fetched beside the frame's own, as the frame's module is read
 * (FrameApp), and the page's first draw held for it (surface-status firstDrawWaitsFor), with Forms' list beside its code.
 *
 * On the phone sweep of 22 Nov 2026 a load on Content drew the page's frame, then the box that says a view is reading, then
 * the view 0.3 s later (0.8 s on a slow phone): its reads had come back a second before, and its code was asked for only as
 * the page was drawn. The Library waited for a second chunk after that (+0.5 s, 2.3 s on a slow phone), Forms read its list
 * only once its code was in (+0.5 s, 2.2 s), and an Ads address where Ads is not drawn waited for Sequences' code in its
 * place (+0.3 s, 1.2 s). Held no longer than any first draw is (ROUTE_WAIT_MS): a chunk that has not come by then is drawn
 * as it lands, as before, from the box that says it is reading.
 */
import { firstDrawWaitsFor, surfacesSettled } from "@/bridge/surface-status";
import { refreshSurface } from "../../frame-verbs";
import { surfaceValue } from "../../surface-values";
import { adsShown } from "../ads/shown";
import { libraryCode } from "../content/library-code";
import { readFormsOpening } from "../forms/opening";
import { adsCode, contentCode, formsCode, sequencesCode } from "./campaigns-code";

/** Campaigns' address, and its second word: which view it draws. */
const CAMPAIGNS_ADDRESS = /^campaigns(?:\/([^/]*))?/;

/** The code, and Forms' list, that the view an address of Campaigns draws first is made of; null off Campaigns. */
function openingOf(route: string): Promise<unknown> | null {
  const m = CAMPAIGNS_ADDRESS.exec(route);
  if (!m) return null;
  const word = m[1] ?? "";
  if (/^content:library(:|$)/.test(word)) return Promise.all([contentCode(), libraryCode()]);
  if (/^content(:|$)/.test(word)) return contentCode();
  if (/^forms(:|$)/.test(word)) return Promise.all([formsCode(), readFormsOpening()]);
  // Ads where it is drawn, else Sequences in its place: the settings read says which, and the first draw waits for it already.
  if (/^ads(:|$)/.test(word))
    return surfacesSettled(["settings"]).then((): Promise<unknown> => (adsShown() ? adsCode() : sequencesInAdsPlace()));
  return sequencesCode();
}

/**
 * Sequences where an Ads address names a workspace that draws no Ads: its code and its list, which nothing else reads on an Ads
 * address (the address opens on the settings read and Ads' own reads, never Sequences' list), so the page stood with its strip
 * and New over an empty list for as long as it was open.
 */
function sequencesInAdsPlace(): Promise<unknown> {
  return Promise.all([sequencesCode(), surfaceValue("sequences") === undefined ? refreshSurface("sequences") : null]);
}

/** A load's address, where it is Campaigns: the view it opens on fetched now, and the page's first draw held for it. */
export function campaignsOpensOn(route: string): void {
  const opening = openingOf(route);
  if (opening) firstDrawWaitsFor("campaigns", opening);
}

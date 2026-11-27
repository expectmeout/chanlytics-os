/**
 * The reads over days a write can leave stale (Reports' lenses, Today's headline, the panes that read only where they are
 * drawn): read again where the page is on screen, forgotten elsewhere (ifDrawn). refresh-map.ts's tables name them.
 */
import { broadcastsOverride } from "@/surfaces/campaigns/broadcasts/surface";
import { calendarRunsOverride } from "@/surfaces/calendar/runs-surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { sequencesOverride } from "@/surfaces/campaigns/sequences/surface";
import { forgetReports, reportsOverride } from "@/surfaces/reports/surface";
import { headline } from "@/surfaces/reports/headline";
import { reportsCampaigns as reportsCampaignsLens } from "@/surfaces/reports/campaigns-surface";
import { receptionist as receptionistLens } from "@/surfaces/reports/receptionist-surface";
import { reviews as reviewsLens } from "@/surfaces/reports/reviews-surface";
import { todayPinsOverride } from "@/surfaces/today/pins-surface";
import { askMemoryOverride } from "@/surfaces/settings/memory/surface";
import { filesOverride } from "@/surfaces/files/surface";
import { contentOverride } from "@/surfaces/campaigns/content/surface";
import { weekOverride } from "@/surfaces/campaigns/content/week/surface";
import { askMorningOverride } from "@/surfaces/today/ask-morning-surface";
import { replyDraftsOverride } from "@/surfaces/today/need-you/drafts-surface";
import type { SurfaceOverride } from "../surface-data";
import { leadsOverride } from "@/surfaces/leads/override";
import { drawnHere, ownsTheScreen } from "../surface-registry";
import { routeOnScreen } from "../workspace";

/** A read that counts over days, held by range (period-surface.ts): a Reports lens, or Today's headline. */
interface PeriodRead {
  override: SurfaceOverride;
  forget(): void;
  outdate(): void;
}
/**
 * The one rule for a read over days that a write made wrong and the live feed does not tell of. Where its page is on screen, nothing
 * else would read it, so it is read again at once; every range it holds is dropped, but the numbers drawn stay until the read that
 * replaces them lands, so a band or a lens does not blank for the length of a read on every reply. Anywhere else it is forgotten, and
 * its page reads it as it comes on screen. Each lens below is named once by each write that moves it, through the composite lists: a
 * list that holds another does not name it twice.
 */
export const ifDrawn = (lens: PeriodRead) => (): SurfaceOverride[] => {
  if (typeof window !== "undefined" && ownsTheScreen(lens.override.key, routeOnScreen())) {
    lens.outdate();
    return [lens.override];
  }
  lens.forget();
  return [];
};
// What the Receptionist lens says is made wrong by a verb on a conversation (only the conversation changes, and a reply or a resolved
// escalation moves "waiting on you"), the zone (its days), the hours and the closures ("while you were closed").
export const receptionist = ifDrawn(receptionistLens);
// What the Campaigns lens says is made wrong by a yes or a stop (the people it counts as answers), a reply or a resolved escalation
// ("replies waiting on you"), a run approved, skipped or made ("runs waiting" and the funnel), a number connected or its standing ("your
// number") and the zone (its days). Its page is the lens, or the Overview, which draws it for one fact (the feed hears the lens's tables
// only on the lens, and tells it of none of these writes).
export const reportsCampaigns = ifDrawn(reportsCampaignsLens);
// What Today's week line and Ask found's leaks say goes wrong with a reply or a resolved escalation (one unanswered fewer each), a
// visit marked, and the calendar link or the zone saved (the booking pair, and the Booking gap line it makes). Today draws it.
export const headlineIfDrawn = ifDrawn(headline);
// The counts of the lists pinned to Today (surfaces/today/pins-surface.ts; R10), where Today is on screen, and left for it elsewhere:
// a write the feed does not tell (a person erased takes their messages) moves them.
export const pinsIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([todayPinsOverride]) : [];
// What Ask remembers (settings/memory/surface.ts; decision 0070), where Settings › Memory is on screen: a line kept, changed or
// forgotten there, or by a card's Undo in the Line. Elsewhere the pane reads it as it comes on screen, once it has aged.
export const memoryIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([askMemoryOverride]) : [];
// A business's files (files/surface.ts; decision 0099), where the pane is drawn: nothing else a page draws reads them.
export const filesIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([filesOverride]) : []);
// What Ask made (campaigns/content/surface.ts), where Campaigns › Content is drawn: a made file's change, a post sent or stopped.
const contentIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([contentOverride]) : []);
export const filesAndContentIfDrawn = (): SurfaceOverride[] => [...filesIfDrawn(), ...contentIfDrawn()];
// The Week (campaigns/content/week/surface.ts), where it or Settings › Content is drawn: a week asked for, approved, a slot
// set, a claim or what posts are for kept; and Made beside it, which a week's making fills.
export const weekIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([weekOverride]) : []);
export const weekAndContentIfDrawn = (): SurfaceOverride[] => [...weekIfDrawn(), ...contentIfDrawn()];
export const postMoved = (): SurfaceOverride[] => [...contentIfDrawn(), ...calendarRunsIfDrawn()];
// Ask's morning (today/ask-morning-surface.ts; decision 0070; its cards rows of Need you, 0071), where Today is on screen: a card of the morning's turn
// pressed in the Line, or on Today itself, leaves the cards Today offers, so none is drawn with a press it no longer takes.
export const morningIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([askMorningOverride]) : [];
// The drafts Ask kept for Need you's rows (today/need-you/drafts-surface.ts; decision 0071), where Today is on screen: read again behind a
// draft written, so what the surface holds, and the cache with it, is what the rows show, and a reload draws the new words at once.
export const draftsIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([replyDraftsOverride]) : [];
// The Sequences list counts a batch's replies by their messages (0060): a person erased takes theirs with them. Read where it
// is drawn, left for its page elsewhere.
export const sequencesIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([sequencesOverride]) : [];
// One held email answered moves its run and its lead, never its chain (the row's counts are its report, read on open), and
// the Needs you of its sequence where the Sequences page is drawn; its rewrite's check, now, and its Undo the same (00505).
export const heldEmailMoves = () => [broadcastsOverride, playbooksOverride, leadsOverride, ...sequencesIfDrawn()];
// What the Reviews lens says of a review's reply mode (whether its composer asks the receptionist for a draft) is made wrong by a mode
// saved, which is saved on Autonomy or from a chip, never from the lens: read where the lens is on screen, forgotten elsewhere
// (the wiring's second audit, W-review-facts-rules-9: a mode saved read the lens nobody had open).
export const reviewsIfDrawn = ifDrawn(reviewsLens);
// What the Reports overview says (the report, its booking line and its Deals section) is made wrong by a deal recorded, the zone saved
// and a visit marked, and not by a message, which the feed tells it of while it is open. Made from Reports it is read again at once;
// from anywhere else it is forgotten, and Reports reads it as it comes on screen, as the lenses are.
export const reportsIfDrawn = (): SurfaceOverride[] => {
  forgetReports();
  return typeof window !== "undefined" && ownsTheScreen("reports", routeOnScreen()) ? [reportsOverride] : [];
};
// The Calendar's campaign marks (runs-surface.ts), where the Calendar is drawn: left for it elsewhere.
export function calendarRunsIfDrawn(): SurfaceOverride[] {
  return typeof window !== "undefined" ? drawnHere([calendarRunsOverride]) : [];
}

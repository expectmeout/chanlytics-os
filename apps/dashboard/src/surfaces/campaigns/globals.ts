/**
 * The three things of Campaigns that pages which have not moved still draw or read, under the names they read (decision
 * 0015, step 7). Leads draws the door to a reach-out and, through it, the sheet; Today words a receipt with the time a send
 * really goes. Nothing here is behaviour: it is the surface's own components and words, exactly as it draws them. The app
 * publishes it from seed-globals.ts, before any page loads, and it is deleted with the last page that reads a name (Leads,
 * then Today).
 */
import { bcWhenWords } from "./broadcasts/when";
import { ReachOutDoor } from "./reach-out/door";
import { ReachOutSheet } from "./reach-out/sheet";

export const CAMPAIGN_GLOBALS = { bcWhenWords, ReachOutDoor, ReachOutSheet };

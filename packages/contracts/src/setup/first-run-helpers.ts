/**
 * The first run's rules and words, as one object the page reads (and the bridge publishes as window.__firstRun): the
 * steps (first-run.ts), Today's card (first-run-card.ts), the receptionist so far (first-run-receptionist.ts), and each
 * step's own (the phone, where it answers, going live, the test call, the live summary). A module of its own since
 * decision 0073, so the card, which reads the steps, and the steps never import each other through it.
 */
import { formatPhoneDisplay } from "../shared/phone";
import { bookingPageOffered } from "../google/google";
import { checkChipsOf } from "./check-chips";
import { firstRunOf, FIRST_RUN_WORDS } from "./first-run";
import { setupCardOf } from "./first-run-card";
import { receptionistCardOf, soundsWords } from "./first-run-receptionist";
import { areaCodeOf, firstRunPhoneOf, FIRST_RUN_PHONE_WORDS } from "./first-run-phone";
import { forwardingCarrierOf } from "../voice/forwarding";
import { firstRunChannelsOf, FIRST_RUN_CHANNELS_WORDS } from "./first-run-channels";
import { firstRunGoLiveOf, FIRST_RUN_GOLIVE_WORDS } from "./first-run-golive";
import { firstRunTryOf, FIRST_RUN_TRY_WORDS, TRY_QUIET_AFTER_MS } from "./first-run-try";
import { firstRunLiveOf, FIRST_RUN_LIVE_WORDS } from "./first-run-live";
import { importLinesOf, IMPORT_WORDS } from "../imports/ledger";
import { CHANNELS_SEEN, GOOGLE_CONNECT_LATER, RECEPTIONIST_MET, REHEARSE_SKIPPED, TRY_SKIPPED } from "./setup";
import { FIRST_RUN_LANDED_KEY } from "./first-run-door";

export const FIRST_RUN_HELPERS = {
  of: firstRunOf,
  receptionist: receptionistCardOf,
  /** "Tamsin · Warm · Ava": how the receptionist sounds, in one line. */
  sounds: soundsWords,
  todayCard: setupCardOf,
  chips: checkChipsOf,
  bookingPageOffered,
  /** The phone (first-run-phone.ts): chosen at Where it answers, bought and forwarded at Go live. */
  phone: firstRunPhoneOf,
  phoneWords: FIRST_RUN_PHONE_WORDS,
  areaCodeOf,
  /** Where it answers (first-run-channels.ts): the tiles, the clients' file, the dashboard filling in. */
  channels: firstRunChannelsOf,
  channelsWords: FIRST_RUN_CHANNELS_WORDS,
  /** Go live (first-run-golive.ts): pay, switch it on, live. */
  goLive: firstRunGoLiveOf,
  goLiveWords: FIRST_RUN_GOLIVE_WORDS,
  /** The owner's own call (first-run-try.ts): the proof the number answers, at Go live. */
  tryIt: firstRunTryOf,
  tryWords: FIRST_RUN_TRY_WORDS,
  tryQuietAfterMs: TRY_QUIET_AFTER_MS,
  trySkipped: TRY_SKIPPED,
  /** The member's own marks (decision 0073): went on from Your receptionist; skipped Rehearse; went on from Where it
   *  answers with no number to choose. */
  receptionistMet: RECEPTIONIST_MET,
  rehearseSkipped: REHEARSE_SKIPPED,
  channelsSeen: CHANNELS_SEEN,
  /** Not now on Connect it to Google (decision 0073, R17). */
  googleConnectLater: GOOGLE_CONNECT_LATER,
  /** Live (first-run-live.ts): the summary, the greeting and Finish; "It will / Not yet" is the Business tab's card. */
  live: firstRunLiveOf,
  liveWords: FIRST_RUN_LIVE_WORDS,
  /** What was brought in (imports.ts): a line per source. */
  imports: importLinesOf,
  importWords: IMPORT_WORDS,
  /** The carrier whose codes the answers choose (first-run-phone.ts), which the forwarding is saved with. */
  forwardingCarrierOf,
  /** A number as the app writes one (phone.ts): the numbers offered to pick are said this way, never Twilio's. */
  numberWords: formatPhoneDisplay,
  words: FIRST_RUN_WORDS,
  landedKey: FIRST_RUN_LANDED_KEY,
} as const;

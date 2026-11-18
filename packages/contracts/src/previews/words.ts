/**
 * Every word a lead's own preview's page says (decision 0079), in the owner's voice, the AI called AI as every screen
 * calls it (docs/words.md; the greeting a customer hears keeps decision 0051's own words): its head, the chat, what it
 * knows, its foot, and its states. A module of words alone, so the page that draws them carries nothing else of
 * contracts' (leads/preview.ts says which state is which, on the server).
 */
import { MIN_MS, SECOND_MS } from "../shared/time";
import { PREVIEW_FACT_NAMES } from "./tried";

/** The seconds of a minute, as a call's length is said ("1:12"). */
const MINUTE_S = MIN_MS / SECOND_MS;

export const LEAD_PREVIEW_WORDS = {
  /** The tab's title and the page's heading. */
  title: (business: string) => `AI for ${business.trim()}`,
  /** The tab's title where the business has no name to give it. */
  chip: "Preview",
  /** Under their name: what this is and what to do. */
  ready: "AI is ready to answer for you. Call it or text it the way a customer would.",
  madeFrom: "Set up by Chanlytics from your Google listing and website.",

  /** Over the questions on the field. */
  tryAsking: "Try asking",
  /**
   * What it says first in the chat, as their business: shown, never stored or counted. Decision 0051's rule rides it:
   * a name is never said without "the automated assistant".
   */
  textGreeting: (business: string, assistant: string | null) => {
    const name = (assistant ?? "").replace(/\s+/g, " ").trim();
    const iAm = name ? `I'm ${name}, the automated assistant` : "I'm the automated assistant";
    return `Hi, this is ${business.trim()}. ${iAm}. What can I help you with?`;
  },
  textLabel: "Write what a customer would ask",
  send: "Send",
  writing: "Writing…",
  you: "You",
  it: "AI",
  /**
   * Under an answer: what a live conversation would do with it, said for the business trying it (Try it's own sentence
   * is an owner's, of settings a business that has not signed up does not have).
   */
  then: {
    sends: "A real customer gets this right away.",
    waits: "A real customer gets this after a short wait, unless you stop it.",
    yours: "This one comes to you to answer.",
  },
  left: (n: number) => (n === 1 ? "1 message left" : `${n} messages left`),
  failed: "It couldn't answer just now. Try again in a moment.",
  spent: "That's all a preview answers. Make it yours to keep going.",
  kept: "Only you and Chanlytics see what you say here.",

  /** Under Call it: the one thing the browser does first, so its question is no surprise. */
  micFirst: "Your browser asks for the microphone, like any call.",
  /** Where the browser has no microphone to give (a mail app's own): how the call can still be made. */
  noMic: "To call it, open this page in your browser.",
  /** On the call's screen: how long one runs. */
  callMax: (ms: number) => `A preview call runs up to ${Math.round(ms / MIN_MS)} minutes.`,
  /** A call, as a line of the conversation: how long it ran, and who answered. */
  called: (seconds: number) =>
    `You called it · ${Math.floor(seconds / MINUTE_S)}:${String(Math.round(seconds % MINUTE_S)).padStart(2, "0")}`,
  calledSub: "AI answered as your business",
  endShort: "End",
  callStart: "Call it",
  connecting: "Connecting…",
  live: "On the call",
  end: "End the call",
  mute: "Mute",
  unmute: "Unmute",
  mic: "Allow the microphone when your browser asks: it's how it hears you.",
  micBlocked: "Your browser kept the microphone off. You can type instead.",
  callFailed: "The call couldn't start. Try again, or type instead.",
  dropped: "The call dropped. You can call again.",
  heard: "Heard it? Make it mine.",
  callRunning: "A call is still running. End it first, or wait a minute.",
  callUsed: "That's all a preview calls. Make it yours to keep talking.",
  callLeft: (ms: number) => {
    const min = Math.floor(ms / MIN_MS);
    return `${min} minute${min === 1 ? "" : "s"} of calls left`;
  },

  knowsTitle: "What it knows",
  knowsAll: "See all",
  knowsSub: "Read by Chanlytics from your Google listing and website. Fix what's off and it answers with yours.",
  knowsDone: "Done",
  /** A fact the listing or the site never had: where it was looked for, and what its absence costs. */
  missing: { google: "Not on your listing", site: "Not on your site" },
  missingWhy: {
    hours: "Without them, it can't say when you're open.",
    services: "Without them, it can't say what you do.",
  },
  fix: "Fix",
  add: "Tell it",
  sayOff: "Say what's off",
  sayOffLabel: "What's off?",
  save: "Save",
  cancel: "Cancel",
  from: { google: "From Google", site: "From your site", you: "From you" },
  rows: PREVIEW_FACT_NAMES,
  notRight: "Not right",
  notRightLabel: "What's right? (optional)",
  notRightSend: "Send",
  notRightThanks: "Thanks. You can fix it in a minute once it's yours.",
  /** After a fact is put right on the page, and where it cannot take another thing told. */
  teachTitle: "Tell it something",
  /** Under an answer that would come to them: the press that turns the field to telling it. */
  tellWhat: "Tell it what to say",
  telling: "Telling AI",
  tellingStop: "Stop telling AI",
  tellingNote: "A price you give is yours to say.",
  toldUses: "It uses this from its next answer",
  askAgain: "Repeat the question",
  teachSub: "It uses it from its next answer. A price you give is yours to say.",
  teachLabel: "Tell it something a customer asks",
  teachSend: "Tell it",
  teachLeft: (n: number) => (n === 1 ? "1 more" : `${n} more`),
  toldTitle: "You told it",
  teachFailed: "It couldn't take that just now. Try again in a moment.",
  fixed: "Fixed. Try it and see.",
  taughtFull: "That's the three a preview takes. Make it yours to tell it more.",

  /** Over the page its sender opens to look at (Open it, `?look=1`): it counts nothing, so it answers nothing. */
  look: "You're looking as Chanlytics. Nothing here counts, so it answers nothing and can't be made yours.",
  mine: "Make it mine",
  mineSub: "Free to try. You choose a plan when it starts answering your phone.",

  /** Sign-up, from Make it mine (L4): whose receptionist waits, and the one press of someone already signed in. */
  signup: {
    title: (business: string) => `AI for ${business.trim()} is waiting for you`,
    // No password is asked from a preview's link (the canvas's call P10): the code that proves the address is the way in.
    lead: "A code is emailed to you, so there is no password to choose. Everything it knows comes with it.",
    signedIn: (email: string) =>
      `You're signed in as ${email}. It becomes a workspace of yours, with everything it knows.`,
    claim: "Make it mine",
    claiming: "Making it yours…",
    other: "Use another account",
    /** Under Google's button: it comes back to the one press. */
    googleNext: "You'll make it yours on the next screen.",
  },

  building: {
    title: (business: string) => `Setting up AI for ${business.trim()}`,
    sub: "This takes about half a minute.",
  },
  ended: { title: "This preview has ended.", body: "You can set one up yourself in a few minutes.", start: "Start" },
  taken: { title: (business: string) => `${business} is already set up.`, signIn: "Sign in" },
} as const;

/**
 * Every word a lead's own receptionist's page says (decision 0079), in the owner's voice: its head, the chat, what it
 * knows, its foot, and its states. A module of words alone, so the page that draws them carries nothing else of
 * contracts' (lead-preview.ts says which state is which, on the server).
 */
import { MIN_MS } from "../shared/time";

/** A business's, as a sentence says it: "Luna's", and "Fixture Barbers'" for a name that ends in s. */
const theirs = (business: string): string => (/s$/i.test(business.trim()) ? `${business}'` : `${business}'s`);

export const LEAD_PREVIEW_WORDS = {
  /** The tab's title and the page's heading. */
  title: (business: string) => `${theirs(business)} receptionist`,
  chip: "Preview",
  setUp: (business: string) => `Chanlytics set this up for ${business}.`,

  textTitle: "Text it",
  textLabel: "Write what a customer would ask",
  send: "Send",
  writing: "Writing…",
  you: "You",
  it: "Your receptionist",
  /** Over what the live turn would do with an answer (Try it's `then`). */
  onRealChat: "On a real chat",
  left: (n: number) => (n === 1 ? "1 message left" : `${n} messages left`),
  failed: "It couldn't answer just now. Try again in a moment.",
  spent: "That's all a preview answers. Make it yours to keep going.",
  kept: "What you write here is kept for Chanlytics to follow up.",

  callTitle: "Call it",
  callSub: "Talk to it like a caller would, up to 3 minutes a call.",
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
  from: { google: "Google", site: "Your site" },
  rows: { hours: "Hours", address: "Address", phone: "Phone", website: "Website", services: "Services" },
  notRight: "Not right",
  notRightLabel: "What's right? (optional)",
  notRightSend: "Send",
  notRightThanks: "Thanks. You can fix it in a minute once it's yours.",

  /** Over the page its sender opens to look at (Open it, `?look=1`): it counts nothing, so it answers nothing. */
  look: "You're looking as Chanlytics. Nothing here counts, so it answers nothing and can't be made yours.",
  mine: "Make it mine",
  mineSub: "Free to try. You choose a plan when it starts answering your phone.",

  /** Sign-up, from Make it mine (L4): whose receptionist waits, and the one press of someone already signed in. */
  signup: {
    title: (business: string) => `${theirs(business)} receptionist is waiting for you`,
    lead: "Make an account to keep it. Everything it knows comes with it.",
    signedIn: (email: string) =>
      `You're signed in as ${email}. It becomes a workspace of yours, with everything it knows.`,
    claim: "Make it mine",
    claiming: "Making it yours…",
    other: "Use another account",
    /** Under Google's button: it comes back to the one press. */
    googleNext: "You'll make it yours on the next screen.",
  },

  building: {
    title: (business: string) => `Setting up ${theirs(business)} receptionist`,
    sub: "This takes about half a minute.",
  },
  ended: { title: "This preview has ended.", body: "You can set one up yourself in a few minutes.", start: "Start" },
  taken: { title: (business: string) => `${business} is already set up.`, signIn: "Sign in" },
} as const;

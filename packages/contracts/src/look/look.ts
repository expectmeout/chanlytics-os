/**
 * A workspace's look (decision 0075): its logo (00407) and its colour (00490), as an email to its customers and the
 * pages such an email opens wear them. Read off the workspace's row; drawn by the letter (letter.ts) and the link
 * pages; set in Settings › Business, and by the website read where no person set it.
 */
import { readableOnWhite } from "./colour";

export interface WorkspaceLook {
  /** The name the email leaves as. */
  business: string;
  /** Where its logo is served (contracts workspaceLogoSrc), null for none: the name stands in as a wordmark. */
  logo_url: string | null;
  /** Its colour, #rrggbb, null for none: ink stands in. */
  accent: string | null;
}

/** A letter with no colour of its own is set in ink. */
const ACCENT_FALLBACK = "#1f2026";

/** The colour a letter or a page draws its button and links in: the workspace's, readable under white words, else ink. */
export const accentOf = (look: Pick<WorkspaceLook, "accent">): string =>
  readableOnWhite(look.accent ?? ACCENT_FALLBACK);

/** Every word the Colour row says. */
export const LOOK_WORDS = {
  label: "Colour",
  hint: "On your emails to customers and the pages they open: the button and the links.",
  none: "None yet",
  add: "Add",
  change: "Change",
  save: "Save",
  cancel: "Cancel",
  remove: "Use ink instead",
  saving: "Saving…",
  saved: "Saved",
  removed: "Removed",
  notSaved: "Not saved — it didn't go through. Try again.",
  unusable: "Pick a colour.",
  preview: "How an email looks",
  previewSub: "The sign-up confirmation, as a customer gets it.",
  gate: "change the colour",
} as const;

/** The letter's own line, under every business's email. */
export const LETTER_WORDS = {
  sentFor: (business: string): string => `Sent for ${business} by Chanlytics.`,
} as const;

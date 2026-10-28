import { readableOnWhite } from "./colour.js";
const ACCENT_FALLBACK = "#1f2026";
export const accentOf = (look) => readableOnWhite(look.accent ?? ACCENT_FALLBACK);
export const LOOK_WORDS = {
  label: "Colour",
  hint: "On your emails to customers and the pages they open: the button and the links.",
  none: "None yet",
  add: "Add",
  change: "Change",
  save: "Save",
  cancel: "Cancel",
  remove: "Use ink instead",
  saving: "Saving\u2026",
  saved: "Saved",
  removed: "Removed",
  notSaved: "Not saved \u2014 it didn't go through. Try again.",
  unusable: "Pick a colour.",
  preview: "How an email looks",
  previewSub: "The sign-up confirmation, as a customer gets it.",
  gate: "change the colour"
};
export const LETTER_WORDS = {
  sentFor: (business) => `Sent for ${business} by Chanlytics.`
};

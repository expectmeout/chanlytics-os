export const DOUBT_SEEN = ["name", "phone", "email"];
export const DOUBT_SETTLED_AS = ["merged", "not_the_same"];
export const DOUBT_WORDS = {
  heading: "Same person?",
  seen: {
    name: (other) => `${other} has the same name. One person, or two?`,
    phone: (other) => `${other} has the number this record was reached on. One person, or two?`,
    email: (other) => `${other} has the address this record was reached on. One person, or two?`
  },
  merge: "Merge",
  mergeHint: "Two records of one person become one (the owner's act)",
  apart: "Not the same",
  apartHint: "Keep both records; this pair is not asked about again",
  apartBusy: "Keeping both\u2026",
  apartDone: (other) => `Kept apart from ${other}`,
  apartFailed: "Could not settle this pair.",
  notFound: "This doubt is not on this person."
};

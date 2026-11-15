/**
 * WhatsApp's 24-hour window, said once. A reply written after it closes can reach them only as an approved message:
 * the Inbox says it when such a reply comes back refused (code 131047), and Today says it beside a reply that waits.
 * This module imports nothing, so both read it without joining each other's imports.
 */

/** The window has closed: what a reply can still do. */
export const WINDOW_CLOSED_WORDS =
  "They haven't written in 24 hours, so only an approved message reaches them on WhatsApp. Your words go with you.";

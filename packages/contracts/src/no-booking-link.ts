/**
 * What a receptionist with no booking link asks for, where it would have sent one.
 *
 * A business that quotes each job -- a mover, a caterer, a contractor -- has no booking link (the first run's
 * decision 2, 24 Sep 2026): the price comes before anyone books, so its receptionist takes what the team needs to
 * follow up. Every sentence that would have offered the link finishes this one list instead: the prompt on both
 * channels (config.ts), the openings, a caller's appointments and a correction on a call (availability.ts,
 * calendar-people.ts, whisper.ts), and the phone's two tools (apps/edge/api/retell-fn.ts, retell-availability.ts).
 * However the receptionist comes to it, it asks for the same things.
 *
 * Read, not yet written: a receptionist with no link parses, and the save still refuses one
 * (TenantConfigWriteSchema) until the first run's Check asks how customers buy.
 */
export const NO_LINK_DETAILS = "their name, what they need, and where and when";

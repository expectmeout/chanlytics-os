/**
 * How a workspace's customers buy (tenants.sells_by, 00160), retired on 18 October 2026 (0008, amended: deals for
 * everyone). It was the one switch the deal layer hung on; every workspace has deals now, a missing booking link is
 * said the same way to everyone, and the word for a booking is the workspace's own (tenants.appointment_word, 00458).
 * The column stays one release, written by nothing and read only as the word's fallback (appointmentWordOf), and goes
 * with it.
 */

/** The retired column's two answers, held to its CHECK (schema-sets.ts) until the column goes. */
export const SELLS_BY = ["booking", "proposal"] as const;

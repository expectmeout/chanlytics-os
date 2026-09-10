/**
 * Retired. Jobs run from their own due_at through api/jobs/tick.ts (migration
 * 00098), and nothing publishes to QStash any more. A message QStash accepted
 * before the switch can still arrive here; its row is run by the heartbeat or
 * was withdrawn by the migration either way, and a 200 is what stops QStash
 * retrying it.
 *
 * Delete this file, and the QSTASH_* variables on Vercel, after 2026-10-10:
 * the longest delay ever scheduled through QStash was a thirty-day snooze.
 */
import { json } from "../../lib/http.js";

export async function POST(): Promise<Response> {
  return json(200, { ok: true, skipped: "retired" });
}

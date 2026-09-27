/**
 * A partner hears what changed, once a day (decision 0014).
 *
 * The partner clock (api/cron/partners.ts) calls this after the sweep, so a share that became payable tonight is in
 * tonight's letter. partner_letters_due (00208) answers, for each partner with the letter on and an address, what
 * changed in their ledger since their mark; partnerLetter (contracts) says it; the mail goes from the platform's own
 * address through notify's post, the one way the edge reaches a person. Only a letter that went moves the partner's
 * mark (partner_letter_written), so a failed send is tomorrow's letter, with tomorrow's news added to it.
 *
 * Best effort: it never throws. A partner's address is never logged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { partnerLetter, type PartnerLetterNews } from "../packages/contracts.js";
import { dashboardOrigin } from "../dashboard-origin.js";
import { platformFrom, post, NOTIFY_TIMEOUT_MS } from "../ops/notify.js";
import { logger, errField } from "../log.js";

type Db = SupabaseClient<Database>;

/** The longest the letters may take inside the clock's 55 seconds, the sweep having gone first. */
export const LETTERS_BUDGET_MS = 30_000;

export interface LettersOutcome {
  due: number;
  sent: number;
  failed: number;
  /** Left for tomorrow: the budget ran out before their turn. */
  deferred: number;
}

export interface LetterPorts {
  send?: typeof post;
  from?: string | null;
  origin?: string;
  nowMs?: () => number;
}

export async function sendPartnerLetters(db: Db, now: Date, ports: LetterPorts = {}): Promise<LettersOutcome> {
  const L = logger({ sweep: "partners" });
  const out: LettersOutcome = { due: 0, sent: 0, failed: 0, deferred: 0 };
  const clock = ports.nowMs ?? Date.now;
  const started = clock();
  try {
    const { data, error } = await db.rpc("partner_letters_due", { p_now: now.toISOString() });
    if (error) {
      // An older database has no letters yet: nothing to write, said once per tick.
      L.warn("partner_letters_unread", { error: error.message });
      return out;
    }
    const due = data ?? [];
    out.due = due.length;
    if (!due.length) return out;
    const from = ports.from === undefined ? platformFrom() : ports.from;
    if (!from) {
      L.error("partner_letters_no_sender", { due: due.length });
      out.deferred = due.length;
      return out;
    }
    const send = ports.send ?? post;
    const origin = ports.origin ?? dashboardOrigin();
    for (const d of due) {
      // One more send must fit: a letter cut off by the invocation's end would be sent again tomorrow anyway, but
      // its mark would not move, and the clock's own answer would be lost with it.
      if (clock() - started > LETTERS_BUDGET_MS - NOTIFY_TIMEOUT_MS) {
        out.deferred += 1;
        continue;
      }
      const letter = partnerLetter(d.news as unknown as PartnerLetterNews, {
        origin,
        since: d.since,
        nowMs: now.getTime(),
      });
      const went = await send(from, [d.email], letter.subject, letter.body);
      if (!went) {
        out.failed += 1;
        L.error("partner_letter_failed", { partner_id: d.partner_id });
        continue;
      }
      const marked = await db.rpc("partner_letter_written", { p_partner: d.partner_id, p_through: d.through });
      if (marked.error) L.error("partner_letter_unmarked", { partner_id: d.partner_id, error: marked.error.message });
      out.sent += 1;
      L.info("partner_letter_sent", { partner_id: d.partner_id });
    }
  } catch (e) {
    L.error("partner_letters_failed", { error: errField(e) });
  }
  return out;
}

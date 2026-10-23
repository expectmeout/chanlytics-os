/**
 * The lead finder's providers, watched for the platform, never an owner: a provider that refused to start a run, in its
 * own words, and once a day each actor whose pinned build is no longer the provider's latest.
 *
 * 23 Oct 2026: the Maps actor's pinned build was deleted by its provider (its last start had been 24 Sep), and every
 * Maps search was refused at its start. The owner read "the source stopped answering"; the refusal's words ("Build
 * with number "0.14.757" was not found.") were kept nowhere, and were read only by starting the run by hand. A
 * refusal now pages at once (the runner's `tell`, through claim.ts startFailed), and a pin that falls behind pages the
 * morning it does, before the provider removes it. Both through the pager, so Health's "What paged us" shows them and
 * the platform's mail says them.
 *
 * Nothing here is shown to an owner, so the vendor's names are fine in what it says.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { apifyClient, type ApifyClient } from "../packages/channels.js";
import { leadPins } from "../packages/core.js";
import { pageOperator, type PagePorts } from "../ops/page-operator.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";

type Db = SupabaseClient<Database>;

/** The hour (UTC) the health sweep holds the pins against the latest builds; the pager's six hours keep it to one page a day. */
const PIN_WATCH_HOUR = 5;
const CARDS_FILE = "packages/core/src/leads/cards.ts";

/** A provider refused to start a run: paged at once, one page per actor per pager window. */
export async function pageSourceRefused(
  db: Db,
  e: { actor: string; build: string; why: string },
  pager: Omit<PagePorts, "db"> = {},
): Promise<void> {
  await pageOperator(
    { db, ...pager },
    `lead_source_refused:${e.actor}`,
    `A lead source refused to start: ${e.actor}`,
    `${e.actor} refused to start a run at build ${e.build}: ${e.why}\n\n` +
      `Every search that starts this actor fails at its start until this is fixed. A build that was not found: probe ` +
      `the actor's latest build with the card's own input (a few places), check its items read as the card reads them, ` +
      `then pin it in ${CARDS_FILE}. A limit or a key refused: the provider's console says which.\n`,
  );
}

/** The provider's client for the watch, when this deployment holds the key; null checks nothing. */
export function leadSourceClient(fetchImpl: typeof fetch = fetch): ApifyClient | null {
  const token = env.APIFY_TOKEN;
  return token ? apifyClient(fetchImpl, token) : null;
}

/**
 * Once a day: each pinned build held against the provider's latest, and every pin behind it paged. Answers how many
 * were behind. Never throws: a latest that cannot be read is logged and the pin's check is skipped, so the health
 * sweep's other checks stand.
 */
export async function watchLeadPins(
  db: Db,
  apify: ApifyClient | null,
  nowMs: number,
  pager: Omit<PagePorts, "db"> = {},
): Promise<number> {
  if (!apify || new Date(nowMs).getUTCHours() !== PIN_WATCH_HOUR) return 0;
  let behind = 0;
  for (const pin of leadPins()) {
    let latest: string | null;
    try {
      latest = await apify.latestBuild(pin.actor);
    } catch (e) {
      logger({ sweep: "health" }).error("lead_pin_unreadable", { actor: pin.actor, error: errField(e) });
      continue;
    }
    if (!latest || latest === pin.build) continue;
    behind += 1;
    await pageOperator(
      { db, ...pager },
      `lead_source_pin:${pin.actor}`,
      `A lead source's pinned build is behind: ${pin.actor}`,
      `${pin.actor} is pinned to build ${pin.build}; its latest build is ${latest}.\n\n` +
        `The provider deletes old builds, and a run at a deleted build is refused at its start, so every search on it ` +
        `fails. Probe ${latest} with the card's own input (a few places), check its items read as the card reads them, ` +
        `then pin it in ${CARDS_FILE}.\n`,
    );
  }
  return behind;
}

/**
 * The lead finder's providers, watched for the platform, never an owner: a provider that refused to start a run, in its
 * own words, and each actor whose pinned build the provider no longer has.
 *
 * 23 Oct 2026: the Maps actor's pinned build was deleted by its provider (its last start had been 24 Sep), and every
 * Maps search was refused at its start. The owner read "the source stopped answering"; the refusal's words ("Build
 * with number "0.14.757" was not found.") were kept nowhere, and were read only by starting the run by hand. A
 * refusal now pages at once (the runner's `tell`, through claim.ts startFailed), and a pin the provider deleted pages
 * within the health sweep's half hour, before an owner's search meets it. Both through the pager, so Health's "What
 * paged us" shows them and the platform's mail says them.
 *
 * A pin behind the provider's latest is not paged: being behind is not being at risk. The checker's 0.1.16 (built
 * 11 Jun) stood two builds behind for weeks and was still there, while the Maps actor ships a build every two days or
 * so; a page each morning for either would be a page nobody reads.
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
      `then pin its number and id in ${CARDS_FILE}. A limit or a key refused: the provider's console says which.\n`,
  );
}

/** The provider's client for the watch, when this deployment holds the key; null checks nothing. */
export function leadSourceClient(fetchImpl: typeof fetch = fetch): ApifyClient | null {
  const token = env.APIFY_TOKEN;
  return token ? apifyClient(fetchImpl, token) : null;
}

/**
 * Each health sweep: every pinned build read by its id, and a pin the provider no longer has (or whose id names another
 * build) paged, with the provider's latest to probe. The reads are free and need no key. Answers how many were gone.
 * Never throws: a build that cannot be read is logged and that pin is skipped, so the sweep's other checks stand.
 */
export async function watchLeadPins(
  db: Db,
  apify: ApifyClient | null,
  pager: Omit<PagePorts, "db"> = {},
): Promise<number> {
  if (!apify) return 0;
  let gone = 0;
  for (const pin of leadPins()) {
    let number: string | null;
    try {
      number = await apify.buildNumberOf(pin.buildId);
    } catch (e) {
      logger({ sweep: "health" }).error("lead_pin_unreadable", { actor: pin.actor, error: errField(e) });
      continue;
    }
    if (number === pin.build) continue;
    gone += 1;
    const latest = await apify.latestBuild(pin.actor).catch(() => null);
    const [subject, what] =
      number === null
        ? [
            `A lead source's pinned build is gone: ${pin.actor}`,
            `${pin.actor} is pinned to build ${pin.build}, and the provider no longer has it (id ${pin.buildId}). ` +
              `Every search that starts this actor is refused at its start until it is pinned again.`,
          ]
        : [
            `A lead source's pin names two builds: ${pin.actor}`,
            `${pin.actor} is pinned to build ${pin.build}, but the pin's id ${pin.buildId} names build ${number}. ` +
              `A search starts at the number and this watch reads the id, so the two must name one build.`,
          ];
    await pageOperator(
      { db, ...pager },
      `lead_source_pin:${pin.actor}`,
      subject,
      `${what}\n\nProbe ${latest ? `the latest build, ${latest},` : "the actor's latest build"} with the card's ` +
        `own input (a few places), check its items read as the card reads them, then pin its number and id in ` +
        `${CARDS_FILE}.\n`,
    );
  }
  return gone;
}

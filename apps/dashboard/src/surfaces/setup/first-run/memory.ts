/**
 * What the first run keeps in the tab (the loading standard's drafts, legacy-bridge/tab-memory.ts; moved from
 * legacy/pages/first-run.jsx, decision 0015): the owner's choice of number (Where it answers, bought at Go live), and
 * when Try it opened.
 *
 * The choice of number: Stripe's round trip reloads the page, and the choice has to be there when it comes back.
 * Nothing about it is stored anywhere else; a tab that lost it asks again. Besides contracts' PhoneChoice it carries
 * `sent`, when the buy went out from this tab, so a draw while the line is on its way to the page does not send it twice. A
 * buy answers in seconds and its line reaches Setup within a minute; a mark older than PHONE_SENT_MS is a buy that never
 * landed (the tab closed on it), and the step sends it again. It also carries `returnedAt`, when this tab came back from
 * Stripe with a card given: until the trial lands the step says it is starting, a reload included, and never offers
 * checkout twice; a return older than PHONE_RETURN_MS with no trial is one Stripe never confirmed, and the step offers it
 * again.
 */
import { formatPhoneDisplay, HOUR_MS, MIN_MS, type PhoneChoice, type SetupPhoneWant } from "@chanlytics/contracts";
import { tabMemoryFor } from "@/legacy-bridge/tab-memory";

/** The phone step's choice as the tab keeps it: contracts', with when its buy went out and when Stripe sent it back. */
export interface KeptPhoneChoice extends PhoneChoice {
  sent?: number | false;
  returnedAt?: number | null;
}

const PHONE_DRAFT = "first-run-phone";
export const PHONE_SENT_MS = 2 * MIN_MS;
const PHONE_RETURN_MS = 15 * MIN_MS;

/** Back from Stripe with a card given, recently enough that the trial may still be on its way. */
export const returnedFromStripe = (c: KeptPhoneChoice | null): boolean =>
  !!(c && c.pending && c.returnedAt && Date.now() - c.returnedAt < PHONE_RETURN_MS);

/**
 * The choice a tab that holds none starts from: the number the member's saved Setup view says they keep, move or got
 * (surface.ts `want`, decision 0073), written as the app writes one, with nothing pressed; a new number as the pick, and
 * a number kept with how its calls go and what rings, as Where it answers kept them. Null without one.
 */
export const choiceFromWant = (want: SetupPhoneWant | null): KeptPhoneChoice | null => {
  if (!want) return null;
  if (want.way === "new")
    return { way: "new", number: null, pick: { e164: want.number, friendly: want.number }, pending: false };
  return {
    way: want.way,
    number: formatPhoneDisplay(want.number) ?? want.number,
    pick: null,
    pending: false,
    mode: want.mode ?? null,
    rings: want.rings ?? null,
    company: want.company ?? null,
  };
};

export function phoneChoiceKept(): KeptPhoneChoice | null {
  try {
    return tabMemoryFor(window).draft<KeptPhoneChoice>(PHONE_DRAFT) || null;
  } catch {
    return null;
  }
}

export function keepPhoneChoice(c: KeptPhoneChoice | null): void {
  try {
    const memory = tabMemoryFor(window);
    if (c) memory.keepDraft(PHONE_DRAFT, c);
    else memory.dropDraft(PHONE_DRAFT);
  } catch {
    /* the tab keeps nothing; the step asks again */
  }
}

// When Try it opened: a call from before it is not the test, and a reload keeps listening from the same moment. A mark
// older than TRY_FRESH_MS is a visit long gone, and the step listens from now.
const TRY_DRAFT = "first-run-try";
const TRY_FRESH_MS = 2 * HOUR_MS;
/** The test window's length (line_forwarding_test): opened again only once this has passed. */
export const TRY_WINDOW_MS = 30 * MIN_MS;

export function trySince(): number {
  const now = Date.now();
  try {
    const memory = tabMemoryFor(window);
    const kept = memory.draft<{ since?: unknown }>(TRY_DRAFT);
    if (kept && typeof kept.since === "number" && now - kept.since < TRY_FRESH_MS) return kept.since;
    memory.keepDraft(TRY_DRAFT, { since: now });
  } catch {
    /* the tab keeps nothing: listen from now */
  }
  return now;
}

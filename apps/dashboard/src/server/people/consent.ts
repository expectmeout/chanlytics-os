import {
  AppError,
  CONSENT_RESET_SOURCE,
  CONSENT_SOURCES,
  OWN_MESSAGE_REFUSALS,
  offersYesRefusal,
  type AskedPurpose,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { recordDecision } from "@/server/verbs";

/**
 * The same answer for many people at once, through the same door each of
 * them would go through alone.
 *
 * The page used to send one request per person -- fifty round trips for a
 * class that said yes at the desk together, fifty takes of the consent
 * bucket, and a page that refreshed once at the end whatever had happened in
 * between. One request now; the doors are unchanged: set_contact_consent or
 * set_marketing_consent per person (the database judges membership and the
 * written-yes rule per row, and the ledger says who), and a decision per
 * person, so each profile's timeline is whole.
 *
 * The ids are read back under RLS first and held to THIS workspace: a member
 * of two cannot record an answer for the other's customers from this tab, and
 * an erased person is not written on. What was not ours, or not there, comes
 * back as skipped rather than as a failure -- it is not an error to have
 * selected a row that changed underneath you.
 */
interface ConsentInput {
  consent: string;
  source?: string;
  note?: string;
}

interface ManyOutcome {
  done: number;
  failed: { id: string; message: string }[];
  skipped: string[];
}

/** The four sources, the reset with none: the rule the two single routes apply, shared with the batch. */
function consentSourceOf(consent: string, source: string | undefined, purpose: AskedPurpose): string {
  const s = consent === "unknown" ? CONSENT_RESET_SOURCE : source;
  if (typeof s !== "string" || (consent !== "unknown" && !CONSENT_SOURCES.some((k) => k.id === s))) {
    throw new AppError(
      "validation",
      "Say how they told you: in person, on the phone, on a form, or in their own message.",
    );
  }
  // Their own message names the one message it was given in (00137), and one
  // message is not every person's: that answer is recorded on a person's page.
  if (s === "customer_message") throw new AppError("validation", OWN_MESSAGE_REFUSALS.batch);
  // A yes to OFFERS is written or it is not recorded. The database refuses a
  // spoken one as well (00100); asking here first hands the person a sentence
  // instead of the database's, before any row is touched.
  if (purpose === "marketing" && consent === "opted_in") {
    const refusal = offersYesRefusal(s);
    if (refusal) throw new AppError("validation", refusal);
  }
  return s;
}

/** The note, trimmed to what the door takes, or nothing. */
function noteOf(note: unknown): string | null {
  return typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;
}

export async function recordConsentMany(
  ctx: RouteContext,
  tenantId: string,
  purpose: AskedPurpose,
  input: { ids: string[] } & ConsentInput,
): Promise<ManyOutcome> {
  const source = consentSourceOf(input.consent, input.source, purpose);
  const note = noteOf(input.note);
  const ids = [...new Set(input.ids)];
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select("id, tenant_id, erased_at, consent, marketing_consent")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const ours = (data ?? []).filter((c) => c.tenant_id === tenantId && !c.erased_at);
  const skipped = ids.filter((id) => !ours.some((c) => c.id === id));
  const failed: ManyOutcome["failed"] = [];
  let done = 0;
  for (const c of ours) {
    const doorErr =
      purpose === "marketing"
        ? (
            await ctx.supabase.rpc("set_marketing_consent", {
              p_tenant_id: tenantId,
              p_contact_id: c.id,
              p_consent: input.consent,
              p_source: source,
              ...(note ? { p_note: note } : {}),
            })
          ).error
        : (
            await ctx.supabase.rpc("set_contact_consent", {
              p_contact_id: c.id,
              p_consent: input.consent,
              p_source: source,
              ...(note ? { p_note: note } : {}),
            })
          ).error;
    if (doorErr) {
      failed.push({ id: c.id, message: doorErr.message });
      continue;
    }
    await recordDecision(ctx, tenantId, "contact", c.id, "consent_change", {
      ...(purpose === "marketing" ? { purpose: "marketing" } : {}),
      consent: input.consent,
      source,
      note,
      previous: (purpose === "marketing" ? c.marketing_consent : c.consent) ?? null,
      batch: ids.length,
    });
    done += 1;
  }
  return { done, failed, skipped };
}

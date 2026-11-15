/**
 * What a lead's own preview tells the writer of an email that carries its link (decision 0079; the review of 12 November
 * 2026: emails two, three and four said the same whatever the lead did). The line AI writes for that email is written
 * from here, and read against the same record before it goes (campaigns/reach-out/check-one.ts):
 *
 *   previewFactsOf      what it knows, what they did with it and what they said is not right, each a line; and a mark
 *   previewDidMarkOf    the mark alone: which preview, and how far they have used it. The check stamps it on the send
 *                       (channels checkedWordsOf) and the sender compares it, so a line written before the preview stood,
 *                       or before they last used it, is written again
 *   previewForOpening   the two for a lead, or null: only an open preview says anything
 *
 * An open of the page is never among them: a mail scanner opens a link too, and the writer is told nothing it must not say.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseTenantConfig,
  previewClaimable,
  previewKnowsOf,
  previewSaidOf,
  previewStateOf,
  previewTriedWords,
  type PreviewPageFacts,
  type TenantId,
} from "@chanlytics/contracts";
import { findLeadPreview, type LeadPreviewRow } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { getTenantConfig } from "@chanlytics/db/workspace";

type Db = SupabaseClient<Database>;
type Profile = PreviewPageFacts["profile"];

/** A preview as the writer is told it; each line null where there is nothing to say. */
export interface PreviewForOpening {
  mark: string;
  knows: string | null;
  tried: string | null;
  said: string | null;
}

/** How many of its services the writer is given by name. */
const SERVICES_NAMED = 3;

/** Which preview, and how far they have used it: its messages, its calls, and what they said is not right. */
export function previewDidMarkOf(row: Pick<LeadPreviewRow, "id" | "asked_count" | "call_count" | "not_right">): string {
  const flagged = Array.isArray(row.not_right) ? row.not_right.length : 0;
  return [row.id, row.asked_count, row.call_count, flagged].join(":");
}

/** Its services by their count and the first few, so a count the writer says is one the record holds. */
function servicesLine(profile: Profile): string | null {
  const names = (profile?.services ?? []).map((service) => service.name.trim()).filter(Boolean);
  if (names.length === 0) return null;
  const few = names.slice(0, SERVICES_NAMED).join(", ");
  const noun = names.length === 1 ? "service" : "services";
  return `${names.length} ${noun} (${few}${names.length > SERVICES_NAMED ? ", and more" : ""})`;
}

/** What it knows, as its page lists it (contracts previewKnowsOf), its services by their count. */
function knowsLine(profile: Profile): string | null {
  const facts = previewKnowsOf(profile, null).flatMap((known) =>
    known.key === "services" ? [] : [`${known.label.toLowerCase()}: ${known.value}`],
  );
  const services = servicesLine(profile);
  const lines = services ? [...facts, services] : facts;
  return lines.length > 0 ? lines.join("; ") : null;
}

/** A preview's row and its workspace's record, as the writer is told them. */
export function previewFactsOf(
  row: Pick<LeadPreviewRow, "id" | "asked_count" | "call_count" | "call_seconds" | "not_right">,
  profile: Profile,
): PreviewForOpening {
  return {
    mark: previewDidMarkOf(row),
    knows: knowsLine(profile),
    tried: previewTriedWords(row) || null,
    said: previewSaidOf(row.not_right).join(" ") || null,
  };
}

/** The preview workspace's record, or none where it cannot be read: the writer is told only what it knows. */
async function profileOf(db: Db, tenantId: TenantId | null): Promise<Profile> {
  if (!tenantId) return null;
  const config = await getTenantConfig(db, tenantId).catch(() => null);
  return parseTenantConfig(config?.config ?? null)?.brain?.profile ?? null;
}

/** A lead's open preview as the writer is told it, or null: none, one being made, failed, ended or someone's own. */
export async function previewForOpening(
  db: Db,
  params: { tenantId: TenantId; leadId: string },
  now: Date,
): Promise<PreviewForOpening | null> {
  const row = await findLeadPreview(db, params.tenantId, params.leadId);
  if (!row || row.state !== "ready" || !previewClaimable(previewStateOf(row, now))) return null;
  return previewFactsOf(row, await profileOf(db, row.preview_tenant_id));
}

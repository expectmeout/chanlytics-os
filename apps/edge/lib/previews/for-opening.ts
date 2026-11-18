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
 *   previewForLine      the same, asked for ahead of the email where the lead has none, or what the line waits for
 *   lineMarkOf          the mark a line is stamped with and read against: which preview alone where its owner reads
 *                       the line before it goes, so the line they approved is the one that goes (the review of 16
 *                       November 2026)
 *
 * An open of the page is never among them: a mail scanner opens a link too, and the writer is told nothing it must not say.
 */
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseTenantConfig,
  previewClaimable,
  previewKnowsOf,
  previewSaidOf,
  previewStateOf,
  previewTriedWords,
  wordsNeedOpening,
  type PreviewPageFacts,
  type TenantId,
} from "@chanlytics/contracts";
import { findLeadPreview, type LeadPreviewRow } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { getTenantConfig } from "@chanlytics/db/workspace";
import { askPreview } from "./make.js";

type Db = SupabaseClient<Database>;
type Profile = PreviewPageFacts["profile"];

/** A preview as the writer is told it; each line null where there is nothing to say. */
export interface PreviewForOpening {
  id: string;
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

/**
 * What it knows, as its page lists it (contracts previewKnowsOf), its services by their count. A fact the page shows as
 * lacking (its hours, its services, where the listing and the site had none) is not something it knows: the page says
 * why it matters, and the writer is told nothing of it.
 */
function knowsLine(profile: Profile): string | null {
  const facts = previewKnowsOf(profile, null).flatMap((known) =>
    known.key === "services" || known.missing ? [] : [`${known.label.toLowerCase()}: ${known.value}`],
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
    id: row.id,
    mark: previewDidMarkOf(row),
    knows: knowsLine(profile),
    tried: previewTriedWords(row) || null,
    said: previewSaidOf(row.not_right).join(" ") || null,
  };
}

/** The preview workspace's record, or none where it cannot be read: the writer is told only what it knows. */
async function previewRecordOf(db: Db, tenantId: TenantId | null): Promise<Profile> {
  if (!tenantId) return null;
  const config = await getTenantConfig(db, tenantId).catch(
    logAndGoOn("reading a preview's record for the line of the email that carries it", null),
  );
  return parseTenantConfig(config?.config ?? null)?.brain?.profile ?? null;
}

/** A preview row as the writer is told it, or null: none, one being made, failed, ended or someone's own. */
async function openFactsOf(db: Db, row: LeadPreviewRow | null, now: Date): Promise<PreviewForOpening | null> {
  if (!row || row.state !== "ready" || !previewClaimable(previewStateOf(row, now))) return null;
  return previewFactsOf(row, await previewRecordOf(db, row.preview_tenant_id));
}

/** A lead's open preview as the writer is told it, or null: none, one being made, failed, ended or someone's own. */
export async function previewForOpening(
  db: Db,
  params: { tenantId: TenantId; leadId: string },
  now: Date,
): Promise<PreviewForOpening | null> {
  return openFactsOf(db, await findLeadPreview(db, params.tenantId, params.leadId), now);
}

/** What the line of an email that carries their preview is written from, or what it waits for first. */
export type PreviewForLine = { preview: PreviewForOpening | null } | { wait: "making" | "limit" };

/**
 * The preview the line of an email that carries it is written from, made ahead of the email (the review of 16 November
 * 2026: a line its owner approved was written again when the email went, from the preview made only then, and went
 * unread). An open one is the writer's, as previewForOpening's; one being made, or asked for here where the lead has
 * none (askPreview, its build scheduled once), is waited for; with the day's all made (askPreview's limit) the line
 * waits for tomorrow's; and where none can be made (the switch off, a lead its door refuses) there is nothing to wait
 * for, and the line is written as any other's.
 */
export async function previewForLine(
  db: Db,
  params: { tenantId: TenantId; leadId: string },
  now: Date,
): Promise<PreviewForLine> {
  const row = await findLeadPreview(db, params.tenantId, params.leadId);
  if (row?.state === "building") return { wait: "making" };
  if (row) return { preview: await openFactsOf(db, row, now) };
  const answer = await askPreview(db, { ...params, by: null, none: true }, now);
  if (answer.ok) return { wait: "making" };
  return answer.reason === "limit" ? { wait: "limit" } : { preview: null };
}

/**
 * The mark a line is stamped with, and read against before it goes (channels checkedWordsOf). Where its words write a
 * line from an open preview, the preview's (previewDidMarkOf), so a line written before they last used it is written
 * again; where its owner reads the line before it goes (its run waits for their OK, `ownerReads`), which preview alone, so
 * what the lead does with it after the OK never writes the line they approved again. None where there is no line or no
 * open preview.
 */
export function lineMarkOf(
  words: { subject: string | null; body: string },
  preview: Pick<PreviewForOpening, "id" | "mark"> | null,
  ownerReads: boolean,
): string | null {
  if (!preview || !wordsNeedOpening(words)) return null;
  return ownerReads ? preview.id : preview.mark;
}

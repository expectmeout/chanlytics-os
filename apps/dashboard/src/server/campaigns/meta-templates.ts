import "server-only";
import { deployment } from "../shared/env";
import { MIN_MS } from "@chanlytics/contracts";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "../shared/edge";
import type { TenantId } from "@chanlytics/contracts";

/** A sync pages through every template the account holds, a Graph call a page: a minute, as the lines doors get. */
const SYNC_TIMEOUT_MS = MIN_MS;
/** Meta reviews a template as it is submitted; its answer is one Graph call and a row. */
const CREATE_TIMEOUT_MS = 30_000;

/* ---- Templates as Meta holds them: the edge reads the number's account ---- */

/*
 * What a member does to a Library message is on the ledger, about the template (its row's id, subject "template"), with
 * its name and language in the data: the edge's doors write template.submitted and template.removed with the row and
 * who it was (00722 template_submitted_keep and template_remove), and nothing here writes one (00723).
 */

type SyncOutcome =
  | { ok: true; seen: number; approved: number; marketing: number; syncedAt: string }
  | { ok: false; reason: EdgeReason; detail?: string };

/** Every template of the workspace's WhatsApp account, upserted; a row Meta does not return is left as it was. */
export async function syncTemplates(tenantId: TenantId, userId: string): Promise<SyncOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const answer = await callEdge(
    "/api/admin/whatsapp/templates-sync",
    { tenant_id: tenantId },
    { workspace: tenantId, user: userId, timeoutMs: SYNC_TIMEOUT_MS },
  );
  const body = answer.body ?? {};
  if (edgeAnswered(answer) && body.ok) {
    return {
      ok: true,
      seen: body.seen ?? 0,
      approved: body.approved ?? 0,
      marketing: body.marketing ?? 0,
      syncedAt: body.synced_at ?? new Date().toISOString(),
    };
  }
  return { ok: false, reason: edgeReasonOf(answer), detail: body.detail };
}

/* ---- Templates written here: the edge submits to Meta and keeps the row ---- */

type TemplateCreateOutcome =
  { ok: true; id: string; metaStatus: string } | { ok: false; reason: EdgeReason; detail?: string };

export async function createTemplate(
  tenantId: TenantId,
  userId: string,
  target: {
    name: string;
    language: string;
    category: string;
    components: unknown[];
    body: string;
    examples: string[];
    labels?: string[];
  },
): Promise<TemplateCreateOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const answer = await callEdge(
    "/api/admin/whatsapp/templates-create",
    { tenant_id: tenantId, user_id: userId, ...target },
    { workspace: tenantId, user: userId, timeoutMs: CREATE_TIMEOUT_MS },
  );
  const body = answer.body ?? {};
  if (edgeAnswered(answer) && body.ok && body.id) {
    // What a business will say to its customers went to Meta under this member's hand: the edge's door wrote the row
    // and template.submitted, with who and which, in one transaction (00722).
    return { ok: true, id: body.id, metaStatus: body.meta_status ?? "pending" };
  }
  return { ok: false, reason: edgeReasonOf(answer), detail: body.detail };
}

/**
 * A WhatsApp template's words changed and sent back to Meta through the edge (templates-edit): in review again, as the ledger
 * says it was submitted; Meta's own words come back when it says no.
 */
export async function editTemplateWords(
  tenantId: TenantId,
  userId: string,
  target: {
    /** The row's id: the edge's door reads its name and language from it. */
    id: string;
    components: unknown[];
    body: string;
    examples: string[];
    labels: string[];
    /** The approved words these replace, where they were approved: the ledger keeps them (template_words_keep). */
    before: string | null;
  },
): Promise<TemplateCreateOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const { id, before, ...words } = target;
  const answer = await callEdge(
    "/api/admin/whatsapp/templates-edit",
    { tenant_id: tenantId, template_id: id, user_id: userId, before, ...words },
    { workspace: tenantId, user: userId, timeoutMs: CREATE_TIMEOUT_MS },
  );
  const body = answer.body ?? {};
  if (edgeAnswered(answer) && body.ok && body.id) {
    // The edge's door writes template.submitted with the words and the ones they replace (00722).
    return { ok: true, id: body.id, metaStatus: body.meta_status ?? "pending" };
  }
  return { ok: false, reason: edgeReasonOf(answer), detail: body.detail };
}

type TemplateDeleteOutcome = { ok: true; atMeta: boolean } | { ok: false; reason: EdgeReason; detail?: string };

export async function deleteTemplate(
  tenantId: TenantId,
  templateId: string,
  userId: string,
): Promise<TemplateDeleteOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const answer = await callEdge(
    "/api/admin/whatsapp/templates-delete",
    { tenant_id: tenantId, template_id: templateId, user_id: userId },
    { workspace: tenantId, user: userId },
  );
  const body = answer.body ?? {};
  if (edgeAnswered(answer) && body.ok) return { ok: true, atMeta: !!body.at_meta };
  return { ok: false, reason: edgeReasonOf(answer), detail: body.detail };
}

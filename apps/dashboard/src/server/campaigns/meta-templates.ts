import "server-only";
import { deployment } from "../shared/env";
import { MIN_MS } from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db/events";
import { serviceDb } from "../shared/service-db";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "../shared/edge";
import type { TenantId } from "@chanlytics/contracts";

/** A sync pages through every template the account holds, a Graph call a page: a minute, as the lines doors get. */
const SYNC_TIMEOUT_MS = MIN_MS;
/** Meta reviews a template as it is submitted; its answer is one Graph call and a row. */
const CREATE_TIMEOUT_MS = 30_000;

/* ---- Templates as Meta holds them: the edge reads the number's account ---- */

/**
 * What a member did to a Library message, on the ledger: sent to WhatsApp for approval, or deleted. It is about the template
 * (its row's id, subject "template"), with its name and language in the data, which is what the line says and what stays when
 * the row is gone. While the row is there the line opens the message in the Library (activity.ts, doors). Best effort, as an
 * event is.
 */
export function recordTemplateEvent(
  db: ReturnType<typeof serviceDb>,
  tenantId: TenantId,
  kind: "submitted" | "removed",
  template: { id: string; name: string; language: string },
  by: string,
): Promise<void> {
  return emitEvent(
    db,
    tenantId,
    kind === "removed" ? "template.removed" : "template.submitted",
    "template",
    template.id,
    {
      name: template.name,
      language: template.language,
      by,
    },
  );
}

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
    // What a business will say to its customers went to Meta under this member's hand: the ledger says who and
    // which, as it says every other consequential act. Best effort: the message is with Meta either way.
    await recordTemplateEvent(
      serviceDb(),
      tenantId,
      "submitted",
      { id: body.id, name: target.name, language: target.language },
      userId,
    );
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
    { tenant_id: tenantId, template_id: templateId },
    { workspace: tenantId, user: userId },
  );
  const body = answer.body ?? {};
  if (edgeAnswered(answer) && body.ok) return { ok: true, atMeta: !!body.at_meta };
  return { ok: false, reason: edgeReasonOf(answer), detail: body.detail };
}

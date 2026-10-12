import "server-only";
import { deployment } from "../env";
import { MIN_MS } from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db";
import { serviceDb } from "../service-db";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "../edge";

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
export function templateEvent(
  db: ReturnType<typeof serviceDb>,
  tenantId: string,
  what: "submitted" | "removed",
  template: { id: string; name: string; language: string },
  by: string,
): Promise<void> {
  return emitEvent(
    db,
    tenantId,
    what === "removed" ? "template.removed" : "template.submitted",
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
export async function syncTemplates(tenantId: string, userId: string): Promise<SyncOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/whatsapp/templates-sync",
    { tenant_id: tenantId },
    { workspace: tenantId, user: userId, timeoutMs: SYNC_TIMEOUT_MS },
  );
  const j = (r.body ?? {}) as {
    ok?: boolean;
    seen?: number;
    approved?: number;
    marketing?: number;
    synced_at?: string;
    detail?: string;
  };
  if (edgeAnswered(r) && j.ok) {
    return {
      ok: true,
      seen: j.seen ?? 0,
      approved: j.approved ?? 0,
      marketing: j.marketing ?? 0,
      syncedAt: j.synced_at ?? new Date().toISOString(),
    };
  }
  return { ok: false, reason: edgeReasonOf(r), detail: j.detail };
}

/* ---- Templates written here: the edge submits to Meta and keeps the row ---- */

type TemplateCreateOutcome =
  { ok: true; id: string; metaStatus: string } | { ok: false; reason: EdgeReason; detail?: string };

export async function createTemplate(
  tenantId: string,
  userId: string,
  t: {
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
  const r = await callEdge(
    "/api/admin/whatsapp/templates-create",
    { tenant_id: tenantId, user_id: userId, ...t },
    { workspace: tenantId, user: userId, timeoutMs: CREATE_TIMEOUT_MS },
  );
  const j = (r.body ?? {}) as {
    ok?: boolean;
    id?: string;
    meta_status?: string;
    detail?: string;
  };
  if (edgeAnswered(r) && j.ok && j.id) {
    // What a business will say to its customers went to Meta under this member's hand: the ledger says who and
    // which, as it says every other consequential act. Best effort: the message is with Meta either way.
    await templateEvent(serviceDb(), tenantId, "submitted", { id: j.id, name: t.name, language: t.language }, userId);
    return { ok: true, id: j.id, metaStatus: j.meta_status ?? "pending" };
  }
  return { ok: false, reason: edgeReasonOf(r), detail: j.detail };
}

type TemplateDeleteOutcome = { ok: true; atMeta: boolean } | { ok: false; reason: EdgeReason; detail?: string };

export async function deleteTemplate(
  tenantId: string,
  templateId: string,
  userId: string,
): Promise<TemplateDeleteOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/whatsapp/templates-delete",
    { tenant_id: tenantId, template_id: templateId },
    { workspace: tenantId, user: userId },
  );
  const j = (r.body ?? {}) as { ok?: boolean; at_meta?: boolean; detail?: string };
  if (edgeAnswered(r) && j.ok) return { ok: true, atMeta: !!j.at_meta };
  return { ok: false, reason: edgeReasonOf(r), detail: j.detail };
}

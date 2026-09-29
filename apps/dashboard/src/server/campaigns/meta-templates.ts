import "server-only";
import { deployment } from "../deployment";
import { MIN_MS } from "@chanlytics/contracts";
import { callEdge, edgeAnswered } from "../edge";

/** A sync pages through every template the account holds, a Graph call a page: a minute, as the lines doors get. */
const SYNC_TIMEOUT_MS = MIN_MS;
/** Meta reviews a template as it is submitted; its answer is one Graph call and a row. */
const CREATE_TIMEOUT_MS = 30_000;

/* ---- Templates as Meta holds them: the edge reads the number's account ---- */

type SyncOutcome =
  | { ok: true; seen: number; approved: number; marketing: number; syncedAt: string }
  | { ok: false; reason: string; detail?: string };

/** Every template of the workspace's WhatsApp account, upserted; a row Meta does not return is left as it was. */
export async function syncTemplates(tenantId: string): Promise<SyncOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/whatsapp/templates-sync",
    { tenant_id: tenantId },
    { workspace: tenantId, timeoutMs: SYNC_TIMEOUT_MS },
  );
  const j = (r.body ?? {}) as {
    ok?: boolean;
    seen?: number;
    approved?: number;
    marketing?: number;
    synced_at?: string;
    error?: string;
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
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

/* ---- Templates written here: the edge submits to Meta and keeps the row ---- */

type TemplateCreateOutcome =
  { ok: true; id: string; metaStatus: string } | { ok: false; reason: string; detail?: string };

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
    error?: string;
    detail?: string;
  };
  if (edgeAnswered(r) && j.ok && j.id) return { ok: true, id: j.id, metaStatus: j.meta_status ?? "pending" };
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

type TemplateDeleteOutcome = { ok: true; atMeta: boolean } | { ok: false; reason: string; detail?: string };

export async function deleteTemplate(tenantId: string, templateId: string): Promise<TemplateDeleteOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/whatsapp/templates-delete",
    { tenant_id: tenantId, template_id: templateId },
    { workspace: tenantId },
  );
  const j = (r.body ?? {}) as { ok?: boolean; at_meta?: boolean; error?: string; detail?: string };
  if (edgeAnswered(r) && j.ok) return { ok: true, atMeta: !!j.at_meta };
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

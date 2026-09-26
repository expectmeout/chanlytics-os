import "server-only";
import { deployment } from "../deployment";
import { edgeHeaders, edgeUrl } from "../edge";

/* ---- Templates as Meta holds them: the edge reads the number's account ---- */

export type SyncOutcome =
  | { ok: true; seen: number; approved: number; marketing: number; syncedAt: string }
  | { ok: false; reason: string; detail?: string };

/** Every template of the workspace's WhatsApp account, upserted; a row Meta does not return is left as it was. */
export async function syncTemplates(tenantId: string): Promise<SyncOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await fetch(`${edgeUrl()}/api/admin/whatsapp/templates-sync`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/whatsapp/templates-sync", { workspace: tenantId }),
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  const j = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    seen?: number;
    approved?: number;
    marketing?: number;
    synced_at?: string;
    error?: string;
    detail?: string;
  };
  if (r.ok && j.ok) {
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

export type TemplateCreateOutcome =
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
  const r = await fetch(`${edgeUrl()}/api/admin/whatsapp/templates-create`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/whatsapp/templates-create", { workspace: tenantId, user: userId }),
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, ...t }),
  });
  const j = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    id?: string;
    meta_status?: string;
    error?: string;
    detail?: string;
  };
  if (r.ok && j.ok && j.id) return { ok: true, id: j.id, metaStatus: j.meta_status ?? "pending" };
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

export type TemplateDeleteOutcome = { ok: true; atMeta: boolean } | { ok: false; reason: string; detail?: string };

export async function deleteTemplate(tenantId: string, templateId: string): Promise<TemplateDeleteOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await fetch(`${edgeUrl()}/api/admin/whatsapp/templates-delete`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/whatsapp/templates-delete", { workspace: tenantId }),
    body: JSON.stringify({ tenant_id: tenantId, template_id: templateId }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; at_meta?: boolean; error?: string; detail?: string };
  if (r.ok && j.ok) return { ok: true, atMeta: !!j.at_meta };
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

/**
 * Templates as Meta holds them.
 *
 * WhatsApp Manager is where a business writes a template and Meta is where
 * it is approved, categorised, paused or disabled; the product only ever
 * reads. This module lists a WABA's templates and turns each into the row
 * the templates table keeps: status and category in the table's own words,
 * the body text as the preview, the numbered variables the body names with
 * Meta's own examples, and the components verbatim for the day a send needs
 * a header or a button. Labels a person gave a variable by hand are kept
 * when the positions still match; a sync never makes a template less
 * legible than it was.
 */
import { GRAPH_VERSION } from "./meta-graph.js";

export interface MetaTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  example?: { body_text?: string[][]; header_text?: string[] };
  buttons?: unknown[];
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: MetaTemplateComponent[];
  quality_score?: { score?: string };
  rejected_reason?: string;
}

export type TemplateStatus = "approved" | "pending" | "rejected" | "paused" | "disabled";
export type TemplateCategory = "marketing" | "utility" | "authentication";

export interface TemplateVariable {
  position: number;
  label: string;
  example: string | null;
}

const FIELDS = "id,name,language,status,category,components,quality_score,rejected_reason";
const PAGE = 100;
const MAX_PAGES = 10;

export async function listTemplates(
  token: string,
  wabaId: string,
): Promise<{ ok: true; templates: MetaTemplate[] } | { ok: false; error: string; status: number }> {
  const out: MetaTemplate[] = [];
  let url: string | null = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?fields=${FIELDS}&limit=${PAGE}`;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), status: 0 };
    }
    const body = (await res.json().catch(() => null)) as
      | { data?: MetaTemplate[]; paging?: { next?: string }; error?: { message?: string } }
      | null;
    if (!res.ok || !body) return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}`, status: res.status };
    out.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }
  return { ok: true, templates: out };
}

/** Meta's status words into the table's. Anything still in flight is pending. */
export function mapStatus(s: string | null | undefined): TemplateStatus {
  switch (String(s ?? "").toUpperCase()) {
    case "APPROVED": return "approved";
    case "REJECTED": return "rejected";
    case "PAUSED": return "paused";
    case "DISABLED":
    case "DELETED":
    case "PENDING_DELETION": return "disabled";
    default: return "pending";
  }
}

export function mapCategory(c: string | null | undefined): TemplateCategory | null {
  switch (String(c ?? "").toUpperCase()) {
    case "MARKETING": return "marketing";
    case "UTILITY": return "utility";
    case "AUTHENTICATION": return "authentication";
    default: return null;
  }
}

function bodyComponent(t: MetaTemplate): MetaTemplateComponent | undefined {
  return (t.components ?? []).find((c) => String(c.type).toUpperCase() === "BODY");
}

export function bodyOf(t: MetaTemplate): string | null {
  const text = bodyComponent(t)?.text;
  return typeof text === "string" && text.trim() ? text : null;
}

/** The variables the body names, in order, with Meta's examples and any label a person gave them. */
export function variablesOf(t: MetaTemplate, keepLabels: TemplateVariable[] = []): TemplateVariable[] {
  const body = bodyOf(t) ?? "";
  const positions = new Set<number>();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) positions.add(Number(m[1]));
  const examples = bodyComponent(t)?.example?.body_text?.[0] ?? [];
  return [...positions]
    .sort((a, b) => a - b)
    .map((n) => ({
      position: n,
      label: keepLabels.find((k) => k.position === n)?.label ?? `Value ${n}`,
      example: typeof examples[n - 1] === "string" ? examples[n - 1] : null,
    }));
}

/** The labels a row already holds, when they are the shape this module writes. */
export function labelsOf(variables: unknown): TemplateVariable[] {
  if (!Array.isArray(variables)) return [];
  return variables
    .filter((v): v is { position: number; label: string } => !!v && typeof v === "object" && typeof (v as { position?: unknown }).position === "number" && typeof (v as { label?: unknown }).label === "string")
    .map((v) => ({ position: v.position, label: v.label, example: null }));
}

export interface TemplateRow {
  tenant_id: string;
  channel: "whatsapp";
  name: string;
  language: string;
  meta_status: TemplateStatus;
  category: TemplateCategory | null;
  meta_id: string;
  components: MetaTemplateComponent[] | null;
  quality: string | null;
  rejected_reason: string | null;
  body_preview: string | null;
  variables: TemplateVariable[];
  synced_at: string;
}

export function templateRow(t: MetaTemplate, tenantId: string, keepLabels: TemplateVariable[] = [], now = new Date()): TemplateRow {
  const status = mapStatus(t.status);
  const reason = typeof t.rejected_reason === "string" && t.rejected_reason !== "NONE" ? t.rejected_reason : null;
  return {
    tenant_id: tenantId,
    channel: "whatsapp",
    name: t.name,
    language: t.language,
    meta_status: status,
    category: mapCategory(t.category),
    meta_id: t.id,
    components: t.components ?? null,
    quality: t.quality_score?.score ?? null,
    rejected_reason: status === "rejected" ? reason : null,
    body_preview: bodyOf(t),
    variables: variablesOf(t, keepLabels),
    synced_at: now.toISOString(),
  };
}

/* ---- Templates written here ---- */

/** A template written here, submitted to Meta for review. Meta's own words come back when it says no. */
export async function createTemplate(
  token: string,
  wabaId: string,
  t: { name: string; language: string; category: string; components: MetaTemplateComponent[] },
): Promise<{ ok: true; data: { id: string; status: string; category?: string } } | { ok: false; error: string; status: number }> {
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: t.name, language: t.language, category: t.category, components: t.components, allow_category_change: true }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), status: 0 };
  }
  const body = (await res.json().catch(() => null)) as
    | { id?: string; status?: string; category?: string; error?: { message?: string; error_user_msg?: string } }
    | null;
  if (!res.ok || !body?.id) return { ok: false, error: body?.error?.error_user_msg ?? body?.error?.message ?? `HTTP ${res.status}`, status: res.status };
  return { ok: true, data: { id: body.id, status: body.status ?? "PENDING", category: body.category } };
}

/** Gone from Meta: by name and the template's own id, so one language goes and not every language of that name. */
export async function deleteTemplate(
  token: string,
  wabaId: string,
  name: string,
  hsmId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const qs = new URLSearchParams({ name });
  if (hsmId) qs.set("hsm_id", hsmId);
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?${qs.toString()}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), status: 0 };
  }
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: { message?: string } } | null;
  if (!res.ok || !body?.success) return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}`, status: res.status };
  return { ok: true };
}

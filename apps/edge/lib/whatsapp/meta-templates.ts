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
import type { SchemaSet, TemplateStatus, TenantId } from "@chanlytics/contracts";
import { GRAPH_TIMEOUT_MS, GRAPH_VERSION } from "./meta-graph.js";
import { answerObject, fetchFromProvider } from "@chanlytics/channels/shared";
import {
  isList,
  listOrEmpty,
  NUMBERED_SLOT,
  nonEmptyOrNull,
  recordOrNull,
  textOrEmpty,
  valueAt,
} from "@chanlytics/contracts";

/**
 * A template's component as a page writes one for Meta: its type, and where it has them its format, its words and its
 * buttons. Its examples go to Meta as the page wrote them; nothing here reads them.
 */
interface MetaTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  example?: unknown;
  buttons?: unknown[];
}

/** Whether a value is a component as Meta takes one: a type, and its format, words and buttons each of its kind. */
function isMetaComponent(value: unknown): value is MetaTemplateComponent {
  const optional = (v: unknown, kind: "string" | "list") =>
    v === undefined || (kind === "list" ? isList(v) : typeof v === "string");
  return (
    typeof valueAt(value, "type") === "string" &&
    optional(valueAt(value, "format"), "string") &&
    optional(valueAt(value, "text"), "string") &&
    optional(valueAt(value, "buttons"), "list")
  );
}

/** A page's components for Meta, where every one is a component; none where any is not, or where there is no list. */
export function componentsOf(value: unknown): readonly MetaTemplateComponent[] | null {
  return isList(value) && value.every(isMetaComponent) ? value : null;
}

/** A template as Meta's list holds it, by the fields its row keeps (listedTemplateOf); its components as Meta wrote them. */
interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: readonly unknown[];
  quality_score?: { score?: string };
  rejected_reason?: string;
}

/** Words where a value is words, else none. */
const wordsOrNone = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/**
 * A template in Meta's list, read by the fields its row keeps: none without its id, its name or its language, which
 * the row is kept by and could not be written without.
 */
function listedTemplateOf(item: unknown): MetaTemplate[] {
  const id = nonEmptyOrNull(valueAt(item, "id"));
  const name = nonEmptyOrNull(valueAt(item, "name"));
  const language = nonEmptyOrNull(valueAt(item, "language"));
  if (!id || !name || !language) return [];
  const components = valueAt(item, "components");
  return [
    {
      id,
      name,
      language,
      status: textOrEmpty(valueAt(item, "status")),
      category: textOrEmpty(valueAt(item, "category")),
      ...(isList(components) ? { components } : {}),
      quality_score: { score: wordsOrNone(valueAt(item, "quality_score", "score")) },
      rejected_reason: wordsOrNone(valueAt(item, "rejected_reason")),
    },
  ];
}

/** Meta's refusal in an answer, by its words: its own, and the words it gives for a person, each where it has them. */
interface MetaRefusal {
  message: string | undefined;
  error_user_msg: string | undefined;
}

/**
 * A Graph answer, read by the fields this module uses: an id, a status and a category, whether it was done, a list's
 * page and the next page's address, and Meta's refusal; none for an answer that is no object.
 */
function graphAnswerOf(answer: Record<string, unknown> | null) {
  if (!answer) return null;
  const error = recordOrNull(answer.error);
  const refusal: MetaRefusal | undefined = error
    ? { message: wordsOrNone(error.message), error_user_msg: wordsOrNone(error.error_user_msg) }
    : undefined;
  return {
    id: wordsOrNone(answer.id),
    status: wordsOrNone(answer.status),
    category: wordsOrNone(answer.category),
    success: answer.success === true,
    data: listOrEmpty(answer.data).flatMap(listedTemplateOf),
    next: wordsOrNone(valueAt(answer, "paging", "next")),
    error: refusal,
  };
}

/** The columns' own sets (templates.meta_status, templates.category), not copies of them. */
type TemplateCategory = SchemaSet<"templates.category">;

interface TemplateVariable {
  position: number;
  label: string;
  example: string | null;
}

const FIELDS = "id,name,language,status,category,components,quality_score,rejected_reason";
const META_TEMPLATES_PAGE = 100;
const MAX_PAGES = 10;
/** Creating a template is given longer than a list or a delete. */
const CREATE_TIMEOUT_MS = 20_000;

export async function listTemplates(
  token: string,
  wabaId: string,
): Promise<{ ok: true; templates: MetaTemplate[] } | { ok: false; error: string; status: number }> {
  const out: MetaTemplate[] = [];
  let url: string | null =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?fields=${FIELDS}&limit=${META_TEMPLATES_PAGE}`;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await fetchFromProvider("meta", url, {
      headers: { authorization: `Bearer ${token}` },
      timeoutMs: GRAPH_TIMEOUT_MS,
      idempotent: true,
      tries: 2,
    });
    if (res.status === 0) return { ok: false, error: String(res.error), status: 0 };
    const body = graphAnswerOf(answerObject(res));
    if (res.outcome !== "ok" || !body)
      return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}`, status: res.status };
    out.push(...body.data);
    url = body.next ?? null;
  }
  return { ok: true, templates: out };
}

/** What WhatsApp says of one template now (getTemplate): its status word, its kind and its reason as Meta spells them. */
interface MetaTemplateNow {
  id: string;
  status: string;
  category: string | null;
  rejected_reason: string | null;
}

/**
 * One template as WhatsApp holds it now, by its id: what a review that went quiet past a day is asked again
 * (slow-reviews.ts), one read, bounded by Graph's own time, never tried twice inside the visit's time.
 */
export async function getTemplate(
  token: string,
  templateId: string,
): Promise<{ ok: true; template: MetaTemplateNow } | { ok: false; error: string; status: number }> {
  const res = await fetchFromProvider(
    "meta",
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(templateId)}?fields=id,status,category,rejected_reason`,
    { headers: { authorization: `Bearer ${token}` }, timeoutMs: GRAPH_TIMEOUT_MS, idempotent: true, tries: 1 },
  );
  if (res.status === 0) return { ok: false, error: String(res.error), status: 0 };
  const body = answerObject(res);
  const id = textOrEmpty(body?.id);
  const status = textOrEmpty(body?.status);
  const failure = recordOrNull(body?.error);
  if (res.outcome !== "ok" || !id || !status)
    return { ok: false, error: textOrEmpty(failure?.message) || `HTTP ${res.status}`, status: res.status };
  const category = textOrEmpty(body?.category) || null;
  return { ok: true, template: { id, status, category, rejected_reason: textOrEmpty(body?.rejected_reason) || null } };
}

/**
 * Meta's status words into the table's. Anything still in flight is pending. REINSTATED is a webhook's event, never a
 * status in Meta's list: a message turned back on, which can be sent again.
 */
export function mapStatus(text: string | null | undefined): TemplateStatus {
  switch (String(text ?? "").toUpperCase()) {
    case "APPROVED":
    case "REINSTATED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "PAUSED":
      return "paused";
    case "DISABLED":
    case "DELETED":
    case "PENDING_DELETION":
      return "disabled";
    default:
      return "pending";
  }
}

export function mapCategory(code: string | null | undefined): TemplateCategory | null {
  switch (String(code ?? "").toUpperCase()) {
    case "MARKETING":
      return "marketing";
    case "UTILITY":
      return "utility";
    case "AUTHENTICATION":
      return "authentication";
    default:
      return null;
  }
}

const TEMPLATE_QUALITIES = ["GREEN", "YELLOW", "RED", "UNKNOWN"] as const;
type TemplateQuality = (typeof TEMPLATE_QUALITIES)[number];
/** A number's quality has the template's four words and Meta's NA, a number it has not rated; no template has it. */
const NUMBER_QUALITIES = [...TEMPLATE_QUALITIES, "NA"] as const;
type NumberQuality = (typeof NUMBER_QUALITIES)[number];

/** Which of `words` Meta's word is, however it cased or padded it, else null: the one rule behind every quality. */
function qualityIn<W extends string>(words: readonly W[], q: unknown): W | null {
  const word = typeof q === "string" ? q.trim().toUpperCase() : "";
  return words.find((w) => w === word) ?? null;
}

/** A template's quality in Meta's own words (the Templates page's pill is keyed by them); any other value is no quality. */
export function mapQuality(query: unknown): TemplateQuality | null {
  return qualityIn(TEMPLATE_QUALITIES, query);
}

/** A number's quality in Meta's own words (the channel-quality sweep keeps it); any other value is no quality. */
export function mapNumberQuality(query: unknown): NumberQuality | null {
  return qualityIn(NUMBER_QUALITIES, query);
}

/** A listed template's body, the component Meta types BODY, read where it is used. */
function bodyComponent(t: MetaTemplate): unknown {
  return listOrEmpty(t.components).find((c) => textOrEmpty(valueAt(c, "type")).toUpperCase() === "BODY");
}

export function bodyOf(metaTemplate: MetaTemplate): string | null {
  const text = valueAt(bodyComponent(metaTemplate), "text");
  return typeof text === "string" && text.trim() ? text : null;
}

/** The variables the body names, in order, with Meta's examples and any label a person gave them. */
export function variablesOf(metaTemplate: MetaTemplate, keepLabels: TemplateVariable[] = []): TemplateVariable[] {
  const body = bodyOf(metaTemplate) ?? "";
  const positions = new Set<number>();
  for (const m of body.matchAll(NUMBERED_SLOT)) positions.add(Number(m[1]));
  const examples = listOrEmpty(valueAt(bodyComponent(metaTemplate), "example", "body_text", 0));
  return [...positions]
    .sort((a, b) => a - b)
    .map((n) => {
      const example = examples[n - 1];
      return {
        position: n,
        label: keepLabels.find((k) => k.position === n)?.label ?? `Value ${n}`,
        example: typeof example === "string" ? example : null,
      };
    });
}

/** The labels a row already holds, when they are the shape this module writes. */
export function labelsOf(variables: unknown): TemplateVariable[] {
  if (!Array.isArray(variables)) return [];
  return variables
    .filter(
      (v): v is { position: number; label: string } =>
        typeof valueAt(v, "position") === "number" && typeof valueAt(v, "label") === "string",
    )
    .map((v) => ({ position: v.position, label: v.label, example: null }));
}

interface TemplateRow {
  tenant_id: TenantId;
  channel: "whatsapp";
  name: string;
  language: string;
  meta_status: TemplateStatus;
  category: TemplateCategory | null;
  meta_id: string;
  components: readonly unknown[] | null;
  quality: TemplateQuality | null;
  rejected_reason: string | null;
  body_preview: string | null;
  variables: TemplateVariable[];
  synced_at: string;
}

export function templateRow(
  metaTemplate: MetaTemplate,
  tenantId: TenantId,
  keepLabels: TemplateVariable[] = [],
  now = new Date(),
): TemplateRow {
  const status = mapStatus(metaTemplate.status);
  const reason =
    typeof metaTemplate.rejected_reason === "string" && metaTemplate.rejected_reason !== "NONE"
      ? metaTemplate.rejected_reason
      : null;
  return {
    tenant_id: tenantId,
    channel: "whatsapp",
    name: metaTemplate.name,
    language: metaTemplate.language,
    meta_status: status,
    category: mapCategory(metaTemplate.category),
    meta_id: metaTemplate.id,
    components: metaTemplate.components ?? null,
    quality: mapQuality(metaTemplate.quality_score?.score),
    rejected_reason: status === "rejected" ? reason : null,
    body_preview: bodyOf(metaTemplate),
    variables: variablesOf(metaTemplate, keepLabels),
    synced_at: now.toISOString(),
  };
}

/* ---- Templates written here ---- */

/** A template written here, submitted to Meta for review. Meta's own words come back when it says no. */
export async function createTemplate(
  token: string,
  wabaId: string,
  target: { name: string; language: string; category: string; components: readonly MetaTemplateComponent[] },
): Promise<
  { ok: true; data: { id: string; status: string; category?: string } } | { ok: false; error: string; status: number }
> {
  const res = await fetchFromProvider(
    "meta",
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: target.name,
        language: target.language,
        category: target.category,
        components: target.components,
        allow_category_change: true,
      }),
      timeoutMs: CREATE_TIMEOUT_MS,
    },
  );
  if (res.status === 0) return { ok: false, error: String(res.error), status: 0 };
  const body = graphAnswerOf(answerObject(res));
  if (res.outcome !== "ok" || !body?.id)
    return {
      ok: false,
      error: body?.error?.error_user_msg ?? body?.error?.message ?? `HTTP ${res.status}`,
      status: res.status,
    };
  return { ok: true, data: { id: body.id, status: body.status ?? "PENDING", category: body.category } };
}

/**
 * A template's words changed at Meta (POST /{template id}, its components whole: Meta replaces every one of them). An
 * approved template takes this up to once a day and ten times in thirty days, a refused or paused one as often as asked
 * (Meta's template management page, read 12 Nov 2026); Meta reviews the new words, and its answer arrives as any other
 * (waba-events.ts). Its own words come back when it says no.
 */
export async function editTemplate(
  token: string,
  metaId: string,
  components: readonly MetaTemplateComponent[],
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const res = await fetchFromProvider(
    "meta",
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(metaId)}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ components }),
      timeoutMs: CREATE_TIMEOUT_MS,
    },
  );
  if (res.status === 0) return { ok: false, error: String(res.error), status: 0 };
  const body = graphAnswerOf(answerObject(res));
  if (res.outcome !== "ok" || !body?.success)
    return {
      ok: false,
      error: body?.error?.error_user_msg ?? body?.error?.message ?? `HTTP ${res.status}`,
      status: res.status,
    };
  return { ok: true };
}

/**
 * Gone from Meta: by name and the template's own id, so one language goes and
 * not every language of that name.
 *
 * `hsmId` is REQUIRED, and that is the whole point. It was optional, and a
 * caller with nothing to pass sent `?name=` alone — which Meta reads as every
 * language of that name, and then holds the name for thirty days. There is no
 * caller that wants that, so the type no longer allows it to happen by
 * omission.
 */
export async function deleteTemplate(
  token: string,
  wabaId: string,
  name: string,
  hsmId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const qs = new URLSearchParams({ name, hsm_id: hsmId });
  const res = await fetchFromProvider(
    "meta",
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?${qs.toString()}`,
    { method: "DELETE", headers: { authorization: `Bearer ${token}` }, timeoutMs: GRAPH_TIMEOUT_MS },
  );
  if (res.status === 0) return { ok: false, error: String(res.error), status: 0 };
  const body = graphAnswerOf(answerObject(res));
  if (res.outcome !== "ok" || !body?.success)
    return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}`, status: res.status };
  return { ok: true };
}

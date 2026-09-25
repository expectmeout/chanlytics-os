/**
 * A workspace's own sending domains at the mail provider (Resend's domains API): create one, read where it stands,
 * ask for it to be checked, remove it. Reach out, Part 2 (docs/superpowers/plans/2026-09-25-reach-out-part-2-the-wire.md).
 *
 * These run on the COLD account's key only (the edge's RESEND_COLD_API_KEY): a business's own domains send its cold
 * mail, apart from the account every reminder and reply leaves on. Opens and clicks are switched off by name: the
 * provider's own example domain has open tracking on, and the product counts neither (decision 8 of the spec).
 *
 * Like postEmail, nothing here throws for an answer: each call returns what the provider said, and "we could not
 * ask" (status 0) is kept apart from any answer it gave.
 */
import type { DomainRecord } from "@chanlytics/contracts";
import type { ResendConfig } from "./email-resend";

const RESEND_DOMAINS = "https://api.resend.com/domains";
const TIMEOUT_MS = 15_000;

/** One domain as the provider holds it: its id, the word for where it stands, and the records to publish. */
export interface ProviderDomain {
  id: string;
  name: string;
  status: string;
  records: DomainRecord[];
}

export type ProviderAnswer<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

const unquote = (s: string): string => {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
};

/** A record as a registrar wants it typed: the value without the quotes the provider wraps a TXT in. */
function recordFrom(r: unknown): DomainRecord | null {
  const o = (r ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null =>
    typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string) : null;
  const label = str("record");
  const type = str("type");
  const name = str("name");
  const value = str("value");
  if (!label || !type || !name || !value) return null;
  // Tracking is off on every domain we create; a tracking record, if one is ever listed, is not ours to publish.
  if (label.toLowerCase() === "tracking") return null;
  return {
    label,
    type: type.toUpperCase(),
    name: name.trim(),
    value: type.toUpperCase() === "TXT" ? unquote(value) : value.trim(),
    priority: typeof o.priority === "number" && Number.isFinite(o.priority) ? o.priority : null,
    status: str("status")?.trim() ?? "unknown",
  };
}

/** A domain in a provider's answer; null when the answer is not a domain at all. */
export function providerDomainFrom(body: unknown): ProviderDomain | null {
  const d = (body ?? {}) as Record<string, unknown>;
  if (typeof d.id !== "string" || !d.id || typeof d.name !== "string" || !d.name) return null;
  const records = Array.isArray(d.records) ? d.records.map(recordFrom).filter((r): r is DomainRecord => !!r) : [];
  return {
    id: d.id,
    name: d.name.trim().toLowerCase(),
    status: typeof d.status === "string" && d.status.trim() ? d.status.trim() : "unknown",
    records,
  };
}

async function call(
  cfg: ResendConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown; raw: string }> {
  try {
    const r = await fetch(`${RESEND_DOMAINS}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const raw = await r.text().catch(() => "");
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { status: r.status, json, raw };
  } catch (e) {
    return { status: 0, json: null, raw: e instanceof Error ? e.message : String(e) };
  }
}

/** What went wrong, in the provider's own words when it gave some. */
function refusal(status: number, json: unknown, raw: string): { ok: false; status: number; message: string } {
  const m = (json as { message?: unknown } | null)?.message;
  return {
    ok: false,
    status,
    message: typeof m === "string" && m.trim() ? m.trim() : raw.slice(0, 200) || `HTTP ${status}`,
  };
}

/** Register a domain at the cold account: sending on, receiving off, opens and clicks off. */
export async function createMailDomain(cfg: ResendConfig, host: string): Promise<ProviderAnswer<ProviderDomain>> {
  const r = await call(cfg, "POST", "", {
    name: host,
    region: "us-east-1",
    open_tracking: false,
    click_tracking: false,
    capabilities: { sending: "enabled", receiving: "disabled" },
  });
  if (r.status < 200 || r.status >= 300) return refusal(r.status, r.json, r.raw);
  const d = providerDomainFrom(r.json);
  return d
    ? { ok: true, value: d }
    : { ok: false, status: r.status, message: "the provider answered a shape that is not a domain" };
}

/** Where a domain stands. `value: null` is the provider saying it has no such domain (404): a fact, not a failure. */
export async function getMailDomain(cfg: ResendConfig, id: string): Promise<ProviderAnswer<ProviderDomain | null>> {
  const r = await call(cfg, "GET", `/${encodeURIComponent(id)}`);
  if (r.status === 404) return { ok: true, value: null };
  if (r.status < 200 || r.status >= 300) return refusal(r.status, r.json, r.raw);
  const d = providerDomainFrom(r.json);
  return d
    ? { ok: true, value: d }
    : { ok: false, status: r.status, message: "the provider answered a shape that is not a domain" };
}

/** At most this many pages of 100 are read looking for one name: an account with more domains than that is a finding. */
const FIND_PAGES_MAX = 20;

/**
 * The account's own domain by that name, or null when the account has none: the truth about whether a create whose
 * answer was lost (a timeout, a 5xx, a shape that is not a domain) made one anyway, and what an adoption reads. The
 * list carries no records; the caller reads the domain by its id for them.
 */
export async function findMailDomain(
  cfg: ResendConfig,
  name: string,
): Promise<ProviderAnswer<{ id: string; name: string; status: string } | null>> {
  const want = name.trim().toLowerCase();
  let after: string | null = null;
  for (let page = 0; page < FIND_PAGES_MAX; page++) {
    const r = await call(cfg, "GET", `?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    if (r.status < 200 || r.status >= 300) return refusal(r.status, r.json, r.raw);
    const body = (r.json ?? {}) as { data?: unknown; has_more?: unknown };
    if (!Array.isArray(body.data))
      return { ok: false, status: r.status, message: "the provider answered a shape that is not a list" };
    let last: string | null = null;
    for (const d of body.data as Array<Record<string, unknown>>) {
      if (typeof d?.id !== "string") continue;
      last = d.id;
      if (typeof d.name === "string" && d.name.trim().toLowerCase() === want)
        return {
          ok: true,
          value: { id: d.id, name: want, status: typeof d.status === "string" && d.status ? d.status : "unknown" },
        };
    }
    if (body.has_more !== true || !last) return { ok: true, value: null };
    after = last;
  }
  return { ok: false, status: 0, message: `more than ${FIND_PAGES_MAX * 100} domains to look through` };
}

/** Ask the provider to check the records now. Asynchronous at the provider: the answer is read by getMailDomain. */
export async function verifyMailDomain(cfg: ResendConfig, id: string): Promise<ProviderAnswer<true>> {
  const r = await call(cfg, "POST", `/${encodeURIComponent(id)}/verify`);
  if (r.status < 200 || r.status >= 300) return refusal(r.status, r.json, r.raw);
  return { ok: true, value: true };
}

/** Remove a domain. Already gone (404) is gone: the removal the caller wanted. */
export async function removeMailDomain(cfg: ResendConfig, id: string): Promise<ProviderAnswer<"removed" | "gone">> {
  const r = await call(cfg, "DELETE", `/${encodeURIComponent(id)}`);
  if (r.status === 404) return { ok: true, value: "gone" };
  if (r.status < 200 || r.status >= 300) return refusal(r.status, r.json, r.raw);
  return { ok: true, value: "removed" };
}

/**
 * Whether a set of TXT answers holds a DMARC record: any whose chunks, joined, begin `v=DMARC1` (RFC 7489 §6.4).
 * A record is split into 255-byte chunks on the wire, so the chunks are joined before the test.
 */
export function dmarcOf(txt: readonly (readonly string[])[]): "found" | "missing" {
  return txt.some((chunks) => /^v=DMARC1\s*(;|$)/i.test(chunks.join("").trim())) ? "found" : "missing";
}

import "server-only";

/**
 * The public facts of one workspace's opt-in page, read by slug.
 *
 * This page has no session — a customer opens it from a QR at the desk or a
 * link in a bio — so it reads with the service role, and returns EXACTLY the
 * three facts the page shows: the business's name and the numbers customers
 * already write to. Nothing else crosses this boundary, and nothing here
 * writes. A workspace that does not exist, or is a test fixture, has no page.
 *
 * This is the third place the dashboard holds the service role (service-db.ts
 * for jobs, signup.ts for the one door a stranger may open), and like the
 * second it touches no tenant data.
 */
import { serviceDb } from "../service-db";

interface ConsentPageRow {
  businessName: string;
  /** The workspace's slug, for the links to its own privacy page and terms. */
  slug: string;
  /** Whether `/b/<slug>` publishes: a legal name and an address on record. */
  businessPage: boolean;
  whatsappE164: string | null;
  smsE164: string | null;
}

/** A slug as `create_workspace` mints them: lowercase letters, digits and dashes. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export async function consentPageFor(slug: string): Promise<ConsentPageRow | null> {
  const clean = slug.trim().toLowerCase();
  if (!SLUG.test(clean)) return null;
  const db = serviceDb();
  const { data: tenant, error } = await db.from("tenants").select("id, name, status").eq("slug", clean).maybeSingle();
  if (error) throw new Error(`reading the workspace: ${error.message}`);
  if (!tenant || tenant.status === "test") return null;

  const { data: channels, error: chErr } = await db
    .from("tenant_channels")
    .select("kind, number_e164")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .in("kind", ["whatsapp", "sms"]);
  if (chErr) throw new Error(`reading the channels: ${chErr.message}`);
  const numberOf = (kind: string) => channels?.find((c) => c.kind === kind && c.number_e164)?.number_e164 ?? null;
  // Whether the business's own page publishes -- it needs a legal name and an
  // address -- so the privacy and terms links beside the asks are the
  // business's own rather than Chanlytics'. Read, never written; no record is
  // simply no page.
  const { data: record } = await db
    .from("business_records")
    .select("legal_name, street, city")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  const businessPage = !!(record && record.legal_name.trim() && record.street.trim() && record.city.trim());
  return {
    businessName: tenant.name,
    slug: clean,
    businessPage,
    whatsappE164: numberOf("whatsapp"),
    smsE164: numberOf("sms"),
  };
}

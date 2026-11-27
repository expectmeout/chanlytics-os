/**
 * One workspace's public world for the public pages' tests: the business on record, its receptionist, its lines and its
 * plan, over a database in memory that the real readers (src/server/public) read through the service client. Each world
 * stands under a slug of its own, since a reader is a request cache's. Moved out of
 * a-paused-workspace-asks-nobody-for-a-yes.test.mjs on 26 Nov 2026, when the pages themselves came to be run by their
 * slug (the-pages-answer-for-their-slug.test.mjs).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { setServiceClient } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/shared/service-db.ts")).href
);

export const NAME = "Harbor Moving";
/** The business on record, every column the table has. */
export const RECORD = (tenant_id) => ({
  tenant_id,
  legal_name: "Harbor Moving LLC",
  trade_name: null,
  street: "1 Example Street",
  street_secondary: null,
  city: "Miami",
  region: "FL",
  postal_code: "33101",
  country: "US",
  contact_email: "owner@example.com",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_phone: "+13055550199",
  contact_title: "Owner",
  contact_job_position: "CEO",
  website_url: "",
  about: "Moves homes and offices across Miami.",
  industry: "PROFESSIONAL_SERVICES",
  business_type: "Limited Liability Corporation",
  company_type: "private",
  ein: "12-3456789",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

/** A receptionist whole enough to parse (a config the schema rejects reads as none), listing one service. */
export const BRAIN = {
  business_name: NAME,
  booking_link: "https://book.example.com/harbor",
  system_prompt: "Answer as the front desk: brief, warm, and never a price or a booking over text.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { services: [{ name: "Local move", duration_min: 240 }] },
};

let made = 0;
/** One workspace's world, under a slug of its own (the reader is a request cache's). */
export function world({
  status = "active",
  left_empty_at = null,
  billing = { mode: "stripe", status: "active" },
  record = true,
} = {}) {
  const id = `aaaaaaaa-0000-4000-8000-${String(++made).padStart(12, "0")}`;
  const slug = `harbor-${made}`;
  const tables = {
    tenants: [{ id, name: NAME, slug, status, left_empty_at }],
    billing_accounts: billing ? [{ tenant_id: id, ...billing }] : [],
    // `record`: the business on record, or columns over it (true is it as written above).
    business_records: record ? [{ ...RECORD(id), ...(record === true ? {} : record) }] : [],
    tenant_config: [{ tenant_id: id, config: { brain: BRAIN } }],
    tenant_channels: [
      {
        tenant_id: id,
        kind: "whatsapp",
        status: "active",
        number_e164: "+13055550100",
        created_at: "2026-10-01T00:00:00Z",
      },
      { tenant_id: id, kind: "sms", status: "active", number_e164: "+13055550101", created_at: "2026-10-01T00:00:00Z" },
      {
        tenant_id: id,
        kind: "voice",
        status: "active",
        number_e164: "+13055550102",
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
  };
  const db = fakeDb(tables);
  setServiceClient(db);
  return { slug, db };
}

/** A world whose read of one table is refused, by its slug. */
export function worldFaulted(table) {
  const id = `bbbbbbbb-0000-4000-8000-${String(++made).padStart(12, "0")}`;
  const slug = `faulted-${made}`;
  const tables = {
    tenants: [{ id, name: NAME, slug, status: "active", left_empty_at: null }],
    billing_accounts: [{ tenant_id: id, mode: "stripe", status: "active" }],
    business_records: [RECORD(id)],
    tenant_config: [{ tenant_id: id, config: {} }],
    tenant_channels: [
      { tenant_id: id, kind: "sms", status: "active", number_e164: "+13055550101", created_at: "2026-10-01T00:00:00Z" },
    ],
  };
  setServiceClient(fakeDb(tables, { [`${table}.select`]: { message: "statement timeout" } }));
  return slug;
}

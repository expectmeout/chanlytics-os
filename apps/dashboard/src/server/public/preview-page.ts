import "server-only";

/**
 * A lead's own receptionist's page (decision 0079), read by its link's token on the service role: the person opening it
 * has no session, and the token is the only thing they hold. What it is drawn from: the preview's row (its state, its
 * clock, its chat), the preview workspace's name and look (0075's, as every link's page wears it, link-page.ts) and its
 * Business record, and the number on the lead the sender wrote to.
 *
 * A token that names nothing is no page (null): the proxy answers it Not found before the page renders
 * (public-page-gate.ts), and the page's own notFound() is the floor. A preview whose workspace is gone (ended, its lead
 * erased) still has a page, which says it ended.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneDisplay, parseTenantConfig, type PreviewPageFacts } from "@chanlytics/contracts";
import {
  getTenantConfig,
  leadForPreview,
  leadPreviewByToken,
  type Database,
  type LeadPreviewRow,
} from "@chanlytics/db";
import { linkPageDb, linkPageLookOf, NO_LOOK, type LinkPageLook } from "./link-page";

type Db = SupabaseClient<Database>;

/** What the page is drawn from, and the row its routes act on. */
export interface PreviewPageRead {
  row: LeadPreviewRow;
  facts: PreviewPageFacts;
  look: LinkPageLook;
}

/** The preview workspace's record, or none where it cannot be read: the page says only what it knows. */
async function profileOf(db: Db, tenantId: string): Promise<PreviewPageFacts["profile"]> {
  const row = await getTenantConfig(db, tenantId).catch(() => null);
  return parseTenantConfig(row?.config ?? null)?.brain?.profile ?? null;
}

/** The number the business's listing gives, from the lead it was made from; none where the lead is gone. */
async function phoneOf(db: Db, row: LeadPreviewRow): Promise<string | null> {
  const lead = await leadForPreview(db, row.tenant_id, row.lead_id).catch(() => null);
  return formatPhoneDisplay(lead?.phone_e164 ?? null);
}

/** The page's read for a token, or null where it names no preview. Throws where the database cannot be asked. */
export async function previewPageFor(token: string, db: Db | null = linkPageDb()): Promise<PreviewPageRead | null> {
  if (!db) throw new Error("preview page: this deployment holds no service-role key");
  const row = await leadPreviewByToken(db, token);
  if (!row) return null;
  const ws = row.preview_tenant_id;
  const [look, profile, phone] = ws
    ? await Promise.all([linkPageLookOf(db, ws), profileOf(db, ws), phoneOf(db, row)])
    : [NO_LOOK, null, null];
  return {
    row,
    look,
    facts: {
      state: row.state,
      ends_at: row.ends_at,
      asked_count: row.asked_count,
      turns: row.turns,
      business: look.business ?? "",
      logo_url: look.logo_url,
      profile,
      phone_display: phone,
      call_seconds: row.call_seconds,
    },
  };
}

/** Whether a token names a preview, for the proxy's question before the page renders. */
export async function previewNamed(token: string): Promise<boolean> {
  const db = linkPageDb();
  return !!db && !!(await leadPreviewByToken(db, token));
}

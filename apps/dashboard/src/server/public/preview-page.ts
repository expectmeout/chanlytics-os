import "server-only";

/**
 * A lead's own receptionist's page (decision 0079), read by its link's token on the service role: the person opening it
 * has no session, and the token is the only thing they hold. What it is drawn from: the preview's row (its state, its
 * clock, its chat), the preview workspace's name and look (0075's, as every link's page wears it, link-page.ts) and its
 * Business record, and the number on the lead the sender wrote to.
 *
 * A token that names nothing is no page (null): the proxy answers it Not found before the page renders
 * (public/page-gate.ts), and the page's own notFound() is the floor. A preview whose workspace is gone (ended, its lead
 * erased) still has a page, which says it ended.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneDisplay, parseTenantConfig, type PreviewPageFacts } from "@chanlytics/contracts";
import { getTenantConfig } from "@chanlytics/db/workspace";
import { findLeadForPreview, findLeadPreviewByToken, type LeadPreviewRow } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { linkPageDb, linkPageLookOf, NO_LOOK, type LinkPageLook } from "./link-page";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What the page is drawn from, and the row its routes act on. */
interface PreviewPageRead {
  row: LeadPreviewRow;
  facts: PreviewPageFacts;
  look: LinkPageLook;
}

/**
 * What the preview's workspace keeps for its page: its record, and the questions written for it as it was built
 * (config `preview.starters`, as kept: contracts reads each for what it is).
 */
type PreviewKept = Pick<PreviewPageFacts, "profile" | "starters">;

/** What it keeps, or none of either where its settings cannot be read: the page says only what it knows. */
async function previewKeptOf(db: Db, tenantId: TenantId): Promise<PreviewKept> {
  const row = await getTenantConfig(db, tenantId).catch(() => null);
  const config = parseTenantConfig(row?.config ?? null);
  return { profile: config?.brain?.profile ?? null, starters: config?.preview?.starters };
}

/** A preview whose workspace is gone keeps nothing. */
const NOTHING_KEPT: PreviewKept = { profile: null };

/** The preview workspace's record, or none where it cannot be read. */
export async function previewProfileOf(db: Db, tenantId: TenantId): Promise<PreviewPageFacts["profile"]> {
  return (await previewKeptOf(db, tenantId)).profile;
}

/** What the page shows of the lead it was made from: its listing's number and its Google photo; none where it is gone. */
async function leadShownOf(db: Db, row: LeadPreviewRow): Promise<{ phone: string | null; photo: string | null }> {
  const lead = await findLeadForPreview(db, row.tenant_id, row.lead_id).catch(() => null);
  return { phone: formatPhoneDisplay(lead?.phone_e164 ?? null), photo: lead?.image_url ?? null };
}

/** The page's read for a token, or null where it names no preview. Throws where the database cannot be asked. */
export async function findPreviewPage(token: string, db: Db | null = linkPageDb()): Promise<PreviewPageRead | null> {
  if (!db) throw new Error("preview page: this deployment holds no service-role key");
  const row = await findLeadPreviewByToken(db, token);
  if (!row) return null;
  const ws = row.preview_tenant_id;
  const [look, kept, shown] = ws
    ? await Promise.all([linkPageLookOf(db, ws), previewKeptOf(db, ws), leadShownOf(db, row)])
    : [NO_LOOK, NOTHING_KEPT, { phone: null, photo: null }];
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
      profile: kept.profile,
      starters: kept.starters,
      phone_display: shown.phone,
      call_seconds: row.call_seconds,
      call_count: row.call_count,
      photo_url: shown.photo,
    },
  };
}

/** Whether a token names a preview, for the proxy's question before the page renders. */
export async function previewNamed(token: string): Promise<boolean> {
  const db = linkPageDb();
  return !!db && !!(await findLeadPreviewByToken(db, token));
}

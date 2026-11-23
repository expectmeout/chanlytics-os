/**
 * The brand kit a workspace's videos wear, read once for the press and for Settings › Content (contracts
 * content/making/kit.ts): what the owner said of the look (the config's `content.look`, their sentence kept as
 * `content.lines.look`), and what AI proposed from the website on day one (the website read's `kit`), with the colour and
 * the mark the workspace already keeps (Details, the website read).
 */
import "server-only";
import { brandKitOf, parseTenantConfig, recordOrNull, type BrandKit, type TenantId } from "@chanlytics/contracts";
import { listBusinessReads } from "@chanlytics/db/imports";
import { findWorkspaceLook } from "@chanlytics/db/look";
import type { RouteContext } from "@/server/shared/with-route";

/** The kit, and the colour and mark beside it (the mark where it is kept, null for none). */
interface BrandKitRead {
  kit: BrandKit;
  accent: string | null;
  logo_path: string | null;
  name: string | null;
}

/** What the website read proposed for the look, where its read kept one. */
const proposedOf = (reads: readonly { source: string; facts: unknown }[]): unknown =>
  recordOrNull(reads.find((r) => r.source === "website")?.facts)?.kit;

/** The workspace's kit as it stands: `config` is the config already read by the caller. */
export async function readBrandKit(ctx: RouteContext, tenantId: TenantId, config: unknown): Promise<BrandKitRead> {
  const content = parseTenantConfig(config)?.content;
  const [reads, look] = await Promise.all([
    listBusinessReads(ctx.supabase, tenantId),
    findWorkspaceLook(ctx.supabase, tenantId),
  ]);
  return {
    kit: brandKitOf(content?.look, content?.lines?.look, proposedOf(reads)),
    accent: look?.accent ?? null,
    logo_path: look?.logo_path ?? null,
    name: look?.name ?? null,
  };
}

import "server-only";

/**
 * What the pages a link in an email opens share: the unsubscribe page (unsubscribe.ts) and a sign-up's confirmation
 * page (confirm.ts). Each is the one screen a stranger sees from an email, drawn as its own small HTML so it does not
 * depend on the app's bundle: the database it holds (the service role, since the person pressing has no session), the
 * headers it is answered with, the product's paper and ink, and the body a press sends.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accentOf, escapeHtml, workspaceLogoSrc } from "@chanlytics/contracts";
import { workspaceLookOf, type Database } from "@chanlytics/db";
import { env } from "@/server/env";
import { serviceDbIfConfigured } from "@/server/service-db";

/** A test's database; otherwise the dashboard's one service-role client, when this deployment holds its keys. */
let linkDb: SupabaseClient<Database> | null = null;

/** For tests: the database the pages read and write through. */
export function setLinkPageClient(db: SupabaseClient<Database> | null): void {
  linkDb = db;
}

/** The database a link's page reads and writes through, or null when this deployment holds no service-role key. */
export function linkPageDb(): SupabaseClient<Database> | null {
  return linkDb ?? serviceDbIfConfigured();
}

/** The largest body a one click or a page's button sends. Anything larger is not one. */
export const LINK_PAGE_MAX_BYTES = 4096;

export const LINK_PAGE_HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  // The token is in the path: nothing on the page links out, and nothing should carry it anywhere if it did.
  "referrer-policy": "no-referrer",
};

/** The product's paper and ink (legacy tokens.css), light and dark, so the page reads as the app's. */
const LINK_PAGE_STYLE = `
:root{--bg:oklch(0.985 0.003 80);--raised:oklch(1 0 0);--line:oklch(0.92 0.005 80);--ink:oklch(0.18 0.01 260);
--muted:oklch(0.42 0.01 260);--accent:oklch(0.52 0.19 25);--on-accent:#fff;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:oklch(0.16 0.005 260);--raised:oklch(0.2 0.006 260);
--line:oklch(0.27 0.008 260);--ink:oklch(0.96 0.004 80);--muted:oklch(0.74 0.008 260);--accent:oklch(0.7 0.18 28);
--on-accent:#1a0a06}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "Geist","Inter",-apple-system,BlinkMacSystemFont,sans-serif}
main{max-width:520px;margin:12vh auto 10vh;padding:0 22px}
.card{padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--raised)}
h1{font-size:1.35rem;margin:0 0 8px;text-wrap:balance}
p{margin:0;color:var(--muted);font-size:.95rem}
form{margin:18px 0 0}
button{font:inherit;font-weight:600;font-size:.95rem;border:0;border-radius:9px;padding:10px 18px;cursor:pointer;
background:var(--accent);color:var(--on-accent)}
button:hover{opacity:.9}
button.quiet{background:transparent;color:var(--muted);border:1px solid var(--line);font-weight:500}
form+form{margin-top:10px}
.foot{margin:18px 0 0;font-size:.8rem}
.mark{display:block;height:40px;width:auto;margin:0 0 14px}
.who{margin:0 0 14px;font-weight:700;color:var(--ink)}
`;

/** The business the page speaks for, as the letter wears it (decision 0075): its logo's address and its colour, or neither. */
export interface LinkPageLook {
  business: string | null;
  logo_url: string | null;
  accent: string | null;
}

export const NO_LOOK: LinkPageLook = { business: null, logo_url: null, accent: null };

/**
 * The workspace's look for its page, read on the service role; a workspace that cannot be read wears none, and the
 * page still answers (the look is never the reason a stop or a yes is lost).
 */
export async function linkPageLookOf(db: SupabaseClient<Database>, tenantId: string): Promise<LinkPageLook> {
  try {
    const row = await workspaceLookOf(db, tenantId);
    if (!row) return NO_LOOK;
    return {
      business: row.name,
      logo_url: workspaceLogoSrc(env.NEXT_PUBLIC_SUPABASE_URL, row.logo_path),
      accent: row.accent,
    };
  } catch {
    return NO_LOOK;
  }
}

/** The page's style: the product's paper, and the button and links in the business's colour where it has one. */
export function linkPageStyle(look: Pick<LinkPageLook, "accent">): string {
  if (!look.accent) return LINK_PAGE_STYLE;
  const accent = accentOf(look);
  return `${LINK_PAGE_STYLE}\n:root,:root[data-theme]{--accent:${accent};--on-accent:#fff}\n@media (prefers-color-scheme:dark){:root{--accent:${accent};--on-accent:#fff}}`;
}

/** The business at the top of the page: its logo, else its name, as the letter wears it; nothing when neither is known. */
export function linkPageMark(look: Pick<LinkPageLook, "business" | "logo_url">): string {
  if (look.logo_url)
    return `<img class="mark" src="${escapeHtml(look.logo_url)}" alt="${escapeHtml(look.business ?? "")}" height="40">`;
  return look.business ? `<p class="who">${escapeHtml(look.business)}</p>` : "";
}

/**
 * The body's fields, read no further than LINK_PAGE_MAX_BYTES. Lenient on purpose, because a stop lost to a strict
 * parser is a stop nobody sees: multipart when the type says so, otherwise the url-encoded form RFC 8058 names, whatever
 * type (or none) came with it, and every value trimmed of the line ending a client may leave on it.
 */
export async function readLinkFields(req: Request): Promise<Map<string, string> | "too_large" | "unreadable"> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LINK_PAGE_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return "too_large";
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  const type = req.headers.get("content-type") ?? "";
  const fields = new Map<string, string>();
  try {
    if (/multipart\/form-data/i.test(type)) {
      const form = await new Response(bytes, { headers: { "content-type": type } }).formData();
      for (const [k, v] of form) if (typeof v === "string") fields.set(k, v.trim());
    } else {
      for (const [k, v] of new URLSearchParams(new TextDecoder().decode(bytes).trim())) fields.set(k, v.trim());
    }
  } catch {
    return "unreadable";
  }
  return fields;
}

/**
 * The dashboard's public environment: the `NEXT_PUBLIC_*` values Next compiles into every bundle at build, and the
 * build's own `NODE_ENV`. The one module besides `src/server/shared/env.ts` that may read `process.env` in the dashboard
 * (eslint.config.mjs), and the only one browser code may import.
 *
 * Each value is read by its literal name, because that is the only form Next replaces with the value at build: a
 * read through a variable or a spread would reach the browser as undefined. Blank is unset and whitespace is
 * trimmed, as everywhere else. What these values must be is the server's to say (`src/server/shared/env.ts` checks them at
 * boot, from here); the browser only reads them.
 */

function blankAsUnset(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The project a client is made for, from the two values as the caller reads them (the browser from `publicEnv`, the
 * server from its checked `env`): both set, or a thrown error naming the one that is not. Production never starts without
 * them (REQUIRED_IN_PRODUCTION), and a client made with neither could only fail at its first call.
 */
export function supabaseProject(
  url: string | undefined,
  anonKey: string | undefined,
): { url: string; anonKey: string } {
  if (!url) throw new Error("env_invalid: NEXT_PUBLIC_SUPABASE_URL is required");
  if (!anonKey) throw new Error("env_invalid: NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  return { url, anonKey };
}

export const publicEnv = {
  /** The Supabase project: auth, storage and Realtime. Public by design; RLS is the boundary. */
  get NEXT_PUBLIC_SUPABASE_URL(): string | undefined {
    return blankAsUnset(process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  /** The anon key: safe in a bundle because every row it reads is behind RLS. */
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string | undefined {
    return blankAsUnset(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  /** The public half of the keys browsers are told with (D12 of the answers canvas). Unset, the choice is not offered. */
  get NEXT_PUBLIC_VAPID_PUBLIC_KEY(): string | undefined {
    return blankAsUnset(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  },
  /**
   * "1" in the nightly e2e's own build alone (.github/workflows/nightly-e2e.yml): Ask's client is put on the window for
   * the specs that ask it what a page would send (bridge/ask.ts). Unset everywhere a customer is, so nothing of it ships.
   */
  get NEXT_PUBLIC_E2E(): string | undefined {
    return blankAsUnset(process.env.NEXT_PUBLIC_E2E);
  },
  /** Where the lead map's basemap bundle lives: an origin or a same-origin path. Unset, the map stays a plot. */
  get NEXT_PUBLIC_LEAD_MAP_BASE(): string | undefined {
    return blankAsUnset(process.env.NEXT_PUBLIC_LEAD_MAP_BASE);
  },
  /**
   * Switch: "off" lets what other pages read go once the page on screen has its own reads, as before 23 Nov 2026; unset or
   * anything else, it waits for the page to be drawn too (bridge/workspace.ts pageFirst; the plan "Pages that open at
   * once", piece 3). A variable and a redeploy turn it off, never a code change (apps/edge/lib/shared/ai-flags.ts).
   */
  get NEXT_PUBLIC_PAGE_FIRST(): string | undefined {
    return blankAsUnset(process.env.NEXT_PUBLIC_PAGE_FIRST);
  },
  /**
   * Each page's own stylesheets, as next.config wrote and listed them (src/styles/page-sheets.ts SheetManifest, as
   * JSON). Unset where nothing wrote them (a test): a page then links none.
   */
  get NEXT_PUBLIC_SHEETS(): string | undefined {
    return blankAsUnset(process.env.NEXT_PUBLIC_SHEETS);
  },
  /** The build's commit, set by next.config from Vercel's; "dev" off Vercel. Keys the tab's caches to one build. */
  get NEXT_PUBLIC_BUILD_SHA(): string {
    return blankAsUnset(process.env.NEXT_PUBLIC_BUILD_SHA) ?? "dev";
  },
  /** Whether this is a production build (`next build`), as opposed to the development server. */
  get productionBuild(): boolean {
    return process.env.NODE_ENV === "production";
  },
};

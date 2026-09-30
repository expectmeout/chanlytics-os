/**
 * The dashboard's public environment: the `NEXT_PUBLIC_*` values Next compiles into every bundle at build, and the
 * build's own `NODE_ENV`. The one module besides `src/server/env.ts` that may read `process.env` in the dashboard
 * (eslint.config.mjs), and the only one browser code may import.
 *
 * Each value is read by its literal name, because that is the only form Next replaces with the value at build: a
 * read through a variable or a spread would reach the browser as undefined. Blank is unset and whitespace is
 * trimmed, as everywhere else. What these values must be is the server's to say (`src/server/env.ts` checks them at
 * boot, from here); the browser only reads them.
 */

function blankAsUnset(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
  /** Where the lead map's basemap bundle lives: an origin or a same-origin path. Unset, the map stays a plot. */
  get NEXT_PUBLIC_LEAD_MAP_BASE(): string | undefined {
    return blankAsUnset(process.env.NEXT_PUBLIC_LEAD_MAP_BASE);
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

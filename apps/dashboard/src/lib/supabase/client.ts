"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@chanlytics/db";
import { publicEnv } from "@/lib/public-env";

export function createClient() {
  return createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

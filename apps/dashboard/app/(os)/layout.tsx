import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side auth gate for every OS surface (middleware is the first line; this is the guarantee). */
export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}

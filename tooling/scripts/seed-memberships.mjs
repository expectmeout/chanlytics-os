/**
 * One-off Slice 0 seed: create the operator auth users (email-confirmed, OTP
 * login only) and their owner memberships on the Melany tenant. Idempotent.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_EMAILS (comma list).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const emails = (process.env.SEED_EMAILS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!url || !key || !emails.length) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_EMAILS required");
  process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: tenant, error: terr } = await db
  .from("tenants")
  .select("id, slug")
  .eq("slug", "melanys-beauty-salon")
  .single();
if (terr) {
  console.error("tenant lookup failed:", terr.message);
  process.exit(1);
}

for (const email of emails) {
  let userId;
  const { data: created, error: cerr } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (cerr) {
    if (!/already/i.test(cerr.message)) {
      console.error(email, "createUser:", cerr.message);
      continue;
    }
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email === email)?.id;
  } else {
    userId = created.user.id;
  }
  if (!userId) {
    console.error(email, "no user id resolved");
    continue;
  }
  const { error: merr } = await db
    .from("memberships")
    .upsert({ user_id: userId, tenant_id: tenant.id, role: "owner" }, { onConflict: "user_id,tenant_id" });
  console.log(email, "->", userId.slice(0, 8), merr ? `membership FAILED: ${merr.message}` : "owner of " + tenant.slug);
}

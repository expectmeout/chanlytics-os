import { createClient } from "@/lib/supabase/server";

/**
 * Slice 0 foundation page: proves auth + RLS end-to-end.
 * The tenants query runs on the SESSION client — rows appear only through the
 * caller's memberships (the §8 policy), which is exactly what this page verifies.
 * The legacy mockup bridge mounts here in Slice 0B.
 */
export default async function FoundationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("slug, name, status, timezone")
    .order("name");

  return (
    <main className="os-shell">
      <h1>Chanlytics OS — foundation online</h1>
      <div className="card">
        <p>
          Signed in as <code>{user?.email}</code>
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
      <div className="card">
        <h2>Your workspaces</h2>
        {error && <p className="muted">Query error: {error.message}</p>}
        {tenants && tenants.length === 0 && (
          <p className="muted">
            No workspaces yet — your account has no membership rows. RLS is doing its job;
            an admin needs to add you to a tenant.
          </p>
        )}
        <ul>
          {tenants?.map((t) => (
            <li key={t.slug}>
              <b>{t.name}</b> <span className="muted">({t.slug} · {t.status} · {t.timezone})</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="muted">
        Slice 0 of the build: auth, tenancy, and row-level security live. The workspace
        surfaces arrive slice by slice — Conversations first.
      </p>
    </main>
  );
}

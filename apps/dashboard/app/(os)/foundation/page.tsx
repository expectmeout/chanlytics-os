import { createClient } from "@/lib/supabase/server";

/** Slice-0 diagnostics: session + RLS-scoped workspaces (auth proof page). */
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
        The OS shell lives at <a href="/">/</a>. This page stays as an auth/RLS diagnostic.
      </p>
    </main>
  );
}

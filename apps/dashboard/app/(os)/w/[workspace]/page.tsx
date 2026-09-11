import LegacyHost from "@/legacy-bridge/LegacyHost";

/**
 * /w/<slug> — the OS shell for one workspace, named in the address (plan 3.5).
 * The bridge reads the slug from the path and names it on every request; the
 * hash router below it owns navigation, so /w/acme#/inbox is a deep link that
 * is correct by construction. The segment is not read here: the layout gates
 * the session, the server validates membership on each call.
 */
export default function WorkspacePage() {
  return <LegacyHost />;
}

import LegacyHost from "@/legacy-bridge/LegacyHost";

/**
 * The home: sends the tab to its workspace's own address, /w/<slug> — the
 * last one used, else the one the server calls active — carrying the query
 * and the hash route with it. An account with no workspace stays, and sees
 * the create screen. The shell itself lives under /w/[workspace].
 */
export default function OsPage() {
  return <LegacyHost home />;
}

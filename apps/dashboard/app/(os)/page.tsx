import LegacyHost from "@/legacy-bridge/LegacyHost";

/** The OS shell — the ported mockup behind auth. Its internal hash router
 *  owns navigation in Phase A, so every #/route deep link keeps working. */
export default function OsPage() {
  return <LegacyHost />;
}

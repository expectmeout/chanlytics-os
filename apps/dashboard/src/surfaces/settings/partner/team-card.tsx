/**
 * Settings › Team, as Settings' page draws it: the team card, whose last row is the workspace's partner (0020). The
 * partner's own card stood here under the team until 9 Oct 2026; it is that row now (team/partner.tsx), so one card
 * says who has access. Published on the Partner pane as its Team (settings/globals.ts).
 */
import type { LegacyFlash } from "../../legacy-verbs";
import { TeamSection } from "../team/team";

export function PaneTeam({ flash }: { flash: (f: LegacyFlash) => void }) {
  return <TeamSection flash={flash} />;
}

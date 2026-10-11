/**
 * Settings › Team on a phone: a row is one press, and it opens the person's sheet (the record kit's, which the Business
 * tab already draws here), where a desk has the row's picker and ⋯. The role with what each one does, the alerts
 * switch, and Remove, Leave or Revoke; Cancel and Save, an equal pair at the foot. A press on the row's picker and ⋯
 * was a 28px target among four on a 390px row.
 *
 * Save does what the desk's presses do, through the card: a role made Owner, a removal, a leave and a revocation are
 * asked on the row once the sheet closes, as they are on a desk.
 */
import { useState } from "react";
import { TEAM_ROLES, roleSays } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordSwitch } from "../../kit/record/field";
import { RecordSheet } from "../../kit/record/sheet";
import { Segmented } from "../../kit/segmented/segmented";
import type { TeamPerson } from "./people";
import type { RowActs } from "./rows";

type TeamRole = (typeof TEAM_ROLES)[number];

/** The words under the sheet's name: the address where a name was given, and when. */
const subOf = (p: TeamPerson) => [p.sub, p.when, p.left].filter(Boolean).join(" · ") || null;

/** The sheet's one destructive press: Remove, Leave or Revoke, asked on the row once the sheet is shut. */
function endOf(p: TeamPerson, k: RowActs) {
  if (p.kind === "invite")
    return k.canManage ? { words: "Revoke invitation…", go: () => k.arm({ kind: "revoke", id: p.id }) } : null;
  if (p.isMe)
    return k.lastOwner(p)
      ? null
      : {
          words: "Leave this workspace…",
          go: () => k.arm({ kind: "leave", id: p.id, dropAlerts: p.alerts && k.mayAlerts && !k.alertsHeld(p) }),
        };
  return k.canManage
    ? {
        words: "Remove from team…",
        go: () => k.arm({ kind: "remove", id: p.id, stopAlerts: p.alerts && !k.alertsHeld(p) }),
      }
    : null;
}

export function PersonSheet({ person: p, k, onClose }: { person: TeamPerson; k: RowActs; onClose: () => void }) {
  const [role, setRole] = useState<string>(p.role);
  const [alerts, setAlerts] = useState(p.alerts);
  const mayRole = k.canManage && !p.isMe && p.kind === "member" && p.role !== "partner";
  const mayAlerts = k.mayAlerts && p.kind === "member" && !!p.email;
  const held = p.alerts ? k.alertsHeld(p) : null;
  const end = endOf(p, k);
  const save = () => {
    onClose();
    if (mayAlerts && alerts !== p.alerts) k.setAlerts(p, alerts);
    if (mayRole && role !== p.role) k.pickRole(p, role);
  };
  return (
    <RecordSheet
      id="team-person"
      title={p.isMe ? `${p.name} (you)` : p.name}
      sub={subOf(p)}
      onClose={onClose}
      onSave={mayRole || mayAlerts ? save : null}
      saveLabel="Save"
      cancelLabel="Cancel"
      // A person's few choices, as tall as they are on a phone: they stood at the foot of a screen of blank.
      fit
      testid="team-sheet"
    >
      {mayRole ? (
        <Segmented
          label="Role"
          value={role as TeamRole}
          onValueChange={setRole}
          options={TEAM_ROLES.map((r) => ({ value: r, label: roleSays(r).label, hint: roleSays(r).short }))}
        />
      ) : (
        <p className="set-team-note">
          {roleSays(p.role).label}: {roleSays(p.role).short}
        </p>
      )}
      {mayAlerts && (
        <div className="set-check">
          <RecordSwitch
            labelledBy="team-sheet-alerts"
            on={alerts}
            onChange={(on) => {
              if (!on && held) return;
              setAlerts(on);
            }}
            testid="team-sheet-alerts"
          />
          <span id="team-sheet-alerts">
            {held && alerts ? `Gets alerts by email. ${held}` : "Gets alerts by email"}
          </span>
        </div>
      )}
      {p.isMe && (
        <LinkButton
          onClick={() => {
            onClose();
            k.toProfile();
          }}
        >
          {p.sub ? "Change your name" : "Add your name"}
        </LinkButton>
      )}
      {p.kind === "invite" && k.canManage && (
        <Button
          size="sm"
          onClick={() => {
            onClose();
            k.resend(p);
          }}
          data-testid="team-sheet-resend"
        >
          {p.expired ? "Send again" : "Resend invitation"}
        </Button>
      )}
      {end && (
        <LinkButton
          tone="danger"
          onClick={() => {
            onClose();
            end.go();
          }}
          data-testid="team-sheet-end"
        >
          {end.words}
        </LinkButton>
      )}
      {p.isMe && k.lastOwner(p) && (
        <p className="set-team-note">You&apos;re the only owner. Make someone else Owner before you leave.</p>
      )}
    </RecordSheet>
  );
}

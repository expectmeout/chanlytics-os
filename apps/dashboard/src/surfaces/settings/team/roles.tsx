/**
 * Settings › Team, the roles: what each may do, compared when asked for, and an owner's preview of a narrower one.
 *
 * The legend stood open under every roster, three chips and three sentences, far from where a role is chosen (which is
 * now the picker, each role with its line). Here the roles are named in a row, and Compare opens the table drawn from
 * contracts' roleTable, itself ROLE_PERMS, so it cannot say a role may do what the gates refuse it.
 *
 * Preview as was the card's first row, as large as the roster, and read like a filter on the list. It is a menu on this
 * row, and while it is on, the shell's status line says so on every page with its way out (contracts shellStatusLine).
 * It only narrows: every gate reads it, and the server still answers the real role.
 */
import { useState } from "react";
import { ROLES, TEAM_ROLES, roleSays, roleTable } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { RecordRow } from "../../kit/record/row";
import { setViewAs } from "../../legacy-verbs";

/** The roles compared: a line a permission, a column a role. */
function RolesCompare({ withPartner }: { withPartner: boolean }) {
  const roles = ROLES.filter((r) => r !== "partner" || withPartner);
  return (
    <div className="set-team-compare" data-testid="team-roles-compare">
      <table>
        <thead>
          <tr>
            <th scope="col">Can</th>
            {roles.map((r) => (
              <th scope="col" key={r}>
                {roleSays(r).label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roleTable().map((row) => (
            <tr key={row.says}>
              <th scope="row">
                {row.says}
                {row.note && <span className="set-team-compare-note"> ({row.note})</span>}
              </th>
              {roles.map((r) => (
                <td key={r} data-can={row.can[r] ? "true" : undefined}>
                  {row.can[r] ? <Icon name="check" size={13} /> : <span aria-hidden="true">–</span>}
                  <span className="rec-sr">{row.can[r] ? "Yes" : "No"}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {withPartner && (
        <p className="set-team-compare-note">
          A partner joins with their code, never by invitation, and their seat opens only after two-step sign-in.
        </p>
      )}
    </div>
  );
}

/** Preview as: the narrower roles, or the way back while one is on. An owner's alone. */
function PreviewMenu({ previewing }: { previewing: string | null }) {
  const narrower = TEAM_ROLES.filter((r) => r !== "owner");
  return (
    <MoreMenu
      btnClass="btn btn-ghost btn-sm"
      label={previewing ? `Previewing as ${roleSays(previewing).label}` : "Preview as…"}
      title="See the app as another role would"
      testid="team-viewas"
      items={[
        { header: "See the app as" },
        ...narrower.map((r) => ({
          label: roleSays(r).one.replace(/^a/, "A"),
          meta: roleSays(r).short,
          metaBelow: true,
          checked: previewing === r,
          onClick: () => setViewAs(r),
        })),
        ...(previewing
          ? [{ divider: true }, { label: "Stop previewing", icon: "x", onClick: () => setViewAs(null) }]
          : []),
      ]}
    />
  );
}

/** The roles' row: their names, Compare, and (for an owner) Preview as. */
export function RolesRow({
  isOwner,
  previewing,
  withPartner,
}: {
  isOwner: boolean;
  previewing: string | null;
  withPartner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const named = ROLES.filter((r) => r !== "partner" || withPartner).map((r) => roleSays(r).label);
  // The table stands under the row, across the card: in the row's value column its lines broke three to a cell.
  return (
    <>
      <RecordRow
        id="team-roles"
        testid="team-roles"
        label="Roles"
        value={
          <span className="set-team-roles">
            <span>{named.join(", ")}</span>
            <span className="set-team-roles-acts">
              <LinkButton onClick={() => setOpen(!open)} aria-expanded={open} data-testid="team-roles-compare-toggle">
                {open ? "Hide" : "Compare"}
              </LinkButton>
              {isOwner && <PreviewMenu previewing={previewing} />}
            </span>
          </span>
        }
      />
      {open && <RolesCompare withPartner={withPartner} />}
    </>
  );
}

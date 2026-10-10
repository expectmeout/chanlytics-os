/**
 * Settings › Team, the card's foot: what each role may do, compared when asked for, beside whom to ask when the caller
 * may not change the team.
 *
 * The legend stood open under every roster once, three chips and three sentences, far from where a role is chosen (which
 * is now the picker, each role with its line). Then it was a row of its own, the roles' names beside Compare and an
 * owner's Preview as, and read as one heavy row (Ruben, 10 Oct 2026). It is the card's last line now, one quiet press
 * that opens the table drawn from contracts' roleTable, itself ROLE_PERMS, so it cannot say a role may do what the gates
 * refuse it.
 *
 * Preview as is hidden for now (Ruben, 10 Oct 2026). The role store still holds a preview, and while one is on the
 * shell's status line says so on every page with its way out (contracts shellStatusLine).
 */
import { useState, type ReactNode } from "react";
import { ROLES, roleSays, roleTable } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";

/** The roles compared: a line a permission, a column a role. */
function RolesCompare({ withPartner }: { withPartner: boolean }) {
  const roles = ROLES.filter((r) => r !== "partner" || withPartner);
  return (
    <div className="set-team-compare" id="team-roles-compare" data-testid="team-roles-compare">
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

/** The card's foot: whom to ask (`note`, for a role that may not change the team), and what each role can do. */
export function RolesFoot({ withPartner, note }: { withPartner: boolean; note: ReactNode }) {
  const [open, setOpen] = useState(false);
  // The table stands under the foot, across the card: beside the words its lines broke three to a cell.
  return (
    <>
      <div className="set-team-foot" data-testid="team-roles">
        {note}
        <LinkButton
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="team-roles-compare"
          data-testid="team-roles-compare-toggle"
        >
          What each role can do <Icon name={open ? "chevron-up" : "chevron-down"} size={12} />
        </LinkButton>
      </div>
      {open && <RolesCompare withPartner={withPartner} />}
    </>
  );
}
